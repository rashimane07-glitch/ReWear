const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('./helpers/fakes'); // fake settings + a temporary uploads folder (never the real one)
const config = require('../src/config/env');
const storageService = require('../src/services/storage.service');
const { planRestore, applyPlan, DEMO_MARKER } = require('../scripts/restore-demo-images');

const uploadsDir = config.storage.uploadsDir;
const demoDoc = (n, id) => ({ _id: `listing:demo-listing-${n}`, demoSeed: DEMO_MARKER, isDeleted: false, imageKeys: [`listings/demo-listing-${n}/${id}.jpg`] });
const sourceOf = (n) => fs.readFileSync(path.join(__dirname, '..', 'demo-images', `demo-${n}.jpg`));

test('copies each demo photo to the exact key Cloudant points to, then skips it on a second run', async () => {
  const docs = [demoDoc('01', '11111111-1111-4111-8111-111111111111'), demoDoc('02', '22222222-2222-4222-8222-222222222222')];
  const plan = planRestore(docs);
  assert.deepEqual(plan.map((p) => p.action), ['copy', 'copy']);
  assert.equal(await applyPlan(plan, storageService), 2);
  for (const [n, doc] of [['01', docs[0]], ['02', docs[1]]]) {
    assert.deepEqual(fs.readFileSync(path.join(uploadsDir, doc.imageKeys[0])), sourceOf(n));
  }
  const again = planRestore(docs);
  assert.deepEqual(again.map((p) => p.action), ['present', 'present']);
  assert.equal(await applyPlan(again, storageService), 0);
});

test('never overwrites a different existing file', async () => {
  const doc = demoDoc('03', '33333333-3333-4333-8333-333333333333');
  const target = path.join(uploadsDir, doc.imageKeys[0]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'someone else\'s file');
  const plan = planRestore([doc]);
  assert.equal(plan[0].action, 'skip');
  assert.match(plan[0].reason, /different file/);
  await applyPlan(plan, storageService);
  assert.equal(fs.readFileSync(target, 'utf8'), 'someone else\'s file');
});

test('ignores listings without the demo marker, removed listings and keys outside the listing folder', () => {
  const plan = planRestore([
    { _id: 'listing:demo-listing-04', imageKeys: ['listings/demo-listing-04/44444444-4444-4444-8444-444444444444.jpg'] }, // no marker
    { _id: 'listing:abc-real', demoSeed: DEMO_MARKER, imageKeys: ['listings/abc-real/x.jpg'] }, // not a demo id
    { ...demoDoc('05', '55555555-5555-4555-8555-555555555555'), isDeleted: true },
    { ...demoDoc('06', '66666666-6666-4666-8666-666666666666'), imageKeys: ['listings/demo-listing-07/77777777-7777-4777-8777-777777777777.jpg'] },
  ]);
  assert.equal(plan.filter((p) => p.action === 'copy').length, 0);
  assert.equal(plan.length, 1);
  assert.match(plan[0].reason, /outside/);
});
