import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerMandateContinuityModel } from '../sellerMandateContinuityService.js'

test('reviewed physical mandate is signed continuity only after approval', () => {
  const context = {
    lead: { leadId: 'lead-reviewed', mandateStatus: 'signed' },
    listing: { id: 'listing-reviewed', mandateStatus: 'signed' },
    documents: [{
      id: 'doc-reviewed', document_type: 'signed_mandate', status: 'uploaded',
      reviewed_signing_version_id: 'reviewed-version-1',
      visibility: 'seller_visible', storage_path: 'seller-mandates/reviewed.pdf',
    }],
  }
  const pending = buildSellerMandateContinuityModel(context)
  assert.equal(pending.signedDocumentId, '')
  const approved = buildSellerMandateContinuityModel({ ...context, documents: [{ ...context.documents[0], status: 'approved' }] })
  assert.equal(approved.signedDocumentId, 'doc-reviewed')
})
