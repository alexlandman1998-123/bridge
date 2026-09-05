import { createAgencyCrmLeadActivity, updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import { createRentalLeaseWorkflow } from './rentalLeaseWorkflowService'
import { buildRentalTenantPlacementHandoff } from './rentalTenantPlacementHandoffModel'

const text = (value) => String(value ?? '').trim()

export async function linkRentalTenantLeadToTenancy(lead = {}, tenancy = {}, context = {}) {
  if (lead.role !== 'tenant' || lead.stage !== 'placement_ready') throw new Error('Choose a tenant lead at Placement ready.')
  if (!text(tenancy.id) || !text(tenancy.listingId)) throw new Error('A saved lease workflow is required.')
  const current = getRentalLeadMetadata(lead.raw)
  const metadata = patchRentalCrmLeadMetadata(lead.raw, {
    relationships: { ...current.relationships, listingId: text(tenancy.listingId), tenancyId: text(tenancy.id), applicationId: text(tenancy.applicationReference || current.relationships.applicationId) },
  })
  const updated = await updateAgencyCrmLeadRecord(context.organisationId, lead.id, { rawEnquiryPayload: metadata })
  void createAgencyCrmLeadActivity(context.organisationId, lead.id, {
    agent: context.actor || {}, activityType: 'Rental Tenancy Linked',
    activityNote: `Lease workflow ${text(tenancy.reference || tenancy.id)} created and linked to tenant lead.`, outcome: 'tenancy_created',
  }, { actor: context.actor || {} }).catch(() => null)
  return updated
}

export async function createRentalTenantPlacementHandoff(lead = {}, values = {}, listing = {}, application = {}, context = {}) {
  const form = buildRentalTenantPlacementHandoff(lead, values)
  const created = await createRentalLeaseWorkflow(form, listing, application, context)
  try {
    await linkRentalTenantLeadToTenancy(lead, created.lease, context)
  } catch (error) {
    throw new Error(`Lease workflow ${created.lease.reference || created.lease.id} was created, but it could not be linked to the tenant lead: ${error?.message || 'Unknown error.'}`)
  }
  return created
}
