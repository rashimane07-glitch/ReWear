const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/fakes'); // sets fake settings before src/ is loaded
const {
  prepareListings,
  countDistribution,
  seedListings,
  ensureSeller,
  DEMO_MARKER,
  DEMO_SELLER,
} = require('../scripts/seed-demo');
const { DEMO_LISTINGS } = require('../scripts/demo-listings');

// Silence the script's progress output during tests.
const quiet = async (fn) => {
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
};

function fakeListingRepo(initial = []) {
  const docs = new Map(initial.map((doc) => [doc._id.slice('listing:'.length), { ...doc, _rev: '1' }]));
  return {
    docs,
    writes: 0,
    async findListingById(id) {
      const doc = docs.get(id);
      return doc ? { ...doc, imageKeys: [...(doc.imageKeys || [])] } : null;
    },
    async insertListing(id, body) {
      if (docs.has(id)) throw new Error('conflict');
      this.writes += 1;
      docs.set(id, { _id: `listing:${id}`, _rev: '1', ...body });
    },
    async updateListing(doc) {
      this.writes += 1;
      docs.set(doc._id.slice('listing:'.length), { ...doc });
      return true;
    },
  };
}

function fakeStorage() {
  return {
    files: new Set(),
    async uploadImage({ key }) { this.files.add(key); },
    async deleteImages(keys) { keys.forEach((key) => this.files.delete(key)); },
  };
}

function fakeUserRepo(users = [], emailOwners = {}) {
  const docs = new Map(users.map((u) => [u._id.slice('user:'.length), u]));
  return {
    docs,
    async findUserById(id) { return docs.get(id) || null; },
    async findUserByEmail(email) { return emailOwners[email] ? docs.get(emailOwners[email]) || null : null; },
    async claimEmail(email, id) { emailOwners[email] = id; return { claimed: true }; },
    async insertUser(id, body) { docs.set(id, { _id: `user:${id}`, ...body }); },
  };
}

const jpeg = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), ext: 'jpg', mime: 'image/jpeg', file: 'demo-01.jpg' };

test('the demo data is exactly 30 valid listings: 15 men, 15 women, 5 per category', () => {
  const prepared = prepareListings();
  assert.equal(prepared.length, 30);
  assert.equal(prepared.filter((l) => l.gender === 'men').length, 15);
  assert.equal(prepared.filter((l) => l.gender === 'women').length, 15);
  assert.deepEqual(countDistribution(prepared), {
    tops: { men: 3, women: 2 },
    dresses: { men: 0, women: 5 },
    bottoms: { men: 3, women: 2 },
    outerwear: { men: 3, women: 2 },
    ethnic_wear: { men: 1, women: 4 },
    accessories: { men: 5, women: 0 },
  });
  assert.equal(new Set(prepared.map((l) => l.id)).size, 30);
  assert.ok(prepared.every((l) => l.listingType === 'sell' && Number.isInteger(l.price) && l.price > 0));
});

