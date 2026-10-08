import { isRentalListingRecord } from '../../services/rentals/rentalListingDraftService.js'
import { getListingCardAddressLabel, getListingPropertyFacts } from '../../services/listings/listingIndexCardPresentation.js'

const text = (value) => String(value ?? '').trim()
const lower = (value) => text(value).toLowerCase()
export function agentWorkspaceListingScope(agent = {}) {
  return `${text(agent.organisationId || agent.organisation_id)}:${text(agent.userId || agent.user_id || agent.id)}`
}
export function assignedAgentListings(agent = {}) {
  const organisationId = text(agent.organisationId || agent.organisation_id)
  const agentIds = new Set([agent.userId, agent.user_id, agent.id, agent.organisationUserId].map(text).filter(Boolean))
  const email = lower(agent.email)
  return (agent.privateListings || []).filter((listing) => {
    const org = text(listing.organisationId || listing.organisation_id)
    if (org && org !== organisationId) return false
    const ids = [listing.assignedAgentId, listing.assigned_agent_id, listing.assignedUserId, listing.assigned_user_id, listing.agentId].map(text).filter(Boolean)
    if (ids.length) return ids.some((id) => agentIds.has(id))
    const assignedEmail = lower(listing.assignedAgentEmail || listing.assigned_agent_email)
    return !assignedEmail || Boolean(email && assignedEmail === email)
  })
}
export function splitAgentListings(agent = {}) {
  const listings = assignedAgentListings(agent)
  return { sales: listings.filter((row) => !isRentalListingRecord(row)), rentals: listings.filter(isRentalListingRecord) }
}
export function agentSalesListingCard(listing, agent) {
  return {
    id: listing.id, title: listing.listingTitle || listing.title || 'Listing',
    addressLabel: getListingCardAddressLabel(listing), price: Number(listing.askingPrice ?? listing.price ?? 0),
    propertyFacts: getListingPropertyFacts(listing, listing.listingPublicationData?.quickAdd),
    inventoryStatusKey: lower(listing.listingStatus || listing.listing_status || listing.status) === 'draft' ? 'draft' : '',
    inventoryStatusLabel: 'Draft Listing',
    assignedAgent: { name: agent.name || agent.fullName || [agent.firstName, agent.lastName].filter(Boolean).join(' '), email: agent.email, avatarUrl: agent.avatarUrl || agent.profilePhotoUrl, isAssigned: true },
  }
}
export function agentListingFallbackImage(listing = {}) {
  const marketing = listing.marketing || {}
  const gallery = [...(marketing.imageGallery || []), ...(listing.images || []), ...(listing.galleryImages || []), ...(listing.sellerOnboarding?.formData?.imageGallery || [])]
  const coverId = text(marketing.coverImageId || listing.coverImageId || listing.propertyDetails?.coverImageId)
  const cover = gallery.find((row) => text(row.id || row.path) === coverId) || gallery.find((row) => row.url || row.signedUrl || row.publicUrl)
  return text(listing.coverImageUrl || listing.imageUrl || listing.image_url || marketing.mediaUrl || cover?.url || cover?.signedUrl || cover?.publicUrl)
}
function developmentRow(entry = {}) {
  return entry.row || entry
}
export function buildAgentDevelopmentCards(agent, options = [], assignedIds = []) {
  const ids = new Set(assignedIds.map(text).filter(Boolean))
  const linkedRows = (agent.developmentListings || []).map(developmentRow)
  for (const row of linkedRows) {
    const id = text(row.development?.id || row.transaction?.development_id || row.unit?.development_id)
    if (id) ids.add(id)
  }
  for (const listing of assignedAgentListings(agent)) {
    const developmentId = text(listing.developmentId || listing.development_id || listing.propertyDetails?.developmentId)
    if (developmentId) ids.add(developmentId)
  }
  const agentIds = new Set([agent.userId, agent.user_id, agent.id, agent.organisationUserId].map(text).filter(Boolean))
  const email = lower(agent.email)
  const name = lower(agent.name || agent.fullName || [agent.firstName, agent.lastName].filter(Boolean).join(' '))
  const matches = (member) => {
    const id = text(member.userId || member.user_id || member.id)
    const address = lower(member.email || member.contactEmail)
    if (id || address) return (id && agentIds.has(id)) || Boolean(email && address === email)
    return Boolean(name && lower(member.name || member.contactName) === name)
  }
  const grouped = new Map()
  for (const option of options) {
    if (!ids.has(text(option.id)) && !(option.stakeholder_teams?.agents || []).some(matches)) continue
    grouped.set(text(option.id), option)
  }
  for (const row of linkedRows) {
    const id = text(row.development?.id || row.transaction?.development_id || row.unit?.development_id)
    if (id && !grouped.has(id)) grouped.set(id, { ...row.development, id })
  }
  return [...grouped].map(([id, option]) => {
    const rows = linkedRows.filter((row) => text(row.development?.id || row.transaction?.development_id || row.unit?.development_id) === id)
    const units = new Map(rows.filter((row) => row.unit?.id).map((row) => [row.unit.id, row.unit]))
    const sold = [...units.values()].filter((unit) => ['sold', 'reserved'].includes(lower(unit.status))).length
    const total = Number(option.planned_units || option.total_units_expected || units.size) || 0
    return {
      id, name: option.name || 'Development', location: option.location || option.formatted_address || option.address || [option.suburb, option.city].filter(Boolean).join(', ') || 'Location pending',
      developer: option.developer_company || option.stakeholder_teams?.developers?.find((member) => member.company || member.name)?.company || option.stakeholder_teams?.developers?.find((member) => member.name)?.name,
      assignedAgent: agent.name || agent.fullName || [agent.firstName, agent.lastName].filter(Boolean).join(' '),
      totalUnits: total, unitsSoldOrReserved: sold, unitsAvailable: Math.max(0, total - sold),
      status: option.status || 'draft', nextAction: 'Open development workspace',
    }
  })
}
