export const RENTAL_LEAD_OUTCOME_VERSION = 'arch9_rental_lead_outcome_v1'
export const RENTAL_LEAD_OUTCOME_STATUSES = Object.freeze(['open', 'won', 'lost', 'withdrawn', 'nurture'])
export const RENTAL_LEAD_LOST_REASONS = Object.freeze(['unresponsive', 'budget', 'location', 'property_unavailable', 'selected_alternative', 'not_qualified', 'other'])

const text = (value) => String(value ?? '').trim()
const normalise = (value) => text(value).toLowerCase().replace(/[\s-]+/g, '_')

export function getRentalLeadOutcome(lead = {}) {
  const raw = lead.rawEnquiryPayload || lead.raw_enquiry_payload || lead.raw || lead.metadata || lead
  const metadata = raw.rentalCrm || raw.rental_crm || raw
  const source = metadata.outcome && typeof metadata.outcome === 'object' ? metadata.outcome : {}
  const status = RENTAL_LEAD_OUTCOME_STATUSES.includes(normalise(source.status)) ? normalise(source.status) : 'open'
  return { status, reason: text(source.reason), note: text(source.note), reactivationDate: text(source.reactivationDate || source.reactivation_date), recordedAt: text(source.recordedAt || source.recorded_at), recordedBy: text(source.recordedBy || source.recorded_by) }
}

export function isRentalLeadOperational(lead = {}) {
  return getRentalLeadOutcome(lead).status === 'open'
}

export function buildRentalLeadOutcome(values = {}, context = {}) {
  const status = normalise(values.status)
  if (!RENTAL_LEAD_OUTCOME_STATUSES.includes(status)) throw new Error('Choose a supported lead outcome.')
  const reason = normalise(values.reason)
  const reactivationDate = text(values.reactivationDate)
  if (status === 'lost' && !RENTAL_LEAD_LOST_REASONS.includes(reason)) throw new Error('Choose a lost reason.')
  if (status === 'withdrawn' && !text(values.reason)) throw new Error('A withdrawal reason is required.')
  if (status === 'nurture' && (!reactivationDate || Number.isNaN(new Date(reactivationDate).getTime()))) throw new Error('A valid reactivation date is required for nurture.')
  return { version: RENTAL_LEAD_OUTCOME_VERSION, status, reason: text(values.reason), note: text(values.note), reactivationDate: status === 'nurture' ? reactivationDate : '', recordedAt: context.nowIso || new Date().toISOString(), recordedBy: text(context.recordedBy) }
}
