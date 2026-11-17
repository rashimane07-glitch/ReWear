// Lets someone log in as the demo seller (so requests on the 30 demo listings can be accepted in a demo).
// It sets the password and the phone contact of the DEMO SELLER ONLY:
//
//   1. In backend/.env set:   DEMO_SELLER_PASSWORD=<8+ characters>
//                             DEMO_SELLER_PHONE=<a phone number you are happy to show in demos>
//   2. npm run demo:seller-login:dry     (shows what would change; writes nothing)
//   3. npm run demo:seller-login         (applies it)
//
// Then log in on the site as demo.seller@example.com with that password.
//
// SAFETY
//   * Changes exactly one record: the user with the demo marker (user:demo-seller-rewear). If that record is
//     missing or has no marker, nothing is changed.
//   * Uses the app's own rules: password 8-72 bytes, phone checked and normalised like the profile form.
//   * Never prints the password. Accepting a request shows the phone number to that buyer, so use a number
//     meant for demos.

const bcrypt = require('bcryptjs');

const config = require('../src/config/env');
const { validateProfileUpdate } = require('../src/validators/user.validator');
const { DEMO_MARKER, DEMO_SELLER } = require('./seed-demo');

const BCRYPT_ROUNDS = 10; // same as src/services/auth.service.js
const MAX_ATTEMPTS = 3;

// Checks the inputs with the app's own rules. Returns { password, contact } or throws an Error.
function checkInputs(password, phone) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 8) problems.push('DEMO_SELLER_PASSWORD must be at least 8 characters.');
  else if (Buffer.byteLength(password, 'utf8') > 72) problems.push('DEMO_SELLER_PASSWORD is too long (maximum 72 bytes).');
  let contact = null;
  if (typeof phone !== 'string' || phone.trim() === '') {
    problems.push('DEMO_SELLER_PHONE is required (the demo seller needs a phone number to accept requests).');
  } else {
    try {
      contact = validateProfileUpdate({ contact: { type: 'phone', value: phone.trim() } }).contact;
    } catch (err) {
      problems.push(`DEMO_SELLER_PHONE: ${((err.details || [])[0] || {}).message || err.message}`);
    }
  }
  if (problems.length) throw new Error(problems.join(' '));
  return { password, contact };
}

// Applies the change to the demo seller only. Returns 'updated' | 'would-update' | 'unchanged'.
async function setSellerLogin({ dryRun, userRepository, password, contact }) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const seller = await userRepository.findUserById(DEMO_SELLER.id);
    if (!seller) throw new Error('The demo seller does not exist yet. Run "npm run seed:demo" first.');
    if (seller.demoSeed !== DEMO_MARKER) throw new Error('The account with the demo seller id was NOT made by the seed script. Nothing was changed.');

    const samePassword = typeof seller.passwordHash === 'string' && (await bcrypt.compare(password, seller.passwordHash));
    const samePhone = Boolean(seller.contact && seller.contact.value === contact.value);
    if (samePassword && samePhone) return 'unchanged';
    if (dryRun) return 'would-update';

    const saved = await userRepository.updateUser({
      ...seller,
      passwordHash: samePassword ? seller.passwordHash : await bcrypt.hash(password, BCRYPT_ROUNDS),
      contact,
      updatedAt: new Date().toISOString(),
    });
    if (saved) return 'updated';
    // Changed at the same moment: read it again and retry.
  }
  throw new Error('The demo seller was changed at the same time. Please run the command again.');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!config.cloudant.url || !config.cloudant.apiKey) {
    console.error('FAILED: Cloudant is not configured (CLOUDANT_URL / CLOUDANT_APIKEY in backend/.env).');
    return 1;
  }
  const { password, contact } = checkInputs(process.env.DEMO_SELLER_PASSWORD, process.env.DEMO_SELLER_PHONE);
  const userRepository = require('../src/repositories/user.repository');
  const result = await setSellerLogin({ dryRun, userRepository, password, contact });
  const messages = {
    unchanged: 'Nothing to do: the demo seller already has this password and phone.',
    'would-update': `DRY RUN: would set the demo seller's password and phone (${contact.value}). Nothing was written.`,
    updated: `Done: ${DEMO_SELLER.email} can now log in with DEMO_SELLER_PASSWORD; phone set to ${contact.value}.`,
  };
  console.log(messages[result]);
  return 0;
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

module.exports = { checkInputs, setSellerLogin };
