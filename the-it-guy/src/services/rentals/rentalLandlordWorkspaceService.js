import { updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { getRentalProperty } from './rentalPropertyRepository'
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
  await updateAgencyCrmLeadRecord(context.organisationId, lead.id, {
    rawEnquiryPayload: patchRentalCrmLeadMetadata(lead.raw, patch),
  })
  return true
}
export async function saveRentalLandlordProfile(leadId, values, context) {
  const lead = await current(leadId, context)
  return save(
    lead,
    { landlordProfile: normalizeLandlordProfile(values) },
    context,
  )
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
    text(previous.canonicalPropertyId) !== text(property.canonicalPropertyId)
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
  await save(
    lead,
    {
      landlordPortfolio: portfolio.map((item) =>
        item.id === propertyId ? { ...item, mandateId: mandate.id } : item,
      ),
    },
    context,
  )
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
