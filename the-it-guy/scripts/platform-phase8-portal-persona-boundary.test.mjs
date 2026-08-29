import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const page = await readFile('src/pages/ClientPortal.jsx', 'utf8')
const workspace = await readFile('src/services/clientPortalWorkspaceService.js', 'utf8')
const boundary = await readFile('src/lib/sellerPortalApi.js', 'utf8')
assert.doesNotMatch(page, /from ['"]\.\.\/services\/privateListingService['"]/, 'Portal page must not eagerly load seller services.')
assert.doesNotMatch(workspace, /from ['"]\.\/privateListingService['"]/, 'Shared portal loader must not eagerly load seller services.')
assert.match(page, /from ['"]\.\.\/lib\/sellerPortalApi['"]/, 'Portal page must use the seller persona boundary.')
assert.match(workspace, /from ['"]\.\.\/lib\/sellerPortalApi['"]/, 'Portal loader must use the seller persona boundary.')
assert.match(boundary, /servicePromise \|\|= import\('\.\.\/services\/privateListingService'\)/)
assert.match(boundary, /export function getStoredSellerPortalAccessToken/)

const assets = await readdir('dist/assets')
const portalAsset = assets.find((name) => /^ClientPortal-.*\.js$/.test(name))
assert.ok(portalAsset)
const built = await readFile(`dist/assets/${portalAsset}`)
const builtText = built.toString('utf8')
assert.doesNotMatch(builtText, /from"\.\/privateListingService-[A-Za-z0-9_-]+\.js"/, 'Buyer/shared portal must not statically import seller services.')
const gzipBytes = gzipSync(built).byteLength
assert.ok(gzipBytes <= 188 * 1024, `Client Portal is ${gzipBytes} bytes gzip; Phase 8 ceiling is 188 KB.`)
console.log(`Client Portal Phase 8 persona boundary passed (${gzipBytes} bytes gzip).`)
