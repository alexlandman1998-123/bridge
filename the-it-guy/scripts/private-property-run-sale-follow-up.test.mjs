import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-run-sale-follow-up.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-sale-follow-up-'))
const baselinePath = path.join(outputDir, 'baseline.json')
const output = path.join(outputDir, 'sale-follow-up.json')

assert.match(source, /sale-residential-change-unique-id/)
assert.match(source, /sale-commercial-cancel-showday-reduce-price/)
assert.match(source, /sale-farm-reorder-agents/)
assert.match(source, /sale-land-offers-from/)
assert.match(source, /salesPricePresentation/)
assert.match(source, /--offers-from/)
assert.match(source, /missing_argument:--offers-from/)
assert.match(source, /apply_requires_exactly_one_sale_action/)
assert.match(source, /new_property_id_must_differ_from_current_property_id/)
assert.match(source, /--active=false/)
assert.match(source, /--price=\$\{action\.reducedPrice\}/)
assert.match(source, /ARCH9-SANDBOX-USER-2,ARCH9-SANDBOX-USER-1/)
assert.match(source, /retryAttempted: false/)

fs.writeFileSync(baselinePath, `${JSON.stringify({
  phase: 'private-property-sandbox-phase1-baseline',
  status: 'CAPTURED',
  baseline: {
    listings: [
      { propertyId: 'PP-SANDBOX-SALE-RES-VIDEO-001', captureStatus: 'CAPTURED', privatePropertyReference: 'T2870290' },
      { propertyId: 'PP-SANDBOX-SALE-COM-SHOWDAY-001', captureStatus: 'CAPTURED', privatePropertyReference: 'T2870291' },
      { propertyId: 'PP-SANDBOX-SALE-FARM-AUCTION-001', captureStatus: 'CAPTURED', privatePropertyReference: 'T2870292' },
      { propertyId: 'PP-SANDBOX-SALE-LAND-001', captureStatus: 'CAPTURED', privatePropertyReference: 'T2870293' },
    ],
  },
}, null, 2)}\n`)
const result = spawnSync(process.execPath, [scriptPath, '--action=all', `--baseline=${baselinePath}`, `--output=${output}`], {
  cwd: appRoot,
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(report.status, 'DRY_RUN')
assert.equal(report.baseline.ready, true)
assert.equal(report.actions.length, 4)
assert.equal(report.actions.find((action) => action.id === 'sale-land-offers-from').executable, true)
assert.equal(report.safety.privatePropertyApiCalled, false)
assert.equal(report.safety.listingOrAgentChanged, false)

fs.rmSync(outputDir, { recursive: true, force: true })
console.log('Private Property sale follow-up contract passed')
