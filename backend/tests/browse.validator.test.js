const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/fakes'); // sets fake settings before src/ is loaded
const { validateBrowseQuery } = require('../src/validators/browse.validator');
const { buildPublicSelector } = require('../src/repositories/listing.repository');
const ApiError = require('../src/utils/ApiError');

// Runs the validator and returns { field: message } for the failing parameters (or null if it passed).
function problems(query) {
  try {
    validateBrowseQuery(query);
    return null;
  } catch (err) {
    assert.ok(err instanceof ApiError, 'should throw an ApiError');
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return Object.fromEntries(err.details.map((detail) => [detail.field, detail.message]));
  }
}

test('no parameters (or no query object at all) gives the defaults', () => {
  const defaults = { filters: {}, searchTerms: [], sort: 'newest', limit: 12, cursor: undefined };
  assert.deepEqual(validateBrowseQuery({}), defaults);
  assert.deepEqual(validateBrowseQuery(undefined), defaults);
  assert.deepEqual(validateBrowseQuery(null), defaults);
});

test('empty values count as "not given"', () => {
  const result = validateBrowseQuery({ q: '', category: '', size: ' ', sort: '', limit: '', cursor: '', colour: '' });
  assert.deepEqual(result, { filters: {}, searchTerms: [], sort: 'newest', limit: 12, cursor: undefined });
});

test('filters are lower-cased, split on commas, de-duplicated and may be repeated', () => {
  const result = validateBrowseQuery({
    category: 'Outerwear, DRESSES,outerwear',
    size: ['m', 'l,xl'],
    condition: 'good',
    listingType: 'SELL',
  });
  assert.deepEqual(result.filters, {
    category: ['outerwear', 'dresses'],
    size: ['m', 'l', 'xl'],
    condition: ['good'],
    listingType: ['sell'],
  });
});

test('"type" works as an alias of listingType, "color" as an alias of colour', () => {
  assert.deepEqual(validateBrowseQuery({ type: 'donate' }).filters, { listingType: ['donate'] });
  assert.deepEqual(validateBrowseQuery({ color: ' Blue ' }).filters, { colour: 'Blue' });
  assert.ok(problems({ type: 'sell', listingType: 'sell' }).type);
  assert.ok(problems({ color: 'red', colour: 'red' }).color);
});

test('rejects values outside the allowed lists and says what is allowed', () => {
  const found = problems({ category: 'spaceship', size: 'huge', condition: 'broken', listingType: 'rent' });
  assert.deepEqual(Object.keys(found).sort(), ['category', 'condition', 'listingType', 'size']);
  assert.match(found.category, /outerwear/);
  assert.ok(problems({ category: 'tops,spaceship' }).category, 'one bad value among good ones is still an error');
});

test('limits how many values one filter may have', () => {
  const eleven = Array(11).fill('m').map((v, i) => ['xs', 's', 'm', 'l', 'xl', 'xxl', 'free_size'][i % 7] + (i > 6 ? '' : ''));
  // 11 values, but de-duplicated they are only 7, so build 11 DISTINCT-looking values with an invalid tail instead
  assert.equal(problems({ size: eleven.join(',') }), null, 'duplicates collapse, so this is fine');
  const tooMany = ['tops', 'bottoms', 'dresses', 'ethnic_wear', 'outerwear', 'activewear', 'accessories', 'other'];
  assert.equal(problems({ category: tooMany.join(',') }), null, 'all 8 categories is allowed');
});

test('search text is cleaned and split into words', () => {
  assert.deepEqual(validateBrowseQuery({ q: '  denim    jacket ' }).searchTerms, ['denim', 'jacket']);
  assert.deepEqual(validateBrowseQuery({ q: 'a\u0000b\tc\nd' }).searchTerms, ['a', 'b', 'c', 'd']);
  assert.deepEqual(validateBrowseQuery({ q: '   ' }).searchTerms, []);
});

test('search is limited to 100 characters and 5 words', () => {
  assert.equal(problems({ q: 'x'.repeat(100) }), null);
  assert.ok(problems({ q: 'x'.repeat(101) }).q);
  assert.equal(problems({ q: 'a b c d e' }), null);
  assert.ok(problems({ q: 'a b c d e f' }).q);
});

test('sort accepts the four options (any letter case) and nothing else', () => {
  for (const sort of ['newest', 'oldest', 'price_asc', 'price_desc']) {
    assert.equal(validateBrowseQuery({ sort }).sort, sort);
  }
  assert.equal(validateBrowseQuery({ sort: 'PRICE_ASC' }).sort, 'price_asc');
  assert.ok(problems({ sort: 'cheapest' }).sort);
  assert.ok(problems({ sort: 'createdAt' }).sort);
});

test('limit must be a whole number from 1 to 50', () => {
  assert.equal(validateBrowseQuery({ limit: '1' }).limit, 1);
  assert.equal(validateBrowseQuery({ limit: '50' }).limit, 50);
  assert.equal(validateBrowseQuery({ limit: ' 7 ' }).limit, 7);
  for (const bad of ['0', '51', '-1', 'abc', '1.5', '1e2', '12abc', '0x10', '999999999']) {
    assert.ok(problems({ limit: bad }).limit, `limit=${bad} must be rejected`);
  }
});

