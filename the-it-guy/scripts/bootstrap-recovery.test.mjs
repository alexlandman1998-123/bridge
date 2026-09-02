import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [indexHtml, appSource, packageJson] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('src/App.jsx', 'utf8'),
  readFile('package.json', 'utf8'),
])
const packageDefinition = JSON.parse(packageJson)

assert.match(indexHtml, /arch9:bootstrap-retry:v1/, 'The HTML shell must remember a bounded bootstrap retry.')
assert.match(indexHtml, /window\.addEventListener\('error'/, 'The HTML shell must catch a failed entry script before React starts.')
assert.match(indexHtml, /window\.addEventListener\('unhandledrejection'/, 'The HTML shell must catch a failed module import before React starts.')
assert.match(indexHtml, /Finishing the latest update/, 'A failed bootstrap must show a recovery screen instead of a blank page.')
assert.match(indexHtml, /arch9_bootstrap_reload/, 'Bootstrap recovery must navigate with a cache-busting URL.')
assert.match(appSource, /__arch9MarkBootstrapReady\?\.\(\)/, 'The app must retire the bootstrap retry after React has mounted.')
assert.match(packageDefinition.scripts['build:guarded'], /test:bootstrap-recovery/, 'Guarded builds must verify bootstrap recovery.')

console.log('bootstrap recovery tests passed')
