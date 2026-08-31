export const RENTAL_DASHBOARD_VERSION = 'arch9_rental_dashboard_v1'

const text = (value) => String(value ?? '').trim()

export function buildRentalDashboardSnapshot({ listings = [], leads = [], applications = [], leases = [], managementEvents = [] } = {}) {
  const activeListings = listings.filter((listing) => ['active', 'published', 'marketing'].includes(text(listing.status).toLowerCase())).length
  const tenantLeads = leads.filter((lead) => lead.role === 'tenant')
  const landlordLeads = leads.filter((lead) => lead.role === 'landlord')
  const openApplications = applications.filter((application) => !['approved', 'declined', 'withdrawn'].includes(text(application.applicationStatus).toLowerCase())).length
  const activeTenancies = leases.filter((lease) => ['active', 'fully_signed'].includes(text(lease.leaseStatus).toLowerCase())).length
  const openManagement = managementEvents.filter((event) => !['completed', 'cancelled'].includes(text(event.status).toLowerCase()))
  return {
    activeListings,
    landlordLeads: landlordLeads.length,
    tenantLeads: tenantLeads.length,
    openApplications,
    activeTenancies,
    openManagement: openManagement.length,
    attention: [
      ...openManagement.filter((event) => event.type === 'arrears_follow_up'),
      ...openManagement.filter((event) => event.type === 'maintenance'),
      ...leases.filter((lease) => text(lease.depositStatus) === 'received_unverified').map((lease) => ({ type: 'deposit', tenantName: lease.tenantName, listingTitle: lease.listingTitle, status: 'received_unverified', dueDate: '' })),
    ].slice(0, 6),
  }
}
