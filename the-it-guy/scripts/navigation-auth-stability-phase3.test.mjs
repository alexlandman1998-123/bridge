import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [app, authClient, transactionShell] = await Promise.all([
  readFile('src/App.jsx', 'utf8'),
  readFile('src/lib/supabaseClient.js', 'utf8'),
  readFile('src/components/transactions/TransactionDetailRouteShell.jsx', 'utf8'),
])

assert.match(app, /function getStableRouteContentKey\(pathname = ''\)/)
assert.match(app, /return pathname/)
assert.doesNotMatch(app, /return `\$\{pathname\}\$\{search \|\| ''\}`/)
assert.match(app, /const recoverableSessionRestoreFailure =/)
assert.match(app, /if \(authState\.status === 'error'\)/)
assert.match(app, /if \(authState\.status === 'unauthenticated'\)/)
assert.match(app, /<TransactionDetailRoute \/>/)
assert.match(app, /function TransactionDetailRoute\(\)/)

assert.match(authClient, /let cacheGeneration = 0/)
assert.match(authClient, /const invalidate = \(\) => \{/)
assert.match(authClient, /cacheGeneration \+= 1/)
assert.doesNotMatch(authClient, /const clear = \(\) => \{\s*inFlight = null/s)
assert.match(authClient, /requestGeneration === cacheGeneration/)

assert.match(transactionShell, /aria-label="Loading transaction workspace"/)

console.log('Phase 3 navigation and auth stability checks passed.')
