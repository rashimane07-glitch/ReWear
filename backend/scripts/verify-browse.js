// Read-only smoke test of the browse queries against your REAL IBM Cloudant database.
// Run it yourself with:  npm run db:verify-browse
//
// WHY: the automated tests use an in-memory fake of Cloudant, which cannot prove that real
// Cloudant accepts the browse queries ($regex, $or, $in, sort + JSON index, bookmarks, null
// prices). This script sends the same queries the API sends and checks the answers.
//
// It only READS (POST /_find). It never creates, changes or deletes anything. Run
// "npm run db:setup" first so the two "listing-feed-*" indexes exist. Add a few listings
// (and make sure at least one is "sell" and one "donate") for the strongest check.
// It prints only our own messages, never credentials or raw errors.

const { checkConnection } = require('../src/config/database');
const listingRepository = require('../src/repositories/listing.repository');

let failed = 0;
const pass = (message) => console.log(`PASS  ${message}`);
const fail = (message) => {
  failed += 1;
  console.log(`FAIL  ${message}`);
};
const info = (message) => console.log(`INFO  ${message}`);

const search = (params) =>
  listingRepository.searchPublicListings({ filters: {}, searchTerms: [], sort: 'newest', limit: 5, ...params });

// Runs one search; reports a failure (with our error code only) instead of throwing.
async function attempt(label, params) {
  try {
    return await search(params);
  } catch (err) {
    fail(`${label}: ${(err && err.code) || 'unexpected error'}${err && err.statusCode ? ` (HTTP ${err.statusCode})` : ''}`);
    return null;
  }
}

const priceRank = (price) => (price === null || price === undefined ? -Infinity : price);
const inOrder = (values, direction) =>
  values.every((value, i) => i === 0 || (direction === 'asc' ? values[i - 1] <= value : values[i - 1] >= value));
const includesDoc = (result, doc) => Boolean(result) && result.docs.some((d) => d._id === doc._id);
const words = (text) => String(text).split(/[^A-Za-z0-9]+/).filter((word) => word.length >= 4);

