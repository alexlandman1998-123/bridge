import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildSellerDocumentRequirementReconciliationRecord,
  buildSellerDocumentRequirementReconciliationReport,
  getExpectedSellerDocumentRequirements,
  summarizeSellerDocumentRequirementReconciliationReport,
} from '../src/services/sellerDocumentRequirementsService.js'

const listing = {
  id: '22222222-2222-4222-8222-222222222222',
  organisationId: '33333333-3333-4333-8333-333333333333',
  sellerLeadId: 'seller-lead-1',
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
      occupancyStatus: 'tenant_occupied',
    },
  },
  documentRequirements: [
    { id: 'req-id', private_listing_id: '22222222-2222-4222-8222-222222222222', requirement_key: 'id_document', status: 'required', is_required: true },
    { id: 'req-proof', private_listing_id: '22222222-2222-4222-8222-222222222222', requirement_key: 'proof_of_address', status: 'required', is_required: true },
    { id: 'req-stale', private_listing_id: '22222222-2222-4222-8222-222222222222', requirement_key: 'seller_contact_confirmation', status: 'required', is_required: true },
  ],
}

const record = buildSellerDocumentRequirementReconciliationRecord(listing)

assert.equal(record.status, 'needs_sync')
assert.equal(record.canSync, true)
assert.equal(record.recommendedAction, 'sync_private_listing_document_requirements')
assert.ok(record.missingRequirementKeys.includes('gas_compliance_certificate'))
assert.ok(record.missingRequirementKeys.includes('solar_compliance_documents'))
assert.ok(record.missingRequirementKeys.includes('lease_agreement'))
assert.ok(record.staleRequirementKeys.includes('seller_contact_confirmation'))

const expectedRequirements = getExpectedSellerDocumentRequirements(listing)
const readyListing = {
  ...listing,
  documentRequirements: expectedRequirements.map((requirement, index) => ({
    id: `req-${index}`,
    private_listing_id: listing.id,
    requirement_key: requirement.requirement_key,
    requirement_name: requirement.requirement_name,
    requirement_group: requirement.requirement_group,
    status: 'required',
    is_required: true,
  })),
}
const readyRecord = buildSellerDocumentRequirementReconciliationRecord(readyListing)
assert.equal(readyRecord.status, 'ready')
assert.equal(readyRecord.canSync, false)

const report = buildSellerDocumentRequirementReconciliationReport([listing, readyListing], {
  generatedAt: '2026-07-13T12:00:00.000Z',
})
assert.equal(report.contractVersion, 'seller_document_reconciliation_v1')
assert.equal(report.dryRun, true)
assert.equal(report.summary.total, 2)
assert.equal(report.summary.ready, 1)
assert.equal(report.summary.needsSync, 1)
assert.equal(report.summary.syncable, 1)
assert.match(summarizeSellerDocumentRequirementReconciliationReport(report), /2 listings checked/)

const privateListingService = readFileSync(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
assert.match(privateListingService, /export async function runSellerDocumentRequirementReconciliation/)
assert.match(privateListingService, /dryRun = true/)
assert.match(privateListingService, /reason: 'seller_document_reconciliation_phase4'/)
assert.match(privateListingService, /buildSellerDocumentRequirementReconciliationReport/)

const cliSource = readFileSync(new URL('./reconcile-seller-documents.mjs', import.meta.url), 'utf8')
assert.match(cliSource, /--apply/)
assert.match(cliSource, /--organisation-id=/)
assert.match(cliSource, /runSellerDocumentRequirementReconciliation/)

const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /"test:seller-document-reconciliation-phase4": "node scripts\/seller-document-reconciliation-phase4\.test\.mjs"/)
assert.match(packageSource, /"reconcile:seller-documents": "node scripts\/reconcile-seller-documents\.mjs"/)

const sourceOfTruthContract = readFileSync(new URL('../docs/seller-lead-listing-source-of-truth.md', import.meta.url), 'utf8')
assert.match(sourceOfTruthContract, /Seller Document Requirement Reconciliation/)
assert.match(sourceOfTruthContract, /dry-run by default/)
assert.match(sourceOfTruthContract, /seller_document_reconciliation_phase4/)

console.log('seller document reconciliation phase 4 tests passed')
