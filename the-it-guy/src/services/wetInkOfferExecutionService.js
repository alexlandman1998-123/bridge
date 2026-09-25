import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuid(value, label) {
  const normalized = String(value || '').trim()
  if (!UUID.test(normalized)) throw new Error(`${label} is required.`)
  return normalized
}

function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in to manage wet-ink offer execution.')
  return supabase
}

export const WET_INK_OFFER_EXECUTION_STATUS = Object.freeze({
  NOT_PREPARED: 'not_prepared',
  AWAITING_BUYER: 'awaiting_buyer_wet_ink',
  AWAITING_SELLER: 'awaiting_seller_wet_ink',
  AWAITING_REVIEW: 'awaiting_review',
  FULLY_EXECUTED: 'fully_executed',
  REJECTED: 'rejected',
})

export function mapWetInkOfferExecution(row = {}) {
  return {
    offerId: String(row.offerId || row.offer_id || '').trim(),
    status: String(row.status || WET_INK_OFFER_EXECUTION_STATUS.NOT_PREPARED).trim(),
    printablePackDocumentId: String(row.printablePackDocumentId || row.printable_pack_document_id || '').trim(),
    buyerSignedDocumentId: String(row.buyerSignedDocumentId || row.buyer_signed_document_id || '').trim(),
    sellerSignedDocumentId: String(row.sellerSignedDocumentId || row.seller_signed_document_id || '').trim(),
    preparedAt: row.preparedAt || row.prepared_at || null,
    reviewedAt: row.reviewedAt || row.reviewed_at || null,
    reviewNote: String(row.reviewNote || row.review_note || '').trim(),
  }
}

async function call(name, payload) {
  const { data, error } = await client().rpc(name, payload)
  if (error) throw error
  return data || {}
}

export async function listWetInkOfferExecution({ organisationId = '', listingId = '' } = {}) {
  const result = await call('bridge_list_wet_ink_offer_execution_records', {
    p_organisation_id: uuid(organisationId, 'Organisation'),
    p_listing_id: uuid(listingId, 'Listing'),
  })
  return (Array.isArray(result.records) ? result.records : []).map(mapWetInkOfferExecution)
}

export async function prepareWetInkOfferExecution({ offerId = '', printablePackDocumentId = '', note = '' } = {}) {
  const result = await call('bridge_prepare_wet_ink_offer_execution', {
    p_offer_id: uuid(offerId, 'Offer'),
    p_printable_pack_document_id: uuid(printablePackDocumentId, 'Printable OTP pack'),
    p_note: String(note || '').trim(),
  })
  return { offerId: String(result.offerId || '').trim(), status: String(result.status || '').trim() }
}

export async function recordWetInkOfferEvidence({ offerId = '', signerRole = '', documentId = '', note = '' } = {}) {
  const result = await call('bridge_record_wet_ink_offer_evidence', {
    p_offer_id: uuid(offerId, 'Offer'),
    p_signer_role: String(signerRole || '').trim().toLowerCase(),
    p_document_id: uuid(documentId, 'Signed OTP evidence'),
    p_note: String(note || '').trim() || null,
  })
  return { offerId: String(result.offerId || '').trim(), status: String(result.status || '').trim() }
}

export async function reviewWetInkOfferExecution({ offerId = '', decision = '', note = '' } = {}) {
  const result = await call('bridge_review_wet_ink_offer_execution', {
    p_offer_id: uuid(offerId, 'Offer'),
    p_decision: String(decision || '').trim().toLowerCase(),
    p_review_note: String(note || '').trim(),
  })
  return { offerId: String(result.offerId || '').trim(), status: String(result.status || '').trim() }
}
