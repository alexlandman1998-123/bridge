import { DEVELOPMENT_LEAD_STAGES } from '../leads/developmentBuyerLead.js'
import { normalizeDeveloperLeadStatus } from '../developerLeads/developerLeadContract.js'

const STATUS_BY_STAGE = {
  captured: ['new', 'captured'], contacted: ['contacted'], qualified: ['qualified'], viewing: ['viewing'],
  development_selection: ['reserved'], transaction_setup: ['onboarding_sent', 'onboarding_submitted'],
  offer: ['otp'], transaction: ['converted'], lost: ['lost'],
}

// Reuse the Revo development buyer flow labels and order, with the existing
// developer-lead statuses underneath. No schema or reservation state changes.
export const DEVELOPMENT_LEAD_BOARD_STAGES = Object.freeze(DEVELOPMENT_LEAD_STAGES
  .filter(([key]) => STATUS_BY_STAGE[key])
  .map(([key, label]) => ({ key, label, statuses: STATUS_BY_STAGE[key] })))

export function getDevelopmentLeadBoardStage(lead = {}) {
  const status = normalizeDeveloperLeadStatus(lead.leadStatus)
  return DEVELOPMENT_LEAD_BOARD_STAGES.find(stage => stage.statuses.includes(status)) || DEVELOPMENT_LEAD_BOARD_STAGES[0]
}

export function resolveDevelopmentLeadBoardMove(lead, targetKey) {
  const target = DEVELOPMENT_LEAD_BOARD_STAGES.find(stage => stage.key === targetKey)
  if (!target) throw new Error('Choose a valid development lead stage.')
  if (getDevelopmentLeadBoardStage(lead).key === targetKey) return { kind: 'noop' }
  // A linked, converted deal continues through the transaction workspace.
  if (normalizeDeveloperLeadStatus(lead.leadStatus) === 'converted') return { kind: 'workflow', tab: 'onboarding_otp', transactionId: lead.convertedTransactionId || '' }
  const status = { captured: 'new', contacted: 'contacted', qualified: 'qualified', viewing: 'viewing', lost: 'lost' }[targetKey]
  if (status) return { kind: 'status', status, label: target.label }
  if (targetKey === 'development_selection' && lead.reservationState === 'reserved') return { kind: 'status', status: 'reserved', label: target.label }
  return { kind: 'workflow', tab: targetKey === 'development_selection' ? 'development' : 'onboarding_otp', transactionId: targetKey === 'transaction' ? lead.convertedTransactionId || '' : '' }
}
