import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-capture-sandbox-baseline.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-baseline-'))
const output = path.join(outputDir, 'baseline.json')

assert.match(source, /const ACCEPTED_LISTINGS = \[/)
assert.match(source, /PP-SANDBOX-RENTAL-RES-001/)
assert.match(source, /PP-SANDBOX-SALE-LAND-001/)
assert.match(source, /ARCH9-SANDBOX-USER-1/)
assert.match(source, /ARCH9-SANDBOX-USER-2/)
assert.match(source, /--capture/)
assert.match(source, /getListingsDetails/)
assert.match(source, /getListingStatus/)
assert.match(source, /getReferenceNumberByListing/)
assert.match(source, /getActiveListings/)
assert.match(source, /getListingEventFeedByBranch/)
assert.doesNotMatch(source, /updateListing\(/)
assert.doesNotMatch(source, /updateAgent\(/)
assert.doesNotMatch(source, /listingStatusUpdate\(/)

const result = spawnSync(process.execPath, [scriptPath, `--output=${output}`], {
  cwd: appRoot,
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(report.status, 'DRY_RUN')
assert.equal(report.safety.privatePropertyApiCalled, false)
assert.equal(report.safety.databaseWritten, false)
assert.equal(report.safety.listingOrAgentChanged, false)
assert.equal(report.baseline.listings.length, 7)
assert.equal(report.baseline.agents.length, 2)
assert.equal(report.plannedReadCalls.includes('GetListingsDetails'), true)

fs.rmSync(outputDir, { recursive: true, force: true })
console.log('Private Property sandbox baseline capture contract passed')
