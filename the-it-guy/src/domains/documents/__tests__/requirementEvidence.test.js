// @vitest-environment node
import { expect, it } from 'vitest'
import { buildRequiredChecklistFromRows } from '../requirementReadModel.js'

const requirement = { key: 'buyer_id', label: 'Buyer ID', isRequired: true, status: 'approved', canonicalRequirementInstanceId: 'requirement-one', uploadedDocumentId: 'document-one', transactionId: 'transaction-one' }
const document = { id: 'document-one', document_type: 'buyer_id', canonical_requirement_instance_id: 'requirement-one', transaction_id: 'transaction-one', is_current_evidence: true, status: 'approved' }
const item = documents => buildRequiredChecklistFromRows([requirement], documents).checklist[0]

it('requires available evidence even when the requirement was previously approved', () => {
  expect(item([])).toMatchObject({ complete: false, evidenceUnavailable: true, matchedDocument: null })
})
it('accepts the explicitly linked current evidence in the same transaction', () => {
  expect(item([document])).toMatchObject({ complete: true, evidenceUnavailable: false, matchedDocument: document })
})
it.each([
  { ...document, transaction_id: 'another-transaction' },
  { ...document, is_current_evidence: false },
  { ...document, canonical_requirement_instance_id: 'another-requirement' },
])('rejects conflicting or retired evidence: %j', conflicting => {
  expect(item([conflicting])).toMatchObject({ complete: false, evidenceUnavailable: true, matchedDocument: null })
})
