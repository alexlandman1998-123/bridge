import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const REVIEW_ACTIONS = new Set(['start_review', 'approve', 'reject'])
const REVIEWABLE_STATUSES = new Set(['uploaded', 'under_review'])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function buildSellerDocumentReviewCommand({ document = {}, action = '', reason = '' } = {}) {
  const normalizedAction = key(action)
  const status = key(document.status || '')
  const documentId = text(document.id || document.document_id || document.documentId)
  const requirementId = text(document.requirement_id || document.requirementId)
  const normalizedReason = text(reason)
  const errors = []
  if (!documentId) errors.push('Document id is required.')
  if (!requirementId) errors.push('The document must be linked to an exact seller requirement before review.')
  if (!REVIEW_ACTIONS.has(normalizedAction)) errors.push('Choose start review, approve, or reject.')
  if (!REVIEWABLE_STATUSES.has(status)) errors.push('Only uploaded or under-review seller documents can be decided.')
  if (normalizedAction === 'reject' && normalizedReason.length < 5) errors.push('Enter a clear rejection reason of at least 5 characters.')
  return {
    valid: errors.length === 0,
    errors,
    documentId,
    requirementId,
    action: normalizedAction,
    reason: normalizedReason,
    expectedRevision: Math.max(0, Number(document.review_revision ?? document.reviewRevision ?? 0) || 0),
  }
}

function requireClient(client) {
  if (!isSupabaseConfigured || !client?.rpc) throw new Error('Supabase is required for seller document review actions.')
  return client
}

function workflowError(error, fallback) {
  const message = text(error?.message || error)
  if (/changed by another reviewer/i.test(message) || String(error?.code || '') === '40001') {
    return new Error('This document changed while you were reviewing it. Refresh and try again.')
  }
  if (/function .* does not exist|could not find the function|PGRST202/i.test(message)) {
    return new Error('Deploy the P1-8 seller document review migration before using review actions.')
  }
  return new Error(message || fallback)
}

export async function reviewSellerDocument({ document = {}, action = '', reason = '', client = supabase } = {}) {
  const command = buildSellerDocumentReviewCommand({ document, action, reason })
  if (!command.valid) throw new Error(command.errors[0])
  const result = await requireClient(client).rpc('bridge_review_private_listing_seller_document_p1_8', {
    p_document_id: command.documentId,
    p_action: command.action,
    p_reason: command.reason || null,
    p_expected_revision: command.expectedRevision,
  })
  if (result.error) throw workflowError(result.error, 'Unable to update the seller document review.')
  return result.data
}

export async function sendSellerDocumentManualReminder({ requirementId = '', reason = '', client = supabase } = {}) {
  const normalizedRequirementId = text(requirementId)
  if (!normalizedRequirementId) throw new Error('Seller document requirement id is required.')
  const result = await requireClient(client).rpc('bridge_send_seller_document_manual_reminder_p1_8', {
    p_requirement_id: normalizedRequirementId,
    p_reason: text(reason) || null,
  })
  if (result.error) throw workflowError(result.error, 'Unable to send the seller document reminder.')
  return result.data
}

export async function listSellerDocumentReviewQueue({ listingId = '', client = supabase } = {}) {
  const normalizedListingId = text(listingId)
  if (!normalizedListingId) return []
  const result = await requireClient(client)
    .from('seller_document_review_queue_v1')
    .select('*')
    .eq('private_listing_id', normalizedListingId)
    .in('queue_state', ['pending', 'overdue', 'seller_correction'])
    .order('uploaded_at', { ascending: true })
  if (result.error) throw workflowError(result.error, 'Unable to load the seller document review queue.')
  return result.data || []
}

export { REVIEW_ACTIONS, REVIEWABLE_STATUSES }
