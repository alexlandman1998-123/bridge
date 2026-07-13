import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildSellerDocumentRequirementReconciliationReviewPacket,
  buildSellerDocumentRequirementReconciliationReport,
  getExpectedSellerDocumentRequirements,
  renderSellerDocumentRequirementReconciliationRunbook,
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
      occupancyStatus: 'tenant_occupied',
    },
  },
  documentRequirements: [
    { id: 'req-id', requirement_key: 'id_document', status: 'required', is_required: true },
    { id: 'req-proof', requirement_key: 'proof_of_address', status: 'required', is_required: true },
    { id: 'req-stale', requirement_key: 'seller_contact_confirmation', status: 'required', is_required: true },
  ],
}

const report = buildSellerDocumentRequirementReconciliationReport([listing], {
  generatedAt: '2026-07-13T12:00:00.000Z',
})
const packet = buildSellerDocumentRequirementReconciliationReviewPacket(report, {
  source: 'phase_7_fixture',
  organisationId: listing.organisationId,
  outputDir: '/tmp/seller-documents',
})

assert.equal(packet.version, 'seller_document_reconciliation_review_packet_v1')
assert.equal(packet.phase, '7')
assert.equal(packet.status, 'blocked')
assert.equal(packet.mutatedData, false)
assert.equal(packet.dryRun, true)
assert.equal(packet.gate.status, 'fail')
assert.equal(packet.repairPlan.syncableCount, 1)
assert.deepEqual(packet.repairPlan.syncableListingIds, [listing.id])
assert.ok(packet.repairPlan.rows[0].missingRequirementKeys.includes('gas_compliance_certificate'))
assert.ok(packet.repairPlan.rows[0].staleRequirementKeys.includes('seller_contact_confirmation'))
assert.ok(packet.checklist.some((item) => item.key === 'apply_reviewed_requirement_sync' && item.done === false))
assert.ok(packet.operatorCommands.some((command) => command.includes('prepare:seller-documents')))
assert.equal(packet.operatorCommands.some((command) => command.includes('--apply')), false)
assert.ok(packet.artifacts.includes('seller-document-reconciliation-runbook.md'))

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
const readyPacket = buildSellerDocumentRequirementReconciliationReviewPacket(
  buildSellerDocumentRequirementReconciliationReport([readyListing]),
)
assert.equal(readyPacket.status, 'ready')
assert.equal(readyPacket.gate.status, 'pass')
assert.equal(readyPacket.repairPlan.syncableCount, 0)

const runbook = renderSellerDocumentRequirementReconciliationRunbook(packet)
assert.match(runbook, /# Seller Document Reconciliation Review Packet/)
assert.match(runbook, /Mutated data: no/)
assert.match(runbook, /409 Queens Crescent/)
assert.match(runbook, /Do not use the packet generator to apply repairs/)
assert.match(runbook, /Rerun `npm run verify:seller-documents`/)

const tempInput = path.join(os.tmpdir(), `seller-document-reconciliation-phase7-${Date.now()}.json`)
const outputDir = path.join(os.tmpdir(), `seller-document-reconciliation-phase7-output-${Date.now()}`)
fs.writeFileSync(tempInput, JSON.stringify(report, null, 2))

const cliOutput = execFileSync(
  process.execPath,
  ['scripts/prepare-seller-document-reconciliation-packet.mjs', `--input=${tempInput}`, `--output-dir=${outputDir}`],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
)
const cliPacket = JSON.parse(cliOutput)
assert.equal(cliPacket.version, 'seller_document_reconciliation_review_packet_v1')
assert.equal(cliPacket.repairPlan.syncableCount, 1)
assert.equal(cliPacket.source, `file:${path.resolve(process.cwd(), tempInput)}`)

for (const fileName of [
  'seller-document-reconciliation-packet.json',
  'seller-document-reconciliation-report.json',
  'seller-document-reconciliation-syncable.json',
  'seller-document-reconciliation-manual-review.json',
  'seller-document-reconciliation-runbook.md',
]) {
  assert.ok(fs.existsSync(path.join(outputDir, fileName)), `Expected ${fileName} artifact`)
}

const markdownOutput = execFileSync(
  process.execPath,
  ['scripts/prepare-seller-document-reconciliation-packet.mjs', `--input=${tempInput}`, '--markdown'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
)
assert.match(markdownOutput, /Seller Document Reconciliation Review Packet/)
assert.match(markdownOutput, /Syncable: 1/)

const packageSource = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
assert.match(packageSource, /"test:seller-document-reconciliation-phase7": "node scripts\/seller-document-reconciliation-phase7\.test\.mjs"/)
assert.match(packageSource, /"prepare:seller-documents": "node scripts\/prepare-seller-document-reconciliation-packet\.mjs"/)

const sourceOfTruthContract = fs.readFileSync(path.resolve(process.cwd(), 'docs/seller-lead-listing-source-of-truth.md'), 'utf8')
assert.match(sourceOfTruthContract, /Phase 7 packages the gate evidence into an operator runbook/)
assert.match(sourceOfTruthContract, /npm run prepare:seller-documents/)
assert.match(sourceOfTruthContract, /dry-run-only/)

console.log('seller document reconciliation phase 7 tests passed')
