import { DEVELOPMENT_LEAD_STAGES } from '../leads/developmentBuyerLead.js'
import { normalizeDeveloperLeadStatus } from '../developerLeads/developerLeadContract.js'

const STATUS_BY_STAGE = {
  captured: ['new', 'captured'], contacted: ['contacted'], qualified: ['qualified'], viewing: ['viewing'],
  development_selection: ['reserved'], buyer_onboarding_sent: ['onboarding_sent'],
  buyer_onboarding_submitted: ['onboarding_submitted'],
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

export function resolveDevelopmentLeadWorkspaceUrl(lead = {}, organisationId = '', tab = 'overview') {
  const ownerOrgId = lead.leadOwner === 'agency' ? lead.sourceAgencyOrgId : lead.developerOrgId
  if (lead.sourceLeadId && ownerOrgId && ownerOrgId === organisationId) {
    const buyerTab = tab === 'onboarding_otp' ? 'buyer_profile' : 'overview'
    return `/pipeline/leads/${encodeURIComponent(lead.sourceLeadId)}?tab=${buyerTab}`
  }
  if (lead.developerLeadId) return `/developer/leads/${encodeURIComponent(lead.developerLeadId)}?workspaceTab=${encodeURIComponent(tab)}`
  return ''
}

export function resolveDevelopmentLeadBoardMove(lead, targetKey) {
  if (targetKey === 'transaction_setup') targetKey = 'buyer_onboarding_sent'
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


// A sales stage or unit preference alone is not a confirmed reservation.
export function isActiveDevelopmentLeadReservation(lead = {}, now = Date.now(), developmentUnitIds = null) {
  const state = String(lead.reservationState || lead.reservation_state || '').trim().toLowerCase()
  const status = String(lead.leadStatus || lead.lead_status || '').trim().toLowerCase()
  const unitId = String(lead.preferredUnitId || lead.preferred_unit_id || '').trim()
  if (state !== 'reserved' || !unitId || (developmentUnitIds && !developmentUnitIds.has(unitId))) return false
  if (['lost', 'converted'].includes(status) || lead.convertedTransactionId || lead.converted_transaction_id) return false
  const expiresAt = lead.reservationExpiresAt || lead.reservation_expires_at
  return !expiresAt || (Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now)
}
