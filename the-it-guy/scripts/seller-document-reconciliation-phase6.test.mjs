import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildSellerDocumentRequirementReconciliationGate,
  buildSellerDocumentRequirementReconciliationReport,
  getExpectedSellerDocumentRequirements,
} from '../src/services/sellerDocumentRequirementsService.js'

const listing = {
  id: '22222222-2222-4222-8222-222222222222',
  organisationId: '33333333-3333-4333-8333-333333333333',
  title: '409 Queens Crescent',
  listingStatus: 'onboarding_completed',
  sellerOnboardingStatus: 'completed',
  sellerOnboarding: {
    status: 'completed',
    formData: {
      sellerType: 'natural_person',
      propertyStructureType: 'full_title',
      gasInstallation: true,
      solarInstallation: true,
    },
  },
  documentRequirements: [
    { id: 'req-id', requirement_key: 'id_document', status: 'required', is_required: true },
    { id: 'req-stale', requirement_key: 'seller_contact_confirmation', status: 'required', is_required: true },
  ],
}

const driftReport = buildSellerDocumentRequirementReconciliationReport([listing], {
  generatedAt: '2026-07-13T12:00:00.000Z',
})
const driftGate = buildSellerDocumentRequirementReconciliationGate(driftReport)

assert.equal(driftGate.contractVersion, 'seller_document_reconciliation_gate_v1')
assert.equal(driftGate.phase, '6')
assert.equal(driftGate.status, 'fail')
assert.equal(driftGate.exitCode, 1)
assert.equal(driftGate.releaseReady, false)
assert.ok(driftGate.blockers.some((blocker) => blocker.includes('missing or stale seller document requirement rows')))
assert.equal(driftGate.summary.syncable, 1)

const warningGate = buildSellerDocumentRequirementReconciliationGate(driftReport, {
  failOnSyncNeeded: false,
})
assert.equal(warningGate.status, 'warning')
assert.equal(warningGate.exitCode, 0)
assert.equal(warningGate.releaseReady, true)
assert.ok(warningGate.warnings.some((warning) => warning.includes('missing or stale seller document requirement rows')))

const readyListing = {
  ...listing,
  documentRequirements: getExpectedSellerDocumentRequirements(listing).map((requirement, index) => ({
    id: `req-${index}`,
    requirement_key: requirement.requirement_key,
    requirement_name: requirement.requirement_name,
    status: 'required',
    is_required: true,
  })),
}
const readyGate = buildSellerDocumentRequirementReconciliationGate(
  buildSellerDocumentRequirementReconciliationReport([readyListing]),
)
assert.equal(readyGate.status, 'pass')
assert.equal(readyGate.exitCode, 0)
assert.equal(readyGate.releaseReady, true)

const loadFailedReport = buildSellerDocumentRequirementReconciliationReport([])
loadFailedReport.summary.loadFailed = 1
loadFailedReport.actionQueues.manualReview.push({
  listingId: 'missing-listing',
  status: 'load_failed',
})
const loadFailedGate = buildSellerDocumentRequirementReconciliationGate(loadFailedReport)
assert.equal(loadFailedGate.status, 'fail')
assert.ok(loadFailedGate.blockers.some((blocker) => blocker.includes('could not be loaded')))
assert.ok(loadFailedGate.blockers.some((blocker) => blocker.includes('manual review')))

const cliSource = readFileSync(new URL('./reconcile-seller-documents.mjs', import.meta.url), 'utf8')
assert.match(cliSource, /--gate/)
assert.match(cliSource, /buildSellerDocumentRequirementReconciliationGate/)
assert.match(cliSource, /options\.gate && options\.dryRun === false/)
assert.match(cliSource, /Seller document reconciliation gate is dry-run only/)
assert.match(cliSource, /process\.exitCode = report\.gate\.exitCode/)
assert.match(cliSource, /## Gate/)

const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /"test:seller-document-reconciliation-phase6": "node scripts\/seller-document-reconciliation-phase6\.test\.mjs"/)
assert.match(packageSource, /"verify:seller-documents": "node scripts\/reconcile-seller-documents\.mjs --gate"/)

const sourceOfTruthContract = readFileSync(new URL('../docs/seller-lead-listing-source-of-truth.md', import.meta.url), 'utf8')
assert.match(sourceOfTruthContract, /Phase 6 turns reconciliation into a non-mutating release gate/)
assert.match(sourceOfTruthContract, /npm run verify:seller-documents/)
assert.match(sourceOfTruthContract, /gate refuses `--apply`/)

console.log('seller document reconciliation phase 6 tests passed')
