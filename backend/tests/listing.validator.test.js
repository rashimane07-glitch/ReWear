const test = require('node:test');
const assert = require('node:assert/strict');

const { validateCreateListing, validateUpdateListing } = require('../src/validators/listing.validator');
const ApiError = require('../src/utils/ApiError');

const valid = () => ({
  title: 'Denim jacket',
  description: 'Worn twice, no flaws at all.',
  category: 'outerwear',
  size: 'm',
  colour: 'Blue',
  condition: 'like_new',
  listingType: 'sell',
  price: 400,
});

// Runs the validator and returns the list of failing field names (or null if it passed).
function failingFields(body) {
  try {
    validateCreateListing(body);
    return null;
  } catch (err) {
    assert.ok(err instanceof ApiError, 'should throw an ApiError');
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return err.details.map((detail) => detail.field).sort();
  }
}

test('accepts a valid sell listing and cleans the values', () => {
  const result = validateCreateListing({
    ...valid(),
    title: '  Denim    jacket ',
    category: 'OUTERWEAR',
    size: ' M ',
  });
  assert.equal(result.title, 'Denim jacket');
  assert.equal(result.category, 'outerwear');
  assert.equal(result.size, 'm');
  assert.equal(result.price, 400);
});

test('exchange and donate listings need no price and get price: null', () => {
  for (const listingType of ['exchange', 'donate']) {
    const body = valid();
    delete body.price;
    assert.equal(validateCreateListing({ ...body, listingType }).price, null);
    assert.equal(validateCreateListing({ ...body, listingType, price: null }).price, null);
  }
});

test('reports every missing required field at once', () => {
  assert.deepEqual(failingFields({}), [
    'category',
    'colour',
    'condition',
    'description',
    'listingType',
    'size',
    'title',
  ]);
});

test('rejects bodies that are not objects', () => {
  for (const body of [undefined, null, 'text', 42, [1, 2]]) {
    assert.throws(() => validateCreateListing(body), (err) => err.statusCode === 400);
  }
});

test('rejects values outside the allowed lists', () => {
  assert.deepEqual(failingFields({ ...valid(), category: 'spaceship' }), ['category']);
  assert.deepEqual(failingFields({ ...valid(), size: 'huge' }), ['size']);
  assert.deepEqual(failingFields({ ...valid(), condition: 'broken' }), ['condition']);
  assert.deepEqual(failingFields({ ...valid(), listingType: 'rent' }), ['listingType']);
  assert.deepEqual(failingFields({ ...valid(), size: 5 }), ['size']);
});

test('enforces text length limits', () => {
  assert.deepEqual(failingFields({ ...valid(), title: 'ab' }), ['title']);
  assert.deepEqual(failingFields({ ...valid(), title: 'x'.repeat(101) }), ['title']);
  assert.deepEqual(failingFields({ ...valid(), description: 'too short' }), ['description']);
  assert.deepEqual(failingFields({ ...valid(), description: 'x'.repeat(1001) }), ['description']);
  assert.deepEqual(failingFields({ ...valid(), colour: 'x' }), ['colour']);
  assert.deepEqual(failingFields({ ...valid(), title: 12345 }), ['title']);
  assert.deepEqual(failingFields({ ...valid(), title: '   ' }), ['title']);
});

test('price is required and must be a whole number of rupees for sell listings', () => {
  const noPrice = valid();
  delete noPrice.price;
  assert.deepEqual(failingFields(noPrice), ['price']);
  assert.deepEqual(failingFields({ ...valid(), price: null }), ['price']);
  assert.deepEqual(failingFields({ ...valid(), price: '400' }), ['price']);
  assert.deepEqual(failingFields({ ...valid(), price: 0 }), ['price']);
  assert.deepEqual(failingFields({ ...valid(), price: -5 }), ['price']);
  assert.deepEqual(failingFields({ ...valid(), price: 99.5 }), ['price']);
  assert.deepEqual(failingFields({ ...valid(), price: 100000 }), ['price']);
  assert.equal(failingFields({ ...valid(), price: 1 }), null);
  assert.equal(failingFields({ ...valid(), price: 99999 }), null);
});

test('price is not allowed on exchange or donate listings', () => {
  assert.deepEqual(failingFields({ ...valid(), listingType: 'donate', price: 100 }), ['price']);
  assert.deepEqual(failingFields({ ...valid(), listingType: 'exchange', price: 100 }), ['price']);
});

test('rejects fields a client must never set (owner, status, images, ...)', () => {
  for (const field of ['ownerId', 'owner', 'status', 'imageKeys', 'isDeleted', '_id', 'id', 'createdAt', 'acceptedRequestId']) {
    assert.deepEqual(failingFields({ ...valid(), [field]: 'x' }), [field], `field "${field}" should be rejected`);
  }
});

// ---------- validateUpdateListing (PATCH) ----------

function updateFailures(body) {
  try {
    validateUpdateListing(body);
    return null;
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return (err.details || []).map((detail) => detail.field).sort();
  }
}

test('update: accepts any subset of fields and cleans them', () => {
  assert.deepEqual(validateUpdateListing({ title: '  Blue   jacket ' }), { title: 'Blue jacket' });
  assert.deepEqual(validateUpdateListing({ size: 'L', condition: 'GOOD' }), { size: 'l', condition: 'good' });
  assert.deepEqual(validateUpdateListing({ listingType: 'donate', price: null }), { listingType: 'donate', price: null });
  assert.deepEqual(validateUpdateListing({ price: 250 }), { price: 250 });
});

test('update: rejects empty or non-object bodies', () => {
  assert.deepEqual(updateFailures({}), []);
  assert.deepEqual(updateFailures(null), []);
  assert.deepEqual(updateFailures([]), []);
  assert.deepEqual(updateFailures('title'), []);
});

test('update: rejects fields a client must never set', () => {
  assert.deepEqual(updateFailures({ ownerId: 'x', status: 'reserved', imageKeys: [], isDeleted: true }), [
    'imageKeys',
    'isDeleted',
    'ownerId',
    'status',
  ]);
});

test('update: applies the same field rules as create, only to the fields sent', () => {
  assert.deepEqual(updateFailures({ title: 'ab' }), ['title']);
  assert.deepEqual(updateFailures({ title: '' }), ['title']);
  assert.deepEqual(updateFailures({ title: 42 }), ['title']);
  assert.deepEqual(updateFailures({ category: 'hats', size: 'huge' }), ['category', 'size']);
  assert.deepEqual(updateFailures({ price: 0 }), ['price']);
  assert.deepEqual(updateFailures({ price: 10.5 }), ['price']);
  assert.deepEqual(updateFailures({ price: '100' }), ['price']);
  assert.deepEqual(updateFailures({ price: 100000 }), ['price']);
});
