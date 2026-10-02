import { resolveDealSetupFinanceType } from '../core/transactions/dealSetupContract.js'
import { supabase } from '../lib/supabaseClient.js'
import { reviewSectionDetails, validateReviewDetails } from '../core/transactions/transactionDetailReview.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function requireTransaction(id, client) {
  if (!uuid.test(String(id || ''))) throw new Error('A transaction is required.')
  if (!client?.rpc) throw new Error('Sign in to review transaction details.')
}
function reviewError(error) {
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new Error('The review feature needs its database update before details can be saved. Existing transaction details are unchanged.')
  }
  return error
}

export async function loadTransactionDetailReview({ transactionId, client = supabase } = {}) {
  requireTransaction(transactionId, client)
  const result = await client.rpc('bridge_get_transaction_detail_review', { p_transaction_id: transactionId })
  if (result.error) throw reviewError(result.error)
  if (!result.data?.sections?.some((section) => section.key === 'funding')) throw new Error('The funding review needs its database update before details can be reviewed. Existing transaction details are unchanged.')
  return result.data
}

export async function saveTransactionDetailReview({ transactionId, section, details, review, confirm = false, sourceDocumentId = null, attested = false, client = supabase } = {}) {
  requireTransaction(transactionId, client)
  const current = review?.sections?.find((item) => item.key === section)
  if (!current || review.transactionId !== transactionId) throw new Error('Reload this transaction before saving details.')
  const normalized = reviewSectionDetails(section, details)
  if (section === 'funding' && resolveDealSetupFinanceType(normalized.financeType)) normalized.financeType = resolveDealSetupFinanceType(normalized.financeType)
  const document = review.documents?.find((item) => item.id === sourceDocumentId)
  const errors = validateReviewDetails({ section, details: normalized, snapshot: current.currentSnapshot, confirm, attested, sourceAvailable: document?.available === true })
  if (errors.length) throw new Error(errors.join(' '))
  const result = await client.rpc('bridge_save_transaction_detail_review', {
    p_transaction_id: transactionId, p_section: section, p_details: normalized,
    p_expected_snapshot: current.currentSnapshot, p_expected_revision: current.revision,
    p_confirm: confirm, p_source_document_id: document?.available ? document.id : null,
  })
  if (result.error) throw reviewError(result.error)
  let refreshWarning = ''
  const typeChanged = (section === 'buyer' && normalized.purchaserType !== current.currentSnapshot.purchaserType) ||
    (section === 'seller' && normalized.entityType !== current.currentSnapshot.entityType)
  if (typeChanged || section === 'funding') {
    try {
      const { syncDealSetupDownstream, syncDealSetupAttorneyHandoff } = await import('./dealSetupService.js')
      await syncDealSetupAttorneyHandoff({ transactionId, client })
      await syncDealSetupDownstream({ transactionId, client })
    } catch {
      refreshWarning = 'The details were saved, but document requirements could not be refreshed. Refresh Deal Setup before progressing.'
    }
  }
  return { review: result.data, refreshWarning }
}

export async function createReviewSourceUrl({ document, client = supabase } = {}) {
  if (!document?.available || !document.filePath || /^[a-z]+:/i.test(document.filePath)) throw new Error('This PDF needs document recovery before it can be viewed.')
  const result = await client.storage.from(document.bucket || 'documents').createSignedUrl(document.filePath, 300)
  if (result.error) throw result.error
  if (!result.data?.signedUrl) throw new Error('The original PDF could not be opened.')
  return result.data.signedUrl
}
