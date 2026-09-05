import { createRentalPropertyMandate } from './rentalLandlordMandateRepository'
import { buildRentalLandlordMandateHandoff } from './rentalLandlordMandateHandoffModel'
import { advanceRentalLead } from './rentalLeadService'

export async function recordRentalLandlordMandateHandoff(lead = {}, values = {}, context = {}) {
  const handoff = buildRentalLandlordMandateHandoff(lead, values)
  const mandate = await createRentalPropertyMandate({ organisationId: context.organisationId, propertyId: handoff.propertyId, branchId: context.branchId, mandateStatus: 'active', authorityStatus: 'confirmed', startsOn: handoff.startsOn, endsOn: handoff.endsOn, managementFeeType: handoff.managementFeeType, managementFeeAmount: handoff.managementFeeAmount, metadata: handoff.metadata, createdBy: context.actor?.id || context.actor?.userId || '' })
  let updatedLead
  try {
    updatedLead = await advanceRentalLead(lead, { organisationId: context.organisationId, actor: context.actor || {}, toStage: 'mandate_signed', evidence: { mandateReference: handoff.evidenceReference, signedAt: handoff.signedAt }, relationships: { propertyId: handoff.propertyId, mandateId: mandate.id } })
  } catch (cause) {
    throw new Error(`Mandate ${mandate.id} was recorded, but the landlord lead was not advanced: ${cause?.message || 'unknown lead update failure'}`)
  }
  return { mandate, lead: updatedLead }
}
