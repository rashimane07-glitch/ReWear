// One-time database setup. Run it yourself with:  npm run db:setup
//
// What it does:
//   - If the database (CLOUDANT_DATABASE, default "rewear") already exists: does nothing.
//   - If it does not exist: creates it.
//   - Makes sure the query indexes exist (safe to repeat).
// It never deletes or overwrites anything, and it is safe to run repeatedly.

const config = require('../src/config/env');
const { setupDatabase, ensureIndexes } = require('../src/config/database');

async function main() {
  console.log(`Setting up Cloudant database "${config.cloudant.database}"...`);

  const result = await setupDatabase();

  if (result.ok) {
    console.log(`OK: ${result.message}`);
    const indexes = await ensureIndexes();
    if (indexes.ok) {
      console.log(`OK: ${indexes.message}`);
      process.exit(0);
    }
    console.error(`FAILED: ${indexes.message}`);
    process.exit(1);
  }

  console.error(`FAILED: ${result.message}`);
  if (result.httpStatus || result.errorCode) {
    const details = [result.httpStatus && `HTTP ${result.httpStatus}`, result.errorCode].filter(Boolean);
    console.error(`(Technical details: ${details.join(', ')})`);
  }
  process.exit(1);
}

main();
