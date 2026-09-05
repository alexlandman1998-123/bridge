import { RENTAL_LEASE_INITIAL_FORM } from './rentalLeaseWorkflowModel.js'

const text = (value) => String(value ?? '').trim()

export function buildRentalTenantPlacementHandoff(lead = {}, values = {}) {
  if (lead.role !== 'tenant' || lead.stage !== 'placement_ready') throw new Error('Choose a tenant lead at Placement ready.')
  if (!text(values.listingId)) throw new Error('Choose a rental listing for the tenancy handoff.')
  return {
    ...RENTAL_LEASE_INITIAL_FORM,
    ...values,
    listingId: text(values.listingId),
    applicationReference: text(values.applicationReference || lead.workflow?.events?.find((event) => event.applicationReference)?.applicationReference),
    tenantName: text(values.tenantName || lead.name),
    tenantEmail: text(values.tenantEmail || lead.email),
    tenantPhone: text(values.tenantPhone || lead.phone),
  }
}
