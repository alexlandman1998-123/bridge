import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  RENTAL_LISTING_RELEASE_GATE_VERSION,
  buildRentalListingReleaseGate,
} from '../the-it-guy/src/services/rentals/rentalListingReleaseGateModel.js'

const repoRoot = process.cwd()
const rentalSourceRoots = [
  path.join(repoRoot, 'the-it-guy', 'src', 'pages', 'rentals'),
  path.join(repoRoot, 'the-it-guy', 'src', 'services', 'rentals'),
]

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function collectSourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(absolutePath)
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [absolutePath] : []
  })
}

const rentalSource = rentalSourceRoots
  .flatMap(collectSourceFiles)
  .map((filePath) => `${filePath}\n${readFile(filePath)}`)
  .join('\n\n')

const appSource = readFile(path.join(repoRoot, 'the-it-guy', 'src', 'App.jsx'))
const packageJson = JSON.parse(readFile(path.join(repoRoot, 'package.json')))

const liveProperty24WritePatterns = [
  /callProperty24ListingAction\s*\(/,
  /property24\/listings\/[^'"]+\/publish/,
  /publishProperty24Listing\s*\(/,
  /server\/property24\/publishService/,
]

const deferredAccountingPatterns = [
  /rentCollection/i,
  /collectRent/i,
  /arrearsLedger/i,
  /landlordPayout/i,
  /rentalAccounting/i,
  /processPayout/i,
]

const sourceGuards = {
  noLiveProperty24Write: liveProperty24WritePatterns.every((pattern) => !pattern.test(rentalSource)),
  noDeferredAccounting: deferredAccountingPatterns.every((pattern) => !pattern.test(rentalSource)),
}

const gate = buildRentalListingReleaseGate({ sourceGuards })
assert.equal(gate.version, RENTAL_LISTING_RELEASE_GATE_VERSION)
assert.equal(gate.status, 'passed')
assert.equal(gate.passed, true)
assert.deepEqual(gate.failedChecks, [])

for (const requiredCheck of [
  'architecture_version',
  'route_contract',
  'tab_contract',
  'tab_routes',
  'property24_readiness_contract',
  'property24_ready_fixture',
  'publish_request_guarded',
  'publish_live_write_disabled',
  'listings_module_available',
  'property24_module_flagged',
  'deferred_accounting_boundary',
  'no_live_property24_source_path',
  'no_deferred_accounting_source_path',
]) {
  assert.ok(gate.checks.some((check) => check.key === requiredCheck && check.passed), `missing passed gate check: ${requiredCheck}`)
}

assert.equal(gate.readiness.readyToPublish, true)
assert.equal(gate.publishRequest.liveWriteEnabled, false)
assert.equal(gate.publishRequest.requiresBackendPublisher, true)
assert.equal(gate.publishRequest.requestPayload.listingType, 'Rental')

for (const route of [
  'path="/agent/rentals/listings/new"',
  'path="/agent/rentals/listings/:listingId/:detailTab?"',
  'path="/agent/rentals/listings"',
]) {
  assert.ok(appSource.includes(route), `missing rental listing route: ${route}`)
}

assert.equal(packageJson.scripts['test:rental-listing-release-gate'], 'node scripts/rental-listing-release-gate.test.mjs')

console.log('rental listing release gate tests passed')
