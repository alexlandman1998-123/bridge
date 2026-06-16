import { ArrowRight, Building2, CheckCircle2, CircleAlert, FolderKanban, Loader2, MoreVertical, Plus, Search, Share2, Trash2, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import SectionHeader from '../components/ui/SectionHeader'
import { getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  fetchAssignedDevelopmentIdsForRole,
  fetchDevelopmentOptions,
  fetchTransactionsByParticipantSummary,
} from '../lib/api'
import { fetchOrganisationSettings, listOrganisationUsers } from '../lib/settingsApi'
import { startRouteTransitionTrace } from '../lib/performanceTrace'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  buildSellerOnboardingLink,
  createAgentSellerLead,
  deleteAgentPrivateListingCascade,
  createListingDraftFromSellerLead,
  generateId,
  generateSellerOnboardingToken,
  LISTING_STATUS,
  OFFER_STATUS,
  readAgentPrivateListings,
  readDeletedListingIds,
  rememberDeletedListingIds,
  SELLER_ONBOARDING_STATUS,
  writeAgentPrivateListings,
} from '../lib/agentListingStorage'
import { MOCK_DATA_ENABLED } from '../lib/mockData'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  evaluatePrivateListingTransitionGuards,
  getPrivateListingLifecycleNextAction,
  getPrivateListingLifecycleState,
  getPrivateListingStatusGroup,
} from '../lib/privateListingLifecycle'
import { createPrivateListing, createPrivateListingActivity, deletePrivateListing, getAgentPrivateListings, transitionPrivateListingStatus, updatePrivateListing, uploadPrivateListingDocument } from '../services/privateListingService'
import { getListingPartnerShareOptions, shareListingWithPartner, unshareListingWithPartner } from '../services/partnerListingSharingService'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import {
  getPropertyCategoryLabel,
  getPropertyStructureTypeLabel,
  normalizeListingSource,
  normalizePropertyCategory,
  normalizePropertyStructureType,
  PROPERTY_CATEGORIES,
  PROPERTY_STRUCTURE_TYPES,
} from '../lib/propertyTaxonomy'

const LISTINGS_VIEW_STORAGE_KEY = 'itg:agent-listings:view-mode:v1'
const ACTIVE_LISTING_TABS = ['residential', 'developments']
const MANUAL_LISTING_STATUSES = ['draft', 'active', 'under_offer', 'sold', 'archived']
const QUICK_ADD_STEPS = ['property', 'seller', 'mandate', 'assignment']
const QUICK_LISTING_METADATA_PREFIX = 'BRIDGE_QUICK_ADD_METADATA:'
const LISTING_ORIGINS = ['quick_add', 'guided_onboarding', 'imported_property24', 'manual_admin_capture', 'developer_unit']
const LISTING_DOCUMENT_CATEGORIES = ['Mandate', 'Seller ID', 'Proof of Address', 'Property Photos', 'Rates and Taxes', 'Bond Statement', 'Title Deed', 'Other']
const CANONICAL_LISTING_STRUCTURE = [
  'listing',
  'property',
  'seller_party',
  'mandate',
  'commission_terms',
  'agent_assignment',
  'documents',
  'transaction_events',
]
const TRANSFER_ATTORNEY_OPTIONS = ['Tuckers Attorneys', 'Van Breda Conveyancers', 'Ndlovu Legal Transfers']
const BOND_ATTORNEY_OPTIONS = ['Bond & Co Attorneys', 'HomeLoan Legal Desk', 'Mokoena Bond Attorneys']
const BOND_ORIGINATOR_OPTIONS = ['Bridge Bond Desk', 'Prime Originators', 'Urban Finance Originators']

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeContact(value) {
  return normalizeText(value).toLowerCase().replace(/[^\da-z@.+-]/g, '')
}

function normalizeDocumentCategoryKey(value) {
  const normalized = normalizeText(value)
  const supported = LISTING_DOCUMENT_CATEGORIES.find((category) => normalizeKey(category) === normalizeKey(normalized))
  return (supported || 'Other').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || '').trim())
}

function getListingIdentityKeys(row = {}) {
  return [
    row.id,
    row.listingId,
    row.listing_id,
    row.privateListingId,
    row.private_listing_id,
    row.sourceDraftId,
    row.source_draft_id,
    row.listingDraftId,
    row.listing_draft_id,
    row.sellerLeadId,
    row.seller_lead_id,
    row.originatingCrmLeadId,
    row.originating_crm_lead_id,
  ].map((value) => String(value || '').trim()).filter(Boolean)
}

function rowMatchesDeletedListing(row = {}, deletedIds = new Set()) {
  if (!deletedIds.size) return false
  return getListingIdentityKeys(row).some((value) => deletedIds.has(value))
}

function isDeletedListingRecord(row = {}) {
  const status = String(row.listingStatus || row.listing_status || row.status || row.lifecycleStatus || '').trim().toLowerCase()
  const visibility = String(row.listingVisibility || row.listing_visibility || '').trim().toLowerCase()
  return Boolean(
    row.deleted_at ||
      row.deletedAt ||
      row.is_deleted ||
      row.isDeleted ||
      ['withdrawn', 'deleted', 'archived'].includes(status) ||
      ['archived', 'deleted'].includes(visibility),
  )
}

function getListingStatusLabel(key) {
  const labels = {
    seller_lead: 'Seller Lead',
    onboarding_sent: 'Onboarding Sent',
    onboarding_completed: 'Onboarding Completed',
    listing_review: 'Listing Review',
    mandate_ready: 'Mandate Ready',
    mandate_sent: 'Mandate Sent',
    mandate_signed: 'Mandate Signed',
    active: 'Active',
    under_offer: 'Under Offer',
    transaction_created: 'Transaction Created',
    sold: 'Sold',
    withdrawn: 'Withdrawn',
  }
  return labels[key] || 'Seller Lead'
}

function getPrivateListingStatus(listing) {
  const explicitStatus = getPrivateListingLifecycleState(listing)
  if (!['active', 'seller_lead'].includes(explicitStatus)) return explicitStatus
  const offers = Array.isArray(listing?.offers) ? listing.offers : []
  const hasAccepted = offers.some((offer) => String(offer?.status || '').toLowerCase() === OFFER_STATUS.ACCEPTED)
  if (hasAccepted) return 'under_offer'
  return explicitStatus === 'seller_lead' ? 'seller_lead' : 'active'
}

function listingStatusGroupLabel(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'draft_intake') return 'Draft / Intake'
  if (key === 'mandate') return 'Mandate'
  if (key === 'active') return 'Active'
  if (key === 'under_offer') return 'Under Offer'
  if (key === 'sold_archived') return 'Sold / Archived'
  if (key === 'withdrawn') return 'Withdrawn'
  return 'All'
}

function resolvePropertyCategory(listing = {}) {
  return normalizePropertyCategory(
    listing?.propertyCategory ||
      listing?.property_category ||
      listing?.propertyType ||
      listing?.property_type ||
      listing?.listingCategory ||
      listing?.listingType,
    { fallback: 'residential' },
  )
}

function resolveListingSource(listing = {}) {
  return normalizeListingSource(
    listing?.listingSource || listing?.listing_source || listing?.stockSource || listing?.stock_source || listing?.listingCategory || listing?.listingType,
    { fallback: 'private_listing' },
  )
}

function resolvePropertyStructureType(listing = {}) {
  return normalizePropertyStructureType(
    listing?.propertyStructureType ||
      listing?.property_structure_type ||
      listing?.ownershipType ||
      listing?.ownership_structure ||
      listing?.propertyType ||
      listing?.property_type,
    { fallback: 'other' },
  )
}

function resolveListingTypeLabel(listing = {}) {
  const listingType = String(listing?.listingCategory || listing?.listingType || '').trim().toLowerCase()
  const mandateType = String(listing?.mandateType || '').trim().toLowerCase()
  const hasRentalSignal =
    listingType.includes('rental') ||
    String(listing?.notes || '').toLowerCase().includes('rental')

  if (listingType.includes('development')) return 'Development Unit'
  if (hasRentalSignal) return 'Rental'
  if (mandateType === 'sole') return 'Sole Mandate'
  if (mandateType === 'open') return 'Open Mandate'
  if (mandateType === 'exclusive') return 'Exclusive Mandate'
  return 'Private Sale'
}

function getListingOriginLabel(listing = {}) {
  const embedded = parseQuickListingMetadata(listing?.internalListingNotes || listing?.internal_listing_notes || listing?.description) || {}
  const origin = normalizeKey(listing.origin || listing.source || embedded.origin || embedded.source || 'guided_onboarding')
  const labels = {
    quick_add: 'Quick Add',
    guided_onboarding: 'Guided',
    imported_property24: 'Property24 Import',
    manual_admin_capture: 'Admin Capture',
    developer_unit: 'Developer Unit',
  }
  return labels[origin] || origin.replace(/_/g, ' ') || 'Guided'
}

function getMandateStatus(listing) {
  const explicit = String(listing?.mandateStatus || listing?.mandate_status || '').trim().toLowerCase()
  if (explicit) {
    return explicit.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  }
  const endDate = String(listing?.mandateEndDate || '').trim()
  if (!endDate) return 'Active'
  const parsed = new Date(endDate)
  if (Number.isNaN(parsed.getTime())) return 'Active'
  return parsed.getTime() < Date.now() ? 'Expired' : 'Active'
}

function getListingSeller(listing = {}) {
  const facts = listing?.sellerCanonicalFacts || listing?.sellerOnboarding?.canonicalFacts || listing?.sellerOnboarding?.formData || {}
  const seller = listing?.seller || {}
  const firstName = normalizeText(facts.firstName || facts.sellerFirstName || facts.name)
  const lastName = normalizeText(facts.lastName || facts.sellerLastName || facts.surname)
  return {
    name: normalizeText(seller.name || facts.sellerName || facts.fullName || facts.registeredName || [firstName, lastName].filter(Boolean).join(' ')),
    email: normalizeText(seller.email || facts.email || facts.sellerEmail),
    phone: normalizeText(seller.phone || facts.phone || facts.mobile || facts.sellerPhone),
    registrationNumber: normalizeText(seller.registrationNumber || facts.idNumber || facts.registrationNumber || facts.companyRegistrationNumber || facts.trustRegistrationNumber),
  }
}

function getListingAddress(listing = {}) {
  return normalizeText(
    listing.propertyAddress ||
      listing.addressLine1 ||
      listing.address_line_1 ||
      listing.propertyDetails?.addressLine1 ||
      listing.listingTitle ||
      listing.title,
  )
}

function getListingDocuments(listing = {}) {
  return [
    ...(Array.isArray(listing.documents) ? listing.documents : []),
    ...(Array.isArray(listing.requiredDocuments) ? listing.requiredDocuments : []),
    ...(Array.isArray(listing.documentRequirements) ? listing.documentRequirements : []),
  ]
}

function listingHasDocumentSignal(listing, matchers = []) {
  const normalizedMatchers = matchers.map(normalizeKey)
  return getListingDocuments(listing).some((document) => {
    const key = normalizeKey([
      document.key,
      document.requirementKey,
      document.requirement_key,
      document.documentType,
      document.document_type,
      document.documentCategory,
      document.category,
      document.name,
      document.document_name,
      document.fileName,
      document.file_name,
    ].filter(Boolean).join(' '))
    const status = normalizeKey(document.status || document.documentStatus || document.document_status)
    const statusReady = !status || ['uploaded', 'approved', 'verified', 'completed', 'signed'].includes(status)
    return statusReady && normalizedMatchers.some((matcher) => key.includes(matcher))
  })
}

function listingHasFicaDocuments(listing = {}) {
  const hasBundledFica = listingHasDocumentSignal(listing, ['fica'])
  const hasIdentity = listingHasDocumentSignal(listing, [
    'seller id',
    'id document',
    'id_document',
    'identity',
    'identity_documents',
    'passport',
  ])
  const hasProofOfAddress = listingHasDocumentSignal(listing, [
    'proof of address',
    'proof_of_address',
    'residential address',
    'residence',
  ])
  return hasBundledFica || (hasIdentity && hasProofOfAddress)
}

function getListingComplianceWarnings(listing = {}, completeness = null) {
  const embedded = parseQuickListingMetadata(listing?.internalListingNotes || listing?.internal_listing_notes || listing?.description) || {}
  const seller = getListingSeller(listing)
  const sellerFormData = listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : listing?.seller_onboarding?.form_data && typeof listing.seller_onboarding.form_data === 'object'
      ? listing.seller_onboarding.form_data
      : {}
  const commission = listing.commission || embedded.commission || {}
  const property = embedded.property || {}
  const mandateStatus = normalizeKey(listing.mandateStatus || listing.mandate_status || embedded.mandateStatus)
  const missingItems = new Set([...(completeness?.missingItems || []), ...(listing.missingFollowUpItems || [])].map(normalizeKey))
  const hasCommission = Boolean(
    normalizeText(
      commission.value ||
        commission.amount ||
        commission.commission_amount ||
        commission.percentage ||
        commission.commission_percentage ||
        commission.mandate_terms ||
        embedded.commissionStatus,
    ) ||
      normalizeText(embedded?.commission?.value) ||
      normalizeText(
        sellerFormData.commissionPercentage ||
          sellerFormData.commissionPercent ||
          sellerFormData.commission_percent ||
          sellerFormData.mandateCommissionPercentage ||
          sellerFormData.mandateCommissionPercent ||
          sellerFormData.commissionAmount ||
          sellerFormData.commission_amount ||
          sellerFormData.mandateCommissionAmount ||
          sellerFormData.mandateTerms,
      )
  )
  const hasPhotos = listingHasDocumentSignal(listing, ['property photo', 'property photos', 'photos']) || Boolean(Array.isArray(listing.images) && listing.images.length)
  const hasMandate = ['signed', 'signed_uploaded', 'approved', 'verified', 'completed'].includes(mandateStatus) || listingHasDocumentSignal(listing, ['mandate', 'signed_mandate'])
  const warnings = []
  if (!hasMandate || missingItems.has('signed mandate')) warnings.push('Mandate missing')
  if (!seller.registrationNumber && !listingHasFicaDocuments(listing)) warnings.push('Seller FICA missing')
  if (!seller.email || !seller.phone) warnings.push('Seller contact incomplete')
  if (!hasCommission || missingItems.has('commission structure')) warnings.push('Commission missing')
  if (!hasPhotos || missingItems.has('property photos')) warnings.push('Photos missing')
  if (!normalizeText(listing.property24ListingUrl || listing.property24_listing_url || property.externalListingLink)) warnings.push('External listing link missing')
  return [...new Set(warnings)]
}

