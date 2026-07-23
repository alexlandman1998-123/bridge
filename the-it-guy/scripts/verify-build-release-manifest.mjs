import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distPath = resolve(process.cwd(), 'dist')
const manifestPath = resolve(distPath, 'release-manifest.json')
const indexPath = resolve(distPath, 'index.html')
const [manifestRaw, indexHtml] = await Promise.all([
  readFile(manifestPath, 'utf8'),
  readFile(indexPath, 'utf8'),
])
const manifest = JSON.parse(manifestRaw)

assert.equal(manifest.version, 1, 'Unexpected release manifest version.')
assert.ok(manifest.releaseId, 'Release manifest is missing releaseId.')
assert.ok(manifest.supabaseOrigin === null || (typeof manifest.supabaseOrigin === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(manifest.supabaseOrigin)), 'Release manifest has an invalid supabaseOrigin.')
assert.equal(manifest.listingDetailAssetDetected, true, 'Release manifest does not include the listing-detail chunk.')
assert.ok(Array.isArray(manifest.criticalAssets) && manifest.criticalAssets.length > 0, 'Release manifest has no critical assets.')
assert.match(indexHtml, new RegExp(`<meta name="arch9-release" content="${manifest.releaseId}"`), 'HTML and release manifest markers do not match.')

await Promise.all(manifest.criticalAssets.map((asset) => access(resolve(distPath, asset))))

console.log(JSON.stringify({
  version: 'arch9_build_release_manifest_v1',
  passed: true,
  releaseId: manifest.releaseId,
  supabaseOrigin: manifest.supabaseOrigin,
  criticalAssetCount: manifest.criticalAssets.length,
  listingDetailAssetDetected: manifest.listingDetailAssetDetected,
}, null, 2))
