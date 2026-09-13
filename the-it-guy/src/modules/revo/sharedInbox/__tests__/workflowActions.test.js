import assert from 'node:assert/strict'
import { buildRevoInboxWorkflowRequest, findDuplicateTransactionCandidate } from '../workflowActions.js'

const base = { organisationId: 'org', conversationId: 'conversation', requestedBy: 'user', listingId: 'listing', leadId: 'lead' }
assert.equal(buildRevoInboxWorkflowRequest({ ...base, actionType: 'create_viewing' }).action_type, 'create_viewing')
assert.equal(buildRevoInboxWorkflowRequest({ ...base, actionType: 'create_transaction' }).lead_id, 'lead')
assert.throws(() => buildRevoInboxWorkflowRequest({ ...base, actionType: 'create_offer' }), /viewing and transaction/)
assert.equal(findDuplicateTransactionCandidate([{ id: 'transaction-1', listing_id: 'listing', originating_lead_id: 'lead', lifecycle_state: 'active' }], base).id, 'transaction-1')

console.log('Revo inbox workflow action checks passed.')
