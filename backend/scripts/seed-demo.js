// Adds ONE demo seller account and EXACTLY 30 demo listings (15 men, 15 women). Run it yourself:
//
//   npm run seed:demo:dry      show what would happen; writes nothing (works even without Cloudant settings)
//   npm run seed:demo          create whatever is missing
//
// Options:  --dry-run           same as seed:demo:dry
//           --images <folder>   where the photos are (default: backend/demo-images)
//
// SAFETY
//   * Idempotent: the demo seller and listings have FIXED ids ("user:demo-seller-rewear",
//     "listing:demo-listing-01" ... "-30"). Running it again creates only what is missing; nothing is duplicated.
//   * Every record it creates carries  isDemo: true  and  demoSeed: "rewear-demo-seed-v1".
//   * It never deletes anything, and never changes a record WITHOUT that marker. If a real account or listing
//     uses one of the demo ids or the demo email, that record is left alone and reported.
//   * The only change it makes to an existing demo listing: adding a photo when the listing has none yet
//     (so you can add the photos later and run the script again).
//   * No secrets are printed. The demo seller's password is NOT stored anywhere readable: set
//     DEMO_SELLER_PASSWORD in backend/.env (8+ characters) BEFORE the first run if you want to log in as the demo
//     seller; otherwise a random password is used and nobody can log in as it (the listings still show normally).
//
// PHOTOS: backend/demo-images/demo-01.jpg ... demo-30.jpg (.jpeg / .png / .webp also work, max 5 MB each).
// The number matches "n" in scripts/demo-listings.js. Photos are copied into the normal uploads folder
// (uploads/listings/<listing-id>/...) exactly like a photo uploaded through the app. Missing photos are skipped.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const config = require('../src/config/env');
const { LISTING_STATUS, IMAGE_LIMITS, ROLES } = require('../src/config/constants');
const { validateCreateListing } = require('../src/validators/listing.validator');
const { detectImageType } = require('../src/utils/imageType');
const { DEMO_LISTINGS, EXPECTED_DISTRIBUTION } = require('./demo-listings');

const DEMO_MARKER = 'rewear-demo-seed-v1';
const DEMO_SELLER = Object.freeze({ id: 'demo-seller-rewear', email: 'demo.seller@example.com', name: 'ReWear Demo Seller' });
const DEFAULT_IMAGES_DIR = path.resolve(__dirname, '..', 'demo-images');
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const BCRYPT_ROUNDS = 10; // same as src/services/auth.service.js
// Fixed, spread-out creation dates (one every 20 hours from 16 Oct 2026), so "newest first" is stable.
const FIRST_CREATED_AT = Date.parse('2026-10-16T10:00:00.000Z');

const pad = (n) => String(n).padStart(2, '0');
const listingIdFor = (n) => `demo-listing-${pad(n)}`;
const createdAtFor = (n) => new Date(FIRST_CREATED_AT + (n - 1) * 20 * 60 * 60 * 1000).toISOString();

// Validates all 30 listings with the API's own validator and checks the exact distribution.
// Pure (no database, no files). Throws an Error describing every problem.
function prepareListings(listings = DEMO_LISTINGS) {
  const problems = [];
  const prepared = listings.map((item) => {
    try {
      const cleaned = validateCreateListing({
        title: item.title,
        description: item.description,
        category: item.category,
        size: item.size,
        gender: item.gender,
        colour: item.colour,
        condition: item.condition,
        listingType: 'sell',
        price: item.price,
      });
      if (!cleaned.gender) problems.push(`#${item.n}: gender is required for demo listings.`);
      return { n: item.n, id: listingIdFor(item.n), createdAt: createdAtFor(item.n), ...cleaned };
    } catch (err) {
      const details = (err.details || []).map((d) => `${d.field}: ${d.message}`).join('; ');
      problems.push(`#${item.n}: ${details || err.message}`);
      return null;
    }
  });

  if (listings.length !== 30) problems.push(`Expected exactly 30 listings, found ${listings.length}.`);
  const numbers = listings.map((item) => item.n);
  if (new Set(numbers).size !== numbers.length) problems.push('Listing numbers must be unique.');

  const counts = countDistribution(listings);
  for (const [category, expected] of Object.entries(EXPECTED_DISTRIBUTION)) {
    for (const gender of ['men', 'women']) {
      const actual = (counts[category] && counts[category][gender]) || 0;
      if (actual !== expected[gender]) problems.push(`${category}/${gender}: expected ${expected[gender]}, found ${actual}.`);
    }
  }
  for (const category of Object.keys(counts)) {
    if (!EXPECTED_DISTRIBUTION[category]) problems.push(`Unexpected category "${category}".`);
  }
  if (listings.some((item) => item.gender === 'unisex')) problems.push('Demo listings must be men or women only.');

  if (problems.length > 0) {
    throw new Error(`The demo data is not valid:\n  - ${problems.join('\n  - ')}`);
  }
  return prepared;
}

