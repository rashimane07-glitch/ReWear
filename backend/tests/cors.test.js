const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers/fakes'); // fake settings (NODE_ENV=test, FRONTEND_URL default)

// Which browser origins may call the API (CORS). See src/app.js.
test('CORS: the configured frontend and any local dev port are allowed; other sites are not', async () => {
  const server = await startServer();
  try {
    const originFor = async (origin) => {
      const res = await fetch(`${server.base}/health`, { headers: { Origin: origin } });
      return res.headers.get('access-control-allow-origin');
    };
    assert.equal(await originFor('http://localhost:5173'), 'http://localhost:5173');
    assert.equal(await originFor('http://localhost:5178'), 'http://localhost:5178'); // Vite on another port
    assert.equal(await originFor('http://127.0.0.1:5174'), 'http://127.0.0.1:5174');
    assert.equal(await originFor('https://evil.example.com'), null);
    assert.equal(await originFor('http://localhost.evil.example.com:5173'), null);
  } finally {
    await server.close();
  }
});
