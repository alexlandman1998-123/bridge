const inputUrl = process.argv.find((arg) => arg.startsWith('--url='))?.slice('--url='.length)
const baseUrl = String(inputUrl || process.env.APP_URL || process.env.VITE_APP_URL || '').trim()
if (!baseUrl) throw new Error('Provide --url=https://app.arch9.co.za or APP_URL.')

const appUrl = new URL(baseUrl)
const cacheBypass = String(Date.now())
const indexUrl = new URL(appUrl)
indexUrl.searchParams.set('arch9_release_probe', cacheBypass)

const indexResponse = await fetch(indexUrl, { headers: { 'Cache-Control': 'no-cache' } })
const indexHtml = await indexResponse.text()
if (!indexResponse.ok) throw new Error(`App shell returned HTTP ${indexResponse.status}.`)

const releaseMatch = indexHtml.match(/<meta\s+name=["']arch9-release["']\s+content=["']([^"']+)["']/i)
if (!releaseMatch) throw new Error('App shell is missing the arch9-release marker.')
const releaseId = releaseMatch[1]

const manifestUrl = new URL('/release-manifest.json', appUrl)
manifestUrl.searchParams.set('arch9_release_probe', cacheBypass)
const manifestResponse = await fetch(manifestUrl, { headers: { 'Cache-Control': 'no-cache' } })
const manifestText = await manifestResponse.text()
if (!manifestResponse.ok) throw new Error(`Release manifest returned HTTP ${manifestResponse.status}.`)
const manifest = JSON.parse(manifestText)
if (manifest.releaseId !== releaseId) {
  throw new Error(`Mixed release detected: app shell is ${releaseId}, manifest is ${manifest.releaseId}.`)
}
if (!manifest.listingDetailAssetDetected || !Array.isArray(manifest.criticalAssets) || !manifest.criticalAssets.length) {
  throw new Error('Release manifest is missing listing-detail critical assets.')
}

const checks = await Promise.all(manifest.criticalAssets.map(async (asset) => {
  const assetUrl = new URL(`/${String(asset).replace(/^\/+/, '')}`, appUrl)
  const response = await fetch(assetUrl, { headers: { 'Cache-Control': 'no-cache' } })
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  const expectedType = asset.endsWith('.css') ? 'text/css' : 'javascript'
  return {
    asset,
    status: response.status,
    contentType,
    ok: response.ok && contentType.includes(expectedType),
  }
}))
const failedAssets = checks.filter((check) => !check.ok)

console.log(JSON.stringify({
  version: 'arch9_deployed_release_assets_v1',
  appUrl: appUrl.origin,
  releaseId,
  manifestCacheControl: manifestResponse.headers.get('cache-control') || '',
  indexCacheControl: indexResponse.headers.get('cache-control') || '',
  criticalAssetCount: checks.length,
  passed: failedAssets.length === 0,
  failedAssets,
}, null, 2))

if (failedAssets.length) process.exit(1)
