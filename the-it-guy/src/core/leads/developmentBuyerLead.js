import { inferLeadCategoryFromRecord } from '../../lib/leadCategory.js'

const text = (value) => String(value ?? '').trim()
const token = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_')

export const DEVELOPMENT_SELECTION_STAGE = 'development_selection'
export const DEVELOPMENT_LEAD_STAGES = Object.freeze([
  ['captured', 'Captured', 'New development enquiries awaiting contact.'],
  ['contacted', 'Contacted', 'Buyer contact has been recorded.'],
  ['qualified', 'Qualified', 'Budget, finance, timing and development requirements captured.'],
  ['viewing', 'Viewing / Presentation', 'Site visits, show-unit viewings or sales consultations.'],
  [DEVELOPMENT_SELECTION_STAGE, 'Unit Selection & Reservation', 'Choose a unit and confirm its reservation through the development workspace.'],
  ['transaction_setup', 'Buyer Onboarding', 'Capture purchaser, finance and party information.'],
  ['offer', 'OTP', 'Prepare and capture signed purchase document evidence.'],
  ['transaction', 'Transaction', 'Continue deposits, finance, transfer and registration.'],
  ['on_hold', 'On hold', 'Paused buyers awaiting follow-up.'],
  ['lost', 'Lost', 'Buyer is no longer proceeding.'],
  ['closed_won', 'Closed won', 'The linked transaction completed successfully.'],
  ['closed_lost', 'Closed lost', 'The linked transaction fell through.'],
])

export function getLeadDevelopmentId(lead = {}) {
  const raw = lead.rawEnquiryPayload ?? lead.raw_enquiry_payload
  let payload = raw
  if (typeof raw === 'string') {
    try { payload = JSON.parse(raw) } catch { payload = null }
  }
  return text(lead.developmentId || lead.development_id || lead.primaryDevelopmentId || lead.primary_development_id ||
    lead.developmentLeadContext?.primaryDevelopmentId || lead.linkedListing?.developmentId || lead.linkedListing?.development_id ||
    payload?.developmentId || payload?.development_id || payload?.primary_development_id ||
    payload?.property?.developmentId || payload?.property?.development_id)
}

export function isDevelopmentBuyerLead(lead = {}) {
  return inferLeadCategoryFromRecord(lead, 'buyer') === 'buyer' && Boolean(getLeadDevelopmentId(lead))
}

export function getDevelopmentLeadStage(value = '', fallbackKey = 'captured') {
  const key = token(value)
  const aliases = {
    viewing_presentation: 'viewing', unit_selection_reservation: DEVELOPMENT_SELECTION_STAGE,
    unit_selection: DEVELOPMENT_SELECTION_STAGE, unit_reservation: DEVELOPMENT_SELECTION_STAGE,
    reserved: DEVELOPMENT_SELECTION_STAGE, reservation: DEVELOPMENT_SELECTION_STAGE,
    buyer_onboarding: 'transaction_setup', buyer_onboarding_sent: 'transaction_setup',
    onboarding_sent: 'transaction_setup', onboarding_submitted: 'transaction_setup',
    otp: 'offer', otp_sent: 'offer', otp_signed: 'offer', signed_otp: 'offer',
  }
  const stageKey = aliases[key] || key
  const stage = DEVELOPMENT_LEAD_STAGES.find(([id]) => id === stageKey) || DEVELOPMENT_LEAD_STAGES.find(([id]) => id === fallbackKey) || DEVELOPMENT_LEAD_STAGES[0]
  return { key: stage[0], label: stage[1], description: stage[2] }
}
