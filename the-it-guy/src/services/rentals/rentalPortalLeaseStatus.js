export function rentalPortalLeaseStatus(lease = {}) {
  const states = { draft: 'Lease in preparation', awaiting_tenant: 'Awaiting tenant signatures', awaiting_landlord: 'Awaiting landlord signatures', signed: 'Lease signed · move-in pending', ended: 'Lease ended', terminated: 'Lease terminated', cancelled: 'Lease cancelled', upcoming: 'Lease starts soon', renewal_pending: 'Renewal pending' }
  if (states[lease.status]) return states[lease.status]
  if (lease.status !== 'active') return 'Lease details pending'
  const end = lease.endsOn ? new Date(`${String(lease.endsOn).slice(0, 10)}T12:00:00`) : null
  const remaining = end ? Math.ceil((end - Date.now()) / 86400000) : null
  return remaining !== null && remaining < 0 ? 'Lease end date passed' : remaining !== null && remaining <= 60 ? 'Lease ending soon' : 'Your lease is active'
}
