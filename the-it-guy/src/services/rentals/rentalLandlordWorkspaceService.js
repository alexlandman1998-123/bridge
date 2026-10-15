import { saveRentalLandlordDiscovery, linkRentalLandlordOnboardingProperty } from './rentalLandlordOnboardingService.js'
import { rentalLandlordDiscovery } from './rentalLandlordOnboardingModel.js'
import { updateAgencyCrmLeadRecord, createAgencyCrmLeadActivity } from '../../lib/agencyCrmRepository'
import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { getRentalProperty } from './rentalPropertyRepository'
import { listRentalUnits } from './rentalUnitRepository.js'
import {
  createRentalPropertyMandate,
  listRentalPropertyMandates,
} from './rentalLandlordMandateRepository'
import { findLeadMandate } from './rentalLeadHandoffModel'
import { advanceRentalLead, getRentalLeadWorkspace } from './rentalLeadService'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import {
  landlordWorkspace,
  normalizeLandlordProfile,
  normalizeLandlordProperty,
} from './rentalLandlordWorkspaceModel'
const text = (value) => String(value ?? '').trim()
async function current(leadId, context) {
  const { lead } = await getRentalLeadWorkspace(
    context.organisationId,
    leadId,
    { ...context.scope, includeClosed: true },
  )
  if (lead.role !== 'landlord') throw new Error('Choose a landlord lead.')
  return lead
}
async function save(lead, patch, context) {
  if (patch.landlordProfile || patch.landlordPortfolio) {
    const currentDiscovery = rentalLandlordDiscovery(lead.raw?.rawEnquiryPayload || lead.raw?.raw_enquiry_payload || {})
    await saveRentalLandlordDiscovery(lead, { profile: patch.landlordProfile || currentDiscovery.profile, portfolio: patch.landlordPortfolio || currentDiscovery.portfolio }, context.expectedDiscovery || currentDiscovery)
    return true
  }
  await updateAgencyCrmLeadRecord(context.organisationId, lead.id, {
    rawEnquiryPayload: patchRentalCrmLeadMetadata(lead.raw, patch),
  })
  return true
}
export async function saveRentalLandlordProfile(leadId, values, context) {
  const lead = await current(leadId, context)
  const profile = normalizeLandlordProfile(values)
  // Never send the portfolio as a side effect of editing landlord details.
  return saveRentalLandlordDiscovery(lead, { profile }, context.expectedDiscovery || rentalLandlordDiscovery(lead.raw?.rawEnquiryPayload || lead.raw?.raw_enquiry_payload || {}))
}
export async function recordRentalLandlordMandateSent(leadId, propertyId, context) {
  const lead = await current(leadId, context)
  if (lead.stage !== 'mandate_pending') throw new Error('Refresh this lead before recording its mandate as sent.')
  if (!landlordWorkspace(lead).portfolio.some(property => property.id === propertyId)) throw new Error('Choose a property in this landlord portfolio.')
  const actorId = text(context.actor?.id || context.actor?.userId)
  if (!actorId || !lead.updatedAt) throw new Error('Refresh this lead in your signed-in workspace before recording the mandate.')
  const sent = getRentalLeadMetadata(lead.raw).landlordMandateDispatches || {}
  if (sent[propertyId]?.sentAt) return lead
  const receipt = { sentAt: new Date().toISOString(), sentBy: actorId, channel: 'agent_recorded' }
  await updateAgencyCrmLeadRecord(context.organisationId, lead.id, {
    rawEnquiryPayload: patchRentalCrmLeadMetadata(lead.raw, { landlordMandateDispatches: { ...sent, [propertyId]: receipt } }),
  }, { expectedUpdatedAt: lead.updatedAt })
  void createAgencyCrmLeadActivity(context.organisationId, lead.id, {
    agent: context.actor, activityType: 'Rental Mandate Marked Sent', activityNote: 'Agent confirmed that the rental mandate was sent.', outcome: 'Sent',
  }, { actor: context.actor }).catch(() => null)
  return receipt
}
export async function saveRentalLandlordProperty(leadId, values, context) {
  const lead = await current(leadId, context)
  const { portfolio } = landlordWorkspace(lead)
  const property = normalizeLandlordProperty(values)
  const previous = portfolio.find((item) => item.id === property.id)
  if (text(property.listingId) !== text(previous?.listingId))
    throw new Error(
      'Listing links must be created through the rental listing workflow.',
    )
  if (
    (previous?.mandateId || previous?.listingId) &&
    (text(previous.canonicalPropertyId) !== text(property.canonicalPropertyId) || text(previous.canonicalUnitId) !== text(property.canonicalUnitId))
  )
    throw new Error(
      'The managed property cannot be changed after its mandate or listing has been linked.',
    )
  if (property.canonicalPropertyId) {
    const managed = await getRentalProperty(property.canonicalPropertyId)
    if (
      !managed ||
      managed.organisationId !== context.organisationId ||
      (context.scope?.scopeLevel !== 'organisation' &&
        context.scope?.branchId &&
        managed.branchId !== context.scope.branchId)
    )
      throw new Error('Choose a managed property available in this workspace.')
  }
  if (property.canonicalUnitId) {
    if (!property.canonicalPropertyId) throw new Error('Choose a managed property before selecting its unit.')
    const units = await listRentalUnits({ propertyId: property.canonicalPropertyId })
    const unit = units.find(item => item.id === property.canonicalUnitId)
    if (!unit || unit.organisationId !== context.organisationId || (context.scope?.scopeLevel !== 'organisation' && context.scope?.branchId && unit.branchId !== context.scope.branchId))
      throw new Error('Choose a unit in this managed property and workspace.')
  }
  const updated = previous
    ? portfolio.map((item) =>
        item.id === property.id ? { ...item, ...property } : item,
      )
    : [...portfolio, property]
  return save(lead, { landlordPortfolio: updated }, context)
}
export async function saveRentalLandlordDocument(leadId, values, context) {
  const lead = await current(leadId, context)
  const { portfolio, documents } = landlordWorkspace(lead)
  if (!text(values.id) || !text(values.name) || !text(values.reference))
    throw new Error('Document name and reference are required.')
  if (
    values.propertyId &&
    !portfolio.some((item) => item.id === values.propertyId)
  )
    throw new Error('Choose a property in this landlord portfolio.')
  const document = {
    id: text(values.id),
    name: text(values.name),
    reference: text(values.reference),
    propertyId: text(values.propertyId),
    recordedAt: new Date().toISOString(),
  }
  return save(
    lead,
    {
      landlordDocuments: [
        ...documents.filter((item) => item.id !== document.id),
        document,
      ],
    },
    context,
  )
}
export async function recordRentalLandlordPortfolioMandate(
  leadId,
  propertyId,
  signedConfirmation,
  context,
) {
  const lead = await current(leadId, context)
  const { portfolio } = landlordWorkspace(lead)
  const property = portfolio.find((item) => item.id === propertyId)
  if (!property?.canonicalPropertyId)
    throw new Error(
      'Link this portfolio entry to a managed rental property first.',
    )
  if (!signedConfirmation)
    throw new Error('Confirm that the rental mandate has been signed.')
  if (!property.mandateReference || !property.mandateSignedAt)
    throw new Error(
      'Save the signed mandate reference and date on this property first.',
    )
  if (
    ![
      'mandate_pending',
      'mandate_signed',
      'listing_ready',
      'listing_created',
    ].includes(lead.stage)
  )
    throw new Error(
      'Complete the appraisal and prepare the mandate before recording it.',
    )
  const managed = await getRentalProperty(property.canonicalPropertyId)
  if (
    !managed ||
    managed.organisationId !== context.organisationId ||
    (context.scope?.scopeLevel !== 'organisation' &&
      context.scope?.branchId &&
      managed.branchId !== context.scope.branchId)
  )
    throw new Error('The managed property is not available in this workspace.')
  const existing = findLeadMandate(
    lead,
    await listRentalPropertyMandates(property.canonicalPropertyId),
    property.canonicalPropertyId,
    context.organisationId,
  )
  const mandate =
    existing ||
    (await createRentalPropertyMandate({
      organisationId: context.organisationId,
      propertyId: property.canonicalPropertyId,
      branchId: managed.branchId,
      mandateStatus: 'active',
      authorityStatus: 'confirmed',
      startsOn: property.mandateStartDate,
      endsOn: property.mandateEndDate,
      metadata: {
        leadId: lead.id,
        signedEvidenceReference: property.mandateReference,
        signedAt: new Date(property.mandateSignedAt).toISOString(),
      },
      createdBy: context.actor?.id,
    }))
  await linkRentalLandlordOnboardingProperty(lead,propertyId,{mandateId:mandate.id},context.expectedDiscovery)
  if (lead.stage === 'mandate_pending')
    await advanceRentalLead(lead, {
      ...context,
      toStage: 'mandate_signed',
      evidence: {
        mandateReference: property.mandateReference,
        signedAt: property.mandateSignedAt,
      },
      relationships: {
        propertyId: property.canonicalPropertyId,
        mandateId: mandate.id,
      },
    })
  return mandate
}
