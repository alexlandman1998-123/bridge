const text = (value) => String(value ?? '').trim()
const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const metadata = (activity) => activity.metadata || activity.metadata_json || {}

export const RENTAL_OVERVIEW_TABS = Object.freeze([
  { key: 'overview', label: 'Overview' }, { key: 'leads', label: 'Leads' },
  { key: 'landlord', label: 'Landlord' }, { key: 'marketing', label: 'Marketing' },
  { key: 'mandate', label: 'Documents' }, { key: 'commission', label: 'Commission' },
  { key: 'activity', label: 'Activity' },
])

export function buildRentalListingOverview({ listing = {}, leads = [], applications = [], activity = [], documents = [], requirements = [], tenancies = [], mandates = [], issues = [], now = Date.now() } = {}) {
  const listingId = text(listing.id)
  const outcomes = new Map()
  activity.filter((item) => item.activity_type === 'rental_viewing_outcome').sort((a, b) => text(b.created_at).localeCompare(text(a.created_at))).forEach((item) => {
    const id = text(metadata(item).viewingId)
    if (!outcomes.has(id)) outcomes.set(id, metadata(item).outcome)
  })
  const viewings = activity.filter((item) => item.activity_type === 'rental_viewing_scheduled').map((item) => ({ ...metadata(item), id: item.id, outcome: outcomes.get(text(item.id)) || '' }))
  const upcoming = viewings.filter((item) => timestamp(item.startsAt) !== null && timestamp(item.startsAt) >= now && !item.outcome && item.status !== 'cancelled').sort((a, b) => text(a.startsAt).localeCompare(text(b.startsAt)))
  const legacyApplications = activity.filter((item) => item.activity_type === 'rental_application_received').map((item) => ({ id: item.id, leadId: text(metadata(item).tenantLeadId || metadata(item).tenant_lead_id), tenantName: text(metadata(item).tenant?.name) || 'Tenant application', status: text(metadata(item).screening?.applicationStatus) || 'Captured' }))
  const referencedLeads = new Set([...legacyApplications.map((item) => item.leadId), ...applications.map((item) => text(item.leadId)), ...viewings.map((item) => text(item.tenantLeadId))].filter(Boolean))
  const linkedLeads = leads.filter((lead) => lead.role === 'tenant' && (referencedLeads.has(text(lead.id)) || [lead.relationships?.listingId, lead.qualification?.propertyInquiry?.listingId].map(text).includes(listingId)))
  const linkedTenancy = tenancies.find((item) => item.status === 'active') || tenancies.find((item) => !['closed', 'terminated', 'cancelled', 'ended'].includes(item.status)) || null
  const tenantData = linkedTenancy?.tenant?.data || linkedTenancy?.tenant || {}
  const identity = tenantData.identity || {}
  const tenant = linkedTenancy ? { id: linkedTenancy.id, name: text(tenantData.entity?.legalName) || [identity.firstName, identity.lastName].filter(Boolean).join(' ') || 'Tenant', email: text(identity.email), phone: text(identity.phone), status: linkedTenancy.status } : null
  const needed = requirements.filter((item) => item.is_required !== false && item.isRequired !== false)
  const satisfied = new Set(['approved', 'verified', 'accepted', 'complete', 'completed', 'satisfied', 'waived'])
  const complete = needed.filter((item) => satisfied.has(text(item.status).toLowerCase()) || documents.some((doc) => text(doc.requirement_id || doc.requirementId) === text(item.id) && satisfied.has(text(doc.status).toLowerCase()))).length
  const listedAt = listing.listingDate || listing.firstPublishedAt || listing.first_published_at || listing.marketedAt || listing.marketed_at || listing.listedAt || listing.listed_at || listing.publishedAt || listing.published_at || listing.listingPublicationData?.publishedAt
  const start = timestamp(listedAt)
  return {
    issues, leads: linkedLeads, applications, legacyApplications, activity, documents, requirements, tenant, mandates,
    leadCount: issues.includes('Overview') || issues.includes('Leads') || issues.includes('Applications') || issues.includes('Viewings & activity') ? null : new Set([...referencedLeads, ...linkedLeads.map((lead) => text(lead.id))]).size,
    newLeadCount: linkedLeads.filter((lead) => timestamp(lead.createdAt) >= now - 7 * 86400000).length,
    viewingCount: issues.includes('Overview') || issues.includes('Viewings & activity') ? null : viewings.length,
    viewings, upcoming, daysOnMarket: start === null ? null : Math.max(0, Math.floor((now - start) / 86400000)),
    documentProgress: { total: needed.length, complete, percent: needed.length ? Math.round(complete / needed.length * 100) : 0 },
    refreshedAt: now,
  }
}
