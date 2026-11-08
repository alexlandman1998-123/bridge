import { createAgencyCrmLeadRecord } from '../lib/agencyCrmRepository.js'
import { createAgencyIntroducedDeveloperLead, createDeveloperFedLead } from './developerLeadService.js'
import { invalidateAgencyLeadListCache } from '../pages/agency/agencyLeadListReadRepository.js'

const text = value => String(value ?? '').trim()
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))

// The CRM record owns the buyer identity. The developer record links that same
// buyer into development intake; stable capture IDs let partial saves resume.
export async function createDevelopmentBuyerLead({ organisationId, developerOrgId, developmentId, developmentName, form, actor, assignedAgent = actor, identity, savedCrmLead = null, onCrmLeadSaved }, dependencies = {}) {
  const createCrm = dependencies.createCrm || createAgencyCrmLeadRecord
  const createDirect = dependencies.createDirect || createDeveloperFedLead
  const createIntroduced = dependencies.createIntroduced || createAgencyIntroducedDeveloperLead
  const invalidate = dependencies.invalidate || invalidateAgencyLeadListCache
  if (![organisationId, developerOrgId, developmentId, identity?.leadId, identity?.contactId, identity?.developerLeadId, actor?.id].every(uuid)) {
    throw new Error('A resolved workspace, development and assigned agent are required to create this lead.')
  }
  if (!text(form.firstName) || !text(form.lastName) || (!text(form.phone) && !text(form.email))) {
    throw new Error('Enter the buyer’s name and a phone number or email address.')
  }
  const crmLead = savedCrmLead || await createCrm(organisationId, {
    leadId: identity.leadId,
    contact: { contactId: identity.contactId, firstName: form.firstName, lastName: form.lastName, phone: form.phone, email: form.email, notes: form.notes, contactType: 'buyer' },
    assignedAgent, assignedUserId: assignedAgent?.id || actor.id, createdBy: actor.id,
    leadCategory: 'buyer', leadDirection: 'Inbound', leadSource: form.source || 'Other',
    stage: 'New Lead', priority: 'Medium', propertyInterest: text(form.property) || text(developmentName),
    rawEnquiryPayload: { development_id: developmentId, source: 'development_leads_capture' }, notes: form.notes,
  }, { actor, notifyAgent: false })
  if (crmLead.leadId !== identity.leadId || crmLead.contactId !== identity.contactId) throw new Error('The saved buyer lead identity could not be verified.')
  onCrmLeadSaved?.(crmLead)
  invalidate(organisationId)
  const input = {
    developerOrgId, primaryDevelopmentId: developmentId, sourceLeadId: crmLead.leadId,
    developerLeadId: identity.developerLeadId, assignedAgentId: Object.prototype.hasOwnProperty.call(form, 'assignedAgentId') ? form.assignedAgentId : assignedAgent?.id || actor.id, sourceAgentUserId: assignedAgent?.id || actor.id,
    preferredUnitId: form.preferredUnitId, interestedDevelopmentIds: form.interestedDevelopmentIds,
    unitTypeInterest: form.unitTypeInterest, budgetMin: form.budgetMin, budgetMax: form.budgetMax,
    buyerFullName: `${text(form.firstName)} ${text(form.lastName)}`,
    buyerEmail: form.email, buyerPhone: form.phone, privateNotes: form.notes,
    leadSource: form.source || 'Other', leadStatus: 'new',
  }
  try {
    const developerLead = organisationId === developerOrgId
      ? await createDirect(input)
      : await createIntroduced({ ...input, sourceAgencyOrgId: organisationId })
    const protectedAgencyReceipt = organisationId !== developerOrgId && !developerLead.sourceLeadId
    if (!protectedAgencyReceipt && developerLead.sourceLeadId !== crmLead.leadId) throw new Error('The development link did not retain the saved buyer identity.')
    invalidate(organisationId)
    // Agency-facing capture already owns this buyer. The developer-facing
    // receipt masks the source ID; retain the agency's own known CRM reference.
    return { crmLead, developerLead: { ...developerLead, sourceLeadId: crmLead.leadId, buyerFullName: input.buyerFullName, buyerEmail: text(form.email), buyerPhone: text(form.phone) } }
  } catch (error) {
    throw new Error(`Buyer lead saved. Its development link still needs to finish; retry Create lead to continue without creating another buyer. ${error.message}`, { cause: error })
  }
}
