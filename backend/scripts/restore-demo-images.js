// Puts the 30 demo listing photos into THIS computer's uploads folder, under the exact file names
// the demo listings in Cloudant point to. Run it on any computer that did not run the seed itself
// (a teammate's laptop, a fresh clone), otherwise the demo listings show placeholder images:
//
//   npm run demo:restore-images:dry     show what would be copied; writes nothing
//   npm run demo:restore-images         copy the missing photos
//
// SAFETY
//   * Cloudant is only READ (the demo listings' image keys). No database record is changed.
//   * Only listings carrying the demo marker are used, and only files under uploads/listings/demo-listing-NN/.
//   * An existing file is never overwritten; one that differs from the demo photo is reported, not replaced.
//   * Safe to repeat: files that are already there are skipped.
//
// The photos come from backend/demo-images/demo-NN.jpg (committed to Git), the same files the seed used.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('../src/config/env');
const { detectImageType } = require('../src/utils/imageType');

const DEMO_MARKER = 'rewear-demo-seed-v1';
const DEMO_ID = /^listing:demo-listing-(\d{2})$/;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const DEFAULT_IMAGES_DIR = path.resolve(__dirname, '..', 'demo-images');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function findSourceImage(imagesDir, number) {
  for (const extension of IMAGE_EXTENSIONS) {
    const file = path.join(imagesDir, `demo-${number}.${extension}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

// Works out what to do for every photo of every demo listing. Pure apart from reading files.
// `docs` are listing documents ({ _id, imageKeys, demoSeed }); `uploadsDir` is the local uploads folder.
function planRestore(docs, { imagesDir = DEFAULT_IMAGES_DIR, uploadsDir = config.storage.uploadsDir } = {}) {
  const plan = [];
  for (const doc of docs) {
    const match = DEMO_ID.exec(doc._id || '');
    if (!match || doc.demoSeed !== DEMO_MARKER || doc.isDeleted) continue;
    const number = match[1];
    for (const key of doc.imageKeys || []) {
      // Photos stored on ImageKit (objects) live in the cloud already: nothing to restore.
      if (typeof key !== 'string') continue;
      const entry = { listing: `demo-listing-${number}`, key };
      if (!key.startsWith(`listings/demo-listing-${number}/`)) {
        plan.push({ ...entry, action: 'skip', reason: 'image key is outside this listing folder' });
        continue;
      }
      const source = findSourceImage(imagesDir, number);
      if (!source) {
        plan.push({ ...entry, action: 'skip', reason: `demo-${number} photo not found in demo-images` });
        continue;
      }
      const buffer = fs.readFileSync(source);
      const type = detectImageType(buffer);
      const keyExt = path.extname(key).slice(1);
      if (!type || type.ext !== keyExt) {
        plan.push({ ...entry, action: 'skip', reason: `demo photo type (${type ? type.ext : 'unknown'}) does not match the stored name (.${keyExt})` });
        continue;
      }
      const target = path.join(uploadsDir, key);
      if (fs.existsSync(target)) {
        const same = sha256(fs.readFileSync(target)) === sha256(buffer);
        plan.push({ ...entry, action: same ? 'present' : 'skip', reason: same ? undefined : 'a different file already exists (left untouched)' });
        continue;
      }
      plan.push({ ...entry, action: 'copy', source, buffer, mime: type.mime });
    }
  }
  return plan;
}

// Copies the planned files into the LOCAL uploads folder (same path checks as app uploads).
// Always local, even when ImageKit is configured: Cloudant already points at these local keys.
async function applyPlan(plan, storageService) {
  let copied = 0;
  for (const item of plan) {
    if (item.action !== 'copy') continue;
    await storageService.saveLocalImage({ key: item.key, buffer: item.buffer });
    copied += 1;
  }
  return copied;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? 'DRY RUN: nothing will be written.\n' : 'Restoring demo photos...\n');

  if (!config.cloudant.url || !config.cloudant.apiKey) {
    console.error('FAILED: Cloudant is not configured (CLOUDANT_URL / CLOUDANT_APIKEY in backend/.env).');
    return 1;
  }

  // Read-only query: the demo listings and their image keys.
  const { run } = require('../src/repositories/base.repository');
  const response = await run((client, db) =>
    client.postFind({ db, selector: { type: 'listing', demoSeed: DEMO_MARKER }, fields: ['_id', 'imageKeys', 'demoSeed', 'isDeleted'], limit: 200 })
  );
  const docs = (response.result && response.result.docs) || [];
  console.log(`Demo listings in Cloudant: ${docs.length}`);

  const plan = planRestore(docs);
  const count = (action) => plan.filter((item) => item.action === action).length;
  plan.filter((item) => item.action === 'skip').forEach((item) => console.log(`  SKIP ${item.listing}: ${item.reason}`));

  if (dryRun) {
    console.log(`\nDry run: ${count('copy')} photo(s) would be copied, ${count('present')} already present, ${count('skip')} skipped.`);
    return 0;
  }
  const storageService = require('../src/services/storage.service');
  const copied = await applyPlan(plan, storageService);
  console.log(`\nDone: ${copied} photo(s) copied, ${count('present')} already present, ${count('skip')} skipped.`);
  console.log(`Photos folder: ${config.storage.uploadsDir}`);
  return count('skip') > 0 ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      const safe = err && typeof err.message === 'string' && !/apikey|https?:\/\//i.test(err.message);
      console.error(`FAILED: ${safe ? err.message : 'unexpected error'}`);
      process.exit(1);
    });
}

module.exports = { planRestore, applyPlan, DEMO_MARKER };
