import { evaluateMvpFinanceGate } from './mvpFinanceGate.js'

export const MVP_TRANSFER_GATE_VERSION = 'arch9_mvp_transfer_gate_v1'
const COMPLETE = new Set(['complete', 'completed', 'verified', 'approved', 'satisfied', 'waived', 'not_applicable'])
const key = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')

function hasTransferAttorney(participants = []) {
  return participants.some((participant) => {
    if (['removed', 'inactive', 'declined', 'expired'].includes(key(participant.status || 'active'))) return false
    return key(participant.transactionRole || participant.transaction_role) === 'transfer_attorney' ||
      (key(participant.roleType || participant.role_type) === 'attorney' && key(participant.legalRole || participant.legal_role) === 'transfer')
  })
}

export function evaluateMvpTransferGate({ routingProfile = {}, participants = [], documentRequirements = [] } = {}) {
  const finance = evaluateMvpFinanceGate({ routingProfile, participants, documentRequirements })
  const blockers = []
  if (!hasTransferAttorney(participants)) blockers.push({ key: 'participant:transfer_attorney', ownerRole: 'agent', reason: 'A transfer attorney must be assigned before transfer can begin.' })
  blockers.push(...finance.blockers)
  const incomplete = (documentRequirements || []).filter((item) => item.isRequired !== false && !COMPLETE.has(key(item.status)))
  for (const item of incomplete) {
    blockers.push({ key: `document:${key(item.documentKey || item.document_key || item.key)}`, ownerRole: key(item.requiredFromRole || item.required_from_role || 'transaction_coordinator'), reason: `${item.documentLabel || item.document_label || item.label || 'Required document'} must be completed before transfer can begin.` })
  }
  return { version: MVP_TRANSFER_GATE_VERSION, gateKey: 'transfer_ready', satisfied: blockers.length === 0, blockers }
}
