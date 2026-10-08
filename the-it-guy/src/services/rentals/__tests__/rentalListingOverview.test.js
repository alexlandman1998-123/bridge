import { describe, expect, it, vi } from 'vitest'
import { buildRentalListingOverview } from '../rentalListingOverviewModel'
import { buildRentalListingDetailPath, resolveRentalListingDetailTab } from '../rentalListingDetailModel'
import { loadRentalListingOverview } from '../rentalListingOverviewService'
import { listPersistedRentalApplicationsForListing, listPersistedRentalTenanciesForApplications } from '../rentalApplicationRepository'
import { buildRentalListingTenantMatrix, rentalListingLandlordProperties } from '../rentalListingDocumentMatrixModel.js'

const now = Date.parse('2026-10-03T08:00:00Z')
const listing = { id: 'listing-1', rentalPortfolioPropertyId: 'property-1' }
const activity = [
  { id: 'view-1', activity_type: 'rental_viewing_scheduled', metadata: { tenantLeadId: 'lead-1', startsAt: '2026-10-04T08:00:00Z' } },
  { id: 'view-2', activity_type: 'rental_viewing_scheduled', metadata: { tenantLeadId: 'lead-2', startsAt: '2026-10-04T10:00:00Z' } },
  { id: 'out-older', created_at: '2026-10-02T08:00:00Z', activity_type: 'rental_viewing_outcome', metadata: { viewingId: 'view-2', outcome: 'attended' } },
  { id: 'out-new', created_at: '2026-10-03T08:00:00Z', activity_type: 'rental_viewing_outcome', metadata: { viewingId: 'view-2', outcome: 'cancelled' } },
]

describe('rental listing overview', () => {
  it('links by listing/application/viewing identity and counts each tenant once', () => {
    const snapshot = buildRentalListingOverview({ listing, now, activity, applications: [{ id: 'app-1', leadId: 'lead-1' }], leads: [
      { id: 'lead-1', role: 'tenant', createdAt: '2026-10-02T00:00:00Z' },
      { id: 'lead-2', role: 'tenant' },
      { id: 'lead-3', role: 'tenant', relationships: { listingId: listing.id } },
      { id: 'unrelated', role: 'tenant', relationships: { listingId: 'other-listing' } },
      { id: 'landlord', role: 'landlord', relationships: { listingId: listing.id } },
    ] })
    expect(snapshot.leads.map((lead) => lead.id)).toEqual(['lead-1', 'lead-2', 'lead-3'])
    expect(snapshot.leadCount).toBe(3)
    expect(snapshot.newLeadCount).toBe(1)
    expect(snapshot.viewingCount).toBe(2)
    expect(snapshot.upcoming.map((viewing) => viewing.id)).toEqual(['view-1'])
    expect(snapshot.daysOnMarket).toBeNull()
  })
  it('uses only actual tenancy records for placement and approved requirements for completion', () => {
    const result = buildRentalListingOverview({ listing: { ...listing, publishedAt: '2026-10-01T08:00:00Z' }, now,
      applications: [{ id: 'approved-app', status: 'approved' }],
      requirements: [{ id: 'a', is_required: true }, { id: 'b', status: 'waived' }, { id: 'optional', is_required: false }],
      documents: [{ requirement_id: 'a', status: 'uploaded' }],
    })
    expect(result.tenant).toBeNull()
    expect(result.documentProgress).toEqual({ total: 2, complete: 1, percent: 50 })
    expect(result.daysOnMarket).toBe(2)
    const placed = buildRentalListingOverview({ tenancies: [{ id: 'closed', status: 'closed' }, { id: 'active', status: 'active', tenant: { identity: { firstName: 'Amy', lastName: 'Tenant', email: 'amy@example.test' } } }] })
    expect(placed.tenant).toMatchObject({ id: 'active', name: 'Amy Tenant', email: 'amy@example.test' })
  })
  it('keeps source failures unknown and exposes working detail URLs', () => {
    const snapshot = buildRentalListingOverview({ listing, now, issues: ['Leads', 'Viewings & activity'] })
    expect(snapshot.leadCount).toBeNull()
    expect(snapshot.viewingCount).toBeNull()
    expect(buildRentalListingDetailPath('a b', 'leads')).toBe('/agent/rentals/listings/a%20b/leads')
    expect(buildRentalListingDetailPath('id', 'commission')).toBe('/agent/rentals/listings/id/commission')
    expect(resolveRentalListingDetailTab('documents')).toBe('mandate')
  })
  it('loads scoped sources independently and preserves data when one source fails', async () => {
    const calls = {
      getPrivateListingActivity: vi.fn().mockResolvedValue(activity),
      getPrivateListingDocuments: vi.fn().mockRejectedValue(new Error('timeout')),
      getPrivateListingDocumentRequirements: vi.fn().mockResolvedValue([]),
      listRentalLeads: vi.fn().mockResolvedValue([]),
      listPersistedRentalApplicationsForListing: vi.fn().mockResolvedValue([{ id: 'app-1', leadId: 'lead-1' }]),
      listPersistedRentalTenanciesForApplications: vi.fn().mockResolvedValue([]),
      listRentalPropertyMandates: vi.fn().mockResolvedValue([{ organisationId: 'org-1' }, { organisationId: 'org-2' }]),
    }
    const snapshot = await loadRentalListingOverview(listing, { organisationId: 'org-1' }, { assignedAgentId: 'agent-1' }, calls)
    expect(snapshot.issues).toEqual(['Documents'])
    expect(snapshot.applications).toHaveLength(1)
    expect(snapshot.mandates).toHaveLength(1)
    expect(calls.listRentalLeads).toHaveBeenCalledWith('org-1', { assignedAgentId: 'agent-1', includeClosed: true })
    expect(calls.getPrivateListingActivity).toHaveBeenCalledWith('listing-1', { requireAvailable: true })
    expect(calls.listPersistedRentalApplicationsForListing).toHaveBeenCalledWith('org-1', 'listing-1', { includeEvidence: true })
    expect(calls.listPersistedRentalTenanciesForApplications).toHaveBeenCalledWith('org-1', ['app-1'])
  })
})