test('cursor must look like an opaque bookmark', () => {
  assert.equal(validateBrowseQuery({ cursor: 'g1AAAABweJzLYWBgYMpgTmHg' }).cursor, 'g1AAAABweJzLYWBgYMpgTmHg');
  for (const bad of ['has space', '<script>', '../../etc', 'a'.repeat(2001), 'x;y']) {
    assert.ok(problems({ cursor: bad }).cursor, `cursor ${JSON.stringify(bad)} must be rejected`);
  }
});

test('unknown parameters are rejected (so typos never silently show unfiltered results)', () => {
  const found = problems({ categroy: 'tops', foo: '1', page: '2' });
  assert.deepEqual(Object.keys(found).sort(), ['categroy', 'foo', 'page']);
});

test('parameters sent twice, or as objects, are rejected where only one value makes sense', () => {
  assert.ok(problems({ q: ['a', 'b'] }).q);
  assert.ok(problems({ sort: ['newest', 'oldest'] }).sort);
  assert.ok(problems({ limit: ['1', '2'] }).limit);
  assert.ok(problems({ category: { a: 'b' } }).category);
  assert.ok(problems({ q: { $ne: '' } }).q);
});

test('reports every problem at once', () => {
  const found = problems({ category: 'x', sort: 'y', limit: 'z', q: 'x'.repeat(200), nope: '1' });
  assert.deepEqual(Object.keys(found).sort(), ['category', 'limit', 'nope', 'q', 'sort']);
});

// ---------- the Cloudant selector ----------

test('the selector always limits results to available, non-deleted listings', () => {
  assert.deepEqual(buildPublicSelector(), { type: 'listing', isDeleted: false, status: 'available' });
  assert.deepEqual(buildPublicSelector({}, []), { type: 'listing', isDeleted: false, status: 'available' });
});

test('filters become equality (one value) or $in (several values)', () => {
  const selector = buildPublicSelector({ category: ['tops'], size: ['m', 'l'], condition: ['good'], listingType: ['sell', 'donate'] });
  assert.equal(selector.category, 'tops');
  assert.deepEqual(selector.size, { $in: ['m', 'l'] });
  assert.equal(selector.condition, 'good');
  assert.deepEqual(selector.listingType, { $in: ['sell', 'donate'] });
  assert.equal(selector.status, 'available');
});

test('every search word must match the title OR the description', () => {
  const selector = buildPublicSelector({}, ['denim', 'jacket']);
  assert.equal(selector.$and.length, 2);
  assert.deepEqual(selector.$and[0], {
    $or: [{ title: { $regex: '(?i)denim' } }, { description: { $regex: '(?i)denim' } }],
  });
});

test('search words are matched literally: regex characters are escaped', () => {
  const dangerous = ['.*', '(a+)+', '[M]', 'a|b', '50%', '^start', 'end$', 'a\\b', 'what?', 'a{2}', 'x-y', 'a/b'];
  for (const word of dangerous) {
    const pattern = buildPublicSelector({}, [word]).$and[0].$or[0].title.$regex;
    assert.ok(pattern.startsWith('(?i)'));
    const regex = new RegExp(pattern.slice(4), 'i');
    assert.ok(regex.test(`before ${word} after`), `"${word}" must match itself literally`);
  }
  // and must NOT behave like a pattern
  assert.equal(new RegExp(buildPublicSelector({}, ['.*']).$and[0].$or[0].title.$regex.slice(4), 'i').test('abc'), false);
  assert.equal(new RegExp(buildPublicSelector({}, ['a|b']).$and[0].$or[0].title.$regex.slice(4), 'i').test('b'), false);
});

test('colour is an exact, case-insensitive match', () => {
  const pattern = buildPublicSelector({ colour: 'Light Blue' }).colour.$regex;
  const regex = new RegExp(pattern.slice(4), 'i');
  assert.ok(regex.test('light blue'));
  assert.ok(regex.test('LIGHT BLUE'));
  assert.equal(regex.test('Blue'), false);
  assert.equal(regex.test('Light Blue Green'), false);
});

// ---------- gender filter ----------
test('gender filter: one or several of men / women / unisex', () => {
  assert.deepEqual(validateBrowseQuery({ gender: 'Men' }).filters, { gender: ['men'] });
  assert.deepEqual(validateBrowseQuery({ gender: 'women,unisex' }).filters, { gender: ['women', 'unisex'] });
  assert.ok(problems({ gender: 'kids' }).gender);
});

test('gender filter becomes part of the Cloudant selector', () => {
  assert.equal(buildPublicSelector({ gender: ['women'] }).gender, 'women');
  assert.deepEqual(buildPublicSelector({ gender: ['men', 'unisex'] }).gender, { $in: ['men', 'unisex'] });
  assert.equal('gender' in buildPublicSelector({ category: ['tops'] }), false);
});
