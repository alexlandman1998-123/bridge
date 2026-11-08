import { buildDeveloperLeadTransactionHandoff } from './developerLeadTransactionHandoff.js'
import { getDevelopmentBuyerReservationEvidence } from '../leads/developmentBuyerLead.js'
import { JOURNEY_ENTITY_TYPES } from '../journey/journeyStagePolicy.js'
import { applyJourneyStageOverrides } from '../journey/journeyStageOverrideState.js'

const text = value => String(value ?? '').trim()
const lower = value => text(value).toLowerCase()
function requiresAgencyHandover(lead) {
  return (lead.accessProfile?.agencyFed ?? lead.leadOwner === 'agency') && lead.accessProfile?.requiresHandoverBeforePrivateDetails === true
}
function ownsBuyerWorkspace(lead, workspaceOrgId = lead.developerOrgId) {
  return Boolean(lead.sourceLeadId && (lead.leadOwner === 'agency' ? lead.sourceAgencyOrgId : lead.developerOrgId) === workspaceOrgId)
}

function effectiveLeadStatus(lead, overrides = []) {
  const status = lower(lead.leadStatus || 'new')
  const manual = ['new', 'contacted', 'qualified', 'viewing']
  if (!manual.includes(status)) return status
  const keys = ['contacted', 'qualified', 'viewing']
  const stages = applyJourneyStageOverrides({ entityType: JOURNEY_ENTITY_TYPES.developerLead, overrides,
    stages: keys.map((key, index) => ({ key, done: manual.indexOf(status) > index, state: 'upcoming' })) })
  const completedIndex = stages.reduce((last, stage, index) => stage.done || stage.completed || stage.state === 'completed' ? index : last, -1)
  return manual[Math.max(manual.indexOf(status), completedIndex + 1)]
}

export function getNextManualLeadStatus(lead = {}) {
  const status = lower(lead.leadStatus || 'new')
  if (status === 'new') return { status: 'contacted', label: 'Mark Contacted', detail: 'Buyer has been contacted.' }
  if (status === 'contacted') return { status: 'qualified', label: 'Mark Qualified', detail: 'Buyer fit and development interest are qualified.' }
  if (status === 'qualified') return { status: 'viewing', label: 'Mark Viewing', detail: 'Buyer is viewing or selecting a unit.' }
  // Submitted onboarding and signed OTP require their actual saved evidence.
  return null
}

export function getDeveloperLeadPrimaryAction(lead = {}, { overrides = [], workspaceOrgId = lead.developerOrgId } = {}) {
  const status = effectiveLeadStatus(lead, overrides)
  const transactionId = text(lead.convertedTransactionId)
  if (requiresAgencyHandover(lead)) return { key: 'request_handover', stageKey: 'captured', label: lead.visibilityState === 'consent_pending' ? 'Handover Requested' : 'Request Handover', disabled: lead.visibilityState === 'consent_pending', helper: 'Buyer details stay protected until the source agency releases them.' }
  if (status === 'lost') return { key: 'complete_setup', stageKey: 'captured', label: 'Lead is lost', disabled: true, helper: 'Review the lost lead before restarting the buyer journey.' }
  if (status === 'converted' || transactionId && ['onboarding_sent', 'onboarding_submitted', 'otp'].includes(status)) return {
    key: 'open_transaction', transactionId, disabled: !transactionId,
    targetTab: status === 'onboarding_sent' ? 'onboarding' : status === 'onboarding_submitted' ? 'documents' : '',
    stageKey: status === 'onboarding_sent' ? 'onboarding_submitted' : status === 'onboarding_submitted' ? 'otp' : 'converted',
    label: status === 'onboarding_sent' ? 'Open Buyer Onboarding' : status === 'onboarding_submitted' ? 'Upload Signed OTP' : 'Open Transaction Workflow',
    helper: status === 'onboarding_sent' ? 'Review the saved onboarding context and buyer submission.' : 'Continue with the actual onboarding, signed OTP, finance, transfer and registration evidence.',
  }
  if (ownsBuyerWorkspace(lead, workspaceOrgId) && (lead.buyerWorkspaceTransactionId || ['onboarding_sent', 'onboarding_submitted', 'otp'].includes(status))) return { key: 'open_buyer_workspace', stageKey: status === 'onboarding_sent' ? 'onboarding_submitted' : status === 'onboarding_submitted' || status === 'otp' ? 'otp' : 'qualified', label: 'Continue Buyer Workflow', sourceLeadId: lead.sourceLeadId, helper: 'Continue the same buyer record; its saved documents and transaction context determine the next step.' }
  const nextStatus = getNextManualLeadStatus({ ...lead, leadStatus: status })
  if (nextStatus) return { key: 'update_status', stageKey: { contacted: 'contacted', qualified: 'qualified', viewing: 'viewing' }[nextStatus.status], ...nextStatus, helper: nextStatus.detail }
  if (!lead.primaryDevelopmentId || !lead.buyerFullName || !(lead.buyerEmail || lead.buyerPhone)) return {
    key: ownsBuyerWorkspace(lead, workspaceOrgId) ? 'open_buyer_workspace' : 'complete_setup', sourceLeadId: lead.sourceLeadId, stageKey: 'qualified', label: 'Complete Buyer Details', helper: 'Complete buyer contact details and development interest before onboarding.',
  }
  if (!lead.preferredUnitId) return { key: 'select_unit', stageKey: 'reservation', label: 'Select Preferred Unit', disabled: !lead.primaryDevelopmentId, helper: 'Choose a unit in this development before confirming its reservation.' }
  const reservation = getDevelopmentBuyerReservationEvidence(lead)
  if (!reservation.reserved) return { key: 'reserve_unit', stageKey: 'reservation', label: reservation.expired ? 'Renew Unit Reservation' : 'Confirm Unit Reservation', helper: 'Confirm the actual unit reservation in the development workspace before sending buyer onboarding.' }
  if (ownsBuyerWorkspace(lead, workspaceOrgId)) return { key: 'open_buyer_workspace', sourceLeadId: lead.sourceLeadId, stageKey: 'onboarding_sent', label: 'Open Buyer Onboarding', helper: 'Use the linked buyer workspace to send onboarding, capture the signed OTP and create the transaction once.' }
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  return { key: 'complete_setup', stageKey: 'onboarding_sent', label: 'Complete Buyer Workspace Setup', helper: handoff.blockers[0]?.message || 'Link the canonical buyer workspace before sending onboarding.' }
}

