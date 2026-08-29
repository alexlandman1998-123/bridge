import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const header = await readFile('src/components/HeaderBar.jsx', 'utf8')
const api = await readFile('src/lib/headerNotificationsApi.js', 'utf8')
assert.doesNotMatch(header, /from ['"]\.\.\/lib\/api['"]/, 'Shared header must not import the legacy API.')
assert.match(header, /from ['"]\.\.\/lib\/headerNotificationsApi['"]/, 'Shared header must use its focused notification client.')
assert.match(api, /runHeaderNotificationMaintenance/)
assert.match(api, /maintenancePromise \|\|= import\('\.\/api'\)/, 'Reminder maintenance may load legacy code only after bell interaction.')
assert.match(api, /const CACHE_TTL_MS = 15_000/)
assert.match(api, /let inFlight = null/)

const assets = await readdir('dist/assets')
const headerAsset = assets.find((name) => /^HeaderBar-.*\.js$/.test(name))
assert.ok(headerAsset, 'Fresh build must contain HeaderBar.')
const builtHeader = await readFile(`dist/assets/${headerAsset}`)
assert.doesNotMatch(builtHeader.toString('utf8'), /from"\.\/api-[A-Za-z0-9_-]+\.js"/, 'Built shared header must not statically import the legacy API.')
const gzipBytes = gzipSync(builtHeader).byteLength
assert.ok(gzipBytes <= 55 * 1024, `HeaderBar is ${gzipBytes} bytes gzip; Phase 6 ceiling is 55 KB.`)

for (const prefix of ['Dashboard', 'Units', 'AttorneyTransactionDetail', 'ClientPortal', 'UnitDetail', 'DevelopmentDetail']) {
  const asset = assets.find((name) => new RegExp(`^${prefix}-.*\\.js$`).test(name))
  assert.ok(asset, `Final build must contain ${prefix}.`)
  const source = (await readFile(`dist/assets/${asset}`)).toString('utf8')
  assert.doesNotMatch(source, /from"\.\/api-[A-Za-z0-9_-]+\.js"/, `${prefix} must retain its asynchronous legacy boundary.`)
}

console.log(`Platform Phase 6 shared-shell boundary passed (${gzipBytes} bytes gzip).`)
