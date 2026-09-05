import { createCommunicationEvent, listLeadCommunications } from '../leadCommunicationService'
import { buildRentalLeadCommunicationPayload } from './rentalLeadCommunicationModel'
import { listRentalLeads } from './rentalLeadService'

const text = (value) => String(value ?? '').trim()

export async function listRentalLeadCommunications(organisationId, leadId, options = {}) {
  const leads = await listRentalLeads(organisationId, options)
  if (!leads.some((lead) => lead.id === text(leadId))) throw new Error('This rental lead is not available in your current scope.')
  return listLeadCommunications({ organisationId, leadId })
}

export async function logRentalLeadCommunication(lead = {}, values = {}, context = {}) {
  const visibleLeads = await listRentalLeads(context.organisationId, context.scope || {})
  const scopedLead = visibleLeads.find((item) => item.id === text(lead.id))
  if (!scopedLead) throw new Error('This rental lead is not available in your current scope.')
  const payload = buildRentalLeadCommunicationPayload(scopedLead, values)
  return createCommunicationEvent({
    ...payload, organisationId: context.organisationId, leadId: scopedLead.id,
    contactId: scopedLead.raw?.contactId || scopedLead.raw?.contact_id || '', agentId: context.actor?.id || context.actor?.userId || '',
  }, { actor: context.actor || {}, mirrorActivity: true })
}