function database(pages) {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn() }
  for (const key of ['select', 'eq', 'in', 'order']) query[key].mockReturnValue(query)
  pages.forEach((data) => query.range.mockResolvedValueOnce({ data, error: null }))
  return { from: vi.fn().mockReturnValue(query), query }
}
it('reads every application page with explicit listing and organisation filters', async () => {
  const db = database([Array.from({ length: 100 }, (_, i) => ({ id: `app-${i}` })), [{ id: 'last' }]])
  const rows = await listPersistedRentalApplicationsForListing('org-1', 'listing-1', { client: db })
  expect(rows).toHaveLength(101)
  expect(db.query.eq).toHaveBeenCalledWith('organisation_id', 'org-1')
  expect(db.query.eq).toHaveBeenCalledWith('application_data->property->>listingId', 'listing-1')
  expect(db.query.range).toHaveBeenNthCalledWith(2, 100, 199)
})
it('reads only tenancy conversions from these applications and skips empty queries', async () => {
  const db = database([[{ id: 'tenancy-1', source_application_id: 'app-1' }]])
  expect(await listPersistedRentalTenanciesForApplications('org-1', [], { client: db })).toEqual([])
  expect(db.from).not.toHaveBeenCalled()
  const result = await listPersistedRentalTenanciesForApplications('org-1', ['app-1', 'app-1'], { client: db })
  expect(result[0].sourceApplicationId).toBe('app-1')
  expect(db.query.eq).toHaveBeenCalledWith('organisation_id', 'org-1')
  expect(db.query.in).toHaveBeenCalledWith('source_application_id', ['app-1'])
})

it('retains earlier application activity as tenant evidence without inventing an online application URL', () => {
  const snapshot = buildRentalListingOverview({ listing, activity: [{ id: 'old-app', activity_type: 'rental_application_received', metadata: { tenantLeadId: 'old-lead', tenant: { name: 'Earlier Tenant' }, screening: { applicationStatus: 'submitted' } } }] })
  expect(snapshot.leadCount).toBe(1)
  expect(snapshot.legacyApplications).toEqual([{ id: 'old-app', leadId: 'old-lead', tenantName: 'Earlier Tenant', status: 'submitted' }])
  expect(snapshot.applications).toEqual([])
})

it('reads the scoped saved application summary and preserves requirement and file pointers', async () => {
  const db = database([[{ id: 'app-1', organisation_id: 'org-1', requirements: [{ id: 'r-1', active: true, required: true, mode: 'active', subject_id: 'primary', scope_key: 'application', purpose: 'identity', current_document_id: 'doc-1', state: 'received', generation: 2 }], documents: [{ id: 'doc-1', name: 'identity.pdf' }] }]])
  const rows = await listPersistedRentalApplicationsForListing('org-1', 'listing-1', { client: db, includeEvidence: true })
  expect(db.from).toHaveBeenCalledWith('rental_application_review_summaries')
  expect(db.query.eq).toHaveBeenCalledWith('organisation_id', 'org-1')
  expect(db.query.eq).toHaveBeenCalledWith('application_data->property->>listingId', 'listing-1')
  expect(rows[0].requirements[0]).toMatchObject({ id: 'r-1', documentId: 'doc-1', generation: 2 })
  expect(rows[0].documents[0].name).toBe('identity.pdf')
})

