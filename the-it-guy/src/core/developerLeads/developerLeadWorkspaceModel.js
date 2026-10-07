import { buildDeveloperLeadTransactionHandoff } from './developerLeadTransactionHandoff.js'
import { JOURNEY_ENTITY_TYPES } from '../journey/journeyStagePolicy.js'
import { applyJourneyStageOverrides } from '../journey/journeyStageOverrideState.js'

const normalizeLower = (value) => String(value ?? '').trim().toLowerCase()
const isConvertedLead = (lead) => normalizeLower(lead.leadStatus) === 'converted'
function requiresAgencyHandover(lead) {
  const agencyFed = lead.accessProfile?.agencyFed ?? lead.leadOwner === 'agency'
  return agencyFed && lead.accessProfile?.requiresHandoverBeforePrivateDetails === true
}

export function buildDeveloperLeadJourneyStages(lead = {}, overrides = []) {
  const status = normalizeLower(lead.leadStatus || 'new')
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  const statusRank = {
    new: 0,
    contacted: 1,
    qualified: 2,
    viewing: 3,
    reserved: 3,
    onboarding_sent: 4,
    onboarding_submitted: 5,
    otp: 6,
    converted: 6,
    lost: 0,
  }
  const activeRank = statusRank[status] ?? 0
  const reservationActive = status === 'reserved' || normalizeLower(lead.reservationState) === 'reserved'
  const steps = [
    { key: 'captured', label: 'Captured', detail: 'Lead created', rank: 0 },
    { key: 'contacted', label: 'Contacted', detail: 'Buyer contacted', rank: 1 },
    { key: 'qualified', label: 'Qualified', detail: handoff.eligible ? 'Ready for onboarding' : 'Buyer fit checked', rank: 2 },
    { key: 'viewing', label: 'Viewing', detail: reservationActive ? 'Reservation relevant' : 'Viewing / selection', rank: 3 },
    { key: 'onboarding_sent', label: 'Onboarding sent', detail: 'Buyer link sent', rank: 4 },
    { key: 'onboarding_submitted', label: 'Onboarding submitted', detail: 'Buyer details complete', rank: 5 },
    ...(reservationActive ? [{ key: 'reservation', label: 'Reservation deposit', detail: 'Deposit paid', rank: 5 }] : []),
    { key: 'otp', label: 'OTP', detail: 'Upload signed OTP', rank: 6 },
  ]

  const staged = steps.map((step) => {
    const state = step.rank < activeRank ? 'completed' : step.rank === activeRank ? 'current' : 'upcoming'
    return { ...step, state }
  })
  return applyJourneyStageOverrides({
    entityType: JOURNEY_ENTITY_TYPES.developerLead,
    stages: staged,
    overrides,
  })
}

export function getDeveloperLeadNextAction(lead = {}) {
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  const leadStatus = normalizeLower(lead.leadStatus || 'new')
  if (isConvertedLead(lead)) {
    return {
      label: 'Open the transaction workflow',
      helper: 'The signed OTP has moved this lead into the transaction workflow.',
    }
  }
  if (leadStatus === 'otp') {
    return {
      label: 'Open the transaction workflow',
      helper: 'Signed OTP has been uploaded, so finance, transfer, and registration can continue from the transaction workflow.',
    }
  }
  if (leadStatus === 'onboarding_submitted') {
    return {
      label: 'Upload signed OTP',
      helper: 'Buyer onboarding is submitted. The next handoff is signed OTP upload, which starts the transaction workflow.',
    }
  }
  if (leadStatus === 'onboarding_sent') {
    return {
      label: 'Wait for buyer onboarding submission',
      helper: 'The buyer has the onboarding link. Once submitted, upload the signed OTP to start the transaction workflow.',
    }
  }
  if (requiresAgencyHandover(lead)) {
    return {
      label: lead.visibilityState === 'consent_pending' ? 'Wait for agency handover' : 'Request agency handover',
      helper: 'Buyer details stay protected until the source agency releases them.',
    }
  }
  if (handoff.eligible) {
    return {
      label: 'Send buyer onboarding',
      helper: 'This sends the buyer onboarding link and prepares the onboarding context before OTP.',
    }
  }
  return {
    label: handoff.blockers?.[0]?.message || 'Complete lead setup',
    helper: 'Capture buyer details, development interest, and a qualified, viewing, or reserved status before sending onboarding.',
  }
}

export function getNextManualLeadStatus(lead = {}) {
  const status = normalizeLower(lead.leadStatus || 'new')
  if (status === 'new') return { status: 'contacted', label: 'Mark Contacted', detail: 'Buyer has been contacted.' }
  if (status === 'contacted') return { status: 'qualified', label: 'Mark Qualified', detail: 'Buyer fit and development interest are qualified.' }
  if (status === 'qualified') return { status: 'viewing', label: 'Mark Viewing', detail: 'Buyer is viewing or selecting a unit.' }
  if (status === 'onboarding_sent') return { status: 'onboarding_submitted', label: 'Mark Onboarding Submitted', detail: 'Buyer onboarding has been submitted.' }
  if (status === 'onboarding_submitted') return { status: 'otp', label: 'Mark Signed OTP Uploaded', detail: 'Signed OTP has been uploaded manually.' }
  return null
}

export function getDeveloperLeadPrimaryAction(lead = {}) {
  const status = normalizeLower(lead.leadStatus || 'new')
  const transactionId = String(lead.convertedTransactionId || '').trim()
  if (['onboarding_sent', 'onboarding_submitted', 'otp'].includes(status) && transactionId) {
    return { key: 'open_transaction', label: status === 'otp' ? 'Open Transaction Workflow' : 'Open Onboarding Context', transactionId }
  }
  if (isConvertedLead(lead)) return { key: 'open_transaction', label: 'Open Transaction Workflow', transactionId, disabled: !transactionId }
  if (requiresAgencyHandover(lead)) {
    const pending = lead.visibilityState === 'consent_pending'
    return { key: 'request_handover', label: pending ? 'Handover Requested' : 'Request Handover', disabled: pending }
  }
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  if (handoff.eligible) return { key: 'send_onboarding', label: 'Send Buyer Onboarding' }
  if (['qualified', 'viewing', 'reserved'].includes(status) && handoff.blockers.some((blocker) => blocker.code === 'unit_missing')) {
    return { key: 'select_unit', label: 'Select Preferred Unit', disabled: !lead.primaryDevelopmentId }
  }
  const nextStatus = getNextManualLeadStatus(lead)
  if (nextStatus) return { key: 'update_status', ...nextStatus }
  return { key: 'complete_setup', label: 'Complete setup before onboarding can be sent.', disabled: true }
}