function getInventoryStatus({ statusKey = '', lifecycleGroup = '', complianceWarnings = [], lifecycleBlockers = [], missingRequirementsCount = 0, readinessState = '' } = {}) {
  const normalizedStatus = normalizeKey(statusKey)
  const normalizedGroup = normalizeKey(lifecycleGroup)
  const hasAttention = Boolean(
    (Array.isArray(complianceWarnings) && complianceWarnings.length) ||
      (Array.isArray(lifecycleBlockers) && lifecycleBlockers.length) ||
      Number(missingRequirementsCount || 0) > 0 ||
      ['blocked', 'attention_required', 'requires_attention'].includes(normalizeKey(readinessState)),
  )

  if (['sold', 'transaction_created'].includes(normalizedStatus) || normalizedGroup === 'sold_archived') {
    return { key: 'sold', filterKey: 'sold', label: 'Sold' }
  }
  if (['withdrawn', 'archived'].includes(normalizedStatus) || normalizedGroup === 'withdrawn') {
    return { key: 'archived', filterKey: 'archived', label: 'Archived' }
  }
  if (['draft', 'seller_lead', 'onboarding_sent'].includes(normalizedStatus) || normalizedGroup === 'draft_intake') {
    return { key: 'draft', filterKey: 'draft', label: 'Draft' }
  }
  if (['active', 'listing_active', 'under_offer'].includes(normalizedStatus) || ['active', 'under_offer'].includes(normalizedGroup)) {
    return { key: 'live', filterKey: 'live', label: 'Live' }
  }
  if (normalizedStatus === 'mandate_signed') {
    return { key: 'ready_to_publish', filterKey: 'ready_to_publish', label: 'Ready To Publish' }
  }
  if (hasAttention) {
    return { key: 'needs_attention', filterKey: 'needs_attention', label: 'Needs Attention' }
  }
  if (['onboarding_completed', 'listing_review', 'mandate_ready', 'mandate_sent'].includes(normalizedStatus) || normalizedGroup === 'mandate') {
    return { key: 'under_review', filterKey: 'draft', label: 'Under Review' }
  }
  return { key: 'draft', filterKey: 'draft', label: 'Draft' }
}

function inventoryStatusClass(statusKey) {
  if (statusKey === 'live') return 'border-[#bfe5ce] bg-[#effaf3] text-[#17623a]'
  if (statusKey === 'needs_attention') return 'border-[#f1d3a6] bg-[#fff8ea] text-[#8a5b16]'
  if (statusKey === 'ready_to_publish') return 'border-[#c9dfef] bg-[#eff7ff] text-[#1f4f78]'
  if (statusKey === 'under_review') return 'border-[#ded7f1] bg-[#f7f3ff] text-[#5a3d9c]'
  if (statusKey === 'sold') return 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
  if (statusKey === 'archived') return 'border-[#d7dee8] bg-[#f4f7fb] text-[#607387]'
  return 'border-[#dbe6f2] bg-[#f7fbff] text-[#35546c]'
}

function inventoryDotClass(statusKey) {
  if (statusKey === 'live' || statusKey === 'sold') return 'bg-[#2fb463]'
  if (statusKey === 'needs_attention') return 'bg-[#d78a16]'
  if (statusKey === 'ready_to_publish') return 'bg-[#1f77b4]'
  if (statusKey === 'under_review') return 'bg-[#7d55d7]'
  if (statusKey === 'archived') return 'bg-[#8da0b5]'
  return 'bg-[#607387]'
}

function formatListingAttentionLine(card = {}) {
  const warnings = Array.isArray(card.complianceWarnings) ? card.complianceWarnings : []
  const missingCount = Number(card.missingRequirementsCount || 0)
  const blockers = Array.isArray(card.lifecycleBlockers) ? card.lifecycleBlockers : []
  const allItems = [...warnings, ...(Array.isArray(card.missingCompletenessItems) ? card.missingCompletenessItems : [])]
    .map((item) => normalizeText(item))
    .filter(Boolean)

  if (allItems.some((item) => normalizeKey(item).includes('fica') || normalizeKey(item).includes('seller id'))) return 'Missing FICA'
  if (allItems.some((item) => normalizeKey(item).includes('photo'))) return 'Missing Photos'
  if (allItems.some((item) => normalizeKey(item).includes('mandate'))) return 'Missing Mandate'
  if (allItems.some((item) => normalizeKey(item).includes('commission'))) return 'Missing Commission'
  if (allItems.some((item) => normalizeKey(item).includes('contact'))) return 'Seller Contact Incomplete'
  if (missingCount > 0) return `${missingCount} Requirement${missingCount === 1 ? '' : 's'} Outstanding`
  if (blockers.length > 1) return `${blockers.length} Requirements Outstanding`
  if (blockers.length === 1) return normalizeText(blockers[0]?.message || blockers[0]?.label || blockers[0]) || 'Requirement Outstanding'
  if (allItems.length > 1) return `${allItems.length} Requirements Outstanding`
  if (allItems.length === 1) return allItems[0]
  return ''
}

function mergePrivateListingRows(dbRows = [], runtimeRows = [], deletedIds = new Set()) {
  const map = new Map()
  const seenKeys = new Set()
  for (const row of Array.isArray(dbRows) ? dbRows : []) {
    if (rowMatchesDeletedListing(row, deletedIds) || isDeletedListingRecord(row)) continue
    const keys = getListingIdentityKeys(row)
    if (!keys.length || keys.some((key) => seenKeys.has(key))) continue
    keys.forEach((key) => seenKeys.add(key))
    map.set(keys[0], row)
  }
  for (const row of Array.isArray(runtimeRows) ? runtimeRows : []) {
    if (rowMatchesDeletedListing(row, deletedIds) || isDeletedListingRecord(row)) continue
    const keys = getListingIdentityKeys(row)
    if (!keys.length || keys.some((key) => seenKeys.has(key))) continue
    keys.forEach((key) => seenKeys.add(key))
    map.set(keys[0], row)
  }
  return Array.from(map.values())
}

function resolveAgentAssignmentIds(profile = {}, organisationUsers = []) {
  const profileId = normalizeText(profile?.id)
  const profileEmail = normalizeContact(profile?.email)
  const ids = new Set([profileId].filter(Boolean))

  for (const user of Array.isArray(organisationUsers) ? organisationUsers : []) {
    const userIds = [
      user?.id,
      user?.userId,
      user?.user_id,
      user?.organisationUserId,
      user?.organisation_user_id,
    ].map(normalizeText).filter(Boolean)
    const userEmail = normalizeContact(user?.email)
    const matchesProfile =
      (profileId && userIds.includes(profileId)) ||
      (profileEmail && userEmail === profileEmail)

    if (!matchesProfile) continue
    userIds.forEach((id) => ids.add(id))
  }

  return Array.from(ids)
}

function ListingCardImage({ src = '', alt = '' }) {
  if (src) {
    return <img src={src} alt={alt} className="h-full w-full object-cover" />
  }

  return (
    <div className="relative h-full w-full bg-[linear-gradient(140deg,#1f4f78_0%,#4a7da8_55%,#a8c2dc_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.24),transparent_52%)]" />
      <div className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">
        Listing image
      </div>
    </div>
  )
}

function resolveListingImageUrl(listing = {}) {
  const marketing = listing?.marketing && typeof listing.marketing === 'object' ? listing.marketing : {}
  const propertyDetails = listing?.propertyDetails && typeof listing.propertyDetails === 'object' ? listing.propertyDetails : {}
  const onboardingFormData =
    listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
      ? listing.sellerOnboarding.formData
      : {}
  const gallery = [
    ...(Array.isArray(marketing.imageGallery) ? marketing.imageGallery : []),
    ...(Array.isArray(onboardingFormData.imageGallery) ? onboardingFormData.imageGallery : []),
  ].filter((item) => item?.url || item?.signedUrl || item?.publicUrl)
  const coverImageId = String(marketing.coverImageId || propertyDetails.coverImageId || onboardingFormData.coverImageId || '').trim()
  const coverImage = gallery.find((item) => String(item?.id || item?.path || '') === coverImageId) || gallery[0] || null
  return String(marketing.mediaUrl || coverImage?.url || coverImage?.signedUrl || coverImage?.publicUrl || '').trim()
}

function readListingsViewMode() {
  if (typeof window === 'undefined') return 'residential'
  const stored = String(window.localStorage.getItem(LISTINGS_VIEW_STORAGE_KEY) || '').trim().toLowerCase()
  if (ACTIVE_LISTING_TABS.includes(stored)) return stored
  return 'residential'
}

function formatRelativeDate(value) {
  if (!value) return 'No recent activity'
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Updated today'
  const days = Math.floor(delta / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated 1 day ago'
  if (days < 30) return `Updated ${days} days ago`
  const months = Math.floor(days / 30)
  return months <= 1 ? 'Updated 1 month ago' : `Updated ${months} months ago`
}

function buildInitialListingLeadForm(profile, workspace) {
  return {
    quickStep: 'property',
    sellerName: '',
    sellerSurname: '',
    sellerEmail: '',
    sellerPhone: '',
    sellerType: 'individual',
    sellerRegistrationNumber: '',
    propertyAddress: '',
    suburb: '',
    propertyType: 'House',
    listingType: 'sale',
    propertyStructureType: 'full_title',
    leadSource: 'Referral',
    assignedAgent: String(profile?.fullName || profile?.name || profile?.email || '').trim(),
    assignedAgentId: String(profile?.id || '').trim(),
    assignedAgentEmail: String(profile?.email || '').trim(),
    agencyOrganisation: String(profile?.agencyName || profile?.company || workspace?.name || '').trim(),
    branchId: '',
    branchName: '',
    visibility: 'agent',
    propertyCategory: 'residential',
    listingSource: 'private_listing',
    listingCategory: 'private_sale',
    estimatedAskingPrice: '',
    listingPrice: '',
    listingTitle: '',
    city: '',
    province: '',
    bedrooms: '',
    bathrooms: '',
    parkingCount: '',
    erfSize: '',
    floorSize: '',
    commissionPercentage: '',
    commissionAmount: '',
    mandateType: 'sole',
    mandateSigned: false,
    mandateStatusCaptured: false,
    mandateStartDate: '',
    mandateEndDate: '',
    commissionType: 'percentage',
    commissionValue: '',
    mandateDocumentCategory: 'Mandate',
    supportingDocumentCategory: 'Other',
    coAgents: '',
    listingStatus: 'draft',
    externalListingLink: '',
    transferAttorney: '',
    bondAttorney: '',
    bondOriginator: '',
    notes: '',
    manualMandateFile: null,
    manualMandateFileName: '',
    supportingDocumentNames: [],
  }
}

function getStatusLabelFromManualSelection(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'active') return 'Active'
  if (normalized === 'under_offer') return 'Under Offer'
  if (normalized === 'sold') return 'Sold'
  if (normalized === 'archived') return 'Archived'
  return 'Draft'
}

function serializeQuickListingMetadata(metadata = {}) {
  return `${QUICK_LISTING_METADATA_PREFIX}${JSON.stringify(metadata)}`
}

function parseQuickListingMetadata(value = '') {
  const text = String(value || '')
  const markerIndex = text.indexOf(QUICK_LISTING_METADATA_PREFIX)
  if (markerIndex < 0) return null
  const raw = text.slice(markerIndex + QUICK_LISTING_METADATA_PREFIX.length).trim()
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function buildListingCompleteness({ form, mandateUploaded = false } = {}) {
  const mandateSigned = Boolean(form?.mandateSigned)
  const sellerHasContact = Boolean(normalizeText(form?.sellerEmail) || normalizeText(form?.sellerPhone))
  const commissionCaptured = Boolean(
    normalizeText(form?.commissionValue) ||
      normalizeText(form?.commissionPercentage) ||
      normalizeText(form?.commissionAmount),
  )
  const checks = [
    { label: 'Property address', complete: Boolean(normalizeText(form?.propertyAddress)) },
    { label: 'Listing price', complete: Number(form?.listingPrice || form?.estimatedAskingPrice || 0) > 0 },
    { label: 'Seller name', complete: Boolean(normalizeText(form?.sellerName)) },
    { label: 'Seller contact details', complete: sellerHasContact },
    { label: 'Signed mandate', complete: mandateSigned && mandateUploaded },
    { label: 'Seller FICA', complete: Boolean(normalizeText(form?.sellerRegistrationNumber)) },
    { label: 'Commission structure', complete: commissionCaptured },
    { label: 'Property photos', complete: false },
    { label: 'External listing link', complete: Boolean(normalizeText(form?.externalListingLink)) },
  ]
  const completedItems = checks.filter((item) => item.complete).map((item) => item.label)
  const missingItems = checks.filter((item) => !item.complete).map((item) => item.label)
  return {
    score: Math.round((completedItems.length / checks.length) * 100),
    completedItems,
    missingItems,
  }
}

function getListingCompleteness(listing = {}) {
  const embedded = parseQuickListingMetadata(listing?.internalListingNotes || listing?.internal_listing_notes || listing?.description)
  if (embedded?.completeness) return embedded.completeness
  if (listing?.listingCompleteness) return listing.listingCompleteness
  const readinessPct = Number(listing?.readinessSummary?.requirementCompletionPct || 0)
  const missingCount = Number(listing?.readinessSummary?.missingRequirementsCount || 0)
  return {
    score: Number.isFinite(readinessPct) ? readinessPct : 0,
    missingItems: missingCount > 0 ? [`${missingCount} requirement${missingCount === 1 ? '' : 's'}`] : [],
    completedItems: [],
  }
}

function buildQuickListingNotes(form, completeness, mandateStatus) {
  const humanNotes = [
    normalizeText(form.notes),
    `Seller Contact: ${normalizeText(form.sellerName)} · ${normalizeText(form.sellerEmail)} · ${normalizeText(form.sellerPhone)}`,
    `Quick Add Meta: Beds ${form.bedrooms || '-'} · Baths ${form.bathrooms || '-'} · Parking ${form.parkingCount || '-'} · Erf ${form.erfSize || '-'} · Floor ${form.floorSize || '-'}`,
    `Mandate: ${mandateStatus} · ${form.mandateType || 'sole'} · ${form.mandateStartDate || '-'} → ${form.mandateEndDate || '-'}`,
    `Commission: ${form.commissionType || 'percentage'} · ${form.commissionValue || 'Not captured'}`,
    `External link: ${normalizeText(form.externalListingLink) || 'None'}`,
  ].filter(Boolean)
  const metadata = {
    origin: 'quick_add',
    canonicalStructure: CANONICAL_LISTING_STRUCTURE,
    mandateStatus,
    completeness,
    source: 'quick_add',
    allowedOrigins: LISTING_ORIGINS,
    complianceWarnings: Array.isArray(form.complianceWarnings) ? form.complianceWarnings : [],
    property: {
      listingType: normalizeText(form.listingType),
      bedrooms: normalizeText(form.bedrooms),
      bathrooms: normalizeText(form.bathrooms),
      parkingCount: normalizeText(form.parkingCount),
      erfSize: normalizeText(form.erfSize),
      propertySize: normalizeText(form.floorSize),
      externalListingLink: normalizeText(form.externalListingLink),
    },
    commission: {
      type: normalizeText(form.commissionType),
      value: normalizeText(form.commissionValue),
      status: normalizeText(form.commissionValue) ? 'captured' : 'missing',
    },
    assignment: {
      assignedAgentId: normalizeText(form.assignedAgentId),
      assignedAgent: normalizeText(form.assignedAgent),
      assignedAgentEmail: normalizeText(form.assignedAgentEmail),
      branchId: normalizeText(form.branchId),
      branchName: normalizeText(form.branchName),
      visibility: normalizeText(form.visibility),
    },
  }
  return [...humanNotes, serializeQuickListingMetadata(metadata)].join('\n')
}

function hasQuickListingSignedMandate(form = {}) {
  return Boolean(form?.mandateSigned && normalizeText(form?.manualMandateFileName))
}

function getQuickListingMandateStatus(form = {}) {
  return hasQuickListingSignedMandate(form) ? 'signed' : 'not_started'
}

function resolveQuickListingStatus(form, { activationWarnings = [] } = {}) {
  return normalizeKey(form.listingStatus) === 'active' && !activationWarnings.length ? 'active' : 'listing_review'
}

function resolveQuickListingVisibility(value, listingStatus = '') {
  const normalizedStatus = normalizeKey(listingStatus)
  if (normalizedStatus === 'active') return 'active_market'
  const normalized = normalizeKey(value)
  if (normalized === 'archived') return 'archived'
  return 'internal'
}

function extractBranchOptions(settingsContext = null) {
  const onboarding = settingsContext?.organisationSettings?.agencyOnboarding || {}
  const branchStructure = onboarding?.branchStructure || settingsContext?.organisationSettings?.branchStructure || {}
  const branches = Array.isArray(branchStructure?.branches) ? branchStructure.branches : []
  return branches
    .map((branch) => ({
      id: normalizeText(branch.id || branch.branchId),
      name: normalizeText(branch.branchName || branch.name || branch.label),
    }))
    .filter((branch) => branch.id || branch.name)
}

function getTransactionAddress(row = {}) {
  return normalizeText(
    row.propertyAddress ||
      row.property_address ||
      row.property_address_line_1 ||
      row.propertyAddressLine1 ||
      row.property_description ||
      row.unit?.propertyAddress ||
      row.unit?.address ||
      row.listing?.propertyAddress,
  )
}

function findQuickListingDuplicates({ form = {}, listings = [], transactions = [] } = {}) {
  const targetAddress = normalizeComparable(form.propertyAddress)
  const targetSellerEmail = normalizeContact(form.sellerEmail)
  const targetSellerPhone = normalizeContact(form.sellerPhone)
  const matches = []
  const seen = new Set()

  ;(Array.isArray(listings) ? listings : []).forEach((listing) => {
    const id = normalizeText(listing.id || listing.listingId || listing.listingCode || getListingAddress(listing))
    if (!id || seen.has(`listing:${id}`) || isDeletedListingRecord(listing)) return
    const seller = getListingSeller(listing)
    const addressMatch = targetAddress && normalizeComparable(getListingAddress(listing)) === targetAddress
    const emailMatch = targetSellerEmail && normalizeContact(seller.email) === targetSellerEmail
    const phoneMatch = targetSellerPhone && normalizeContact(seller.phone) === targetSellerPhone
    const status = getPrivateListingStatus(listing)
    if (addressMatch || emailMatch || phoneMatch) {
      seen.add(`listing:${id}`)
      matches.push({
        id,
        type: 'listing',
        title: listing.listingTitle || listing.title || getListingAddress(listing) || 'Existing listing',
        label: listing.listingTitle || listing.title || getListingAddress(listing) || 'Existing listing',
        reason: [
          addressMatch ? ['active', 'mandate_signed', 'under_offer', 'listing_review', 'mandate_ready'].includes(status) ? 'Existing listing on same property' : 'Same property address' : '',
          emailMatch ? 'Seller email matches' : '',
          phoneMatch ? 'Seller phone matches' : '',
        ].filter(Boolean).join(' · '),
        path: `/agent/listings/${encodeURIComponent(id)}`,
      })
    }
  })

  ;(Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    const address = getTransactionAddress(transaction)
    const addressMatch = targetAddress && normalizeComparable(address) === targetAddress
    if (!addressMatch) return
    const id = normalizeText(transaction.id || transaction.transactionId || transaction.transaction_id || address)
    if (!id || seen.has(`transaction:${id}`)) return
    seen.add(`transaction:${id}`)
    matches.push({
      id,
      type: 'transaction',
      title: transaction.transactionName || transaction.name || address || 'Existing transaction',
      label: transaction.transactionName || transaction.name || address || 'Existing transaction',
      reason: 'Existing transaction on same property',
      path: id ? `/transactions/${encodeURIComponent(id)}` : '/transactions',
    })
  })

  return matches
}

