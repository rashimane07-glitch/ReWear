// Test helpers: fake settings + an in-memory stand-in for IBM Cloudant, and a REAL
// temporary uploads folder for the local image storage (deleted when tests finish).
// Tests never contact (or need credentials for) any real service, and never touch
// the real backend/uploads folder.
//
// IMPORTANT: require this file BEFORE anything from ../../src, because it must
// set the environment and replace the Cloudant client module first.

const path = require('path');
const os = require('os');
const fsSync = require('fs');
const fsp = require('fs/promises');
const http = require('http');

// ---- a throw-away uploads folder, removed when the test process exits ----
const uploadsDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'rewear-test-uploads-'));
process.on('exit', () => {
  fsSync.rmSync(uploadsDir, { recursive: true, force: true });
});

// ---- fake settings (dotenv never overrides variables that are already set) ----
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-'.padEnd(48, 'x'),
  JWT_EXPIRES_IN: '1h',
  CLOUDANT_URL: 'https://cloudant.test',
  CLOUDANT_APIKEY: 'test-api-key',
  CLOUDANT_DATABASE: 'rewear_test',
  UPLOADS_DIR: uploadsDir,
  BACKEND_URL: 'http://localhost:5000',
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const clone = (value) => JSON.parse(JSON.stringify(value));
const errorWithStatus = (status, message) => Object.assign(new Error(message), { status });

// ---------- in-memory Cloudant ----------
const cloudant = {
  store: new Map(), // docId -> document
  seq: 0,
  down: false, // set true to simulate an outage
  finds: [], // every postFind call, so tests can check selectors and limits
  indexes: [], // every postIndex call
  beforePut: null, // optional hook: (docId, store) => void, used to simulate concurrent edits
};

const fakeCloudantClient = {
  async getDatabaseInformation() {
    await tick();
    return { result: {} };
  },
  async getDocument({ docId }) {
    await tick();
    if (cloudant.down) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const doc = cloudant.store.get(docId);
    if (!doc) throw errorWithStatus(404, 'missing');
    return { result: clone(doc) };
  },
  async putDocument({ docId, document, rev }) {
    await tick();
    if (cloudant.down) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    if (cloudant.beforePut) cloudant.beforePut(docId, cloudant.store);
    const current = cloudant.store.get(docId);
    if (current) {
      if (!rev || rev !== current._rev) throw errorWithStatus(409, 'conflict');
    } else if (rev) {
      throw errorWithStatus(409, 'conflict');
    }
    cloudant.seq += 1;
    const stored = { ...clone(document), _id: docId, _rev: `${cloudant.seq}-test` };
    cloudant.store.set(docId, stored);
    return { result: { ok: true, id: docId, rev: stored._rev } };
  },
  // Equality-only selector matching (enough for our queries); honours `limit` like Cloudant.
  async postFind({ selector, limit = 25 }) {
    await tick();
    if (cloudant.down) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    cloudant.finds.push({ selector: clone(selector), limit });
    const docs = [...cloudant.store.values()]
      .filter((doc) => Object.entries(selector).every(([field, value]) => doc[field] === value))
      .slice(0, limit)
      .map(clone);
    return { result: { docs } };
  },
  async postIndex({ index, name }) {
    await tick();
    cloudant.indexes.push({ name, fields: index.fields });
    return { result: { result: 'created', name } };
  },
  async deleteDocument({ docId, rev }) {
    await tick();
    const current = cloudant.store.get(docId);
    if (!current) throw errorWithStatus(404, 'missing');
    if (current._rev !== rev) throw errorWithStatus(409, 'conflict');
    cloudant.store.delete(docId);
    return { result: { ok: true } };
  },
};

// ---------- replace the real Cloudant client module with the fake ----------
function stubModule(relativePathFromSrc, exportsObject) {
  const file = require.resolve(path.join(__dirname, '..', '..', 'src', relativePathFromSrc));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsObject, children: [], paths: [] };
}
stubModule('config/cloudant.js', { isConfigured: () => true, getClient: () => fakeCloudantClient });

// ---------- local storage helpers ----------

// Counts file writes so tests can make the Nth one fail (e.g. "disk full").
// storage.service.js calls fs.writeFile through the module object, so this wrapper sees it.
const writes = { calls: 0, failOnCall: null };
const originalWriteFile = fsp.writeFile;
fsp.writeFile = async function writeFileWithFailureSwitch(...args) {
  writes.calls += 1;
  if (writes.failOnCall === writes.calls) {
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  }
  return originalWriteFile.apply(this, args);
};

// All files under the uploads folder, as keys like "listings/<id>/<file>.jpg".
function storedFiles(dir = uploadsDir, prefix = '') {
  const found = [];
  for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...storedFiles(path.join(dir, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

const storage = {
  dir: uploadsDir,
  files: () => storedFiles(),
  count: () => storedFiles().length,
  exists: (key) => fsSync.existsSync(path.join(uploadsDir, key)),
  read: (key) => fsSync.readFileSync(path.join(uploadsDir, key)),
  writes,
};

// ---------- test utilities ----------

// Starts the real Express app on a random free port.
async function startServer() {
  const app = require('../../src/app');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    base: `http://127.0.0.1:${port}/api/v1`,
    port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Small file contents that start with the real "magic bytes" of each format.
const filler = (size) => Buffer.alloc(Math.max(0, size - 12), 0x41);
const samples = {
  jpeg: (size = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), filler(size)]),
  png: (size = 64) =>
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), filler(size)]),
  webp: (size = 64) => Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'), filler(size)]),
  gif: () => Buffer.from('GIF89a' + 'x'.repeat(64), 'latin1'),
  text: () => Buffer.from('this is definitely not an image', 'utf8'),
  pdf: () => Buffer.from('%PDF-1.4 ' + 'x'.repeat(64), 'latin1'),
};

module.exports = { cloudant, storage, startServer, samples };
