import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildRentalsPhase0Baseline } from './rentals-phase0-baseline.mjs'

const report = await buildRentalsPhase0Baseline()

assert.equal(report.version, 'arch9_rentals_phase0_baseline_v1')
assert.equal(report.decision, 'PHASE_0_READY_FOR_DOMAIN_CONTRACT')
assert.equal(report.guard.checks.every((check) => check.passed), true)
assert.ok(report.rentals.routes.includes('/agent/rentals/dashboard'))
assert.ok(report.rentals.routes.includes('/agent/rentals/listings'))
assert.ok(report.rentals.serviceFiles.some((file) => file.endsWith('rentalListingArchitecture.js')))
assert.ok(report.salesRegressionCommands.includes('npm run test:sales-listing-workspace-phase3'))
assert.ok(report.database.migrationFiles.length > 0, 'expected existing migration inventory')

const appSource = await fs.readFile(path.resolve('src/App.jsx'), 'utf8')
const permissionSource = await fs.readFile(path.resolve('src/auth/permissions/permissionRegistry.js'), 'utf8')
assert.ok(
  /const RentalApplicationsPage = lazy\(/.test(appSource) || appSource.includes("from './modules/rentals'"),
  'rental page loading must remain lazy, either in App or behind the Rentals module boundary',
)
assert.match(appSource, /function RentalWorkspaceGuard/)
assert.match(permissionSource, /prefix: '\/agent\/rentals\/listings'/)

console.log('Rentals Phase 0 baseline checks passed.')