it('loads landlord identity and only this portfolio property while keeping tenant packs separate', async () => {
  const lead = { id: 'owner', name: 'Owner', role: 'landlord', organisationId: 'org-1', raw: { rawEnquiryPayload: { rentalCrm: { landlordProfile: { name: 'Owner' }, landlordPortfolio: [{ id: 'portfolio-1', listingId: 'listing-1', canonicalPropertyId: 'property-1' }, { id: 'portfolio-2', listingId: 'listing-2' }] } } } }
  const requirements = [
    { id: 'identity', active: true, scopeKey: 'identity', purpose: 'identity', subjectId: 'primary', state: 'accepted', documentId: 'id-file', mode: 'preview' },
    { id: 'disclosure', active: true, scopeKey: 'property:portfolio-1', purpose: 'property_disclosure', subjectId: 'property', state: 'missing', mode: 'preview' },
    { id: 'other', active: true, scopeKey: 'property:portfolio-2', purpose: 'signed_mandate', subjectId: 'entity' },
    { id: 'old', active: false, scopeKey: 'identity', purpose: 'identity', subjectId: 'primary' },
  ]
  const tenantRequirement = { id: 'tenant-income', active: true, mode: 'active', scopeKey: 'application', subjectId: 'primary', purpose: 'proof_of_income', required: true, generation: 1, state: 'received', documentId: 'b' }
  const application = { id: 'app-1', status: 'submitted', data: { identity: { firstName: 'Amy' }, documentLinks: ['a', 'b'].map((documentId) => ({ documentId, requirementId: 'tenant-income', generation: 1, subjectId: 'primary', purpose: 'proof_of_income' })) }, requirements: [tenantRequirement], documents: ['a', 'b', 'unassigned'].map((id) => ({ id, name: `${id}.pdf`, intake_bundle_id: 'pack' })) }
  const calls = {
    getPrivateListingActivity: vi.fn().mockResolvedValue([]), getPrivateListingDocuments: vi.fn().mockResolvedValue([]), getPrivateListingDocumentRequirements: vi.fn().mockResolvedValue([]),
    listRentalLeads: vi.fn().mockResolvedValue([lead, { ...lead, id: 'foreign', organisationId: 'org-2' }, { id: 'unrelated', role: 'landlord' }]),
    listPersistedRentalApplicationsForListing: vi.fn().mockResolvedValue([application, { ...application, id: 'app-2', data: { identity: { firstName: 'Bob' } }, requirements: [] }]),
    listPersistedRentalTenanciesForApplications: vi.fn().mockResolvedValue([]), listRentalPropertyMandates: vi.fn().mockResolvedValue([]),
    requestRentalLandlordOnboarding: vi.fn().mockResolvedValue({ onboarding: { data: { profile: { name: 'Owner' }, portfolio: [{ id: 'portfolio-1', listingId: 'listing-1' }, { id: 'portfolio-2', listingId: 'listing-2' }] }, requirements, documents: [{ id: 'id-file', file_name: 'owner-id.pdf' }] } }),
  }
  const snapshot = await loadRentalListingOverview(listing, { organisationId: 'org-1' }, {}, calls)
  expect(calls.requestRentalLandlordOnboarding).toHaveBeenCalledExactlyOnceWith('owner')
  expect(snapshot.documentMatrix.landlords[0].rows.map((row) => row.id)).toEqual(['identity', 'disclosure'])
  expect(snapshot.documentMatrix.landlords[0].rows[0].documents[0].file_name).toBe('owner-id.pdf')
  expect(snapshot.documentMatrix.tenants.map((group) => group.title)).toEqual(['Amy', 'Bob'])
  expect(snapshot.documentMatrix.tenants[0].rows[0].documents.map((doc) => doc.id)).toEqual(['a', 'b'])
  expect(snapshot.documentMatrix.tenants[1].rows).toEqual([])
  calls.requestRentalLandlordOnboarding.mockRejectedValue(new Error('Denied'))
  const partial = await loadRentalListingOverview(listing, { organisationId: 'org-1' }, {}, calls)
  expect(partial.documentMatrix.tenants).toHaveLength(2)
  expect(partial.documentMatrix.issues).toEqual(['Requirements for Owner could not be loaded. Refresh to retry.'])
})

it('does not generate unsaved tenant requirements or revive superseded rows', () => {
  expect(buildRentalListingTenantMatrix({ id: 'legacy', data: { identity: { firstName: 'Old' } } }).rows).toEqual([])
  expect(buildRentalListingTenantMatrix({ id: 'new', requirements: [] }).rows).toEqual([])
  expect(buildRentalListingTenantMatrix({ id: 'old', requirements: [{ active: false, mode: 'active', scopeKey: 'application' }] }).rows).toEqual([])
})

it('uses canonical property links without borrowing another listing’s portfolio scope', () => {
  const properties = rentalListingLandlordProperties(listing, { portfolio: [
    { id: 'linked', listingId: 'listing-1' },
    { id: 'unlisted', canonicalPropertyId: 'property-1' },
    { id: 'other-listing', listingId: 'listing-2', canonicalPropertyId: 'property-1' },
    { id: 'same-local-id', canonicalPropertyId: 'property-2' },
  ] })
  expect(properties.map((property) => property.id)).toEqual(['linked'])
  expect(rentalListingLandlordProperties(listing, { portfolio: [{ id: 'one', canonicalPropertyId: 'property-1' }] }).map((property) => property.id)).toEqual(['one'])
  expect(rentalListingLandlordProperties(listing, { portfolio: [{ id: 'one', canonicalPropertyId: 'property-1' }, { id: 'two', canonicalPropertyId: 'property-1' }] })).toEqual([])
})