function validateQuickListingMinimumFields({ form, assignedAgentKey, requireAssignedAgent = true }) {
  const errors = []
  if (!normalizeText(form.propertyAddress) && !normalizeText(form.listingTitle)) errors.push('Property address or listing title is required.')
  if (!normalizeText(form.sellerName)) errors.push('Seller display name is required.')
  if (requireAssignedAgent && !normalizeText(assignedAgentKey)) errors.push('Assigned agent is required.')
  if (!['draft', 'active'].includes(normalizeKey(form.listingStatus))) errors.push('Listing status must be Draft or Active.')
  return errors
}

function validateQuickListingActiveRules({ form, assignedAgentKey }) {
  if (normalizeKey(form.listingStatus) !== 'active') return []
  const errors = validateQuickListingMinimumFields({ form, assignedAgentKey, requireAssignedAgent: true })
  if (!normalizeText(form.propertyAddress)) errors.push('Property address is required before marking the listing Active.')
  if (!normalizeText(form.propertyType)) errors.push('Property type is required before marking the listing Active.')
  if (!form.listingPrice || Number(form.listingPrice) <= 0) errors.push('Listing price is required before marking the listing Active.')
  if (!hasQuickListingSignedMandate(form)) errors.push('Upload the signed mandate before marking the listing Active.')
  if (!normalizeText(form.commissionValue)) errors.push('Capture the commission structure before marking the listing Active.')
  return [...new Set(errors)]
}

