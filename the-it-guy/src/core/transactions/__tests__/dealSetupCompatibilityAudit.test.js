import assert from 'node:assert/strict'
import test from 'node:test'
import { auditDealSetupCompatibility, auditImportedDealBatch, identifyDealImport } from '../dealSetupCompatibilityAudit.js'

test('compatibility audit identifies legacy transactions needing backfill', () => {
  const audit = auditDealSetupCompatibility({ transaction: { id: 'legacy', purchaser_type: 'individual', finance_type: 'cash' }, buyerParties: [] })
  assert.equal(audit.readyForBackfill, false)
  assert.ok(audit.issues.some((item) => item.includes('buyer')))
})

const importedTransaction = {
  id: 'imported', organisation_id: 'org', transaction_reference: 'PR-OTP-IMP-R09',
  comment: 'Internal import draft from Produktive_OTP_Transaction_Import.xlsx row 9. Source PDF: source.pdf. Workbook status: Review required. Unverified; review before progressing or sharing.',
  buyer_id: 'buyer', purchaser_type: 'individual', finance_type: 'cash',
  buyer_parties_model_version: 'transaction_buyers_phase1_v1',
  sale_date: '2026-08-14', stage_date: '2026-09-01', stage: 'Transfer', current_main_stage: 'TRANS',
}

test('legacy workbook evidence identifies an import but references and dates alone do not', () => {
  assert.equal(identifyDealImport(importedTransaction).status, 'identified')
  assert.equal(identifyDealImport({ transaction_reference: 'PR-OTP-IMP-R09' }).status, 'candidate')
  assert.equal(identifyDealImport({ ...importedTransaction, transaction_reference: 'PR-OTP-IMP-R08' }).status, 'candidate')
  assert.equal(identifyDealImport({ sale_date: '2020-01-01' }).status, 'not_identified')
  assert.equal(identifyDealImport({ transaction_origin_source: 'bulk_import' }).status, 'identified')
})

test('import audit reports gaps without changing historical dates, stages or names', () => {
  const record = { transaction: importedTransaction, buyerParties: [], documents: [], buyerProfile: { id: 'buyer', name: 'Captured Buyer' } }
  const before = structuredClone(record)
  const report = auditImportedDealBatch({ organisationId: 'org', records: [record] })
  assert.deepEqual(record, before)
  assert.equal(report.readOnly, true)
  assert.equal(report.counts.identifiedImports, 1)
  assert.equal(report.counts.missingBuyerParties, 1)
  assert.equal(report.rows[0].saleDate, '2026-08-14')
  assert.equal(report.rows[0].stage, 'Transfer')
  assert.ok(report.rows[0].issueCodes.includes('unlinked_captured_buyer'))
  assert.ok(report.rows[0].issueCodes.includes('source_document_not_linked'))
})

test('an attached source and consistent buyer links still require human identity review', () => {
  const report = auditImportedDealBatch({ organisationId: 'org', records: [{
    transaction: { ...importedTransaction, primary_buyer_participant_id: 'participant', buyer_name: 'Captured Buyer' },
    buyerProfile: { id: 'buyer', name: ' captured  buyer ' },
    buyerParties: [{ id: 'participant', buyer_party_id: 'buyer', is_primary_buyer: true }],
    documents: [{ id: 'source-document', file_name: 'SOURCE.pdf', document_type: 'otp' }],
  }] })
  assert.equal(report.counts.missingBuyerParties, 0)
  assert.equal(report.counts.missingSourceDocuments, 0)
  assert.equal(report.rows[0].requiresDetailsReview, true)
  assert.deepEqual(report.rows[0].issueCodes, [])
})

test('audit keeps uncertain candidates separate and detects missing dates and name differences', () => {
  const report = auditImportedDealBatch({ organisationId: 'org', records: [{
    transaction: { ...importedTransaction, comment: '', sale_date: null, buyer_name: 'Scanned Name' },
    buyerProfile: { id: 'buyer', name: 'Different Name' },
  }] })
  assert.equal(report.counts.identifiedImports, 0)
  assert.equal(report.counts.candidatesRequiringScopeConfirmation, 1)
  assert.ok(report.rows[0].issueCodes.includes('historical_sale_date_missing'))
  assert.ok(report.rows[0].issueCodes.includes('captured_buyer_name_mismatch'))
})

test('audit requires a single explicit organisation and excludes normal backdated deals', () => {
  assert.throws(() => auditImportedDealBatch({ records: [] }), /Choose an organisation/)
  assert.throws(() => auditImportedDealBatch({ organisationId: 'other', records: [{ transaction: importedTransaction }] }), /selected organisation/)
  assert.equal(auditImportedDealBatch({ organisationId: 'org', records: [{ transaction: { id: 'normal', organisation_id: 'org', sale_date: '2020-01-01' } }] }).rows.length, 0)
})
