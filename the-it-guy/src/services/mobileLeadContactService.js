import { fetchAgencyCrmLeadWorkspace, updateAgencyCrmLeadRecord, createAgencyCrmLeadActivity } from '../lib/agencyCrmRepository.js'
import { isRentalCrmLead } from './rentals/rentalCrmLeadModel.js'
import { isNewAgentLead } from './mobileTodayModel.js'

// Use the same persisted contact evidence and CRM stage as the buyer journey.
// Opening the dialler or WhatsApp alone is never proof of contact.
export async function markMobileBuyerLeadContacted({ organisationId, leadId, actor = {} }) {
  if (!organisationId || !leadId) throw new Error('Select a saved lead in the current organisation.')
  const fresh = await fetchAgencyCrmLeadWorkspace(organisationId, leadId)
  const lead = fresh.leads?.find(row => row.leadId === leadId)
  if (!lead || lead.leadCategory !== 'buyer') throw new Error('A saved buyer lead is required.')
  if (isRentalCrmLead(lead)) {
    const { buildRentalLeadView, advanceRentalLead } = await import('./rentals/rentalLeadService.js')
    const contact = fresh.contacts?.find(row => row.contactId === lead.contactId) || {}
    const tenant = buildRentalLeadView(lead, contact)
    if (tenant.role !== 'tenant' || tenant.stage !== 'new') throw new Error('The lead has changed. Refresh before recording contact.')
    return advanceRentalLead(tenant, { organisationId, actor, toStage: 'contacted' })
  }
  if (!isNewAgentLead(lead)) throw new Error('The lead has changed. Refresh before recording contact.')
  const contactedAt = lead.firstContactedAt || new Date().toISOString()
  const updated = await updateAgencyCrmLeadRecord(organisationId, leadId, {
    stage: 'Contacted', status: 'Active', currentStage: 'Contacted',
    firstContactedAt: contactedAt, ownershipStatus: 'contacted',
  }, { expectedUpdatedAt: lead.updatedAt || '' })
  // The confirmed lead record is authoritative. An activity failure must not
  // replay a successful contact update or imply that the lead was not saved.
  await createAgencyCrmLeadActivity(organisationId, leadId, {
    agent: { id: actor.id, name: actor.fullName || actor.name, email: actor.email },
    activityType: 'Buyer Contacted', activityNote: 'Agent confirmed buyer contact from mobile home.',
    outcome: 'Contacted', activityDate: contactedAt,
  }, { actor }).catch(() => null)
  return updated
}
