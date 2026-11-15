// Gives or takes away the administrator role. Run it yourself, on the machine that has the .env file:
//
//   npm run admin:create -- student@example.com     (make this account an administrator)
//   npm run admin:demote -- student@example.com     (make it a normal student again)
//
// The account must already exist (register it through the app first). Administrators can NOT be
// created through the API, so nobody can promote themselves. The change takes effect at once,
// even for a login token issued earlier, because admin routes read the role from the database.
// It changes only the "role" of that one account; nothing else is read, printed or changed.

const { ROLES } = require('../src/config/constants');
const userRepository = require('../src/repositories/user.repository');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 3;

async function main() {
  const args = process.argv.slice(2);
  const demote = args.includes('--demote');
  const email = (args.find((arg) => !arg.startsWith('--')) || '').trim().toLowerCase(); // same cleaning as login
  const targetRole = demote ? ROLES.STUDENT : ROLES.ADMIN;

  if (!EMAIL_PATTERN.test(email)) {
    console.error(`Usage: npm run ${demote ? 'admin:demote' : 'admin:create'} -- <email>`);
    process.exit(1);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const user = await userRepository.findUserByEmail(email);
    if (!user) {
      console.error('No account with that email exists. Register it through the app first.');
      process.exit(1);
    }
    if (user.role === targetRole) {
      console.log(`Nothing to do: that account is already ${targetRole === ROLES.ADMIN ? 'an administrator' : 'a student'}.`);
      process.exit(0);
    }

    const saved = await userRepository.updateUser({ ...user, role: targetRole, updatedAt: new Date().toISOString() });
    if (saved) {
      console.log(`Done: that account is now ${targetRole === ROLES.ADMIN ? 'an administrator' : 'a student'}.`);
      process.exit(0);
    }
    // The account changed at the same moment: read it again and retry.
  }

  console.error('The account was changed at the same time. Please run the command again.');
  process.exit(1);
}

main().catch((err) => {
  // Our own errors carry a safe message (e.g. "Cloudant is not configured"); never print anything else.
  console.error(`FAILED: ${(err && err.statusCode && err.message) || 'unexpected error'}`);
  process.exit(1);
});
