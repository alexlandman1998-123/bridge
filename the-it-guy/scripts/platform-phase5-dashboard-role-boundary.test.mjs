import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const page = await readFile('src/pages/Dashboard.jsx', 'utf8')
const secondary = await readFile('src/lib/dashboardSecondaryApi.js', 'utf8')
for (const component of ['ConveyancerDashboardPage', 'BridgeCommandCenterDashboard', 'ActivePipelineCarousel', 'ResidentialCommandCenterGrid']) {
  assert.match(page, new RegExp(`const ${component} = lazy\\(`), `${component} must be role-loaded.`)
}
assert.doesNotMatch(page, /from ['"]\.\.\/lib\/agencyPipelineService['"]/, 'Agent pipeline service must not be eager.')
assert.doesNotMatch(page, /from ['"]\.\.\/services\/privateListingService['"]/, 'Private listings must not be eager.')
assert.match(secondary, /import\('\.\/agencyPipelineService'\)/)
assert.match(secondary, /import\('\.\.\/services\/privateListingService'\)/)

const assets = await readdir('dist/assets')
const asset = assets.find((name) => /^Dashboard-.*\.js$/.test(name))
assert.ok(asset, 'Fresh build must contain Dashboard.')
const built = await readFile(`dist/assets/${asset}`)
assert.doesNotMatch(built.toString('utf8'), /from"\.\/api-[A-Za-z0-9_-]+\.js"/, 'Dashboard must not statically import the legacy API.')
const gzipBytes = gzipSync(built).byteLength
assert.ok(gzipBytes <= 95 * 1024, `Dashboard is ${gzipBytes} bytes gzip; Phase 5 ceiling is 95 KB.`)
console.log(`Dashboard Phase 5 role boundary passed (${gzipBytes} bytes gzip).`)
