export const MVP_ONBOARDING_GATE_VERSION = 'arch9_mvp_onboarding_gate_v1'

const COMPLETE = new Set(['complete', 'completed', 'verified', 'approved', 'satisfied'])
const key = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')

export function evaluateMvpOnboardingGate({ participants = [], documentRequirements = [] } = {}) {
  const activeRoles = new Set((participants || [])
    .filter((participant) => !['removed', 'cancelled', 'inactive'].includes(key(participant.status || 'active')))
    .map((participant) => key(participant.transactionRole || participant.transaction_role || participant.roleType || participant.role_type)))
  const missingRoles = ['buyer', 'seller'].filter((role) => !activeRoles.has(role) && !activeRoles.has(role === 'seller' ? 'developer_contact' : role))
  const pendingDocuments = (documentRequirements || []).filter((item) => {
    const owner = key(item.requiredFromRole || item.required_from_role)
    return ['buyer', 'seller', 'developer'].includes(owner) && item.isRequired !== false && !COMPLETE.has(key(item.status))
  })
  const blockers = [
    ...missingRoles.map((role) => ({ key: `participant:${role}`, ownerRole: 'agent', reason: `${role === 'buyer' ? 'Buyer' : 'Seller/developer representative'} must be captured before onboarding can complete.` })),
    ...pendingDocuments.map((item) => ({ key: `document:${key(item.documentKey || item.document_key || item.key)}`, ownerRole: key(item.requiredFromRole || item.required_from_role), reason: `${item.documentLabel || item.document_label || item.label || 'Required document'} must be completed before onboarding can complete.` })),
  ]
  return { version: MVP_ONBOARDING_GATE_VERSION, gateKey: 'onboarding_complete', satisfied: blockers.length === 0, blockers }
}
