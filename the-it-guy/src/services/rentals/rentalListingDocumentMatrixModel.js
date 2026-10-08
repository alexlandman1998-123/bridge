import { landlordWorkspace } from './rentalLandlordWorkspaceModel.js'
import { rentalLandlordRequirementTitle, rentalLandlordRequirementReason } from './rentalLandlordOnboardingModel.js'
import { rentalDocumentGuidance } from './rentalApplicationDocumentGuidance.js'
import { rentalApplicationSavedDocumentSlots, rentalApplicationDocumentsForSlot } from './rentalApplicationWizardModel.js'

const text = (value) => String(value ?? '').trim()

// Portfolio IDs scope requirements; canonical property IDs link the listing.
export function rentalListingLandlordProperties(listing, data) {
  if (!text(listing.id)) return []
  const linked = (data.portfolio || []).filter((property) => text(property.listingId) === text(listing.id))
  if (linked.length) return linked
  const propertyId = text(listing.rentalPortfolioPropertyId || listing.sellerCanonicalFacts?.propertyId)
  const candidates = (data.portfolio || []).filter((property) => !text(property.listingId) && propertyId && text(property.canonicalPropertyId) === propertyId)
  return candidates.length === 1 ? candidates : []
}

export function rentalListingLandlordLeads(listing, leads) {
  const leadId = text(listing.sellerLeadId || listing.seller_lead_id)
  return leads.filter((lead) => lead.role === 'landlord' && (
    (leadId && text(lead.id) === leadId) ||
    text(lead.relationships?.listingId) === text(listing.id) ||
    rentalListingLandlordProperties(listing, landlordWorkspace(lead)).length > 0
  ))
}

export function buildRentalListingLandlordMatrix(listing, lead, onboarding) {
  const data = onboarding.data
  const scopes = new Set(rentalListingLandlordProperties(listing, data).map((property) => `property:${property.id}`))
  const requirements = (onboarding.requirements || []).filter((row) => row.active && (row.scopeKey === 'identity' || scopes.has(row.scopeKey)))
  return {
    id: lead.id,
    title: data.profile?.name || lead.name || 'Landlord',
    onboarding,
    propertyLinked: scopes.size > 0,
    manualReviewReason: !['individual', 'multiple_owners', 'company', 'close_corporation', 'trust'].includes(data.profile?.type)
      ? 'Resolve this landlord’s legal type and authority with the rentals team before treating the checklist as complete.'
      : rentalListingLandlordProperties(listing, data).some((property) => property.category && property.category !== 'residential')
        ? 'This property needs a use-specific review. The residential document matrix does not establish commercial or exceptional-use readiness.' : '',
    rows: requirements.map((row) => ({
      ...row,
      title: rentalLandlordRequirementTitle(row, data),
      reason: rentalLandlordRequirementReason(row),
      source: row.scopeKey === 'identity' ? 'Landlord profile' : 'This property',
      documents: (onboarding.documents || []).filter((document) => document.id === row.documentId),
    })),
  }
}

export function buildRentalListingTenantMatrix(application) {
  const data = application.data || {}
  const name = text(data.entity?.legalName) || [data.identity?.firstName, data.identity?.lastName].filter(Boolean).join(' ') || 'Tenant application'
  return {
    id: application.id,
    title: name,
    application,
    status: application.status,
    date: application.submittedAt || application.updatedAt,
    // Only saved rows belong in the listing matrix; unsaved previews stay in the wizard.
    rows: application.requirements === undefined ? [] : rentalApplicationSavedDocumentSlots(data, application.requirements)
      .filter((slot) => slot.requirementId)
      .map((slot) => ({ ...slot, id: slot.requirementId, mode: 'active', reason: rentalDocumentGuidance[slot.purpose] || '', source: 'Tenant application', documents: rentalApplicationDocumentsForSlot(slot, application.documents || [], data) })),
  }
}

export function rentalListingRequirementState(row, now = Date.now()) {
  return row.expiresAt && Date.parse(row.expiresAt) <= now ? 'expired' : row.state || 'missing'
}

export function rentalListingDocumentProgress(matrix, now = Date.now()) {
  const rows = [...(matrix.landlords || []), ...(matrix.tenants || [])].flatMap((section) => section.rows)
  const active = rows.filter((row) => row.mode === 'active')
  const required = active.filter((row) => row.required)
  const complete = required.filter((row) => rentalListingRequirementState(row, now) === 'accepted').length
  const received = required.filter((row) => ['accepted', 'received'].includes(rentalListingRequirementState(row, now))).length
  return {
    available: !(matrix.issues || []).length,
    total: required.length,
    complete,
    received,
    awaiting: required.length - received,
    review: active.filter((row) => rentalListingRequirementState(row, now) === 'received').length,
    preview: rows.filter((row) => row.mode === 'preview').length,
    percent: required.length ? Math.round(complete / required.length * 100) : 0,
  }
}