function AgentListings({ initialTab = null } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace, profile, agencyWorkflowMode, currentMembership } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workflowMessage, setWorkflowMessage] = useState('')
  const [listingsTab, setListingsTab] = useState(() => {
    const pathIsDevelopments = location.pathname.startsWith('/listings/developments')
    if (initialTab === 'developments' || pathIsDevelopments) return 'developments'
    return readListingsViewMode()
  })
  const [showNewListingModal, setShowNewListingModal] = useState(false)
  const [listingModalMode, setListingModalMode] = useState('agent')
  const [listingModalFlow, setListingModalFlow] = useState('seller_lead')
  const [developmentRows, setDevelopmentRows] = useState([])
  const [transactionRows, setTransactionRows] = useState([])
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [assignedDevelopmentIds, setAssignedDevelopmentIds] = useState([])
  const [organisationUsers, setOrganisationUsers] = useState([])
  const [branchOptions, setBranchOptions] = useState([])
  const [privateListings, setPrivateListings] = useState([])
  const [deletedListingIds, setDeletedListingIds] = useState(() => readDeletedListingIds())
  const [organisationId, setOrganisationId] = useState('')
  const [deletingListingId, setDeletingListingId] = useState('')
  const [publishingListingId, setPublishingListingId] = useState('')
  const [openListingMenuId, setOpenListingMenuId] = useState('')
  const [shareModalListing, setShareModalListing] = useState(null)
  const [shareOptions, setShareOptions] = useState([])
  const [shareOptionsLoading, setShareOptionsLoading] = useState(false)
  const [shareActionKey, setShareActionKey] = useState('')
  const [shareError, setShareError] = useState('')
  const [filters, setFilters] = useState({
    statusGroup: 'all',
    search: '',
  })
  const [quickAddDuplicateMatches, setQuickAddDuplicateMatches] = useState([])
  const [quickAddDuplicateOverride, setQuickAddDuplicateOverride] = useState(false)
  const [quickAddSuccess, setQuickAddSuccess] = useState(null)

  const [form, setForm] = useState(() => buildInitialListingLeadForm(profile, workspace))

  const loadData = useCallback(async ({ showLoading = true } = {}) => {
    try {
      if (showLoading) setLoading(true)
      setError('')
      let participantRows = []
      let options = []
      let assignedIds = []
      let userRows = []
      let branchRows = []
      const locallyDeletedIds = readDeletedListingIds()
      setDeletedListingIds(locallyDeletedIds)
      const runtimeListings = readAgentPrivateListings()
      let dbPrivateListings = []
      let resolvedOrganisationId = ''
      if (isSupabaseConfigured) {
        const [organisationContext, participantRowsResult, assignedIdsResult, organisationUsersResult] = await Promise.all([
          fetchOrganisationSettings().catch(() => null),
          profile?.id
            ? fetchTransactionsByParticipantSummary({ userId: profile.id, roleType: 'agent' })
            : Promise.resolve([]),
          fetchAssignedDevelopmentIdsForRole({
            userId: profile?.id || null,
            participantEmail: profile?.email || '',
            roleType: 'agent',
          }),
          listOrganisationUsers().catch(() => []),
        ])
        participantRows = participantRowsResult
        assignedIds = assignedIdsResult
        userRows = Array.isArray(organisationUsersResult) ? organisationUsersResult : []
        branchRows = extractBranchOptions(organisationContext)
        resolvedOrganisationId = String(organisationContext?.organisation?.id || '').trim()

        options = assignedIds.length
          ? await fetchDevelopmentOptions({ developmentIds: assignedIds })
          : await fetchDevelopmentOptions()

        const canUseDbFirstPrivateListings = !MOCK_DATA_ENABLED && Boolean(resolvedOrganisationId && profile?.id)
        if (canUseDbFirstPrivateListings) {
          const agentAssignmentIds = resolveAgentAssignmentIds(profile, userRows)
          dbPrivateListings = await getAgentPrivateListings(profile.id, {
            organisationId: resolvedOrganisationId,
            assignedAgentEmail: profile?.email || '',
            assignedAgentIds: agentAssignmentIds,
            includeAllOrganisationListings:
              agencyWorkflowMode === 'principal' ||
              ['principal', 'owner', 'admin', 'hq', 'branch_manager', 'manager', 'team_lead'].includes(
                normalizeKey(currentMembership?.workspaceRole || currentMembership?.role || currentMembership?.organisationRole || currentMembership?.organisation_role),
              ),
          })
        }
      }
      const agentRows = Array.isArray(participantRows) ? participantRows.filter(Boolean) : []
      setTransactionRows(agentRows)
      setDevelopmentRows(agentRows.filter((row) => getTransactionScopeForRow(row) === 'development'))
      setDevelopmentOptions(Array.isArray(options) ? options : [])
      setAssignedDevelopmentIds(Array.isArray(assignedIds) ? assignedIds : [])
      setOrganisationUsers(userRows)
      setBranchOptions(branchRows)
      setOrganisationId(resolvedOrganisationId)
      setPrivateListings(mergePrivateListingRows(dbPrivateListings, runtimeListings, locallyDeletedIds))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load listings at the moment.')
      setDevelopmentRows([])
      setTransactionRows([])
      setDevelopmentOptions([])
      setAssignedDevelopmentIds([])
      setOrganisationUsers([])
      setBranchOptions([])
      const locallyDeletedIds = readDeletedListingIds()
      setDeletedListingIds(locallyDeletedIds)
      setPrivateListings(mergePrivateListingRows([], readAgentPrivateListings(), locallyDeletedIds))
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [agencyWorkflowMode, currentMembership?.organisationRole, currentMembership?.organisation_role, currentMembership?.role, currentMembership?.workspaceRole, profile?.email, profile?.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    function refresh() {
      void loadData()
    }
    window.addEventListener('itg:developments-changed', refresh)
    window.addEventListener('itg:listings-updated', refresh)
    return () => {
      window.removeEventListener('itg:developments-changed', refresh)
      window.removeEventListener('itg:listings-updated', refresh)
    }
  }, [loadData])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LISTINGS_VIEW_STORAGE_KEY, listingsTab)
  }, [listingsTab])

  useEffect(() => {
    const pathIsDevelopments = location.pathname.startsWith('/listings/developments')
    if (pathIsDevelopments) {
      setListingsTab((previous) => (previous === 'developments' ? previous : 'developments'))
    }
  }, [location.pathname])

  useEffect(() => {
    if (!location.state?.openNewListing) return
    const requestedMode = String(location.state?.listingModalMode || agencyWorkflowMode || 'agent')
      .trim()
      .toLowerCase()
    const requestedFlow = String(location.state?.listingModalFlow || 'seller_lead').trim().toLowerCase()
    setListingModalMode(requestedMode === 'principal' ? 'principal' : 'agent')
    setListingModalFlow(requestedFlow === 'manual' || requestedFlow === 'quick_add' ? 'quick_add' : 'seller_lead')
    setShowNewListingModal(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [agencyWorkflowMode, location.pathname, location.state, navigate])

  useEffect(() => {
    const message = String(location.state?.message || '').trim()
    if (!message) return
    setWorkflowMessage(message)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
    if (['propertyAddress', 'sellerEmail', 'sellerPhone', 'listingStatus'].includes(key)) {
      setQuickAddDuplicateMatches([])
      setQuickAddDuplicateOverride(false)
    }
  }

  function resetForm() {
    setForm(buildInitialListingLeadForm(profile, workspace))
  }

  const isPrincipalListingMode = listingModalMode === 'principal'
  const isQuickAddListingFlow = listingModalFlow === 'quick_add' || listingModalFlow === 'manual'
  const isManualListingFlow = isQuickAddListingFlow

  const currentBranchId = normalizeText(currentMembership?.branchId || currentMembership?.branch_id)
  const currentMembershipRole = normalizeKey(currentMembership?.workspaceRole || currentMembership?.role || currentMembership?.organisationRole || currentMembership?.organisation_role)
  const canAssignAcrossOrganisation = agencyWorkflowMode === 'principal' || ['principal', 'owner', 'admin', 'hq'].includes(currentMembershipRole)
  const canAssignWithinBranch = canAssignAcrossOrganisation || ['branch_manager', 'manager', 'team_lead'].includes(currentMembershipRole)
  const assignableAgents = useMemo(() => {
    const selfOption = {
      id: normalizeText(profile?.id),
      userId: normalizeText(profile?.id),
      branchId: currentBranchId,
      fullName: normalizeText(profile?.fullName || profile?.name || profile?.email || 'Current Agent'),
      email: normalizeText(profile?.email),
      role: 'agent',
      status: 'active',
    }
    const rows = (Array.isArray(organisationUsers) && organisationUsers.length ? organisationUsers : [selfOption])
      .filter((user) => ['active', 'invited', ''].includes(normalizeKey(user.status)))
      .filter((user) => {
        const role = normalizeKey(user.role)
        return !role || ['agent', 'principal', 'branch_manager', 'manager'].includes(role)
      })
      .filter((user) => {
        if (canAssignAcrossOrganisation) return true
        if (canAssignWithinBranch) return normalizeText(user.branchId) === currentBranchId || !currentBranchId
        return normalizeText(user.userId || user.id || user.email) === normalizeText(profile?.id || profile?.email)
      })
    const map = new Map()
    ;[selfOption, ...rows].forEach((user) => {
      const key = normalizeText(user.userId || user.id || user.email)
      if (!key || map.has(key)) return
      map.set(key, user)
    })
    return Array.from(map.values())
  }, [canAssignAcrossOrganisation, canAssignWithinBranch, currentBranchId, organisationUsers, profile?.email, profile?.fullName, profile?.id, profile?.name])

  const effectiveBranchOptions = useMemo(() => {
    const options = Array.isArray(branchOptions) ? branchOptions : []
    if (options.length) return options
    if (!currentBranchId) return []
    return [{ id: currentBranchId, name: 'Current branch' }]
  }, [branchOptions, currentBranchId])

  function openSellerLeadModal() {
    setListingModalMode(agencyWorkflowMode === 'principal' ? 'principal' : 'agent')
    setListingModalFlow('seller_lead')
    setForm((previous) => ({ ...buildInitialListingLeadForm(profile, workspace), branchId: currentBranchId || previous.branchId }))
    setShowNewListingModal(true)
    setQuickAddDuplicateMatches([])
    setQuickAddDuplicateOverride(false)
    setQuickAddSuccess(null)
    setError('')
  }

  function openQuickAddListingModal() {
    setListingModalMode(agencyWorkflowMode === 'principal' ? 'principal' : 'agent')
    setListingModalFlow('quick_add')
    setForm((previous) => ({ ...buildInitialListingLeadForm(profile, workspace), branchId: currentBranchId || previous.branchId }))
    setShowNewListingModal(true)
    setQuickAddDuplicateMatches([])
    setQuickAddDuplicateOverride(false)
    setQuickAddSuccess(null)
    setError('')
  }

  function openManualListingModal() {
    openQuickAddListingModal()
  }

  async function handleSaveListing(event) {
    event.preventDefault()

    const sellerName = form.sellerName.trim()
    const sellerSurname = form.sellerSurname.trim()
    const sellerEmail = form.sellerEmail.trim()
    const sellerPhone = form.sellerPhone.trim()
    const propertyAddress = form.propertyAddress.trim()
    const propertyType = form.propertyType.trim()
    const listingTitle = form.listingTitle.trim() || [propertyType, form.suburb.trim()].filter(Boolean).join(' - ') || propertyAddress
    const estimatedPrice = Number(form.estimatedAskingPrice || form.listingPrice || 0)
    const useDbFirstListingPersistence = Boolean(isSupabaseConfigured && !MOCK_DATA_ENABLED)

    if (!isQuickAddListingFlow && (!sellerName || !sellerSurname || !sellerEmail || !sellerPhone || !propertyAddress || !propertyType)) {
      setError(
        'Seller name, surname, email, phone, property address, and property type are required.',
      )
      return
    }

    if (isManualListingFlow) {
      const normalizedStatus = normalizeKey(form.listingStatus || 'draft')
      const mandateUploaded = Boolean(normalizeText(form.manualMandateFileName))
      const mandateStatus = getQuickListingMandateStatus(form)
      const selectedAgent =
        assignableAgents.find((agent) => normalizeText(agent.userId || agent.id || agent.email) === normalizeText(form.assignedAgentId || form.assignedAgentEmail)) ||
        assignableAgents[0] ||
        null
      const selectedBranch =
        effectiveBranchOptions.find((branch) => normalizeText(branch.id || branch.name) === normalizeText(form.branchId || form.branchName)) ||
        null
      const resolvedAssignedAgentId = normalizeText(selectedAgent?.userId || selectedAgent?.id || profile?.id)
      const resolvedAssignedAgentName = normalizeText(selectedAgent?.fullName || form.assignedAgent || profile?.fullName || profile?.name || profile?.email)
      const resolvedAssignedAgentEmail = normalizeText(selectedAgent?.email || form.assignedAgentEmail || profile?.email)
      const resolvedAssignedAgentKey = normalizeText(resolvedAssignedAgentId || resolvedAssignedAgentEmail)
      const resolvedBranchId = normalizeText(selectedBranch?.id || form.branchId || currentBranchId)
      const resolvedBranchName = normalizeText(selectedBranch?.name || form.branchName)

      const minimumErrors = validateQuickListingMinimumFields({
        form,
        assignedAgentKey: resolvedAssignedAgentKey,
        requireAssignedAgent: useDbFirstListingPersistence,
      })
      if (minimumErrors.length) {
        setError(minimumErrors[0])
        return
      }
      const activationWarnings = validateQuickListingActiveRules({ form, assignedAgentKey: resolvedAssignedAgentKey })
      const resolvedListingStatus = resolveQuickListingStatus(form, { activationWarnings })
      const resolvedListingIsActive = resolvedListingStatus === 'active'
      if (!resolvedAssignedAgentId && useDbFirstListingPersistence) {
        setError('Select an assigned agent.')
        return
      }
      const duplicateMatches = findQuickListingDuplicates({
        form,
        listings: privateListings,
        transactions: transactionRows,
      })
      if (duplicateMatches.length && !quickAddDuplicateOverride) {
        setQuickAddDuplicateMatches(duplicateMatches)
        setError('Possible duplicate found. Review the existing record before creating a new listing.')
        return
      }

      const completeness = buildListingCompleteness({ form, mandateUploaded })
      const complianceWarnings = [...new Set([...getListingComplianceWarnings({
        mandateStatus,
        seller: { name: sellerName, email: sellerEmail, phone: sellerPhone, registrationNumber: form.sellerRegistrationNumber },
        commission: { type: form.commissionType, value: form.commissionValue },
        property24ListingUrl: form.externalListingLink,
        documents: mandateUploaded ? [{ document_type: normalizeDocumentCategoryKey(form.mandateDocumentCategory), status: 'uploaded' }] : [],
      }, completeness), ...activationWarnings])]
      const quickNotes = buildQuickListingNotes(
        {
          ...form,
          assignedAgentId: resolvedAssignedAgentId,
          assignedAgent: resolvedAssignedAgentName,
          assignedAgentEmail: resolvedAssignedAgentEmail,
          branchId: resolvedBranchId,
          branchName: resolvedBranchName,
          complianceWarnings,
        },
        completeness,
        mandateStatus,
      )
      let createdListingId = ''
      let createdListingTitle = listingTitle

      if (useDbFirstListingPersistence) {
        if (!organisationId) {
          setError('Organisation context is missing. Reload and try again.')
          return
        }
        const sellerDisplayName = [sellerName, sellerSurname].filter(Boolean).join(' ').trim()
        const sellerCanonicalFacts = {
          sellerName: sellerDisplayName,
          name: sellerDisplayName,
          fullName: sellerDisplayName,
          firstName: sellerName,
          lastName: sellerSurname,
          email: sellerEmail,
          sellerEmail: sellerEmail,
          phone: sellerPhone,
          mobile: sellerPhone,
        }
        const sellerUpdatePayload = {
          sellerCanonicalFacts,
          sellerCanonicalFactReadiness: {
            sellerName: Boolean(sellerDisplayName),
            sellerEmail: Boolean(sellerEmail),
            sellerPhone: Boolean(sellerPhone),
          },
          sellerCanonicalFactsUpdatedAt: new Date().toISOString(),
        }
        const created = await createPrivateListing({
          organisationId,
          branchId: resolvedBranchId || null,
          assignedAgentId: resolvedAssignedAgentId || null,
          listingStatus: resolvedListingIsActive ? 'listing_review' : resolvedListingStatus,
          sellerOnboardingStatus: 'not_started',
          mandateStatus: 'not_started',
          listingVisibility: resolveQuickListingVisibility(form.visibility, resolvedListingIsActive ? 'listing_review' : resolvedListingStatus),
          title: listingTitle,
          propertyCategory: normalizePropertyCategory(form.propertyCategory, { fallback: 'residential' }),
          listingSource: 'private_listing',
          propertyStructureType: normalizePropertyStructureType(form.propertyStructureType, { fallback: 'other' }),
          propertyType: form.propertyType,
          listingCategory: form.listingType === 'rental' ? 'rental' : 'private_sale',
          askingPrice: Number(form.listingPrice || 0) || estimatedPrice,
          estimatedValue: Number(form.listingPrice || 0) || estimatedPrice,
          addressLine1: propertyAddress,
          suburb: form.suburb.trim(),
          city: form.city.trim(),
          province: form.province.trim(),
          description: quickNotes,
          internalListingNotes: quickNotes,
          listingPreviewDescription: form.notes.trim(),
          sellerType: form.sellerType,
          mandateType: form.mandateType.trim() || 'sole',
          property24ListingUrl: form.externalListingLink,
          source: 'quick_add',
          origin: 'quick_add',
          captureMethod: 'agent_captured',
          completeness,
          canonicalStructure: CANONICAL_LISTING_STRUCTURE,
        })
        if (!created?.listing?.id) {
          throw new Error('Unable to create the quick listing record.')
        }
        createdListingId = created.listing.id
        createdListingTitle = created.listing.listingTitle || created.listing.title || listingTitle
        if (mandateUploaded && form.manualMandateFile) {
          const uploadedMandate = await uploadPrivateListingDocument(created.listing.id, form.manualMandateFile, {
            documentType: normalizeDocumentCategoryKey(form.mandateDocumentCategory),
            documentCategory: form.mandateDocumentCategory,
            documentName: form.manualMandateFileName,
            visibility: 'internal',
            status: 'uploaded',
          }).catch((uploadError) => {
            console.warn('[Listings] quick add mandate upload failed', uploadError)
            return null
          })
          if (!uploadedMandate) {
            await updatePrivateListing(created.listing.id, sellerUpdatePayload, { includeRequirementsAndDocuments: false }).catch(() => null)
            setError('Listing was created, but the signed mandate upload failed. Open the listing and upload the mandate again.')
            window.dispatchEvent(new Event('itg:listings-updated'))
            return
          }
          sellerUpdatePayload.mandateStatus = 'signed'
          if (resolvedListingIsActive) {
            sellerUpdatePayload.listingStatus = 'active'
            sellerUpdatePayload.listingVisibility = 'active_market'
            sellerUpdatePayload.isActive = true
          }
        }
        await updatePrivateListing(created.listing.id, sellerUpdatePayload, { includeRequirementsAndDocuments: false }).catch(() => null)
        await createPrivateListingActivity({
          privateListingId: created.listing.id,
          activityType: 'quick_add_listing_created',
          activityTitle: 'Listing created via Quick Add',
          activityDescription: 'Listing created from manual quick capture.',
          performedBy: profile?.id || null,
          visibility: 'internal',
          metadata: {
            origin: 'quick_add',
            assignedAgentId: resolvedAssignedAgentId,
            assignedAgent: resolvedAssignedAgentName,
            assignedAgentEmail: resolvedAssignedAgentEmail,
            branchId: resolvedBranchId,
            workspaceId: workspace?.id || null,
            mandateStatus,
            selectedListingStatus: normalizedStatus,
            resolvedListingStatus,
            activationWarnings,
            documentUploaded: mandateUploaded,
            duplicateOverride: quickAddDuplicateOverride,
            documentsUploaded: mandateUploaded ? [{ category: form.mandateDocumentCategory, name: form.manualMandateFileName }] : [],
            missingComplianceItems: complianceWarnings,
            missingFollowUpItems: completeness.missingItems,
            canonicalStructure: CANONICAL_LISTING_STRUCTURE,
            createdAt: new Date().toISOString(),
          },
        }).catch(() => null)
      } else {
        const quickListing = {
          id: generateId('listing'),
          listingCode: `QL-${Date.now().toString().slice(-6)}`,
          origin: 'quick_add',
          source: 'quick_add',
          canonicalStructure: CANONICAL_LISTING_STRUCTURE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          activatedAt: resolvedListingIsActive ? new Date().toISOString() : null,
          listingTitle,
          propertyType: form.propertyType,
          propertyCategory: form.propertyCategory,
          listingSource: 'private_listing',
          listingCategory: form.listingType === 'rental' ? 'rental' : 'private_sale',
          propertyStructureType: form.propertyStructureType,
          propertyAddress: [propertyAddress, form.suburb.trim(), form.city.trim()].filter(Boolean).join(', '),
          addressLine1: propertyAddress,
          suburb: form.suburb.trim(),
          city: form.city.trim(),
          province: form.province.trim(),
          askingPrice: Number(form.listingPrice || 0) || estimatedPrice,
          bedrooms: Number(form.bedrooms || 0) || 0,
          bathrooms: Number(form.bathrooms || 0) || 0,
          parkingCount: Number(form.parkingCount || 0) || 0,
          erfSize: Number(form.erfSize || 0) || null,
          floorSize: Number(form.floorSize || 0) || null,
          property24ListingUrl: form.externalListingLink,
          mandateType: form.mandateType,
          mandateStatus,
          mandateStartDate: form.mandateStartDate || null,
          mandateEndDate: form.mandateEndDate || null,
          sellerType: form.sellerType,
          seller: {
            name: [sellerName, sellerSurname].filter(Boolean).join(' ').trim() || sellerName,
            email: sellerEmail,
            phone: sellerPhone,
            registrationNumber: form.sellerRegistrationNumber,
          },
          commission: {
            type: form.commissionType,
            value: Number(form.commissionValue || 0) || null,
          },
          sellerOnboarding: {
            status: SELLER_ONBOARDING_STATUS.NOT_STARTED,
            completedAt: null,
            captureMethod: 'agent_captured',
          },
          documents: mandateUploaded
            ? [{ id: generateId('document'), category: form.mandateDocumentCategory, document_type: normalizeDocumentCategoryKey(form.mandateDocumentCategory), document_name: form.manualMandateFileName, status: 'uploaded', uploaded_at: new Date().toISOString() }]
            : [],
          requiredDocuments: [],
          listingCompleteness: completeness,
          missingFollowUpItems: completeness.missingItems,
          complianceWarnings,
          internalListingNotes: quickNotes,
          notes: quickNotes,
          assignedAgentId: resolvedAssignedAgentId,
          assignedAgentName: resolvedAssignedAgentName,
          assignedAgentEmail: resolvedAssignedAgentEmail,
          branchId: resolvedBranchId,
          branchName: resolvedBranchName,
          visibility: form.visibility,
          activityLog: [
            {
              type: 'quick_add_listing_created',
              title: 'Listing created via Quick Add',
              createdBy: profile?.id || null,
              assignedAgent: resolvedAssignedAgentName,
              mandateStatus,
              selectedListingStatus: normalizedStatus,
              resolvedListingStatus,
              activationWarnings,
              documentUploaded: mandateUploaded,
              duplicateOverride: quickAddDuplicateOverride,
              documentsUploaded: mandateUploaded ? [{ category: form.mandateDocumentCategory, name: form.manualMandateFileName }] : [],
              missingComplianceItems: complianceWarnings,
              missingFollowUpItems: completeness.missingItems,
              createdAt: new Date().toISOString(),
            },
          ],
          status: resolvedListingIsActive ? LISTING_STATUS.LISTING_ACTIVE : LISTING_STATUS.MANDATE_READY,
          listingStatus: resolvedListingIsActive ? LISTING_STATUS.LISTING_ACTIVE : LISTING_STATUS.MANDATE_READY,
        }
        createdListingId = quickListing.id
        createdListingTitle = quickListing.listingTitle
        writeAgentPrivateListings([quickListing, ...readAgentPrivateListings()])
      }

      setShowNewListingModal(false)
      resetForm()
      setError('')
      setQuickAddDuplicateMatches([])
      setQuickAddDuplicateOverride(false)
      setQuickAddSuccess({
        id: createdListingId,
        title: createdListingTitle,
        statusLabel: complianceWarnings.length ? 'Needs Attention' : resolvedListingIsActive ? 'Live' : 'Draft',
        mandateStatus,
        complianceWarnings,
      })
      setWorkflowMessage(
        `Quick Add Listing created as ${complianceWarnings.length ? 'Needs Attention' : resolvedListingIsActive ? 'Active' : 'Draft'}${
          mandateStatus !== 'signed' ? '. Missing mandate still requires follow-up before activation.' : '. Signed mandate captured.'
        }`,
      )
      window.dispatchEvent(new Event('itg:listings-updated'))
      return
    }

    let onboardingLink = ''

    if (useDbFirstListingPersistence) {
      if (!organisationId) {
        setError('Organisation context is missing. Reload and try again.')
        return
      }
      const created = await createPrivateListing({
        organisationId,
        assignedAgentId: String(profile?.id || '').trim() || null,
        assignedAgentEmail: String(profile?.email || '').trim(),
        listingStatus: 'seller_lead',
        sellerOnboardingStatus: 'not_started',
        mandateStatus: 'not_started',
        listingVisibility: 'internal',
        title: listingTitle,
        propertyCategory: normalizePropertyCategory(form.propertyCategory, { fallback: 'residential' }),
        listingSource: 'private_listing',
        propertyStructureType: normalizePropertyStructureType(form.propertyStructureType, { fallback: 'other' }),
        propertyType: form.propertyType,
        listingCategory: form.listingCategory,
        askingPrice: estimatedPrice,
        estimatedValue: estimatedPrice,
        addressLine1: propertyAddress,
        suburb: form.suburb.trim(),
        city: form.city.trim(),
        province: form.province.trim(),
        description: form.notes.trim(),
        sellerType: 'individual',
        source: 'guided_onboarding',
        origin: 'guided_onboarding',
      })
      if (!created?.listing?.id) {
        throw new Error('Unable to create private listing intake record.')
      }
    } else {
      const token = generateSellerOnboardingToken()
      onboardingLink = buildSellerOnboardingLink(token)
      const lead = createAgentSellerLead({
        id: generateId('seller_lead'),
        sellerName,
        sellerSurname,
        sellerEmail,
        sellerPhone,
        propertyAddress: [propertyAddress, form.suburb.trim()].filter(Boolean).join(', '),
        propertyType: form.propertyType,
        estimatedPrice,
        leadSource: form.leadSource.trim() || 'Referral',
        agentId: String(profile?.email || profile?.id || '').trim().toLowerCase(),
        assignedAgentName: form.assignedAgent.trim() || String(profile?.fullName || profile?.name || profile?.email || '').trim(),
        assignedAgentEmail: String(profile?.email || '').trim(),
        agencyId: profile?.agencyId || '',
        assignedAgent: form.assignedAgent.trim() || String(profile?.fullName || profile?.name || profile?.email || '').trim(),
        agencyOrganisation: form.agencyOrganisation.trim() || String(profile?.agencyName || profile?.company || workspace?.name || '').trim(),
        listingCategory: form.listingCategory,
        propertyCategory: form.propertyCategory,
        listingSource: 'private_listing',
        propertyStructureType: form.propertyStructureType,
        propertyData: {
          listingTitle,
          propertyAddress,
          suburb: form.suburb.trim(),
          city: form.city.trim(),
          province: form.province.trim(),
        },
        rolePlayers: {
          transferAttorney: form.transferAttorney.trim(),
          bondAttorney: form.bondAttorney.trim(),
          bondOriginator: form.bondOriginator.trim(),
        },
        notes: form.notes.trim(),
        origin: 'guided_onboarding',
        listingStatus: LISTING_STATUS.SELLER_ONBOARDING_SENT,
        sellerOnboarding: {
          token,
          link: onboardingLink,
          status: SELLER_ONBOARDING_STATUS.NOT_STARTED,
          startedAt: null,
          submittedAt: null,
          completedAt: null,
          reviewedAt: null,
          formData: {},
        },
      })
      createListingDraftFromSellerLead(lead, { stage: LISTING_STATUS.SELLER_ONBOARDING_SENT })
    }

    if (isSupabaseConfigured && onboardingLink) {
      const sellerDisplayName = [sellerName, sellerSurname].filter(Boolean).join(' ') || 'Seller'
      const propertyLabel = propertyAddress || listingTitle || 'your property'
      const agentDisplayName = form.assignedAgent.trim() || String(profile?.fullName || profile?.name || '').trim() || 'your agent'
      const normalizedSellerPhone = formatSouthAfricanWhatsAppNumber(sellerPhone)

      try {
        const onboardingEmailPayload = {
          type: 'seller_onboarding_link',
          to: sellerEmail,
          organisationId: String(organisationId || '').trim(),
          sellerName: sellerDisplayName,
          propertyTitle: propertyLabel,
          propertyType: form.propertyType.trim(),
          onboardingLink,
          agentName: agentDisplayName,
        }
        const { data: emailResult, error: emailError } = await invokeEdgeFunction('send-email', {
          body: {
            ...onboardingEmailPayload,
          },
        })
        if (emailError) {
          console.error('[Seller Onboarding] email notification failed', {
            sellerEmail,
            error: emailError,
          })
        } else {
          const routedType = String(emailResult?.type || '').trim().toLowerCase()
          if (routedType && !['seller_onboarding', 'seller_onboarding_link'].includes(routedType)) {
            console.error('[Seller Onboarding] unexpected email template route', {
              sellerEmail,
              responseType: routedType,
            })
          }
        }
      } catch (emailInvokeError) {
        console.error('[Seller Onboarding] email notification failed', emailInvokeError)
      }

      try {
        const whatsappResult = await sendWhatsAppNotification({
          to: normalizedSellerPhone,
          role: 'seller',
          message: `Hi ${sellerDisplayName},\n\nYour agent has started your seller onboarding for ${propertyLabel}.\n\nPlease complete your onboarding here:\n${onboardingLink}\n\nAgent: ${agentDisplayName}\n\n- Bridge`,
        })
        if (!whatsappResult?.ok) {
          console.error('[Seller Onboarding] WhatsApp notification failed', {
            sellerPhone: normalizedSellerPhone,
            result: whatsappResult,
          })
        }
      } catch (whatsappError) {
        console.error('[Seller Onboarding] WhatsApp notification failed', whatsappError)
      }
    }

    setShowNewListingModal(false)
    resetForm()
    setError('')
    setWorkflowMessage(
      useDbFirstListingPersistence
        ? 'Private listing intake created in Supabase (seller lead stage). Send onboarding when ready.'
        : 'Seller lead created. Onboarding link generated. The listing now appears in Listings in Progress under seller onboarding pending.',
    )
    window.dispatchEvent(new Event('itg:listings-updated'))
  }

  async function handleDeleteListing(card, event) {
    event.stopPropagation()
    const listingIdentityKeys = Array.from(new Set([
      ...(Array.isArray(card?.identityKeys) ? card.identityKeys : []),
      ...getListingIdentityKeys(card?.listingRecord || {}),
      card?.id,
    ].map((value) => String(value || '').trim()).filter(Boolean)))
    const listingId = listingIdentityKeys[0] || ''
    const remoteListingId = listingIdentityKeys.find((value) => isUuidLike(value)) || ''
    if (!listingId) {
      setError('Unable to delete this listing because it is missing a listing id.')
      return
    }

    const listingTitle = String(card?.title || 'this listing').trim()
    const confirmed = window.confirm(
      `Permanently delete "${listingTitle}"?\n\nThis removes the listing from Bridge, local fallback storage, seller workflow drafts, onboarding-linked listing records, documents, and activity. This cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingListingId(listingId)
    setError('')
    setWorkflowMessage('')

    try {
      let remoteDelete = null
      if (isSupabaseConfigured && remoteListingId) {
        remoteDelete = await deletePrivateListing(remoteListingId, {
          organisationId: card?.listingRecord?.organisationId || card?.listingRecord?.organisation_id || organisationId,
        })
        if (!remoteDelete?.deleted) {
          throw new Error('Could not delete listing. Please try again.')
        }
      }

      const localDelete = deleteAgentPrivateListingCascade(card?.listingRecord || remoteDelete?.listing || listingId)
      const deletedIds = new Set([...listingIdentityKeys, ...(localDelete.deletedIds || [])].map((value) => String(value || '').trim()).filter(Boolean))
      rememberDeletedListingIds(deletedIds)
      setDeletedListingIds((previous) => new Set([...previous, ...deletedIds]))
      setPrivateListings((rows) => rows.filter((row) => !rowMatchesDeletedListing(row, deletedIds)))
      await loadData({ showLoading: false })
      setWorkflowMessage(`"${listingTitle}" was permanently deleted.`)
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete this listing.')
    } finally {
      setDeletingListingId('')
    }
  }

  function getRemoteListingIdForCard(card = {}) {
    const listingIdentityKeys = Array.from(new Set([
      ...(Array.isArray(card?.identityKeys) ? card.identityKeys : []),
      ...getListingIdentityKeys(card?.listingRecord || {}),
      card?.id,
    ].map((value) => String(value || '').trim()).filter(Boolean)))
    return listingIdentityKeys.find((value) => isUuidLike(value)) || ''
  }

  async function handlePublishListing(card, event) {
    event?.stopPropagation?.()
    const remoteListingId = getRemoteListingIdForCard(card)
    if (!remoteListingId) {
      setError('Open the listing detail before publishing this locally saved listing.')
      return
    }

    setPublishingListingId(card.id)
    setOpenListingMenuId('')
    setError('')
    setWorkflowMessage('')

    try {
      const result = await transitionPrivateListingStatus(remoteListingId, 'active', {
        metadata: {
          source: 'agent_listings_publish_action',
          triggeredFrom: 'listings_page',
        },
      })
      const publishedListing = result?.listing || null
      if (publishedListing?.id) {
        setPrivateListings((rows) => rows.map((row) => {
          const rowKeys = getListingIdentityKeys(row)
          return rowKeys.some((key) => key === publishedListing.id || key === remoteListingId)
            ? { ...row, ...publishedListing }
            : row
        }))
      }
      await loadData({ showLoading: false })
      setWorkflowMessage(`"${card.title || 'Listing'}" is now live.`)
    } catch (publishError) {
      setError(publishError?.message || 'Unable to publish this listing yet.')
    } finally {
      setPublishingListingId('')
    }
  }

  async function openPartnerShareModal(card, event) {
    event.stopPropagation()
    const remoteListingId = getRemoteListingIdForCard(card)
    if (!remoteListingId) {
      setError('Partner sharing is only available for saved agency listings.')
      return
    }

    setOpenListingMenuId('')
    setShareModalListing({
      id: remoteListingId,
      title: String(card?.title || 'Shared listing').trim(),
    })
    setShareOptions([])
    setShareError('')
    setShareOptionsLoading(true)

    try {
      const options = await getListingPartnerShareOptions(remoteListingId)
      setShareOptions(options)
    } catch (loadShareError) {
      setShareError(loadShareError?.message || 'Unable to load partner sharing options.')
    } finally {
      setShareOptionsLoading(false)
    }
  }

  async function handlePartnerShareToggle(option = {}) {
    if (!shareModalListing?.id || !option.relationshipId) return
    const actionKey = `${option.relationshipId}:${shareModalListing.id}`
    setShareActionKey(actionKey)
    setShareError('')

    try {
      if (option.isShared) {
        await unshareListingWithPartner({
          relationshipId: option.relationshipId,
          listingId: shareModalListing.id,
        })
      } else {
        await shareListingWithPartner({
          relationshipId: option.relationshipId,
          listingId: shareModalListing.id,
        })
      }
      setShareOptions((previous) => previous.map((item) => (
        item.relationshipId === option.relationshipId
          ? { ...item, isShared: !option.isShared }
          : item
      )))
      setWorkflowMessage(option.isShared ? 'Listing sharing was turned off for this partner.' : 'Listing shared with partner.')
    } catch (shareToggleError) {
      setShareError(shareToggleError?.message || 'Unable to update partner sharing.')
    } finally {
      setShareActionKey('')
    }
  }

  const privateListingCards = useMemo(() => {
    const agentName = String(profile?.fullName || profile?.name || profile?.email || 'Assigned Agent').trim()
    return privateListings
      .filter((listing) => !rowMatchesDeletedListing(listing, deletedListingIds) && !isDeletedListingRecord(listing))
      .map((listing) => {
      const statusKey = getPrivateListingStatus(listing)
      const propertyCategory = resolvePropertyCategory(listing)
      const listingSource = resolveListingSource(listing)
      const propertyStructureType = resolvePropertyStructureType(listing)
      const lifecycleGroup = getPrivateListingStatusGroup(statusKey)
      const lifecycleNextAction = getPrivateListingLifecycleNextAction(listing)
      const completeness = getListingCompleteness(listing)
      const quickMetadata = parseQuickListingMetadata(listing?.internalListingNotes || listing?.internal_listing_notes || listing?.description)
      const complianceWarnings = getListingComplianceWarnings(listing, completeness)
      const lifecycleBlockers = evaluatePrivateListingTransitionGuards(
        listing,
        statusKey === 'seller_lead'
          ? 'onboarding_sent'
          : statusKey === 'onboarding_completed' || statusKey === 'listing_review'
            ? 'mandate_ready'
            : statusKey === 'mandate_signed'
              ? 'active'
              : statusKey,
        {},
      )
      const inventoryStatus = getInventoryStatus({
        statusKey,
        lifecycleGroup,
        complianceWarnings,
        lifecycleBlockers,
        missingRequirementsCount: Number(listing?.readinessSummary?.missingRequirementsCount || 0),
        readinessState: String(listing?.readinessSummary?.readinessState || ''),
      })
      const identityKeys = getListingIdentityKeys(listing)
      return {
        id: identityKeys[0] || String(listing.id || ''),
        identityKeys,
        typeLabel: resolveListingTypeLabel(listing),
        propertyCategory,
        propertyCategoryLabel: getPropertyCategoryLabel(propertyCategory),
        listingSource,
        listingSourceLabel: listingSource === 'development' ? 'Development' : 'Private Listing',
        originLabel: getListingOriginLabel(listing),
        propertyStructureType,
        propertyStructureTypeLabel: getPropertyStructureTypeLabel(propertyStructureType),
        title: listing.listingTitle || listing.title || 'Untitled listing',
        suburb: [listing.suburb, listing.city].filter(Boolean).join(', ') || 'Location pending',
        address: [listing.addressLine1 || listing.propertyAddress, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending',
        price: Number(listing.askingPrice || 0),
        bedroomsText: `${Number(listing.bedrooms || listing.bedroomCount || quickMetadata?.property?.bedrooms || 0) || 0} bed`,
        bathroomsText: `${Number(listing.bathrooms || listing.bathroomCount || quickMetadata?.property?.bathrooms || 0) || 0} bath`,
        parkingText: `${Number(listing.parkingCount || listing.parking_count || listing.garages || quickMetadata?.property?.parkingCount || 0) || 0} parking`,
        listingStatusKey: statusKey,
        listingStatusLabel: getListingStatusLabel(statusKey),
        lifecycleGroup,
        lifecycleGroupLabel: listingStatusGroupLabel(lifecycleGroup),
        lifecycleNextAction,
        lifecycleBlockers,
        inventoryStatusKey: inventoryStatus.key,
        inventoryFilterKey: inventoryStatus.filterKey,
        inventoryStatusLabel: inventoryStatus.label,
        canPublish: statusKey === 'mandate_signed' || inventoryStatus.key === 'ready_to_publish' || inventoryStatus.filterKey === 'ready_to_publish',
        attentionLine: '',
        mandateStatusLabel: getMandateStatus(listing),
        completenessScore: completeness.score,
        missingCompletenessItems: completeness.missingItems || [],
        complianceWarnings,
        sellerTypeLabel: String(listing?.sellerType || listing?.seller_type || 'individual').replace(/_/g, ' '),
        requirementCompletionPct: Number(listing?.readinessSummary?.requirementCompletionPct || 0),
        missingRequirementsCount: Number(listing?.readinessSummary?.missingRequirementsCount || 0),
        readinessState: String(listing?.readinessSummary?.readinessState || 'blocked'),
        onboardingStatusLabel: String(listing?.sellerOnboardingStatus || listing?.seller_onboarding_status || 'not_started')
          .replace(/_/g, ' '),
        listingVisibilityLabel: String(listing?.listingVisibility || listing?.listing_visibility || 'internal').replace(/_/g, ' '),
        listingRecord: listing,
        imageUrl: resolveListingImageUrl(listing),
        agentName,
      }
    }).map((card) => ({
      ...card,
      attentionLine: formatListingAttentionLine(card),
    }))
  }, [deletedListingIds, privateListings, profile?.email, profile?.fullName, profile?.name])

  const residentialListingCards = useMemo(
    () => privateListingCards.filter((card) => ['residential', 'mixed_use', 'vacant_land'].includes(card.propertyCategory)),
    [privateListingCards],
  )

  const inventoryFilterOptions = useMemo(() => {
    const countFor = (key) => residentialListingCards.filter((card) => card.inventoryFilterKey === key).length
    return [
      { key: 'all', label: 'All', count: residentialListingCards.length },
      { key: 'live', label: 'Live', count: countFor('live') },
      { key: 'ready_to_publish', label: 'Ready To Publish', count: countFor('ready_to_publish') },
      { key: 'draft', label: 'Draft', count: countFor('draft') },
      { key: 'needs_attention', label: 'Needs Attention', count: countFor('needs_attention') },
      { key: 'sold', label: 'Sold', count: countFor('sold') },
      { key: 'archived', label: 'Archived', count: countFor('archived') },
    ]
  }, [residentialListingCards])

  const categoryFilteredListingCards = useMemo(() => {
    const query = String(filters.search || '').trim().toLowerCase()
    const tabCategoryMap = {
      residential: new Set(['residential', 'mixed_use', 'vacant_land']),
    }
    const targetCategories = tabCategoryMap[listingsTab] || tabCategoryMap.residential

    return privateListingCards.filter((card) => {
      const categoryMatch = targetCategories.has(String(card.propertyCategory || 'residential').toLowerCase())
      const statusMatch = filters.statusGroup === 'all' ? true : card.inventoryFilterKey === filters.statusGroup
      const searchMatch = query
        ? [card.title, card.suburb, card.typeLabel, card.agentName, card.originLabel].join(' ').toLowerCase().includes(query)
        : true
      return categoryMatch && statusMatch && searchMatch
    })
  }, [filters.search, filters.statusGroup, listingsTab, privateListingCards])

  const developmentCards = useMemo(() => {
    const grouped = new Map()
    const normalizedProfileEmail = String(profile?.email || '').trim().toLowerCase()
    const normalizedProfileName = String(profile?.fullName || profile?.name || '').trim().toLowerCase()

    for (const option of developmentOptions) {
      const developmentId = String(option?.id || '').trim()
      if (!developmentId) continue

      const teams = option?.stakeholder_teams && typeof option.stakeholder_teams === 'object' ? option.stakeholder_teams : {}
      const assignedAgents = Array.isArray(teams.agents) ? teams.agents : []
      const assignedDevelopers = Array.isArray(teams.developers) ? teams.developers : []
      const includesCurrentAgent =
        assignedAgents.some((agent) => {
          const email = String(agent?.email || agent?.contactEmail || '').trim().toLowerCase()
          return email && email === normalizedProfileEmail
        }) ||
        assignedAgents.some((agent) => {
          const name = String(agent?.name || agent?.contactName || '').trim().toLowerCase()
          return name && name === normalizedProfileName
        })

      const assignedByParticipantAccess = assignedDevelopmentIds.includes(developmentId)
      if (!includesCurrentAgent && !assignedByParticipantAccess && normalizedProfileEmail) {
        continue
      }

      grouped.set(developmentId, {
        id: developmentId,
        name: option?.name || 'Development',
        location: option?.location || 'Location pending',
        developer:
          assignedDevelopers.find((developer) => String(developer?.company || '').trim())?.company ||
          assignedDevelopers.find((developer) => String(developer?.name || '').trim())?.name ||
          'Developer pending',
        status: assignedDevelopers.some((developer) => String(developer?.status || '').trim().toLowerCase() === 'invited')
          ? 'developer_pending_access'
          : 'draft',
        assignedAgent:
          assignedAgents.find((agent) => String(agent?.email || agent?.contactEmail || '').trim().toLowerCase() === normalizedProfileEmail)?.name ||
          assignedAgents.find((agent) => String(agent?.email || agent?.contactEmail || '').trim().toLowerCase() === normalizedProfileEmail)?.contactName ||
          profile?.fullName ||
          profile?.name ||
          'Assigned Agent',
        totalUnits: Number(option?.planned_units || 0) || 0,
        unitsAvailable: Number(option?.planned_units || 0) || 0,
        unitsSoldOrReserved: 0,
        activeTransactionsCount: 0,
        registeredTransactionsCount: 0,
        buyerCount: 0,
        lastUpdatedAt: null,
      })
    }

    const scopedRows = developmentRows.filter((row) => {
      return workspace.id === 'all'
        ? true
        : String(row?.development?.id || row?.unit?.development_id || '') === String(workspace.id)
    })

    for (const row of scopedRows) {
      const developmentId = String(row?.development?.id || row?.unit?.development_id || '').trim()
      if (!developmentId) continue

      if (!grouped.has(developmentId)) {
        grouped.set(developmentId, {
          id: developmentId,
          name: row?.development?.name || 'Development',
          location: row?.development?.location || row?.transaction?.suburb || 'Location pending',
          developer: row?.development?.developerCompany || 'Developer pending',
          status: String(row?.development?.status || 'active').trim().toLowerCase(),
          assignedAgent: row?.transaction?.assigned_agent || profile?.fullName || profile?.name || 'Assigned Agent',
          totalUnits: 0,
          unitsAvailable: 0,
          unitsSoldOrReserved: 0,
          activeTransactionsCount: 0,
          registeredTransactionsCount: 0,
          buyerCount: 0,
          lastUpdatedAt: null,
        })
      }

      const current = grouped.get(developmentId)
      const stage = String(row?.stage || row?.transaction?.stage || '').trim().toLowerCase()
      const isRegistered = stage.includes('registered') || Boolean(row?.transaction?.registered_at)
      current.totalUnits += 1
      current.activeTransactionsCount += isRegistered ? 0 : 1
      current.registeredTransactionsCount += isRegistered ? 1 : 0
      current.buyerCount += row?.buyer?.name ? 1 : 0
      current.unitsSoldOrReserved += stage === 'available' ? 0 : 1
      current.unitsAvailable += stage === 'available' ? 1 : 0

      const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
      if (!current.lastUpdatedAt || new Date(updatedAt || 0) > new Date(current.lastUpdatedAt || 0)) {
        current.lastUpdatedAt = updatedAt
      }
    }

    return Array.from(grouped.values()).map((card) => {
      let status = String(card.status || '').trim().toLowerCase() || 'draft'
      if (status === 'draft' && card.totalUnits > 0) {
        status = 'active'
      }
      if (card.totalUnits > 0 && card.unitsSoldOrReserved >= card.totalUnits) {
        status = 'sold_out'
      } else if (card.unitsSoldOrReserved > 0 && status !== 'developer_pending_access') {
        status = 'partially_sold'
      }

      const nextAction =
        status === 'developer_pending_access'
          ? 'Awaiting developer access acceptance'
          : card.totalUnits <= 0
            ? 'Add unit stock'
            : card.activeTransactionsCount > 0
              ? 'Monitor active deals'
              : 'Start deal from available unit'

      return {
        ...card,
        status,
        nextAction,
      }
    }).sort((left, right) => {
      if (right.activeTransactionsCount !== left.activeTransactionsCount) {
        return right.activeTransactionsCount - left.activeTransactionsCount
      }
      return left.name.localeCompare(right.name)
    })
  }, [assignedDevelopmentIds, developmentOptions, developmentRows, profile?.email, profile?.fullName, profile?.name, workspace.id])

  const filteredDevelopmentCards = useMemo(() => {
    const query = String(filters.search || '').trim().toLowerCase()
    return developmentCards.filter((card) =>
      query
        ? [card.name, card.location, card.developer, card.assignedAgent, card.status, card.nextAction, card.activeTransactionsCount, card.registeredTransactionsCount]
            .join(' ')
            .toLowerCase()
            .includes(query)
        : true,
    )
  }, [developmentCards, filters.search])

  const listingTabCounts = useMemo(
    () => ({
      residential: privateListingCards.filter((card) => ['residential', 'mixed_use', 'vacant_land'].includes(card.propertyCategory)).length,
      developments: developmentCards.length,
    }),
    [developmentCards.length, privateListingCards],
  )

  function handleOpenDevelopmentWorkspace(card) {
    const developmentId = card?.id
    if (!developmentId) return

    startRouteTransitionTrace({
      from: location.pathname,
      to: `/developments/${developmentId}`,
      label: 'agent-listings-to-development-workspace',
    })
    navigate(`/developments/${developmentId}`)
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className={`grid flex-1 gap-3 ${listingsTab === 'developments' ? 'md:grid-cols-1 xl:grid-cols-2' : 'md:grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]'}`}>
            {listingsTab !== 'developments' ? (
              <div className="grid gap-2">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Inventory Status</span>
                <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] p-1.5">
                  {inventoryFilterOptions.map((option) => {
                    const active = filters.statusGroup === option.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFilters((prev) => ({ ...prev, statusGroup: option.key }))}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.78rem] font-semibold transition ${
                          active
                            ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_6px_14px_rgba(31,79,120,0.18)]'
                            : 'border-[#d7e2ee] bg-white text-[#35546c] hover:border-[#b8c8db]'
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className={active ? 'text-white/78' : 'text-[#7b8ca2]'}>({option.count})</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Search</span>
              <div className="flex h-[44px] items-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-3">
                <Search size={15} className="text-[#7b8ca2]" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  className="w-full border-0 bg-transparent p-0 text-sm text-[#142132] outline-none"
                  placeholder={
                    listingsTab !== 'developments'
                      ? 'Search property, suburb, listing type...'
                      : 'Search developments, locations, activity...'
                  }
                />
              </div>
            </label>
          </div>

          {listingsTab !== 'developments' ? (
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button type="button" onClick={openQuickAddListingModal}>
                <Plus size={16} />
                Quick Add Listing
              </Button>
              <Button type="button" variant="secondary" onClick={openSellerLeadModal}>
                <Plus size={16} />
                Guided Listing
              </Button>
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-3 rounded-[14px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-2 text-sm text-[#b42318]">{error}</p> : null}
        {workflowMessage ? <p className="mt-3 rounded-[14px] border border-[#d8ecdf] bg-[#eefbf3] px-4 py-2 text-sm text-[#1f7d44]">{workflowMessage}</p> : null}
        {quickAddSuccess ? (
          <div className="mt-3 rounded-[18px] border border-[#d8ecdf] bg-[#f3fbf6] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#1f7d44]">Listing created successfully. What would you like to do next?</p>
                <p className="mt-1 text-xs text-[#4d6a59]">{quickAddSuccess.title} · {quickAddSuccess.statusLabel || 'Draft'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => navigate(`/agent/listings/${encodeURIComponent(quickAddSuccess.id)}`)}>Open Listing</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setWorkflowMessage('Mandate generation will be available from the listing workspace.')}>Generate Mandate</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/agent/listings/${encodeURIComponent(quickAddSuccess.id)}`)}>Add Photos</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/agent/listings/${encodeURIComponent(quickAddSuccess.id)}`)}>Add Seller Documents</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent('itg:open-new-transaction', { detail: { listingId: quickAddSuccess.id } }))}>Create Deal</Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-[1.02rem] font-semibold text-[#142132]">
              {listingsTab === 'developments'
                ? 'Development Listings'
                : 'Residential Listings'}
            </h2>
            <p className="mt-1 text-sm text-[#607387]">
              {listingsTab === 'developments'
                ? 'Assigned developments, live buyer activity, and structured workspace access.'
                : 'Agent-owned listings, seller onboarding, offers, and deal preparation.'}
            </p>
            {listingsTab === 'developments' ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => window.dispatchEvent(new Event('itg:open-new-development'))}>
                  <Plus size={16} />
                  New Development
                </Button>
                <Button type="button" variant="secondary" onClick={() => window.dispatchEvent(new Event('itg:open-new-development'))}>
                  <Plus size={16} />
                  Invite Developer Access
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid w-full grid-cols-2 gap-1.5 rounded-[18px] border border-[#dbe6f2] bg-[#f5f9fd] p-1.5 sm:max-w-[460px]">
            {[
              { key: 'residential', label: 'Residential', count: listingTabCounts.residential || 0 },
              { key: 'developments', label: 'Developments', count: listingTabCounts.developments || 0 },
            ].map((tab) => {
              const active = listingsTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setListingsTab(tab.key)
                    if (tab.key === 'developments') {
                      navigate('/listings/developments')
                    } else {
                      navigate('/listings')
                    }
                  }}
                  className={`min-w-0 w-full rounded-[12px] border px-2.5 py-2 text-left transition ${
                    active
                      ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_8px_16px_rgba(31,79,120,0.2)]'
                      : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'
                  }`}
                >
                  <span className="block truncate text-[0.84rem] font-semibold leading-5">{tab.label}</span>
                  <span className={`mt-0.5 block truncate text-[0.7rem] font-medium leading-4 ${active ? 'text-white/82' : 'text-[#7b8ca2]'}`}>
                    {tab.count} item{tab.count === 1 ? '' : 's'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-6 text-sm text-[#6c7f95]">Loading listings…</div>
        ) : null}

        {!loading && listingsTab !== 'developments' ? (
          categoryFilteredListingCards.length ? (
            <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {categoryFilteredListingCards.map((card) => (
                <article
                  key={card.id}
                  onClick={() => navigate(`/agent/listings/${encodeURIComponent(card.id)}`)}
                  className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[18px] border border-[#dce6f2] bg-white shadow-[0_8px_22px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]"
                >
                  <div className="relative h-[150px] w-full overflow-hidden border-b border-[#e5edf6]">
                    <ListingCardImage src={card.imageUrl} alt={card.title} />
                    <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#091322]/58 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_8px_18px_rgba(9,19,34,0.18)] backdrop-blur">
                      <span className={`h-2 w-2 rounded-full ${inventoryDotClass(card.inventoryStatusKey)}`} />
                      {card.inventoryStatusLabel}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${inventoryStatusClass(card.inventoryStatusKey)}`}>
                        <span className={`h-2 w-2 rounded-full ${inventoryDotClass(card.inventoryStatusKey)}`} />
                        {card.inventoryStatusLabel}
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenListingMenuId((previous) => (previous === card.id ? '' : card.id))
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dce6f2] bg-white text-[#607387] transition hover:border-[#b8c8db] hover:bg-[#f7fbff]"
                          aria-label={`Open actions for ${card.title}`}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openListingMenuId === card.id ? (
                          <div
                            className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-[12px] border border-[#dce6f2] bg-white py-1 shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {getRemoteListingIdForCard(card) ? (
                              <button
                                type="button"
                                onClick={(event) => openPartnerShareModal(card, event)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8rem] font-semibold text-[#1f4f78] transition hover:bg-[#f5f9fd]"
                              >
                                <Share2 size={14} />
                                Share With Partners
                              </button>
                            ) : null}
                            {card.canPublish ? (
                              <button
                                type="button"
                                onClick={(event) => handlePublishListing(card, event)}
                                disabled={publishingListingId === card.id}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8rem] font-semibold text-[#1f7d44] transition hover:bg-[#f2fbf5] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {publishingListingId === card.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Make Listing Live
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={(event) => {
                                setOpenListingMenuId('')
                                handleDeleteListing(card, event)
                              }}
                              disabled={deletingListingId === card.id}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.8rem] font-semibold text-[#a13b35] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingListingId === card.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              Delete Listing
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <h3 className="line-clamp-2 text-[1.02rem] font-semibold leading-6 text-[#142132]">{card.title}</h3>
                      <p className="mt-2 text-[1.05rem] font-semibold text-[#1f4f78]">{formatCurrency(card.price)}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-[#607387]">{card.address}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-2 text-[0.76rem] font-semibold text-[#35546c]">
                      <span>{card.bedroomsText}</span>
                      <span>{card.bathroomsText}</span>
                      <span>{card.parkingText}</span>
                    </div>

                    {card.attentionLine ? (
                      <div className="flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#f2dfbf] bg-[#fff8ea] px-3 py-2 text-[0.82rem] font-semibold text-[#8a5b16]">
                        <CircleAlert size={15} />
                        <span className="line-clamp-1">{card.attentionLine}</span>
                      </div>
                    ) : (
                      <div className="flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d8ecdf] bg-[#f3fbf6] px-3 py-2 text-[0.82rem] font-semibold text-[#2d7650]">
                        <CheckCircle2 size={15} />
                        <span>No attention required</span>
                      </div>
                    )}

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[#eef3f8] pt-3 text-[0.82rem] text-[#53687f]">
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
                        <UserRound size={14} className="shrink-0 text-[#1f4f78]" />
                        <span className="truncate">{card.agentName || 'Assigned Agent'}</span>
                      </span>
                      {card.canPublish ? (
                        <button
                          type="button"
                          onClick={(event) => handlePublishListing(card, event)}
                          disabled={publishingListingId === card.id}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#bde7cc] bg-[#1f7d44] px-3 py-1.5 font-semibold text-white shadow-[0_8px_16px_rgba(31,125,68,0.18)] transition hover:bg-[#176337] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {publishingListingId === card.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Make Live
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/agent/listings/${encodeURIComponent(card.id)}`)
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#c6d8ea] bg-white px-3 py-1.5 font-semibold text-[#1f4f78] transition hover:border-[#9fb7d1] hover:bg-[#f6faff]"
                      >
                        Open
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-5 py-10 text-center">
              <Building2 className="mx-auto text-[#8da0b5]" size={24} />
              <p className="mt-3 text-base font-semibold text-[#142132]">
                No residential listings yet.
              </p>
              <p className="mt-1 text-sm text-[#6b7d93]">
                Start a seller workflow or add a manual listing. Listings become live here once onboarding, mandate, and required documents are ready.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button type="button" variant="secondary" onClick={openSellerLeadModal}>
                  <Plus size={16} />
                  Guided Listing
                </Button>
                <Button type="button" onClick={openManualListingModal}>
                  <Plus size={16} />
                  Quick Add Listing
                </Button>
              </div>
            </div>
          )
        ) : null}

        {!loading && listingsTab === 'developments' ? (
          filteredDevelopmentCards.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredDevelopmentCards.map((card) => (
                <article
                  key={card.id}
                  onClick={() => handleOpenDevelopmentWorkspace(card)}
                  className="group cursor-pointer overflow-hidden rounded-[20px] border border-[#dce6f2] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]"
                >
                  <div className="relative h-[170px] overflow-hidden border-b border-[#e5edf6] bg-[linear-gradient(135deg,#113350_0%,#1f4f78_38%,#6e9fc6_100%)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.2),transparent_46%)]" />
                    <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-white/90">
                      <FolderKanban size={14} />
                      Development Workspace
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-[1.08rem] font-semibold text-white">{card.name}</p>
                      <p className="mt-1 text-sm text-white/78">{card.location}</p>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Units</p>
                        <p className="mt-2 text-lg font-semibold text-[#142132]">{card.totalUnits}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Available</p>
                        <p className="mt-2 text-lg font-semibold text-[#142132]">{card.unitsAvailable}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Sold / Reserved</p>
                        <p className="mt-2 text-lg font-semibold text-[#142132]">{card.unitsSoldOrReserved}</p>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3 text-[0.8rem] text-[#51657b]">
                      <p>
                        <span className="font-semibold text-[#35546c]">Developer:</span> {card.developer || 'Developer pending'}
                      </p>
                      <p>
                        <span className="font-semibold text-[#35546c]">Assigned agent:</span> {card.assignedAgent || 'Assigned Agent'}
                      </p>
                      <p>
                        <span className="font-semibold text-[#35546c]">Status:</span>{' '}
                        {String(card.status || 'draft').replace(/_/g, ' ')}
                      </p>
                      <p>
                        <span className="font-semibold text-[#35546c]">Next action:</span> {card.nextAction}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[0.8rem] text-[#6b7d93]">
                      <span>{formatRelativeDate(card.lastUpdatedAt)}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1f4f78]">
                        Open workspace
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-5 py-10 text-center">
              <Building2 className="mx-auto text-[#8da0b5]" size={24} />
              <p className="mt-3 text-base font-semibold text-[#142132]">No developments assigned yet.</p>
              <p className="mt-1 text-sm text-[#6b7d93]">Assigned developments will appear here once this agent is linked into active development workflows.</p>
              <div className="mt-4">
                <Button type="button" onClick={() => window.dispatchEvent(new Event('itg:open-new-development'))}>
                  <Plus size={16} />
                  New Development
                </Button>
              </div>
            </div>
          )
        ) : null}
      </section>

      {shareModalListing ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#091322]/40 p-5 backdrop-blur-[1.5px]">
          <div className="w-full max-w-2xl rounded-[22px] border border-[#dce4ef] bg-white p-6 shadow-[0_22px_56px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Partner visibility</p>
                <h3 className="mt-2 text-xl font-semibold text-[#142132]">Share With Partners</h3>
                <p className="mt-2 text-sm leading-6 text-[#607387]">{shareModalListing.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShareModalListing(null)
                  setShareOptions([])
                  setShareError('')
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#dce6f2] text-[#607387] transition hover:bg-[#f7fbff]"
                aria-label="Close partner sharing"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 rounded-[16px] border border-[#dce6f2] bg-[#f8fbfe] p-4 text-sm leading-6 text-[#51657b]">
              Only accepted partner relationships can receive shared listings. This does not expose seller details, internal notes, mandates, documents, or campaign tools.
            </div>

            {shareError ? (
              <div className="mt-4 rounded-[14px] border border-[#f1c6c2] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#a13b35]">
                {shareError}
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {shareOptionsLoading ? (
                <div className="rounded-[16px] border border-[#dce6f2] bg-white px-4 py-6 text-sm text-[#607387]">Loading partner relationships...</div>
              ) : null}

              {!shareOptionsLoading && !shareOptions.length ? (
                <div className="rounded-[16px] border border-dashed border-[#d3deea] bg-[#fbfcfe] px-5 py-8 text-center">
                  <Building2 className="mx-auto text-[#8da0b5]" size={24} />
                  <p className="mt-3 text-base font-semibold text-[#142132]">No accepted partner relationships found.</p>
                  <p className="mt-1 text-sm text-[#6b7d93]">Accepted partners will appear here once this agency has active organisation relationships.</p>
                </div>
              ) : null}

              {shareOptions.map((option) => {
                const actionKey = `${option.relationshipId}:${shareModalListing.id}`
                const loadingAction = shareActionKey === actionKey
                return (
                  <div key={option.relationshipId} className="flex flex-col gap-3 rounded-[16px] border border-[#dce6f2] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#142132]">{option.partnerName}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                        {option.partnerType ? option.partnerType.replace(/_/g, ' ') : 'Partner'} / {option.isShared ? 'Shared' : 'Not shared'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={option.isShared ? 'secondary' : 'primary'}
                      disabled={loadingAction || Boolean(shareActionKey)}
                      onClick={() => handlePartnerShareToggle(option)}
                    >
                      {loadingAction ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                      {option.isShared ? 'Unshare' : 'Share'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showNewListingModal ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#091322]/40 p-5 backdrop-blur-[1.5px]">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-[#dce4ef] bg-white p-6 shadow-[0_22px_56px_rgba(15,23,42,0.24)]">
            <SectionHeader
              title={
                isManualListingFlow
                  ? 'Quick Add Listing'
                  : isPrincipalListingMode
                    ? 'New Seller Lead (Principal)'
                    : 'New Seller Lead'
              }
              copy={
                isManualListingFlow
                  ? 'Create a listing quickly from the key information you already have.'
                  : isPrincipalListingMode
                    ? 'Capture lead setup, assign role players, and push onboarding through the agency workflow.'
                    : 'Capture core seller details and trigger onboarding quickly. The principal team can enrich the listing later.'
              }
            />

            {isManualListingFlow ? (
              <div className="mt-5 grid gap-2 md:grid-cols-4">
                {[
                  { key: 'property', label: 'Property Details' },
                  { key: 'seller', label: 'Seller Details' },
                  { key: 'mandate', label: 'Mandate & Commission' },
                  { key: 'assignment', label: 'Assignment' },
                ].map((step, index) => {
                  const active = form.quickStep === step.key
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => updateForm('quickStep', step.key)}
                      className={`rounded-[14px] border px-3 py-2 text-left text-sm font-semibold transition ${
                        active
                          ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_10px_20px_rgba(31,79,120,0.18)]'
                          : 'border-[#dce6f2] bg-[#fbfdff] text-[#35546c] hover:border-[#b7c8db]'
                      }`}
                    >
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-current/30 text-[0.75rem]">{index + 1}</span>
                      {step.label}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {isManualListingFlow && quickAddDuplicateMatches.length ? (
              <div className="mt-5 rounded-[18px] border border-[#f0d7a7] bg-[#fff8ea] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#8a5b16]">Possible duplicate found</p>
                    <div className="mt-2 space-y-1 text-sm text-[#6f4a15]">
                      {quickAddDuplicateMatches.slice(0, 3).map((match) => (
                        <p key={`${match.type}:${match.id}`}>
                          <span className="font-semibold">{match.label}</span> · {match.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => {
                      setShowNewListingModal(false)
                      navigate(quickAddDuplicateMatches[0]?.path || '/listings')
                    }}>
                      View existing record
                    </Button>
                    {quickAddDuplicateMatches.some((match) => match.type === 'listing') ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => {
                        const listingMatch = quickAddDuplicateMatches.find((match) => match.type === 'listing')
                        setShowNewListingModal(false)
                        navigate(listingMatch?.path || '/listings')
                      }}>
                        Link to existing listing
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" onClick={() => {
                      setQuickAddDuplicateOverride(true)
                      setQuickAddDuplicateMatches([])
                      setError('')
                      setWorkflowMessage('Duplicate override noted. Click Create Listing again to continue.')
                    }}>
                      Continue anyway
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <form className="mt-5 space-y-6" onSubmit={handleSaveListing}>
              <section className={`${isManualListingFlow && form.quickStep !== 'seller' ? 'hidden' : ''} space-y-4 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4`}>
                <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#3b5774]">Seller</h4>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Seller name</span>
                    <Field
                      value={form.sellerName}
                      onChange={(event) => updateForm('sellerName', event.target.value)}
                      placeholder={isManualListingFlow ? 'Seller full name' : 'First name'}
                    />
                  </label>
                  <label className={`${isManualListingFlow ? 'hidden' : ''} grid gap-2`}>
                    <span className="text-sm font-semibold text-[#2d445e]">Seller surname</span>
                    <Field value={form.sellerSurname} onChange={(event) => updateForm('sellerSurname', event.target.value)} placeholder="Surname" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Seller email</span>
                    <Field type="email" value={form.sellerEmail} onChange={(event) => updateForm('sellerEmail', event.target.value)} placeholder="seller@email.com" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Seller phone</span>
                    <Field value={form.sellerPhone} onChange={(event) => updateForm('sellerPhone', event.target.value)} placeholder="082..." />
                  </label>
                  {isManualListingFlow ? (
                    <>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Seller type</span>
                        <Field as="select" value={form.sellerType} onChange={(event) => updateForm('sellerType', event.target.value)}>
                          <option value="individual">Individual</option>
                          <option value="company">Company</option>
                          <option value="trust">Trust</option>
                          <option value="deceased_estate">Deceased Estate</option>
                        </Field>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">ID / registration number</span>
                        <Field value={form.sellerRegistrationNumber} onChange={(event) => updateForm('sellerRegistrationNumber', event.target.value)} placeholder="Optional" />
                      </label>
                    </>
                  ) : null}
                </div>
              </section>

              <section className={`${isManualListingFlow && form.quickStep !== 'property' ? 'hidden' : ''} space-y-4 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4`}>
                <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#3b5774]">Property</h4>
                <div className={`grid gap-4 md:grid-cols-2 ${isManualListingFlow ? 'xl:grid-cols-4' : 'xl:grid-cols-4'}`}>
                  {isManualListingFlow ? (
                    <label className="grid gap-2 xl:col-span-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Listing title</span>
                      <Field value={form.listingTitle} onChange={(event) => updateForm('listingTitle', event.target.value)} placeholder="House, Pretoria East" />
                    </label>
                  ) : null}
                  <label className="grid gap-2 xl:col-span-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Property address</span>
                    <Field value={form.propertyAddress} onChange={(event) => updateForm('propertyAddress', event.target.value)} placeholder="Street address" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Suburb / area</span>
                    <Field value={form.suburb} onChange={(event) => updateForm('suburb', event.target.value)} placeholder="Suburb" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">City</span>
                    <Field value={form.city} onChange={(event) => updateForm('city', event.target.value)} placeholder="City" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Province</span>
                    <Field value={form.province} onChange={(event) => updateForm('province', event.target.value)} placeholder="Province" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Property type</span>
                    <Field as="select" value={form.propertyType} onChange={(event) => updateForm('propertyType', event.target.value)}>
                      <option>House</option>
                      <option>Apartment</option>
                      <option>Townhouse</option>
                      <option>Sectional Title</option>
                    </Field>
                  </label>
                  {isManualListingFlow ? (
                    <>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Listing type</span>
                        <Field as="select" value={form.listingType} onChange={(event) => updateForm('listingType', event.target.value)}>
                          <option value="sale">Sale</option>
                          <option value="rental">Rental</option>
                        </Field>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Listing price</span>
                        <Field type="number" value={form.listingPrice} onChange={(event) => updateForm('listingPrice', event.target.value)} placeholder="2500000" min="0" step="1000" />
                      </label>
                    </>
                  ) : null}
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Property category</span>
                    <Field as="select" value={form.propertyCategory} onChange={(event) => updateForm('propertyCategory', event.target.value)}>
                      {PROPERTY_CATEGORIES.filter((category) => ['residential', 'mixed_use', 'vacant_land'].includes(category)).map((category) => (
                        <option key={category} value={category}>
                          {getPropertyCategoryLabel(category)}
                        </option>
                      ))}
                    </Field>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[#2d445e]">Ownership / structure type</span>
                    <Field as="select" value={form.propertyStructureType} onChange={(event) => updateForm('propertyStructureType', event.target.value)}>
                      {PROPERTY_STRUCTURE_TYPES.map((structureType) => (
                        <option key={structureType} value={structureType}>
                          {getPropertyStructureTypeLabel(structureType)}
                        </option>
                      ))}
                    </Field>
                  </label>
                  {isManualListingFlow ? (
                    <>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Bedrooms</span>
                        <Field type="number" min="0" value={form.bedrooms} onChange={(event) => updateForm('bedrooms', event.target.value)} />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Bathrooms</span>
                        <Field type="number" min="0" value={form.bathrooms} onChange={(event) => updateForm('bathrooms', event.target.value)} />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Garages / parking</span>
                        <Field type="number" min="0" value={form.parkingCount} onChange={(event) => updateForm('parkingCount', event.target.value)} />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Erf size (sqm)</span>
                        <Field type="number" min="0" value={form.erfSize} onChange={(event) => updateForm('erfSize', event.target.value)} />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Property size (sqm)</span>
                        <Field type="number" min="0" value={form.floorSize} onChange={(event) => updateForm('floorSize', event.target.value)} />
                      </label>
                      <label className="grid gap-2 xl:col-span-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Property24 / external listing link</span>
                        <Field value={form.externalListingLink} onChange={(event) => updateForm('externalListingLink', event.target.value)} placeholder="https://..." />
                      </label>
                      <label className="grid gap-2 xl:col-span-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Notes</span>
                        <Field as="textarea" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Internal notes" />
                      </label>
                    </>
                  ) : null}
                </div>
              </section>

              <section className={`${isManualListingFlow && form.quickStep !== 'mandate' ? 'hidden' : ''} space-y-4 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4`}>
                <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#3b5774]">
                  {isManualListingFlow ? 'Mandate & Commission' : 'Lead Routing'}
                </h4>
                <div className={`grid gap-4 md:grid-cols-2 ${isManualListingFlow ? 'xl:grid-cols-4' : 'xl:grid-cols-4'}`}>
                  <label className={`${isManualListingFlow ? 'hidden' : ''} grid gap-2`}>
                    <span className="text-sm font-semibold text-[#2d445e]">Lead source</span>
                    <Field as="select" value={form.leadSource} onChange={(event) => updateForm('leadSource', event.target.value)}>
                      <option value="Referral">Referral</option>
                      <option value="Website">Website</option>
                      <option value="Property24">Property24</option>
                      <option value="Private Property">Private Property</option>
                      <option value="Walk-In">Walk-In</option>
                      <option value="Canvassing">Canvassing</option>
                    </Field>
                  </label>
                  <label className={`${isManualListingFlow ? 'hidden' : ''} grid gap-2`}>
                    <span className="text-sm font-semibold text-[#2d445e]">Assigned agent</span>
                    <Field value={form.assignedAgent} onChange={(event) => updateForm('assignedAgent', event.target.value)} placeholder="Assigned agent" />
                  </label>
                  {isPrincipalListingMode && !isManualListingFlow ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Branch / agency</span>
                      <Field value={form.agencyOrganisation} onChange={(event) => updateForm('agencyOrganisation', event.target.value)} placeholder="Agency / organisation" />
                    </label>
                  ) : null}
                  <label className={`${isManualListingFlow ? 'hidden' : ''} grid gap-2`}>
                    <span className="text-sm font-semibold text-[#2d445e]">Listing type</span>
                    <Field as="select" value={form.listingCategory} onChange={(event) => updateForm('listingCategory', event.target.value)}>
                      <option value="private_sale">Private sale</option>
                      <option value="rental">Rental</option>
                      <option value="mandate">Mandate</option>
                      <option value="other">Other</option>
                    </Field>
                  </label>

                  {isManualListingFlow ? (
                    <>
                      <label className="hidden gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Listing price</span>
                        <Field type="number" value={form.listingPrice} onChange={(event) => updateForm('listingPrice', event.target.value)} placeholder="2500000" min="0" step="1000" />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Commission type</span>
                        <Field as="select" value={form.commissionType} onChange={(event) => updateForm('commissionType', event.target.value)}>
                          <option value="percentage">Percentage</option>
                          <option value="fixed">Fixed</option>
                        </Field>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Commission value</span>
                        <Field type="number" min="0" step={form.commissionType === 'percentage' ? '0.01' : '100'} value={form.commissionValue} onChange={(event) => updateForm('commissionValue', event.target.value)} placeholder={form.commissionType === 'percentage' ? '5.00' : '50000'} />
                      </label>
                      <label className="hidden gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Status</span>
                        <Field as="select" value={form.listingStatus} onChange={(event) => updateForm('listingStatus', event.target.value)}>
                          {MANUAL_LISTING_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {getStatusLabelFromManualSelection(status)}
                            </option>
                          ))}
                        </Field>
                      </label>
	                      <label className="grid gap-2">
	                        <span className="text-sm font-semibold text-[#2d445e]">Mandate signed?</span>
	                        <Field as="select" value={form.mandateSigned ? 'yes' : form.mandateStatusCaptured ? 'no' : ''} onChange={(event) => {
	                          updateForm('mandateSigned', event.target.value === 'yes')
	                          updateForm('mandateStatusCaptured', Boolean(event.target.value))
	                        }}>
	                          <option value="">Capture status</option>
	                          <option value="yes">Yes</option>
	                          <option value="no">No</option>
	                        </Field>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Mandate type</span>
                        <Field as="select" value={form.mandateType} onChange={(event) => updateForm('mandateType', event.target.value)}>
                          <option value="sole">Sole</option>
                          <option value="exclusive">Exclusive</option>
                          <option value="open">Open</option>
                        </Field>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Mandate start date</span>
                        <Field type="date" value={form.mandateStartDate} onChange={(event) => updateForm('mandateStartDate', event.target.value)} />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Mandate end date</span>
                        <Field type="date" value={form.mandateEndDate} onChange={(event) => updateForm('mandateEndDate', event.target.value)} />
                      </label>
                      <label className="grid gap-2 xl:col-span-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Co-agents (optional)</span>
                        <Field value={form.coAgents} onChange={(event) => updateForm('coAgents', event.target.value)} placeholder="Add names or emails, separated by commas" />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-[#2d445e]">Estimated asking price (optional)</span>
                        <Field type="number" value={form.estimatedAskingPrice} onChange={(event) => updateForm('estimatedAskingPrice', event.target.value)} placeholder="2500000" min="0" step="1000" />
                      </label>
                      {isPrincipalListingMode ? (
                        <>
                          <label className="grid gap-2">
                            <span className="text-sm font-semibold text-[#2d445e]">Transferring attorney</span>
                            <Field as="select" value={form.transferAttorney} onChange={(event) => updateForm('transferAttorney', event.target.value)}>
                              <option value="">Select transferring attorney</option>
                              {TRANSFER_ATTORNEY_OPTIONS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </Field>
                          </label>
                          <label className="grid gap-2">
                            <span className="text-sm font-semibold text-[#2d445e]">Bond attorney (optional)</span>
                            <Field as="select" value={form.bondAttorney} onChange={(event) => updateForm('bondAttorney', event.target.value)}>
                              <option value="">Not assigned</option>
                              {BOND_ATTORNEY_OPTIONS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </Field>
                          </label>
                          <label className="grid gap-2">
                            <span className="text-sm font-semibold text-[#2d445e]">Bond originator (optional)</span>
                            <Field as="select" value={form.bondOriginator} onChange={(event) => updateForm('bondOriginator', event.target.value)}>
                              <option value="">Not assigned</option>
                              {BOND_ORIGINATOR_OPTIONS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </Field>
                          </label>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </section>

              {isManualListingFlow && form.quickStep === 'mandate' ? (
                <section className="space-y-4 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#3b5774]">Mandate & Documents</h4>
                  <p className="rounded-[12px] border border-[#f3d7a8] bg-[#fff8ea] px-3 py-2 text-xs text-[#88531a]">
                    Missing mandates do not block listing creation. They are shown as a listing attention item.
                  </p>
	                  <div className="grid gap-4 md:grid-cols-2">
	                    {form.mandateSigned ? (
	                      <>
	                        <label className="grid gap-2">
	                          <span className="text-sm font-semibold text-[#2d445e]">Document category</span>
	                          <Field as="select" value={form.mandateDocumentCategory} onChange={(event) => updateForm('mandateDocumentCategory', event.target.value)}>
	                            {LISTING_DOCUMENT_CATEGORIES.map((category) => (
	                              <option key={category} value={category}>{category}</option>
	                            ))}
	                          </Field>
	                        </label>
	                        <label className="grid gap-2">
	                          <span className="text-sm font-semibold text-[#2d445e]">Signed mandate document</span>
	                          <Field
	                            type="file"
	                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
	                            onChange={(event) => {
	                              const file = event.target.files?.[0] || null
	                              updateForm('manualMandateFile', file)
	                              updateForm('manualMandateFileName', file?.name || '')
	                            }}
	                          />
	                          <span className="text-xs text-[#6b7d93]">{form.manualMandateFileName ? `Selected: ${form.manualMandateFileName}` : 'Upload now if you have it, or leave it as a follow-up warning.'}</span>
	                        </label>
	                      </>
	                    ) : (
	                      <div className="rounded-[14px] border border-[#dbe6f2] bg-white p-4">
                        <p className="text-sm font-semibold text-[#2d445e]">Mandate missing</p>
                        <p className="mt-1 text-xs text-[#6b7d93]">Create now and generate the mandate later from the listing workspace.</p>
                        <Button type="button" variant="secondary" className="mt-3" onClick={() => setWorkflowMessage('Mandate generation will be available from the listing workspace after save.')}>
                          Generate Mandate
                        </Button>
                      </div>
	                    )}
	                    <label className="grid gap-2">
	                      <span className="text-sm font-semibold text-[#2d445e]">Supporting document category</span>
	                      <Field as="select" value={form.supportingDocumentCategory} onChange={(event) => updateForm('supportingDocumentCategory', event.target.value)}>
	                        {LISTING_DOCUMENT_CATEGORIES.map((category) => (
	                          <option key={category} value={category}>{category}</option>
	                        ))}
	                      </Field>
	                    </label>
	                    <label className="grid gap-2">
	                      <span className="text-sm font-semibold text-[#2d445e]">Supporting documents (optional)</span>
                      <Field
                        type="file"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []).map((file) => file.name)
                          updateForm('supportingDocumentNames', files)
                        }}
                      />
                      <span className="text-xs text-[#6b7d93]">
                        {form.supportingDocumentNames.length
                          ? `Selected: ${form.supportingDocumentNames.join(', ')}`
                          : 'No supporting documents selected.'}
                      </span>
                    </label>
                  </div>
                </section>
              ) : null}

              {isManualListingFlow && form.quickStep === 'assignment' ? (
                <section className="space-y-4 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#3b5774]">Assignment</h4>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="grid gap-2 xl:col-span-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Assigned agent</span>
                      <Field
                        as="select"
                        value={form.assignedAgentId || form.assignedAgentEmail}
                        onChange={(event) => {
                          const selected = assignableAgents.find((agent) => normalizeText(agent.userId || agent.id || agent.email) === event.target.value)
                          updateForm('assignedAgentId', normalizeText(selected?.userId || selected?.id || event.target.value))
                          updateForm('assignedAgent', normalizeText(selected?.fullName || selected?.email))
                          updateForm('assignedAgentEmail', normalizeText(selected?.email))
                          if (selected?.branchId && !form.branchId) updateForm('branchId', selected.branchId)
                        }}
                      >
                        {assignableAgents.map((agent) => {
                          const value = normalizeText(agent.userId || agent.id || agent.email)
                          return (
                            <option key={value} value={value}>
                              {agent.fullName || agent.email || 'Agent'}{agent.email ? ` — ${agent.email}` : ''}
                            </option>
                          )
                        })}
                      </Field>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Branch</span>
                      <Field
                        as="select"
                        value={form.branchId}
                        onChange={(event) => {
                          const selected = effectiveBranchOptions.find((branch) => normalizeText(branch.id) === event.target.value)
                          updateForm('branchId', event.target.value)
                          updateForm('branchName', selected?.name || '')
                        }}
                      >
                        <option value="">No branch selected</option>
                        {effectiveBranchOptions.map((branch) => (
                          <option key={branch.id || branch.name} value={branch.id}>
                            {branch.name || branch.id}
                          </option>
                        ))}
                      </Field>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Visibility</span>
                      <Field as="select" value={form.visibility} onChange={(event) => updateForm('visibility', event.target.value)}>
                        <option value="agent">Agent only</option>
                        {canAssignWithinBranch ? <option value="branch">Branch</option> : null}
                        {canAssignAcrossOrganisation ? <option value="organisation">Organisation</option> : null}
                      </Field>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-[#2d445e]">Listing status</span>
                      <Field as="select" value={form.listingStatus} onChange={(event) => updateForm('listingStatus', event.target.value)}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                      </Field>
                    </label>
                  </div>
                  {(() => {
                    const mandateUploaded = Boolean(normalizeText(form.manualMandateFileName))
                    const completeness = buildListingCompleteness({ form, mandateUploaded })
                    const activeWarnings = validateQuickListingActiveRules({
                      form,
                      assignedAgentKey: normalizeText(form.assignedAgentId || form.assignedAgentEmail),
                    })
                    const readinessLabel = completeness.missingItems.length || activeWarnings.length
                      ? 'Needs Attention'
                      : normalizeKey(form.listingStatus) === 'active'
                        ? 'Live'
                        : 'Ready To Publish'
                    return (
                      <div className="rounded-[14px] border border-[#dbe6f2] bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#22374d]">Publication status: {readinessLabel}</p>
                            <p className="mt-1 text-xs text-[#6b7d93]">
                              {completeness.missingItems.length ? `Missing: ${completeness.missingItems.join(', ')}` : 'No immediate follow-up items.'}
                            </p>
                            {activeWarnings.map((warning) => (
                              <p key={warning} className="mt-2 text-xs font-semibold text-[#9a5b13]">{warning}</p>
                            ))}
                            {normalizeKey(form.listingStatus) === 'active' && activeWarnings.length ? (
                              <p className="mt-2 text-xs font-semibold text-[#1f4f78]">It will be created as Listing Review until these activation items are complete.</p>
                            ) : null}
                          </div>
                          {completeness.missingItems.length ? <CircleAlert className="text-[#9a5b13]" size={20} /> : <CheckCircle2 className="text-[#1f7d44]" size={20} />}
                        </div>
                      </div>
                    )
                  })()}
                </section>
              ) : null}

              <div className={`${isManualListingFlow ? 'hidden' : ''} grid gap-4`}>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2d445e]">Notes (optional)</span>
                  <Field
                    as="textarea"
                    value={form.notes}
                    onChange={(event) => updateForm('notes', event.target.value)}
                    placeholder={
                      isManualListingFlow
                        ? 'Internal notes for listing verification and mandate checks'
                        : 'Internal notes for onboarding and mandate setup'
                    }
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e6edf5] pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowNewListingModal(false)}>
                  Cancel
                </Button>
                {isManualListingFlow && QUICK_ADD_STEPS.indexOf(form.quickStep) > 0 ? (
                  <Button type="button" variant="secondary" onClick={() => updateForm('quickStep', QUICK_ADD_STEPS[Math.max(0, QUICK_ADD_STEPS.indexOf(form.quickStep) - 1)])}>
                    Back
                  </Button>
                ) : null}
                {isManualListingFlow && form.quickStep !== 'assignment' ? (
                  <Button type="button" onClick={() => updateForm('quickStep', QUICK_ADD_STEPS[Math.min(QUICK_ADD_STEPS.length - 1, QUICK_ADD_STEPS.indexOf(form.quickStep) + 1)])}>
                    Continue
                  </Button>
                ) : (
                  <Button type="submit">
                    {isManualListingFlow ? 'Create Listing' : 'Save Seller Lead & Send Onboarding'}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default AgentListings
