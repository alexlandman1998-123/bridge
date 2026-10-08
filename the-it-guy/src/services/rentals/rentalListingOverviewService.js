import { getPrivateListingActivity, getPrivateListingDocuments, getPrivateListingDocumentRequirements } from '../privateListingService'
import { listRentalLeads } from './rentalLeadService'
import { listPersistedRentalApplicationsForListing, listPersistedRentalTenanciesForApplications } from './rentalApplicationRepository'
import { listRentalPropertyMandates } from './rentalLandlordMandateRepository'
import { buildRentalListingOverview } from './rentalListingOverviewModel'
import { requestRentalLandlordOnboarding } from './rentalLandlordOnboardingService.js'
import { rentalListingLandlordLeads, buildRentalListingLandlordMatrix, buildRentalListingTenantMatrix } from './rentalListingDocumentMatrixModel.js'

export async function loadRentalListingOverview(listing, scope, options = {}, dependencies = {}) {
  const api = { getPrivateListingActivity, getPrivateListingDocuments, getPrivateListingDocumentRequirements, listRentalLeads, listPersistedRentalApplicationsForListing, listPersistedRentalTenanciesForApplications, listRentalPropertyMandates, requestRentalLandlordOnboarding, ...dependencies }
  const sources = [
    ['activity', 'Viewings & activity', () => api.getPrivateListingActivity(listing.id, { requireAvailable: true })],
    ['documents', 'Documents', () => api.getPrivateListingDocuments(listing.id)],
    ['requirements', 'Document requirements', () => api.getPrivateListingDocumentRequirements(listing.id)],
    ['leads', 'Leads', () => api.listRentalLeads(scope.organisationId, { ...options, includeClosed: true })],
    ['applications', 'Applications', () => api.listPersistedRentalApplicationsForListing(scope.organisationId, listing.id, { includeEvidence: true })],
  ]
  const results = await Promise.allSettled(sources.map(([, , read]) => read()))
  const values = { listing, issues: [] }
  results.forEach((result, index) => {
    values[sources[index][0]] = result.status === 'fulfilled' ? result.value : []
    if (result.status === 'rejected') values.issues.push(sources[index][1])
  })
  const propertyId = listing.rentalPortfolioPropertyId || listing.sellerCanonicalFacts?.propertyId || values.leads.find((lead) => lead.role === 'landlord' && lead.relationships?.listingId === listing.id)?.relationships?.propertyId
  const landlordLeads = rentalListingLandlordLeads(listing, values.leads)
    .filter((lead) => !lead.organisationId || lead.organisationId === scope.organisationId)
  const related = await Promise.allSettled([
    api.listPersistedRentalTenanciesForApplications(scope.organisationId, values.applications.map((item) => item.id)),
    propertyId ? api.listRentalPropertyMandates(propertyId) : Promise.resolve([]),
    ...landlordLeads.map((lead) => api.requestRentalLandlordOnboarding(lead.id)),
  ])
  values.tenancies = related[0].status === 'fulfilled' ? related[0].value : []
  values.mandates = related[1].status === 'fulfilled' ? related[1].value.filter((item) => item.organisationId === scope.organisationId) : []
  if (related[0].status === 'rejected') values.issues.push('Tenant')
  if (related[1].status === 'rejected') values.issues.push('Commission')
  values.documentMatrix = {
    landlords: [],
    tenants: values.applications.map(buildRentalListingTenantMatrix),
    issues: [],
  }
  if (values.issues.includes('Leads')) values.documentMatrix.issues.push('Landlord requirements could not be loaded. Refresh to retry.')
  if (values.issues.includes('Applications')) values.documentMatrix.issues.push('Tenant requirements could not be loaded. Refresh to retry.')
  landlordLeads.forEach((lead, index) => {
    const result = related[index + 2]
    if (result.status === 'fulfilled') values.documentMatrix.landlords.push(buildRentalListingLandlordMatrix(listing, lead, result.value.onboarding))
    else values.documentMatrix.issues.push(`Requirements for ${lead.name || 'the landlord'} could not be loaded. Refresh to retry.`)
  })
  if (values.documentMatrix.issues.length && !values.issues.includes('Document requirements')) values.issues.push('Document requirements')
  return buildRentalListingOverview(values)
}