async function main() {
  const connection = await checkConnection();
  if (!connection.ok) {
    console.log(`FAIL  Cannot reach Cloudant: ${connection.message}`);
    process.exit(1);
  }
  info(connection.message);

  // 1) every sort is accepted (needs the matching index) and really sorted
  const sorted = {};
  for (const sort of ['newest', 'oldest', 'price_asc', 'price_desc']) {
    const result = await attempt(`sort=${sort}`, { sort, limit: 50 });
    if (!result) continue;
    sorted[sort] = result;
    const { docs } = result;
    const strangers = docs.filter((doc) => doc.isDeleted !== false || doc.status !== 'available' || doc.type !== 'listing');
    if (strangers.length > 0) fail(`sort=${sort}: ${strangers.length} deleted/unavailable listing(s) came back`);
    const ordered =
      sort === 'newest' ? inOrder(docs.map((d) => String(d.createdAt)), 'desc')
      : sort === 'oldest' ? inOrder(docs.map((d) => String(d.createdAt)), 'asc')
      : sort === 'price_asc' ? inOrder(docs.map((d) => priceRank(d.price)), 'asc')
      : inOrder(docs.map((d) => priceRank(d.price)), 'desc');
    if (ordered && strangers.length === 0) {
      pass(`sort=${sort}: accepted, ${docs.length} listing(s), correctly ordered${sort.startsWith('price') ? ' (null price = lowest)' : ''}`);
    } else if (!ordered) {
      fail(`sort=${sort}: results are NOT in the expected order (for price sorts: is null really sorted before numbers?)`);
    }
  }

  const base = (sorted.newest && sorted.newest.docs) || [];
  if (base.length === 0) {
    info('No available listings found, so only "queries are accepted" could be checked. Create some listings and run again.');
  } else {
    const doc = base[0];

    // 2) filters ($in, equality, case-insensitive colour via $regex) find a real listing
    const one = await attempt('combined filters', {
      filters: { category: [doc.category], size: [doc.size], condition: [doc.condition], listingType: [doc.listingType], colour: String(doc.colour).toUpperCase() },
    });
    if (one && includesDoc(one, doc)) pass('all filters together (+ upper-case colour) found a known listing');
    else if (one) fail('all filters together did NOT find a listing that matches them (check $regex/$in support)');
    const many = await attempt('multi-value filter', { filters: { category: [doc.category, 'other'], size: [doc.size, 'xs'] } });
    if (many && includesDoc(many, doc)) pass('multi-value ($in) filters work');
    else if (many) fail('multi-value ($in) filters did NOT find a known listing');

    // 3) search ($or + $regex over title and description), any letter case
    const titleWord = words(doc.title)[0];
    const descriptionWord = words(doc.description)[0];
    if (titleWord) {
      const hit = await attempt('title search', { searchTerms: [titleWord.toUpperCase()] });
      if (hit && includesDoc(hit, doc)) pass(`title search for "${titleWord.toUpperCase()}" (upper case) found the listing`);
      else if (hit) fail(`title search for "${titleWord}" did NOT find a listing whose title contains it`);
    }
    if (descriptionWord) {
      const hit = await attempt('description search', { searchTerms: [descriptionWord.toLowerCase()] });
      if (hit && includesDoc(hit, doc)) pass(`description search for "${descriptionWord.toLowerCase()}" found the listing`);
      else if (hit) fail(`description search for "${descriptionWord}" did NOT find a listing whose description contains it`);
    }
    const literal = await attempt('regex characters', { searchTerms: ['.*', '(a+)+$'] });
    if (literal && literal.docs.length === 0) pass('regex characters in search text are matched literally (no results, no error)');
    else if (literal) fail('search text ".*" matched listings: it is being used as a pattern');
    if (titleWord && titleWord.length > 4) {
      const part = await attempt('partial word', { searchTerms: [titleWord.slice(0, titleWord.length - 1)] });
      if (part && includesDoc(part, doc)) pass('part of a word finds the listing');
      else if (part) fail('part of a word did not find the listing');
    }

    // 4) pagination with real bookmarks
    if (base.length >= 4) {
      const four = await attempt('pagination reference', { limit: 4 });
      const first = await attempt('pagination page 1', { limit: 2 });
      if (four && first && first.bookmark) {
        const second = await attempt('pagination page 2', { limit: 2, bookmark: first.bookmark });
        if (second) {
          const expected = four.docs.slice(2).map((d) => d._id);
          const got = second.docs.map((d) => d._id);
          if (JSON.stringify(expected) === JSON.stringify(got) && first.docs.every((d) => !got.includes(d._id))) {
            pass('page 2 (from the bookmark) continues exactly where page 1 stopped, with no repeats');
          } else {
            fail('page 2 does not continue where page 1 stopped');
          }
        }
        // a damaged bookmark must come back as our 400, never a 5xx
        const bad = `${first.bookmark.slice(0, 12)}AAAAAAAA`;
        try {
          await search({ limit: 2, bookmark: bad });
          fail('a damaged bookmark was ACCEPTED by Cloudant (results may be odd); the API cannot tell it is invalid');
        } catch (err) {
          if (err && err.statusCode === 400 && err.code === 'VALIDATION_ERROR') pass('a damaged bookmark is answered with a clean 400');
          else fail(`a damaged bookmark gave ${(err && err.code) || 'an unexpected error'} instead of a clean 400`);
        }
      } else if (four && first) {
        info('Cloudant gave no bookmark for a page of 2 although more listings exist; pagination not checked.');
      }
    } else {
      info('Fewer than 4 available listings: pagination not checked. Add more listings and run again.');
    }
  }

  const prices = new Set(((sorted.price_asc && sorted.price_asc.docs) || []).map((d) => (d.price === null ? 'null' : 'number')));
  if (!(prices.has('null') && prices.has('number'))) {
    info('Your data has only one kind of price (all null or all numbers), so the null-vs-number order was not exercised.');
  }

  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED. See the FAIL lines above.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(() => {
  console.log('FAIL  The check stopped because of an unexpected error.');
  process.exit(1);
});
