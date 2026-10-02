export const TENANCY_STAGES = ['Preparation', 'Signing', 'Move-in', 'Active', 'Move-out', 'Closed']
export function tenancyProgress(tenancy = {}) {
  const lease = tenancy.lease || {}
  const version = lease.rental_lease_versions?.find((item) => item.is_current)
  if (tenancy.status === 'closed') return { stage: 5, action: 'Review the completed tenancy and its records.' }
  if (['notice_given', 'move_out_pending'].includes(tenancy.status)) return { stage: 4, action: 'Arrange the outgoing inspection and final reconciliation.' }
  if (tenancy.status === 'active') return { stage: 3, action: 'Manage rent, maintenance and upcoming lease dates.' }
  if (tenancy.status === 'move_in_pending' || ['signed', 'active'].includes(lease.status) || version?.status === 'signed') return { stage: 2, action: 'Complete move-in checks and confirm occupation.' }
  if (['awaiting_tenant', 'awaiting_landlord'].includes(lease.status) || ['awaiting_tenant', 'awaiting_landlord'].includes(version?.status)) return { stage: 1, action: 'Follow up outstanding lease signatures.' }
  return { stage: 0, action: 'Prepare the lease and confirm the agreed terms.' }
}
export function tenancyRegisterRow(tenancy, property, unit) {
  const identity = tenancy.tenant?.identity || {}
  const lease = tenancy.lease || {}
  const version = lease.rental_lease_versions?.find((item) => item.is_current)
  const terms = lease.terms_json || {}
  const signers = version?.rental_lease_signers || []
  const landlord = signers.find((item) => item.signer_role === 'landlord')
  const tenantSigner = signers.find((item) => item.signer_role === 'tenant')
  return {
    ...tenancy,
    tenantName: [identity.firstName, identity.lastName].filter(Boolean).join(' ') || identity.name || tenancy.tenant?.tenantName || tenantSigner?.signer_name || 'Tenant pending',
    landlordName: landlord?.signer_name || terms.landlord_name || property?.metadata?.landlordName || 'Landlord not captured',
    propertyName: property?.name || 'Property pending',
    unitLabel: unit?.unitLabel || 'Unit pending',
    location: [property?.address?.line1, property?.address?.city].filter(Boolean).join(', ') || 'Address not captured',
    monthlyRent: version?.monthly_rent ?? terms.monthly_rent,
    startDate: version?.effective_start_date || terms.start_date || tenancy.intendedOccupationDate,
    endDate: version?.effective_end_date || terms.end_date,
    ...tenancyProgress(tenancy),
  }
}
