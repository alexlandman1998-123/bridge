import { getPropertyTypeLabel } from '../lib/propertyTaxonomy.js'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { getAgentPrivateListingSummaries, getPrivateListingCoverImageUrls } from './privateListingService.js'
import { buildRentalListingIndexRow } from './rentals/rentalListingIndexModel.js'
import { resolveRentalWorkspaceScope, buildRentalListingQueryOptions, isRentalListingInWorkspace } from './rentals/rentalWorkspaceScope.js'
import { resolveMobileRoleCategory } from '../config/mobileShell.js'
import { getPrivateListingStatusLabel, mapLegacyListingStatusToCanonicalStatus } from '../lib/privateListingLifecycle.js'

export function mobileListingGroup(row) {
  const rawStatus = String(row.listingStatus || row.status || '').toLowerCase()
  if (['archived', 'deleted', 'expired', 'let', 'rented', 'leased'].includes(rawStatus)) return 'closed'
  const status = mapLegacyListingStatusToCanonicalStatus(rawStatus)
  if (['active', 'under_offer'].includes(status)) return 'active'
  if (['sold', 'transaction_created', 'withdrawn', 'archived', 'deleted', 'expired'].includes(status)) return 'closed'
  return 'drafts'
}

export function toMobileListing(row, coverUrl = '') {
  const status = mapLegacyListingStatusToCanonicalStatus(row.listingStatus || row.status)
  const kind = String(row.listingCategory || row.listing_category || '').toLowerCase() === 'rental' ? 'rentals' : 'sales'
  const rental = kind === 'rentals' ? buildRentalListingIndexRow(row) : null
  return { ...row, kind, rentalPriceFrequency: rental?.rentalPriceFrequency || '', propertyType: row.propertyType ? getPropertyTypeLabel(String(row.propertyType).toLowerCase()) : '', title: row.listingTitle || row.title || row.propertyAddress || 'Untitled listing', address: [row.addressLine1 || row.propertyAddress, row.addressLine2, row.suburb, row.city].filter(Boolean).join(', '), group: mobileListingGroup(row), statusLabel: status === 'seller_lead' ? 'Draft' : getPrivateListingStatusLabel(status), status, price: rental ? rental.monthlyRent || 0 : row.askingPrice || row.estimatedValue || 0, coverUrl }
}

export async function getMobileListingsAsync({ workspace = {}, organisation = null } = {}) {
  const category = resolveMobileRoleCategory(workspace)
  const organisationId = organisation?.id || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id
  const userId = workspace.profile?.id || workspace.profile?.userId
  if (!organisationId || !userId || !['agent', 'principal', 'developer'].includes(category)) throw new Error('Select an agent or developer workspace to view listings.')
  if (!isSupabaseConfigured) throw new Error('Connect to load your saved listings.')
  const membershipRole = workspace.currentMembership?.role || workspace.workspaceRole || workspace.organisationMembershipRole
  const includeAllOrganisationListings = category === 'developer' || category === 'principal' || ['owner', 'super_admin', 'principal', 'admin', 'branch_manager'].includes(membershipRole)
  const membership = workspace.currentMembership || {}
  const assignmentAliases = [...new Set([membership.userId, membership.user_id, membership.organisationUserId, membership.organisation_user_id, membership.id, membership.raw?.id].filter((id) => id && id !== userId))]
  const rows = await getAgentPrivateListingSummaries(userId, { organisationId, includeAllOrganisationListings, ...(!includeAllOrganisationListings && assignmentAliases.length ? { assignedAgentIds: assignmentAliases } : {}), fetchAll: true, includePublicationDetails: true, requireAvailable: true })
  const rentalScope = resolveRentalWorkspaceScope(workspace)
  const rentalOptions = { ...buildRentalListingQueryOptions(rentalScope), organisationId, assignedAgentIds: assignmentAliases }
  const listings = rows.filter(row => mobileListingGroup(row) !== 'closed' && (String(row.listingCategory || row.listing_category || '').toLowerCase() !== 'rental' || isRentalListingInWorkspace(row, userId, rentalOptions)))
  const covers = await getPrivateListingCoverImageUrls(listings.map((row) => row.id))
  return listings.map((row) => toMobileListing(row, covers[row.id]))
}
