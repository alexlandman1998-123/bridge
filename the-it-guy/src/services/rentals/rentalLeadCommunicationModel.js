const text = (value) => String(value ?? '').trim()

export const RENTAL_LEAD_COMMUNICATION_VERSION = 'arch9_rental_lead_communication_v1'
export const RENTAL_LEAD_COMMUNICATION_TYPES = Object.freeze(['call', 'email', 'whatsapp', 'note'])
export const RENTAL_LEAD_COMMUNICATION_DIRECTIONS = Object.freeze(['outbound', 'inbound', 'internal'])

export function validateRentalLeadCommunication(values = {}) {
  const errors = []
  if (!text(values.leadId)) errors.push('Choose a rental lead.')
  if (!RENTAL_LEAD_COMMUNICATION_TYPES.includes(text(values.communicationType))) errors.push('Choose a supported communication type.')
  if (!RENTAL_LEAD_COMMUNICATION_DIRECTIONS.includes(text(values.direction))) errors.push('Choose a supported direction.')
  if (!text(values.summary)) errors.push('A communication summary is required.')
  if (values.occurredAt && Number.isNaN(new Date(values.occurredAt).getTime())) errors.push('Communication time must be valid.')
  return errors
}

export function buildRentalLeadCommunicationPayload(lead = {}, values = {}) {
  const errors = validateRentalLeadCommunication({ ...values, leadId: lead.id })
  if (errors.length) throw new Error(errors.join(' '))
  return {
    communicationType: text(values.communicationType), direction: text(values.direction), summary: text(values.summary),
    occurredAt: values.occurredAt || new Date().toISOString(), outcome: text(values.outcome),
    metadata: { captureVersion: RENTAL_LEAD_COMMUNICATION_VERSION, rentalRole: lead.role, rentalStage: lead.stage, followUpIntent: text(values.followUpIntent) },
  }
}