function countDistribution(listings) {
  const counts = {};
  for (const item of listings) {
    counts[item.category] = counts[item.category] || { men: 0, women: 0 };
    counts[item.category][item.gender] = (counts[item.category][item.gender] || 0) + 1;
  }
  return counts;
}

// Finds demo-NN.<ext> in the folder. Returns { file, buffer, ext, mime } | { file, problem } | null (no file).
function findImage(imagesDir, n) {
  for (const extension of IMAGE_EXTENSIONS) {
    const file = path.join(imagesDir, `demo-${pad(n)}.${extension}`);
    if (!fs.existsSync(file)) continue;
    const buffer = fs.readFileSync(file);
    if (buffer.length === 0) return { file, problem: 'the file is empty' };
    if (buffer.length > IMAGE_LIMITS.MAX_FILE_BYTES) return { file, problem: 'larger than 5 MB' };
    const type = detectImageType(buffer);
    if (!type) return { file, problem: 'not a real JPEG, PNG or WebP image' };
    return { file, buffer, ext: type.ext, mime: type.mime };
  }
  return null;
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const at = argv.indexOf('--images');
  const imagesDir = at !== -1 && argv[at + 1] ? path.resolve(argv[at + 1]) : DEFAULT_IMAGES_DIR;
  return { dryRun, imagesDir };
}

const isDemo = (doc) => Boolean(doc && doc.demoSeed === DEMO_MARKER);

// ---------- database steps (only reached when Cloudant is configured) ----------

async function ensureSeller({ dryRun, userRepository }) {
  const existing = await userRepository.findUserById(DEMO_SELLER.id);
  if (existing && !isDemo(existing)) {
    throw new Error('An account that was NOT made by this script already uses the demo seller id. Nothing was changed.');
  }
  const byEmail = await userRepository.findUserByEmail(DEMO_SELLER.email);
  if (byEmail && byEmail._id !== `user:${DEMO_SELLER.id}`) {
    throw new Error(`Another account already uses ${DEMO_SELLER.email}. Nothing was changed.`);
  }
  if (existing) {
    console.log(`Demo seller: already exists (${DEMO_SELLER.email}).`);
    return 'exists';
  }
  if (dryRun) {
    console.log(`Demo seller: WOULD create "${DEMO_SELLER.name}" (${DEMO_SELLER.email}).`);
    return 'would-create';
  }

  const claim = await userRepository.claimEmail(DEMO_SELLER.email, DEMO_SELLER.id);
  if (!claim.claimed && !(claim.existing && claim.existing.userId === DEMO_SELLER.id)) {
    throw new Error(`The email ${DEMO_SELLER.email} is reserved by another account. Nothing was changed.`);
  }
  const chosen = process.env.DEMO_SELLER_PASSWORD;
  const password = typeof chosen === 'string' && chosen.length >= 8 ? chosen : crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  await userRepository.insertUser(DEMO_SELLER.id, {
    type: 'user',
    name: DEMO_SELLER.name,
    email: DEMO_SELLER.email,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: ROLES.STUDENT,
    contact: null,
    isDemo: true,
    demoSeed: DEMO_MARKER,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`Demo seller: created (${DEMO_SELLER.email}${chosen && chosen.length >= 8 ? ', password from DEMO_SELLER_PASSWORD' : ', random password: cannot log in'}).`);
  return 'created';
}

// Uploads one photo (ImageKit when configured, else the local uploads folder) and records it on the
// listing (only if it has no photo yet). `entry` is what the storage service says to save in Cloudant.
async function attachImage({ listingId, image, listingRepository, storageService }) {
  const key = `listings/${listingId}/${crypto.randomUUID()}.${image.ext}`;
  const entry = (await storageService.uploadImage({ key, buffer: image.buffer, contentType: image.mime })) || key;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fresh = await listingRepository.findListingById(listingId);
      if (!isDemo(fresh) || fresh.isDeleted || (fresh.imageKeys || []).length > 0) {
        await storageService.deleteImages([entry]);
        return false;
      }
      fresh.imageKeys = [entry];
      fresh.updatedAt = new Date().toISOString();
      if (await listingRepository.updateListing(fresh)) return true;
    }
    throw new Error(`Listing ${listingId} kept changing; its photo was not attached. Run the script again.`);
  } catch (err) {
    await storageService.deleteImages([entry]);
    throw err;
  }
}

