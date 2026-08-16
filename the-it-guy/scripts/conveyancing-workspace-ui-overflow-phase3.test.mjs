import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const attorneyDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.match(attorneyDetailSource, /archline-matter-header/)
assert.match(attorneyDetailSource, /archline-matter-header-topbar/)
assert.match(attorneyDetailSource, /archline-matter-header-actions/)
assert.match(attorneyDetailSource, /archline-matter-property-title/)
assert.match(attorneyDetailSource, /min-h-10 min-w-0/)
assert.match(attorneyDetailSource, /min-h-12 min-w-0/)
assert.doesNotMatch(attorneyDetailSource, /<h1 className="[^"]*line-clamp-2[^"]*archline-matter-property-title/)
assert.match(appCss, /\.conveyancing-workspace-fit \.archline-matter-header/)
assert.match(appCss, /\.archline-matter-header-actions button/)
assert.match(appCss, /\.archline-matter-property-title/)
assert.match(appCss, /white-space: normal/)
assert.match(appCss, /flex: 0 0 min\(10\.5rem, 78vw\)/)
assert.match(packageSource, /test:conveyancing-workspace-overflow-phase3/)

console.log('conveyancing workspace UI overflow phase 3 contract passed')
