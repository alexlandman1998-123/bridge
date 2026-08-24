import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const scriptPath = path.join(repoRoot, 'scripts', 'report-rental-listing-operational-release.mjs')
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

function runReport(args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}

const jsonOutput = runReport(['--json'])
const report = JSON.parse(jsonOutput)

assert.equal(report.version, 'arch9_rental_listing_operational_report_v1')
assert.equal(report.status, 'passed')
assert.equal(report.decision, 'ready_for_controlled_staging_smoke')
assert.equal(report.environment, 'staging_candidate')
assert.equal(report.scope.module, 'rentals')
assert.equal(report.scope.surface, 'rental_listings')
assert.ok(report.scope.excluded.includes('rent_collection'))
assert.equal(report.gate.status, 'passed')
assert.equal(report.gate.checks.failed, 0)
assert.ok(report.gate.checks.total >= 13)
assert.ok(report.gate.checks.all.some((check) => check.key === 'publish_live_write_disabled' && check.passed))
assert.equal(report.routes.index, '/agent/rentals/listings')
assert.equal(report.routes.syndication, '/agent/rentals/listings/:listingId/syndication')
assert.equal(report.property24.listingType, 'Rental')
assert.equal(report.property24.readyToPublish, true)
assert.equal(report.property24.liveWriteEnabled, false)
assert.equal(report.property24.requiresBackendPublisher, true)
assert.equal(report.property24.featureFlagBoundary, 'property24RentalsEnabled')
assert.ok(report.verificationCommands.includes('npm run test:rental-listing-release-gate'))
assert.ok(report.verificationCommands.includes('npm --prefix the-it-guy run build'))
assert.ok(report.nextActions.some((action) => /staging smoke/i.test(action)))

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rental-listing-report-'))
const jsonPath = path.join(tempDir, 'report.json')
const markdownPath = path.join(tempDir, 'report.md')
const writeOutput = runReport([
  '--write',
  '--json',
  '--output',
  jsonPath,
  '--markdown-output',
  markdownPath,
  '--environment',
  'staging',
])
const writtenReport = JSON.parse(writeOutput)
assert.equal(writtenReport.environment, 'staging')
assert.equal(writtenReport.outputs.json, path.relative(repoRoot, jsonPath))
assert.equal(writtenReport.outputs.markdown, path.relative(repoRoot, markdownPath))
assert.equal(JSON.parse(fs.readFileSync(jsonPath, 'utf8')).status, 'passed')
assert.match(fs.readFileSync(markdownPath, 'utf8'), /Rental Listing Operational Release Report/)
assert.match(fs.readFileSync(markdownPath, 'utf8'), /Live write enabled/)

assert.equal(
  packageJson.scripts['report:rental-listing-operational-release'],
  'node scripts/report-rental-listing-operational-release.mjs',
)
assert.equal(
  packageJson.scripts['test:rental-listing-operational-report'],
  'node scripts/rental-listing-operational-report.test.mjs',
)

console.log('rental listing operational report tests passed')
