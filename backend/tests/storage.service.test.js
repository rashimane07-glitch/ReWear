const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { storage, samples } = require('./helpers/fakes'); // sets fake settings + temp uploads folder first
const storageService = require('../src/services/storage.service');
const ApiError = require('../src/utils/ApiError');

const KEY = 'listings/abc-123/img-1.jpg';

// A file OUTSIDE the uploads folder that must never be touched.
const victim = path.join(os.tmpdir(), `rewear-victim-${process.pid}.txt`);
fs.writeFileSync(victim, 'do not touch');
test.after(() => fs.rmSync(victim, { force: true }));

const UNSAFE_KEYS = [
  `../${path.basename(victim)}`,
  `listings/../../${path.basename(victim)}`,
  'listings/x/../../../escape.jpg',
  victim, // absolute path
  '/etc/passwd',
  'C:\\Windows\\win.ini',
  'listings\\abc\\img.jpg', // backslashes
  'listings//img.jpg', // empty folder name
  'listings/abc/img.txt', // wrong extension
  'listings/abc/.jpg',
  'other/abc/img.jpg', // outside "listings/"
  'listings/abc/img.jpg/../../../x.jpg',
  'listings/a b/img.jpg',
  '',
  null,
  undefined,
  123,
  {},
];

test('uploadImage saves the exact bytes under uploads/listings/<id>/', async () => {
  const bytes = samples.jpeg();
  await storageService.uploadImage({ key: KEY, buffer: bytes, contentType: 'image/jpeg' });
  assert.ok(storage.exists(KEY));
  assert.deepEqual(storage.read(KEY), bytes);
  assert.ok(path.join(storage.dir, KEY).startsWith(storage.dir + path.sep));
});

test('getSignedUrl returns a public link built from BACKEND_URL', () => {
  assert.equal(storageService.getSignedUrl(KEY), `http://localhost:5000/uploads/${KEY}`);
});

test('uploadImage never overwrites an existing file', async () => {
  const key = 'listings/abc-123/same.png';
  const first = samples.png();
  await storageService.uploadImage({ key, buffer: first });
  await assert.rejects(
    storageService.uploadImage({ key, buffer: samples.png(200) }),
    (err) => err instanceof ApiError && err.statusCode === 503 && err.code === 'STORAGE_UNAVAILABLE'
  );
  assert.deepEqual(storage.read(key), first);
});

test('uploadImage turns disk errors into a safe 503 (no paths or system details)', async () => {
  storage.writes.failOnCall = storage.writes.calls + 1;
  await assert.rejects(
    storageService.uploadImage({ key: 'listings/abc-123/full.webp', buffer: samples.webp() }),
    (err) =>
      err instanceof ApiError &&
      err.statusCode === 503 &&
      err.code === 'STORAGE_UNAVAILABLE' &&
      !/ENOSPC|no space|rewear-test-uploads/.test(err.message)
  );
  storage.writes.failOnCall = null;
  assert.ok(!storage.exists('listings/abc-123/full.webp'));
});

test('uploadImage refuses unsafe keys and writes nothing', async () => {
  const filesBefore = storage.files();
  for (const key of UNSAFE_KEYS) {
    await assert.rejects(
      storageService.uploadImage({ key, buffer: samples.jpeg() }),
      (err) => err instanceof ApiError && err.statusCode === 500,
      `key ${JSON.stringify(key)} must be refused`
    );
  }
  assert.deepEqual(storage.files(), filesBefore, 'nothing may be written inside the uploads folder');
  assert.equal(fs.readFileSync(victim, 'utf8'), 'do not touch', 'nothing may be written outside it');
  assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'escape.jpg')));
});

test('getSignedUrl refuses unsafe keys', () => {
  for (const key of UNSAFE_KEYS) {
    assert.throws(() => storageService.getSignedUrl(key), ApiError, `key ${JSON.stringify(key)} must be refused`);
  }
});

test('deleteImages removes the file and the listing folder once it is empty', async () => {
  const keys = ['listings/del-1/a.jpg', 'listings/del-1/b.png'];
  for (const key of keys) await storageService.uploadImage({ key, buffer: samples.jpeg() });

  await storageService.deleteImages([keys[0]]);
  assert.ok(!storage.exists(keys[0]));
  assert.ok(storage.exists(keys[1]), 'other files must stay');
  assert.ok(fs.existsSync(path.join(storage.dir, 'listings/del-1')), 'folder is kept while it still has files');

  await storageService.deleteImages([keys[1]]);
  assert.ok(!fs.existsSync(path.join(storage.dir, 'listings/del-1')), 'empty folder is removed');
});

test('deleteImages never throws: missing files, bad input and unsafe keys are handled', async () => {
  await storageService.deleteImages(['listings/none/missing.jpg']); // already gone
  await storageService.deleteImages([]);
  await storageService.deleteImages(undefined);
  await storageService.deleteImages('not-an-array');
  await storageService.deleteImages(UNSAFE_KEYS);
});

test('deleteImages cannot delete anything outside the uploads folder', async () => {
  await storageService.deleteImages(UNSAFE_KEYS);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'do not touch', 'the file outside uploads must survive');
  assert.ok(fs.existsSync(storage.dir), 'the uploads folder itself must survive');
});

test('deleteImages does not touch other listings or unrelated files', async () => {
  await storageService.uploadImage({ key: 'listings/keep-1/x.jpg', buffer: samples.jpeg() });
  await storageService.uploadImage({ key: 'listings/drop-1/y.jpg', buffer: samples.jpeg() });
  await storageService.deleteImages(['listings/drop-1/y.jpg']);
  assert.ok(storage.exists('listings/keep-1/x.jpg'));
  assert.ok(!storage.exists('listings/drop-1/y.jpg'));
});

test('logStorageStatus creates a missing uploads folder, reports it and never throws', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  fs.rmSync(storage.dir, { recursive: true, force: true });
  await storageService.logStorageStatus();
  assert.ok(fs.existsSync(storage.dir), 'the uploads folder must be created');
  assert.ok(log.mock.calls.some((call) => /Local image storage ready/.test(String(call.arguments[0]))));
});
