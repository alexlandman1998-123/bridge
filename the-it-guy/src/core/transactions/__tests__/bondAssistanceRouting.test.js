import assert from 'node:assert/strict'
import {
  BOND_ASSISTANCE_ROUTING_VERSION,
  buildBondAssistanceRoutingDecision,
} from '../bondAssistanceRouting.js'

const agencySelectionRequired = buildBondAssistanceRoutingDecision({
  transaction: {
    id: 'tx-agency-selection',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  onboarding: {
    id: 'onboarding-agency-selection',
  },
  formData: {
    bond_help_requested: 'yes',
    bond_assistance_selection: 'agency_partner',
  },
  completedAt: '2026-08-05T12:00:00.000Z',
})

assert.equal(agencySelectionRequired.version, BOND_ASSISTANCE_ROUTING_VERSION)
assert.equal(agencySelectionRequired.status, 'agency_originator_selection_required')
assert.equal(agencySelectionRequired.assignmentRequired, true)
assert.equal(agencySelectionRequired.assigned, false)
assert.equal(
  agencySelectionRequired.agentSelectionPoint,
  'after_buyer_onboarding_submit_before_signed_otp_handoff',
)
assert.equal(agencySelectionRequired.notification.title, 'Bond originator selection required')
assert.deepEqual(agencySelectionRequired.notification.roleTypes, ['agent', 'developer'])
assert.equal(agencySelectionRequired.notification.notificationType, 'readiness_updated')
assert.equal(agencySelectionRequired.event.type, 'bond_assistance_routing_decision')
assert.equal(agencySelectionRequired.event.data.selectionSource, 'agency_partner')

const pendingBuyerOriginatorApproval = buildBondAssistanceRoutingDecision({
  transaction: {
    id: 'tx-pending-originator',
    finance_type: 'hybrid',
    finance_managed_by: 'bond_originator',
  },
  formData: {
    bond_help_requested: true,
  },
  buyerBondOriginatorRequest: {
    status: 'pending_approval',
    selectionSource: 'buyer_nominated',
    companyName: 'Buyer Bond Co',
  },
})

assert.equal(pendingBuyerOriginatorApproval.status, 'pending_buyer_originator_approval')
assert.equal(pendingBuyerOriginatorApproval.priority, 'high')
assert.equal(pendingBuyerOriginatorApproval.assignmentRequired, true)
assert.equal(pendingBuyerOriginatorApproval.notification.notificationType, 'roleplayer_change_requested')
assert.match(pendingBuyerOriginatorApproval.notification.message, /Buyer Bond Co/)

const buyerNominatedAssignmentRequired = buildBondAssistanceRoutingDecision({
  transaction: {
    id: 'tx-buyer-nominated',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  formData: {
    bond_help_requested: 'yes',
    bond_assistance_selection: 'buyer_nominated',
  },
})

assert.equal(buyerNominatedAssignmentRequired.status, 'buyer_originator_assignment_required')
assert.equal(buyerNominatedAssignmentRequired.assignmentRequired, true)
assert.match(buyerNominatedAssignmentRequired.nextAction, /buyer-nominated originator/i)

const assignedOriginator = buildBondAssistanceRoutingDecision({
  transaction: {
    id: 'tx-assigned-originator',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  formData: {
    bond_help_requested: 'yes',
  },
  rolePlayers: [
    {
      role_type: 'bond_originator',
      status: 'selected',
    },
  ],
})

assert.equal(assignedOriginator.status, 'bond_originator_assigned')
assert.equal(assignedOriginator.assignmentRequired, false)
assert.equal(assignedOriginator.notification, null)
assert.equal(assignedOriginator.event, null)

const clientManagedFinance = buildBondAssistanceRoutingDecision({
  transaction: {
    id: 'tx-client-managed',
    finance_type: 'bond',
    finance_managed_by: 'client',
  },
  formData: {
    bond_help_requested: 'no',
  },
})

assert.equal(clientManagedFinance.status, 'client_managed_finance')
assert.equal(clientManagedFinance.assignmentRequired, false)
assert.equal(clientManagedFinance.notification, null)

const cashFinance = buildBondAssistanceRoutingDecision({
  transaction: {
    id: 'tx-cash',
    finance_type: 'cash',
  },
})

assert.equal(cashFinance.status, 'not_bond_finance')
assert.equal(cashFinance.assignmentRequired, false)

console.log('bond assistance routing tests passed')
