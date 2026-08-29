import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const unit = await readFile('src/pages/UnitDetail.jsx', 'utf8')
const development = await readFile('src/pages/DevelopmentDetail.jsx', 'utf8')
assert.doesNotMatch(unit, /from ['"]\.\.\/lib\/api['"]/, 'Unit detail must use its async API boundary.')
assert.doesNotMatch(development, /from ['"]\.\.\/lib\/api['"]/, 'Development detail must use its async API boundary.')
assert.match(unit, /from ['"]\.\.\/lib\/unitDetailApi['"]/, 'Unit detail API boundary must be wired.')
assert.match(development, /from ['"]\.\.\/lib\/developmentDetailApi['"]/, 'Development detail API boundary must be wired.')
assert.match(unit, /lazy\(\(\) => import\(['"]\.\.\/components\/AlterationRequestsPanel['"]\)\)/)
assert.match(unit, /lazy\(\(\) => import\(['"]\.\.\/components\/transaction\/TransactionFinanceCommandCenter['"]\)\)/)
assert.match(development, /lazy\(\(\) => import\(['"]\.\.\/components\/DevelopmentAttorneyCommercialSetup['"]\)\)/)

const assets = await readdir('dist/assets')
for (const [prefix, ceilingKb] of [['UnitDetail', 85], ['DevelopmentDetail', 70]]) {
  const asset = assets.find((name) => new RegExp(`^${prefix}-.*\\.js$`).test(name))
  assert.ok(asset, `Fresh build must contain ${prefix}.`)
  const built = await readFile(`dist/assets/${asset}`)
  assert.doesNotMatch(built.toString('utf8'), /from"\.\/api-[A-Za-z0-9_-]+\.js"/, `${prefix} must not statically import the legacy API.`)
  const gzipBytes = gzipSync(built).byteLength
  assert.ok(gzipBytes <= ceilingKb * 1024, `${prefix} is ${gzipBytes} bytes gzip; Phase 4 ceiling is ${ceilingKb} KB.`)
  console.log(`${prefix} Phase 4 boundary passed (${gzipBytes} bytes gzip).`)
}
