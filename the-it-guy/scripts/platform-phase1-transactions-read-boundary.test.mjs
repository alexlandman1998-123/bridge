import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const source = await readFile('src/lib/transactionsListApi.js', 'utf8')
const loader = await readFile('src/routes/transactionsRouteLoader.js', 'utf8')
const legacyBoundary = source.indexOf('let legacyPromise')

assert.ok(legacyBoundary > 0, 'Transactions list API must keep an explicit legacy action boundary.')
const readPath = source.slice(0, legacyBoundary)
assert.doesNotMatch(readPath, /import\(['"]\.\/api['"]\)/, 'List reads must not load the legacy API chunk.')
assert.match(readPath, /from ['"]\.\/supabaseClient['"]/, 'List reads should use the focused Supabase client.')
assert.match(readPath, /const TTL_MS = 60_000/, 'List reads should deduplicate and briefly cache completed requests.')
assert.match(readPath, /transactionIds = await resolveAccessibleTransactionIds/, 'Participant reads must resolve scoped transaction ids before row hydration.')
assert.match(readPath, /buyer:buyers\(id, name, phone, email\)/, 'Transactions should hydrate related summary fields in one nested query.')
assert.doesNotMatch(readPath, /fetchTransactionsListSummary\(\{ organisationId, activeTransactionsOnly: true \}\)/, 'Participant reads must never fetch the broad list before filtering.')
assert.match(loader, /preloadTransactionsListApi/, 'Navigation intent should warm the focused list-data cache.')

const assets = await readdir('dist/assets')
const unitsAsset = assets.find((name) => /^Units-.*\.js$/.test(name))
assert.ok(unitsAsset, 'Fresh build must contain the Transactions route chunk.')
const unitsSource = await readFile(`dist/assets/${unitsAsset}`)
const gzipBytes = gzipSync(unitsSource).byteLength
assert.ok(gzipBytes <= 18 * 1024, `Transactions route chunk is ${gzipBytes} bytes gzip; Phase 1 ceiling is 18 KB.`)

console.log(`Platform Phase 1 Transactions read boundary passed (${gzipBytes} bytes gzip).`)
