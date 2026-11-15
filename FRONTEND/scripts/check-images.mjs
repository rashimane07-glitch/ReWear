// Run: npm run check:images  – fails if any /images/... path used in src/ is missing from public/images.
import fs from 'fs'; import path from 'path'
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const refs = new Set(walk('src').flatMap((f) => fs.readFileSync(f, 'utf8').match(/\/images\/[\w.-]+/g) || []))
const missing = [...refs].filter((r) => !fs.existsSync(path.join('public', r)))
console.log(`${refs.size} image paths referenced, ${missing.length} missing`); missing.forEach((m) => console.log('  MISSING', m)); process.exit(missing.length ? 1 : 0)
