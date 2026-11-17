// Smoke test for the MOCK data layer (auth, listings, requests). No browser needed.
// Run: npm run test:smoke
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } }
globalThis.localStorage = mem(); globalThis.sessionStorage = mem()
// Safety: this test registers accounts and sends requests, so it must NEVER reach a real backend.
// "npm run test:smoke" forces mock mode (scripts/run-smoke.mjs); this guard stops any other way of running it.
const { API_MODE } = await import('../src/services/config.js')
if (API_MODE) {
  console.error('REFUSED: VITE_API_URL is set, so this test would write to the real backend. Run it with "npm run test:smoke".')
  process.exit(1)
}
const auth = await import('../src/services/auth.js')
const api = await import('../src/services/api.js')

let failed = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failed++ }
const errorOf = async (fn) => { try { await fn() } catch (e) { return e.message } return null }
const person = (id) => ({ id, name: `User ${id}`, college: 'Test College', email: `${id}@test.example` })
const listingOf = (userId, id) => api.getMyListings(userId).then((l) => l.find((x) => x.id === id))

// Auth
ok((await errorOf(() => auth.login('demo@rewear.test', 'wrong', true))) === 'Incorrect email or password.', 'wrong password is rejected')
ok((await auth.login('demo@rewear.test', 'demo1234', true)).user.id === 'demo', 'demo login works')
await auth.register({ name: 'Test', email: 'new@test.example', password: 'abcdefg1', college: 'X' })
ok((await auth.login('new@test.example', 'abcdefg1', false)).user.email === 'new@test.example', 'new account can log in')
ok((await errorOf(() => auth.register({ name: 'T', email: 'NEW@test.example', password: 'abcdefg1', college: 'X' }))) !== null, 'duplicate email is rejected')

// Requests and contact privacy
let r = await api.getRequests('demo')
ok(r.incoming.length === 3 && r.sent.length === 2, 'demo has 3 incoming and 2 sent requests')
ok(r.incoming.find((x) => x.id === 'r1').ownerContact === null, 'contact hidden while pending')
ok(r.sent.find((x) => x.id === 'r4').ownerContact !== null, 'contact visible once accepted')

// Accepting a purchase request reserves the item and declines the others
const B = person('uB'), C = person('uC')
await api.submitRequest(1, 'hi', B)
ok((await errorOf(() => api.submitRequest(1, 'again', B))) !== null, 'duplicate request is blocked')
await api.submitRequest(1, '', C)
r = await api.getRequests('demo')
await api.updateRequestStatus(r.incoming.find((x) => x.from.id === 'uB').id, 'accepted')
r = await api.getRequests('demo')
ok(r.incoming.filter((x) => x.listingId === 1 && x.status === 'rejected').length === 2, 'other pending requests on that item are declined')
ok((await listingOf('demo', 1)).status === 'reserved', 'accepted item becomes reserved')

// Exchange: both pieces are reserved, then completed
const mine = await api.createListing({ owner: B, name: 'Tee', category: 'Casual Wear', size: 'M', condition: 'Good', price: 200, description: 'test item', location: 'x', listingType: 'sell', images: [{ url: 'blob:1' }] })
await api.submitRequest(3, 'swap?', B, mine.id)
r = await api.getRequests('demo')
const swap = r.incoming.find((x) => x.from.id === 'uB' && x.listingId === 3)
ok(swap.offered?.id === mine.id, 'offered piece is attached to the request')
await api.updateRequestStatus(swap.id, 'accepted')
ok((await listingOf('uB', mine.id)).status === 'reserved' && (await listingOf('demo', 3)).status === 'reserved', 'accepted swap reserves both pieces')
await api.updateRequestStatus(swap.id, 'completed')
ok((await listingOf('uB', mine.id)).status === 'completed', 'completed swap marks both pieces completed')

// Misc
ok((await api.getListings()) !== (await api.getListings()), 'getListings returns a fresh array each time')
await api.deleteListing(mine.id)
ok(!(await listingOf('uB', mine.id)), 'deleted listing is gone')
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed'); process.exit(failed ? 1 : 0)