async function seedListings({ prepared, images, dryRun, listingRepository, storageService }) {
  const totals = { created: 0, existing: 0, photosAdded: 0, skippedNotDemo: 0 };
  for (const item of prepared) {
    const image = images.get(item.n);
    const usable = image && image.buffer ? image : null;
    const doc = await listingRepository.findListingById(item.id);

    if (doc && !isDemo(doc)) {
      totals.skippedNotDemo += 1;
      console.warn(`  ${item.id}: a listing NOT made by this script uses this id. Left untouched.`);
      continue;
    }

    if (doc) {
      totals.existing += 1;
      const needsPhoto = usable && !doc.isDeleted && doc.status === LISTING_STATUS.AVAILABLE && (doc.imageKeys || []).length === 0;
      if (needsPhoto) {
        if (dryRun) {
          console.log(`  ${item.id}: exists; WOULD add photo ${path.basename(usable.file)}.`);
        } else if (await attachImage({ listingId: item.id, image: usable, listingRepository, storageService })) {
          totals.photosAdded += 1;
          console.log(`  ${item.id}: exists; photo added.`);
        }
      }
      continue;
    }

    if (dryRun) {
      totals.created += 1;
      console.log(`  ${item.id}: WOULD create "${item.title}" (${item.category}, ${item.gender}, ₹${item.price})${usable ? ' with photo' : ' WITHOUT photo'}.`);
      continue;
    }

    await listingRepository.insertListing(item.id, {
      type: 'listing',
      ownerId: DEMO_SELLER.id,
      title: item.title,
      description: item.description,
      category: item.category,
      size: item.size,
      gender: item.gender,
      colour: item.colour,
      condition: item.condition,
      listingType: item.listingType,
      price: item.price,
      imageKeys: [],
      status: LISTING_STATUS.AVAILABLE,
      acceptedRequestId: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deletionReason: null,
      isDemo: true,
      demoSeed: DEMO_MARKER,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    });
    totals.created += 1;
    let photo = 'no photo';
    if (usable && (await attachImage({ listingId: item.id, image: usable, listingRepository, storageService }))) {
      totals.photosAdded += 1;
      photo = 'with photo';
    }
    console.log(`  ${item.id}: created "${item.title}" (${photo}).`);
  }
  return totals;
}

// ---------- main ----------

async function main() {
  const { dryRun, imagesDir } = parseArgs(process.argv.slice(2));
  console.log(dryRun ? 'DRY RUN: nothing will be written.\n' : 'Seeding demo data...\n');

  // 1. Data checks (offline).
  const prepared = prepareListings();
  const counts = countDistribution(prepared);
  console.log('Demo listings: 30 valid listings. Distribution (men / women):');
  for (const [category, c] of Object.entries(counts)) console.log(`  ${category.padEnd(12)} ${c.men} / ${c.women}`);

  // 2. Photos (offline).
  const images = new Map();
  const missing = [];
  const invalid = [];
  for (const item of prepared) {
    const image = findImage(imagesDir, item.n);
    if (!image) missing.push(pad(item.n));
    else if (image.problem) invalid.push(`${path.basename(image.file)} (${image.problem})`);
    images.set(item.n, image);
  }
  const shownDir = path.relative(process.cwd(), imagesDir);
  console.log(`\nPhotos in ${shownDir && !shownDir.startsWith('..') ? shownDir : imagesDir}: ${30 - missing.length - invalid.length} usable, ${missing.length} missing, ${invalid.length} invalid.`);
  if (missing.length) console.log(`  Missing: demo-${missing.join(', demo-')} (.jpg/.jpeg/.png/.webp)`);
  invalid.forEach((text) => console.log(`  Invalid (skipped): ${text}`));

  // 3. Database.
  if (!config.cloudant.url || !config.cloudant.apiKey) {
    const message = 'Cloudant is not configured (CLOUDANT_URL / CLOUDANT_APIKEY in backend/.env), so the database was not checked.';
    if (dryRun) {
      console.log(`\n${message}\nDry run finished: the demo data itself is valid.`);
      return 0;
    }
    console.error(`\nFAILED: ${message}`);
    return 1;
  }

  // Loaded only now, so the offline checks above never need a database connection.
  const userRepository = require('../src/repositories/user.repository');
  const listingRepository = require('../src/repositories/listing.repository');
  const storageService = require('../src/services/storage.service');

  console.log(`\nDatabase "${config.cloudant.database}":`);
  await ensureSeller({ dryRun, userRepository });
  const totals = await seedListings({ prepared, images, dryRun, listingRepository, storageService });
  const verb = dryRun ? 'would be created' : 'created';
  console.log(`\nDone${dryRun ? ' (dry run)' : ''}: ${totals.created} listing(s) ${verb}, ${totals.existing} already present, ${totals.photosAdded} photo(s) ${dryRun ? 'to add' : 'added'}, ${totals.skippedNotDemo} skipped (not demo records).`);
  return totals.skippedNotDemo > 0 ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      // Our own errors carry a safe message; never print raw errors (they could include connection details).
      const safe = err && (err.statusCode || err instanceof Error) && typeof err.message === 'string' && !/apikey|https?:\/\//i.test(err.message);
      console.error(`FAILED: ${safe ? err.message : 'unexpected error'}`);
      process.exit(1);
    });
}

module.exports = { prepareListings, countDistribution, findImage, listingIdFor, createdAtFor, seedListings, ensureSeller, DEMO_MARKER, DEMO_SELLER };
