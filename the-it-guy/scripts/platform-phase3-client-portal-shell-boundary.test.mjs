import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const page = await readFile('src/pages/ClientPortal.jsx', 'utf8')
const workspace = await readFile('src/services/clientPortalWorkspaceService.js', 'utf8')
const boundary = await readFile('src/lib/clientPortalApi.js', 'utf8')

assert.doesNotMatch(page, /from ['"]\.\.\/lib\/api['"]/, 'Client Portal must not statically import the legacy API.')
assert.doesNotMatch(page, /from ['"]\.\.\/services\/clientPortalNotificationsService['"]/, 'Portal notification mutations must remain action-loaded.')
assert.doesNotMatch(workspace, /from ['"]\.\.\/lib\/api['"]/, 'Client Portal core loader must use the async boundary.')
assert.doesNotMatch(workspace, /from ['"]\.\/clientPortalNotificationsService['"]/, 'Portal notification reads must remain dataset-loaded.')
assert.match(page, /from ['"]\.\.\/lib\/clientPortalApi['"]/, 'Client Portal actions must use the portal API boundary.')
assert.match(workspace, /from ['"]\.\.\/lib\/clientPortalApi['"]/, 'Client Portal loader must use the portal API boundary.')
assert.match(boundary, /portalApiPromise \|\|= import\('\.\/api'\)/, 'Portal API must be loaded once and on demand.')

const assets = await readdir('dist/assets')
const pageAsset = assets.find((name) => /^ClientPortal-.*\.js$/.test(name))
assert.ok(pageAsset, 'Fresh build must contain the Client Portal chunk.')
const builtPage = await readFile(`dist/assets/${pageAsset}`)
assert.doesNotMatch(builtPage.toString('utf8'), /from"\.\/api-[A-Za-z0-9_-]+\.js"/, 'Built Client Portal shell must not statically import the legacy API.')
const gzipBytes = gzipSync(builtPage).byteLength
assert.ok(gzipBytes <= 220 * 1024, `Client Portal chunk is ${gzipBytes} bytes gzip; Phase 3 ceiling is 220 KB.`)

console.log(`Platform Phase 3 Client Portal shell boundary passed (${gzipBytes} bytes gzip).`)
