import { createCommunicationEvent, listLeadCommunications } from '../leadCommunicationService'
import { buildRentalLeadCommunicationPayload } from './rentalLeadCommunicationModel'
import { getRentalLeadWorkspace } from './rentalLeadService'

const text = (value) => String(value ?? '').trim()

export async function listRentalLeadCommunications(organisationId, leadId, options = {}) {
  await getRentalLeadWorkspace(organisationId, text(leadId), options)
  return listLeadCommunications({ organisationId, leadId })
}

export async function logRentalLeadCommunication(lead = {}, values = {}, context = {}) {
  const { lead: scopedLead } = await getRentalLeadWorkspace(context.organisationId, text(lead.id), context.scope || {})
  const payload = buildRentalLeadCommunicationPayload(scopedLead, values)
  return createCommunicationEvent({
    ...payload, organisationId: context.organisationId, leadId: scopedLead.id,
    contactId: scopedLead.raw?.contactId || scopedLead.raw?.contact_id || '', agentId: context.actor?.id || context.actor?.userId || '',
  }, { actor: context.actor || {}, mirrorActivity: true })
}