export function getDeveloperLeadNextAction(lead = {}, options = {}) {
  const action = getDeveloperLeadPrimaryAction(lead, options)
  return { label: action.label, helper: action.helper || action.detail || '' }
}

export function buildDeveloperLeadJourneyStages(lead = {}, overrides = [], { workspaceOrgId = lead.developerOrgId } = {}) {
  const status = effectiveLeadStatus(lead, overrides)
  const advanced = ['onboarding_sent', 'onboarding_submitted', 'otp', 'converted'].includes(status)
  const reservation = getDevelopmentBuyerReservationEvidence(lead)
  const current = getDeveloperLeadPrimaryAction(lead, { overrides, workspaceOrgId }).stageKey
  const steps = [
    { key: 'captured', label: 'Captured', detail: 'Lead created', done: Boolean(lead.developerLeadId) },
    { key: 'contacted', label: 'Contacted', detail: 'Buyer contacted', done: !['new', 'lost'].includes(status) },
    { key: 'qualified', label: 'Qualified', detail: 'Buyer fit checked', done: ['qualified', 'viewing', 'reserved'].includes(status) || advanced },
    { key: 'viewing', label: 'Viewing', detail: 'Viewing / selection', done: ['viewing', 'reserved'].includes(status) || advanced },
    { key: 'reservation', label: 'Unit Selection & Reservation', detail: reservation.reserved ? 'Reservation confirmed' : reservation.expired ? 'Reservation expired' : 'Confirm unit reservation', done: reservation.reserved },
    { key: 'onboarding_sent', label: 'Onboarding sent', detail: 'Buyer link sent', done: advanced },
    { key: 'onboarding_submitted', label: 'Onboarding submitted', detail: 'Buyer submission recorded', done: ['onboarding_submitted', 'otp', 'converted'].includes(status) },
    { key: 'otp', label: 'OTP', detail: 'Signed OTP evidence', done: status === 'converted' && Boolean(lead.convertedTransactionId) },
    { key: 'converted', label: 'Transaction', detail: 'Finance, transfer and registration', done: status === 'converted' && Boolean(lead.convertedTransactionId) },
  ]
  return applyJourneyStageOverrides({ entityType: JOURNEY_ENTITY_TYPES.developerLead,
    stages: steps.map(step => ({ ...step, state: step.key === current ? 'current' : step.done ? 'completed' : 'upcoming' })), overrides })
    .map(stage => ({ ...stage, current: stage.key === current,
      state: stage.key === current ? 'current' : stage.done || stage.completed ? 'completed' : 'upcoming' }))
}
