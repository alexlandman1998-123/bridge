import { getPrivateListingActivity, getPrivateListingDocuments, getPrivateListingDocumentRequirements } from '../privateListingService'
import { listRentalLeads } from './rentalLeadService'
import { listPersistedRentalApplicationsForListing, listPersistedRentalTenanciesForApplications } from './rentalApplicationRepository'
import { listRentalPropertyMandates } from './rentalLandlordMandateRepository'
import { buildRentalListingOverview } from './rentalListingOverviewModel'

export async function loadRentalListingOverview(listing, scope, options = {}, dependencies = {}) {
  const api = { getPrivateListingActivity, getPrivateListingDocuments, getPrivateListingDocumentRequirements, listRentalLeads, listPersistedRentalApplicationsForListing, listPersistedRentalTenanciesForApplications, listRentalPropertyMandates, ...dependencies }
  const sources = [
    ['activity', 'Viewings & activity', () => api.getPrivateListingActivity(listing.id, { requireAvailable: true })],
    ['documents', 'Documents', () => api.getPrivateListingDocuments(listing.id)],
    ['requirements', 'Document requirements', () => api.getPrivateListingDocumentRequirements(listing.id)],
    ['leads', 'Leads', () => api.listRentalLeads(scope.organisationId, { ...options, includeClosed: true })],
    ['applications', 'Applications', () => api.listPersistedRentalApplicationsForListing(scope.organisationId, listing.id)],
  ]
  const results = await Promise.allSettled(sources.map(([, , read]) => read()))
  const values = { listing, issues: [] }
  results.forEach((result, index) => {
    values[sources[index][0]] = result.status === 'fulfilled' ? result.value : []
    if (result.status === 'rejected') values.issues.push(sources[index][1])
  })
  const propertyId = listing.rentalPortfolioPropertyId || listing.sellerCanonicalFacts?.propertyId || values.leads.find((lead) => lead.role === 'landlord' && lead.relationships?.listingId === listing.id)?.relationships?.propertyId
  const related = await Promise.allSettled([
    api.listPersistedRentalTenanciesForApplications(scope.organisationId, values.applications.map((item) => item.id)),
    propertyId ? api.listRentalPropertyMandates(propertyId) : Promise.resolve([]),
  ])
  values.tenancies = related[0].status === 'fulfilled' ? related[0].value : []
  values.mandates = related[1].status === 'fulfilled' ? related[1].value.filter((item) => item.organisationId === scope.organisationId) : []
  if (related[0].status === 'rejected') values.issues.push('Tenant')
  if (related[1].status === 'rejected') values.issues.push('Commission')
  return buildRentalListingOverview(values)
}
