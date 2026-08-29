import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const distAssets = path.resolve('dist/assets')

const priorityRoutes = [
  { route: '/dashboard', source: 'src/pages/Dashboard.jsx' },
  { route: '/transactions', source: 'src/pages/Units.jsx' },
  { route: '/transactions/:transactionId', source: 'src/pages/AttorneyTransactionDetail.jsx' },
  { route: '/client/:token', source: 'src/pages/ClientPortal.jsx' },
  { route: '/units/:unitId', source: 'src/pages/UnitDetail.jsx' },
  { route: '/developments/:developmentId', source: 'src/pages/DevelopmentDetail.jsx' },
]

const chunkBudgets = [
  { prefix: 'api-', gzipBytes: 460 * 1024 },
  { prefix: 'Units-', gzipBytes: 20 * 1024 },
  { prefix: 'HeaderBar-', gzipBytes: 18 * 1024 },
  { prefix: 'AttorneyTransactionDetail-', gzipBytes: 290 * 1024 },
  { prefix: 'ClientPortal-', gzipBytes: 230 * 1024 },
  { prefix: 'UnitDetail-', gzipBytes: 90 * 1024 },
  { prefix: 'DevelopmentDetail-', gzipBytes: 75 * 1024 },
]

for (const target of priorityRoutes) {
  assert.ok(existsSync(target.source), `${target.route} source must exist at ${target.source}`)
}

assert.ok(existsSync(distAssets), 'dist/assets must exist; run npm run build before the Phase 0 performance gate')
const assets = await fs.readdir(distAssets)
for (const budget of chunkBudgets) {
  const asset = assets.find((name) => name.startsWith(budget.prefix) && name.endsWith('.js'))
  assert.ok(asset, `expected a built ${budget.prefix}*.js chunk`)
  const content = await fs.readFile(path.join(distAssets, asset))
  const gzipBytes = gzipSync(content).length
  assert.ok(
    gzipBytes <= budget.gzipBytes,
    `${asset} is ${gzipBytes} bytes gzip; Phase 0 budget is ${budget.gzipBytes}`,
  )
}

const [traceSource, baselineSource, unitsSource, routeBoundarySource] = await Promise.all([
  fs.readFile('src/lib/performanceTrace.js', 'utf8'),
  fs.readFile('scripts/performance-baseline.mjs', 'utf8'),
  fs.readFile('src/pages/Units.jsx', 'utf8'),
  fs.readFile('scripts/transactions-route-bundle-boundary.test.mjs', 'utf8'),
])

for (const milestone of ['shell_ready', 'core_ready', 'interactive_ready']) {
  assert.match(`${traceSource}\n${unitsSource}`, new RegExp(milestone))
}
assert.match(baselineSource, /requestSummary: summarizeRouteRequests/)
assert.match(baselineSource, /duplicateRequestCount/)
assert.match(baselineSource, /warm:/)
assert.match(baselineSource, /\/transactions\/__performance_baseline__/)
assert.match(routeBoundarySource, /Transactions route bundle boundary checks passed/)

console.log('Platform Phase 0 performance gate passed.')
