// Runs the smoke test in MOCK mode, whatever FRONTEND/.env says.
// An empty VITE_API_URL in the environment wins over the .env file (Vite rule), so no request
// can reach a real backend. Run: npm run test:smoke
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx --yes vite-node scripts/smoke-test.mjs', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_API_URL: '' },
})
process.exit(result.status ?? 1)
