const ALLOWED_ACTIONS = new Set(['create_viewing', 'link_transaction', 'create_transaction'])

function text(value = '') { return String(value ?? '').trim() }

export function buildRevoInboxWorkflowRequest({ organisationId, conversationId, actionType, listingId = null, leadId = null, transactionId = null, requestedBy, metadata = {} } = {}) {
  const action = text(actionType)
  if (!ALLOWED_ACTIONS.has(action)) throw new Error('Inbox supports viewing and transaction actions only.')
  if (!text(organisationId) || !text(conversationId) || !text(requestedBy)) throw new Error('A Revo conversation and signed-in user are required.')
  if (action === 'create_viewing' && !text(listingId)) throw new Error('Link a listing before creating a viewing.')
  if (action === 'create_transaction' && (!text(listingId) || !text(leadId))) throw new Error('Link a listing and buyer lead before creating a transaction.')
  if (action === 'link_transaction' && !text(transactionId)) throw new Error('Choose an existing transaction to link.')
  return {
    organisation_id: text(organisationId),
    conversation_id: text(conversationId),
    action_type: action,
    listing_id: text(listingId) || null,
    lead_id: text(leadId) || null,
    transaction_id: text(transactionId) || null,
    requested_by: text(requestedBy),
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  }
}

export function findDuplicateTransactionCandidate(transactions = [], { listingId = '', leadId = '' } = {}) {
  return (transactions || []).find((row) =>
    text(row.listingId || row.listing_id) === text(listingId) &&
    [row.originatingLeadId, row.originating_lead_id, row.originatingBuyerLeadId, row.originating_buyer_lead_id].map(text).includes(text(leadId)) &&
    !['cancelled', 'closed', 'archived'].includes(text(row.lifecycleState || row.lifecycle_state).toLowerCase()),
  ) || null
}
