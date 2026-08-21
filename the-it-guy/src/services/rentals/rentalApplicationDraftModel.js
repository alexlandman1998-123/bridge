export const RENTAL_APPLICATION_CAPTURE_VERSION = 'arch9_rental_application_capture_v1'

export const RENTAL_APPLICATION_INITIAL_FORM = Object.freeze({
  listingId: '',
  tenantName: '',
  tenantEmail: '',
  tenantPhone: '',
  intendedOccupationDate: '',
  householdSize: '1',
  employmentStatus: 'employed',
  employerName: '',
  monthlyIncome: '',
  otherIncome: '',
  monthlyObligations: '',
  currentLandlordName: '',
  currentLandlordPhone: '',
  employerReferenceName: '',
  employerReferencePhone: '',
  idDocumentStatus: 'not_requested',
  proofOfIncomeStatus: 'not_requested',
  bankStatementsStatus: 'not_requested',
  referenceConsentStatus: 'not_requested',
  creditCheckStatus: 'not_started',
  applicationStatus: 'draft',
  landlordApprovalStatus: 'not_sent',
  notes: '',
})

export const RENTAL_APPLICATION_SELECT_OPTIONS = Object.freeze({
  employmentStatus: [
    { value: 'employed', label: 'Employed' },
    { value: 'self_employed', label: 'Self-employed' },
    { value: 'contract', label: 'Contract' },
    { value: 'student', label: 'Student' },
    { value: 'retired', label: 'Retired' },
    { value: 'other', label: 'Other' },
  ],
  documentStatus: [
    { value: 'not_requested', label: 'Not requested' },
    { value: 'requested', label: 'Requested' },
    { value: 'received', label: 'Received' },
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Rejected' },
  ],
  creditCheckStatus: [
    { value: 'not_started', label: 'Not started' },
    { value: 'consent_requested', label: 'Consent requested' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'clear', label: 'Clear' },
    { value: 'review_required', label: 'Review required' },
    { value: 'declined', label: 'Declined' },
  ],
  applicationStatus: [
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'screening', label: 'Screening' },
    { value: 'landlord_review', label: 'Landlord review' },
    { value: 'approved', label: 'Approved' },
    { value: 'declined', label: 'Declined' },
  ],
  landlordApprovalStatus: [
    { value: 'not_sent', label: 'Not sent' },
    { value: 'sent', label: 'Sent' },
    { value: 'approved', label: 'Approved' },
    { value: 'declined', label: 'Declined' },
  ],
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePositiveNumber(value) {
  const parsed = normalizeNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function optionLabel(group, value) {
  const normalized = normalizeText(value)
  const options = group === 'documentStatus'
    ? RENTAL_APPLICATION_SELECT_OPTIONS.documentStatus
    : RENTAL_APPLICATION_SELECT_OPTIONS[group]
  return options?.find((item) => item.value === normalized)?.label || normalized
}

function compactReferencePart(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8)
}

export function calculateRentalAffordability(form = {}, listing = {}) {
  const monthlyIncome = normalizeNumber(form.monthlyIncome) || 0
  const otherIncome = normalizeNumber(form.otherIncome) || 0
  const monthlyObligations = normalizeNumber(form.monthlyObligations) || 0
  const monthlyRent = normalizePositiveNumber(
    listing.monthlyRent ||
      listing.askingPrice ||
      listing.asking_price ||
      listing.listingPublicationData?.askingPrice ||
      listing.listingPublicationData?.asking_price,
  )
  const netAvailableIncome = Math.max(0, monthlyIncome + otherIncome - monthlyObligations)
  const rentToIncomeRatio = monthlyRent ? netAvailableIncome / monthlyRent : null
  const score = rentToIncomeRatio === null
    ? 'unknown'
    : rentToIncomeRatio >= 3
      ? 'strong'
      : rentToIncomeRatio >= 2.5
        ? 'review'
        : 'weak'

  return {
    monthlyRent,
    grossMonthlyIncome: monthlyIncome + otherIncome,
    monthlyObligations,
    netAvailableIncome,
    rentToIncomeRatio,
    score,
  }
}

export function validateRentalApplicationDraftForm(form = {}) {
  const errors = []
  if (!normalizeText(form.listingId)) errors.push('Rental listing is required.')
  if (!normalizeText(form.tenantName)) errors.push('Tenant name is required.')
  if (!normalizeText(form.tenantEmail) && !normalizeText(form.tenantPhone)) errors.push('Tenant email or phone is required.')
  if (!normalizePositiveNumber(form.monthlyIncome) && !normalizePositiveNumber(form.otherIncome)) {
    errors.push('Monthly income or other income is required.')
  }
  return errors
}

export function buildRentalApplicationReference(form = {}, options = {}) {
  const tenantPart = compactReferencePart(form.tenantName) || 'TENANT'
  const suffix = compactReferencePart(options.nowIso || new Date().toISOString()) || 'APP'
  return `RTA-${tenantPart}-${suffix}`
}

export function buildRentalApplicationActivityMetadata(form = {}, listing = {}, options = {}) {
  const affordability = calculateRentalAffordability(form, listing)
  const nowIso = options.nowIso || new Date().toISOString()
  return {
    captureVersion: RENTAL_APPLICATION_CAPTURE_VERSION,
    applicationReference: buildRentalApplicationReference(form, { nowIso }),
    listingId: normalizeText(form.listingId),
    listingTitle: normalizeText(listing.listingTitle || listing.title || listing.listingPublicationData?.title),
    tenant: {
      name: normalizeText(form.tenantName),
      email: normalizeText(form.tenantEmail),
      phone: normalizeText(form.tenantPhone),
      intendedOccupationDate: normalizeText(form.intendedOccupationDate),
      householdSize: normalizeNumber(form.householdSize) || 1,
      employmentStatus: normalizeText(form.employmentStatus) || 'employed',
      employerName: normalizeText(form.employerName),
    },
    affordability,
    references: {
      currentLandlordName: normalizeText(form.currentLandlordName),
      currentLandlordPhone: normalizeText(form.currentLandlordPhone),
      employerReferenceName: normalizeText(form.employerReferenceName),
      employerReferencePhone: normalizeText(form.employerReferencePhone),
    },
    documents: {
      idDocumentStatus: normalizeText(form.idDocumentStatus) || 'not_requested',
      proofOfIncomeStatus: normalizeText(form.proofOfIncomeStatus) || 'not_requested',
      bankStatementsStatus: normalizeText(form.bankStatementsStatus) || 'not_requested',
      referenceConsentStatus: normalizeText(form.referenceConsentStatus) || 'not_requested',
    },
    screening: {
      creditCheckStatus: normalizeText(form.creditCheckStatus) || 'not_started',
      applicationStatus: normalizeText(form.applicationStatus) || 'draft',
      landlordApprovalStatus: normalizeText(form.landlordApprovalStatus) || 'not_sent',
    },
    notes: normalizeText(form.notes),
    capturedAt: nowIso,
  }
}

export function buildRentalApplicationActivityPayload(form = {}, listing = {}, context = {}) {
  const metadata = buildRentalApplicationActivityMetadata(form, listing, context)
  const tenantName = metadata.tenant.name || 'Tenant'
  const listingTitle = metadata.listingTitle || 'rental listing'
  return {
    privateListingId: metadata.listingId,
    activityType: 'rental_application_received',
    activityTitle: `${tenantName} application captured`,
    activityDescription: `Tenant application captured for ${listingTitle}. Affordability: ${metadata.affordability.score}.`,
    performedBy: context.performedBy || context.assignedAgentId || null,
    visibility: 'internal',
    metadata,
  }
}

export function mapRentalApplicationActivity(activity = {}, listing = {}) {
  const metadata = activity.metadata || activity.metadata_json || {}
  const tenant = metadata.tenant || {}
  const affordability = metadata.affordability || {}
  const screening = metadata.screening || {}
  const documents = metadata.documents || {}
  return {
    id: normalizeText(activity.id || metadata.applicationReference),
    listingId: normalizeText(activity.private_listing_id || metadata.listingId),
    listingTitle: normalizeText(metadata.listingTitle || listing.listingTitle || listing.title),
    reference: normalizeText(metadata.applicationReference),
    tenantName: normalizeText(tenant.name),
    tenantEmail: normalizeText(tenant.email),
    tenantPhone: normalizeText(tenant.phone),
    intendedOccupationDate: normalizeText(tenant.intendedOccupationDate),
    affordabilityScore: normalizeText(affordability.score) || 'unknown',
    rentToIncomeRatio: affordability.rentToIncomeRatio ?? null,
    creditCheckStatus: normalizeText(screening.creditCheckStatus) || 'not_started',
    applicationStatus: normalizeText(screening.applicationStatus) || 'draft',
    landlordApprovalStatus: normalizeText(screening.landlordApprovalStatus) || 'not_sent',
    documents,
    notes: normalizeText(metadata.notes),
    capturedAt: normalizeText(metadata.capturedAt || activity.created_at),
  }
}

export function getRentalApplicationStatusLabel(group, value) {
  return optionLabel(group, value)
}
