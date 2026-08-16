import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../src/components/SharedTransactionShell.jsx', import.meta.url), 'utf8')
const attorneyDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.match(shellSource, /className = ''/)
assert.match(shellSource, /space-y-4 \$\{className\}/)
assert.match(attorneyDetailSource, /conveyancing-workspace-fit/)
assert.match(appCss, /\.conveyancing-workspace-fit/)
assert.match(appCss, /overflow-x: clip/)
assert.match(appCss, /overflow-wrap: anywhere/)
assert.match(appCss, /button:not\(\[aria-label\]\)/)
assert.match(appCss, /white-space: normal/)
assert.match(appCss, /grid-cols-7/)
assert.match(appCss, /grid-template-columns: minmax\(0, 1fr\) !important/)
assert.match(appCss, /text-overflow: clip/)
assert.match(packageSource, /test:conveyancing-workspace-overflow-phase2/)

console.log('conveyancing workspace UI overflow phase 2 contract passed')