test('a wrong distribution or an invalid listing is refused before anything is written', () => {
  assert.throws(() => prepareListings(DEMO_LISTINGS.slice(1)), /exactly 30/);
  const swapped = DEMO_LISTINGS.map((l) => (l.n === 1 ? { ...l, gender: 'women' } : l));
  assert.throws(() => prepareListings(swapped), /tops\/men: expected 3, found 2/);
  const bad = DEMO_LISTINGS.map((l) => (l.n === 2 ? { ...l, size: 'huge' } : l));
  assert.throws(() => prepareListings(bad), /#2: size/);
});

test('first run creates 30 marked listings owned by the demo seller; a second run creates nothing', async () => {
  const prepared = prepareListings();
  const repo = fakeListingRepo();
  const storage = fakeStorage();
  const images = new Map([[1, jpeg]]);

  const first = await quiet(() => seedListings({ prepared, images, dryRun: false, listingRepository: repo, storageService: storage }));
  assert.equal(first.created, 30);
  assert.equal(first.photosAdded, 1);
  assert.equal(repo.docs.size, 30);
  for (const doc of repo.docs.values()) {
    assert.equal(doc.demoSeed, DEMO_MARKER);
    assert.equal(doc.isDemo, true);
    assert.equal(doc.ownerId, DEMO_SELLER.id);
    assert.equal(doc.status, 'available');
  }
  assert.equal(repo.docs.get('demo-listing-01').imageKeys.length, 1);
  assert.ok(storage.files.has(repo.docs.get('demo-listing-01').imageKeys[0]));

  const writesBefore = repo.writes;
  const second = await quiet(() => seedListings({ prepared, images, dryRun: false, listingRepository: repo, storageService: storage }));
  assert.equal(second.created, 0);
  assert.equal(second.existing, 30);
  assert.equal(second.photosAdded, 0);
  assert.equal(repo.writes, writesBefore);
  assert.equal(repo.docs.size, 30);
});

test('a later run adds a photo to a demo listing that has none, and only once', async () => {
  const prepared = prepareListings();
  const repo = fakeListingRepo();
  const storage = fakeStorage();
  await quiet(() => seedListings({ prepared, images: new Map(), dryRun: false, listingRepository: repo, storageService: storage }));
  assert.equal(repo.docs.get('demo-listing-05').imageKeys.length, 0);

  const again = await quiet(() => seedListings({ prepared, images: new Map([[5, jpeg]]), dryRun: false, listingRepository: repo, storageService: storage }));
  assert.equal(again.photosAdded, 1);
  assert.equal(repo.docs.get('demo-listing-05').imageKeys.length, 1);

  const third = await quiet(() => seedListings({ prepared, images: new Map([[5, jpeg]]), dryRun: false, listingRepository: repo, storageService: storage }));
  assert.equal(third.photosAdded, 0);
  assert.equal(storage.files.size, 1);
});

test('dry run writes nothing', async () => {
  const repo = fakeListingRepo();
  const storage = fakeStorage();
  const totals = await quiet(() => seedListings({ prepared: prepareListings(), images: new Map([[1, jpeg]]), dryRun: true, listingRepository: repo, storageService: storage }));
  assert.equal(totals.created, 30);
  assert.equal(repo.writes, 0);
  assert.equal(repo.docs.size, 0);
  assert.equal(storage.files.size, 0);
});

test('a real (unmarked) listing that uses a demo id is never changed', async () => {
  const real = { _id: 'listing:demo-listing-03', type: 'listing', title: 'Real one', ownerId: 'someone', imageKeys: [], status: 'available', isDeleted: false };
  const repo = fakeListingRepo([real]);
  const totals = await quiet(() => seedListings({ prepared: prepareListings(), images: new Map([[3, jpeg]]), dryRun: false, listingRepository: repo, storageService: fakeStorage() }));
  assert.equal(totals.skippedNotDemo, 1);
  assert.equal(totals.created, 29);
  assert.equal(repo.docs.get('demo-listing-03').title, 'Real one');
  assert.equal(repo.docs.get('demo-listing-03').demoSeed, undefined);
});

test('demo seller: created once with the marker, never duplicated, never takes over a real account', async () => {
  const users = fakeUserRepo();
  assert.equal(await quiet(() => ensureSeller({ dryRun: true, userRepository: users })), 'would-create');
  assert.equal(users.docs.size, 0);

  assert.equal(await quiet(() => ensureSeller({ dryRun: false, userRepository: users })), 'created');
  const seller = users.docs.get(DEMO_SELLER.id);
  assert.equal(seller.demoSeed, DEMO_MARKER);
  assert.equal(seller.role, 'student');
  assert.ok(seller.passwordHash.startsWith('$2'));
  assert.equal(await quiet(() => ensureSeller({ dryRun: false, userRepository: users })), 'exists');
  assert.equal(users.docs.size, 1);

  const realOwner = fakeUserRepo([{ _id: 'user:real-1', type: 'user', email: DEMO_SELLER.email }], { [DEMO_SELLER.email]: 'real-1' });
  await assert.rejects(() => quiet(() => ensureSeller({ dryRun: false, userRepository: realOwner })), /Another account/);
  assert.equal(realOwner.docs.size, 1);

  const realWithId = fakeUserRepo([{ _id: `user:${DEMO_SELLER.id}`, type: 'user', email: 'x@y.z' }]);
  await assert.rejects(() => quiet(() => ensureSeller({ dryRun: false, userRepository: realWithId })), /NOT made by this script/);
});

// ---------- demo seller login (scripts/demo-seller-login.js) ----------
const bcryptForTests = require('bcryptjs');
const { checkInputs, setSellerLogin } = require('../scripts/demo-seller-login');

function fakeSellerRepo(seller) {
  return {
    seller,
    writes: 0,
    async findUserById(id) { return this.seller && this.seller._id === `user:${id}` ? { ...this.seller } : null; },
    async updateUser(doc) { this.writes += 1; this.seller = { ...doc }; return true; },
  };
}

test('demo seller login: inputs follow the app rules and the phone is normalised', () => {
  assert.equal(checkInputs('longenough1', '9876543210').contact.value, '+919876543210');
  assert.throws(() => checkInputs('short', '9876543210'), /at least 8/);
  assert.throws(() => checkInputs('longenough1', ''), /DEMO_SELLER_PHONE is required/);
  assert.throws(() => checkInputs('longenough1', 'abc'), /DEMO_SELLER_PHONE/);
});

test('demo seller login: sets password + phone on the marked seller only, dry run writes nothing, repeat is a no-op', async () => {
  const repo = fakeSellerRepo({ _id: `user:${DEMO_SELLER.id}`, type: 'user', demoSeed: DEMO_MARKER, passwordHash: await bcryptForTests.hash('random-unknown', 4), contact: null });
  const input = checkInputs('DemoSeller2026', '9876543210');
  assert.equal(await setSellerLogin({ dryRun: true, userRepository: repo, ...input }), 'would-update');
  assert.equal(repo.writes, 0);
  assert.equal(await setSellerLogin({ dryRun: false, userRepository: repo, ...input }), 'updated');
  assert.ok(await bcryptForTests.compare('DemoSeller2026', repo.seller.passwordHash));
  assert.deepEqual(repo.seller.contact, { type: 'phone', value: '+919876543210' });
  assert.equal(await setSellerLogin({ dryRun: false, userRepository: repo, ...input }), 'unchanged');
  assert.equal(repo.writes, 1);
});

test('demo seller login: refuses an unmarked account or a missing seller', async () => {
  const input = checkInputs('DemoSeller2026', '9876543210');
  const real = fakeSellerRepo({ _id: `user:${DEMO_SELLER.id}`, type: 'user', passwordHash: 'x', contact: null });
  await assert.rejects(() => setSellerLogin({ dryRun: false, userRepository: real, ...input }), /NOT made by the seed/);
  assert.equal(real.writes, 0);
  await assert.rejects(() => setSellerLogin({ dryRun: false, userRepository: fakeSellerRepo(null), ...input }), /does not exist/);
});
