import {
  buildSellerPortalFormDataFromDirectListing,
  hasDirectListingPortalIntake,
} from './directListingSellerPortalBridge.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function humanize(value = '', fallback = 'Not captured') {
  const text = normalizeText(value)
  if (!text) return fallback
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
}

function firstText(...values) {
  return values.find((value) => normalizeText(value)) || ''
}

function getOnboardingFormData(listing = {}) {
  return firstObject(listing?.sellerOnboarding?.formData, listing?.seller_onboarding?.form_data)
}

function getReadinessFacts(listing = {}) {
  return firstObject(
    listing?.sellerCanonicalFactReadiness,
    listing?.seller_canonical_fact_readiness_json,
    listing?.directListingIntake?.sellerCanonicalFactReadiness,
  )
}

function getDirectListingIntake(listing = {}, portalFormData = {}) {
  return firstObject(
    portalFormData?.directListingIntake,
    listing?.directListingIntake,
    listing?.direct_listing_intake,
  )
}

function getPortalInviteSummary(listing = {}, portalFormData = {}) {
  const onboarding = listing?.sellerOnboarding || {}
  const localInvite = firstObject(onboarding.sellerPortalInvite, onboarding.seller_portal_invite)
  const requested = Boolean(
    portalFormData.sellerPortalInviteRequested ||
      portalFormData.seller_portal_invite_requested ||
      localInvite.requested ||
      onboarding.sellerPortalActivationSource ||
      onboarding.seller_portal_activation_source,
  )
  const token = firstText(onboarding.sellerPortalToken, onboarding.seller_portal_token, onboarding.token, listing?.sellerPortalToken, listing?.seller_portal_token)
  const sentAt = firstText(onboarding.invitationLastSentAt, onboarding.seller_portal_invitation_last_sent_at, onboarding.inviteCreatedAt, onboarding.seller_portal_invite_created_at)
  const activatedAt = firstText(onboarding.activatedAt, onboarding.seller_portal_activated_at, onboarding.termsAcceptedAt, onboarding.seller_portal_terms_accepted_at)
  const status = normalizeKey(localInvite.status || onboarding.sellerPortalStatus || onboarding.seller_portal_status)

  return {
    requested,
    prepared: Boolean(token || localInvite.link || localInvite.portalLinkPresent),
    sent: Boolean(localInvite.sent || sentAt || status === 'invitation_sent'),
    activated: Boolean(activatedAt || status === 'activated' || status === 'profile_complete'),
    status: status || (activatedAt ? 'activated' : sentAt ? 'invitation_sent' : token ? 'invitation_pending' : requested ? 'requested' : 'not_requested'),
    label: activatedAt
      ? 'Activated'
      : sentAt || localInvite.sent
        ? 'Invitation sent'
        : token || localInvite.link
          ? 'Prepared'
          : requested
            ? 'Requested'
            : 'Not requested',
    sentAt,
    activatedAt,
    error: normalizeText(localInvite.error),
  }
}

function buildReadinessSummary(readiness = {}) {
  const keys = Object.keys(readiness).filter((key) => typeof readiness[key] === 'boolean')
  const complete = keys.filter((key) => readiness[key]).length
  const missingKeys = keys.filter((key) => !readiness[key])
  return {
    total: keys.length,
    complete,
    missing: missingKeys.length,
    percent: keys.length ? Math.round((complete / keys.length) * 100) : 0,
    missingKeys,
    missingLabels: missingKeys.map((key) => humanize(key)),
  }
}

function buildDeclarationRows(portalFormData = {}) {
  const sourceRows = Array.isArray(portalFormData.directListingComplianceSummary)
    ? portalFormData.directListingComplianceSummary
    : []
  return sourceRows.map((row) => ({
    key: row.key,
    label: row.label,
    held: row.held,
    status: row.status,
    statusLabel: row.statusLabel,
  }))
}

function findDeclarationRow(declarations = [], key = '') {
  const normalizedKey = normalizeKey(key)
  return declarations.find((row) => normalizeKey(row?.key || row?.label) === normalizedKey) || null
}

function buildDocumentFollowUpAction({
  declarations,
  key,
  label,
  requiredDetail,
  reportedDetail,
}) {
  const declaration = findDeclarationRow(declarations, key)
  const complete = declaration?.held === true
  return {
    key,
    label,
    complete,
    status: complete ? 'reported_held' : 'required',
    statusLabel: complete ? 'Reported held' : 'Required after listing',
    detail: complete ? reportedDetail : requiredDetail,
    attentionLabel: complete ? '' : `${label}: required after listing creation`,
    declarationStatusLabel: declaration?.statusLabel || 'Not captured',
  }
}

function buildFollowUpActions({ declarations = [], portalInvite = {} } = {}) {
  const portalComplete = Boolean(portalInvite.sent || portalInvite.activated)
  return [
    buildDocumentFollowUpAction({
      declarations,
      key: 'mandate',
      label: 'Mandate',
      requiredDetail: 'Update the mandate record and get the signed mandate into the seller document pack.',
      reportedDetail: 'Quick Add says the mandate is held. Verify it is attached before activation or publish.',
    }),
    buildDocumentFollowUpAction({
      declarations,
      key: 'fica_form',
      label: 'FICA documents',
      requiredDetail: 'Collect and upload the seller FICA documents through the seller portal or document centre.',
      reportedDetail: 'Quick Add says FICA is held. Verify the approved documents before activation or publish.',
    }),
    buildDocumentFollowUpAction({
      declarations,
      key: 'property_condition_disclosure',
      label: 'Disclosure form',
      requiredDetail: 'Collect and upload the signed property condition disclosure form.',
      reportedDetail: 'Quick Add says the disclosure is held. Verify it is attached before activation or publish.',
    }),
    {
      key: 'seller_portal',
      label: 'Seller portal link',
      complete: portalComplete,
      status: portalComplete ? 'sent' : portalInvite.prepared ? 'prepared' : 'required',
      statusLabel: portalComplete ? 'Sent' : portalInvite.prepared ? 'Prepared, not sent' : 'Required after listing',
      detail: portalComplete
        ? 'The seller portal invitation has been sent or activated.'
        : 'Send the seller portal link so the seller can upload the mandate, FICA docs and disclosure form.',
      attentionLabel: portalComplete ? '' : 'Seller portal link: send to seller for uploads',
      declarationStatusLabel: portalInvite.label || 'Not requested',
    },
  ]
}

export function buildDirectListingOperationalSummary(listing = {}) {
  const hasIntake = hasDirectListingPortalIntake(listing)
  if (!hasIntake) {
    const portalInvite = getPortalInviteSummary(listing, {})
    const followUpActions = buildFollowUpActions({ declarations: [], portalInvite })
    return {
      hasIntake: false,
      title: 'No direct listing intake',
      declarationOnly: true,
      uploadsRequired: false,
      creationBlocked: false,
      creationUploadsRequired: false,
      postCreateActionsRequired: followUpActions.some((action) => !action.complete),
      readiness: buildReadinessSummary({}),
      declarations: [],
      portalInvite,
      followUpActions,
      attentionItems: followUpActions.map((action) => action.attentionLabel).filter(Boolean),
    }
  }

  const portalFormData = buildSellerPortalFormDataFromDirectListing(listing)
  const existingFormData = getOnboardingFormData(listing)
  const intake = getDirectListingIntake(listing, portalFormData)
  const readiness = buildReadinessSummary(getReadinessFacts(listing))
  const declarations = buildDeclarationRows(portalFormData)
  const portalInvite = getPortalInviteSummary(listing, {
    ...existingFormData,
    ...portalFormData,
  })
  const sellerType = portalFormData.directListingSellerLegalType || portalFormData.sellerLegalType || portalFormData.ownershipType
  const propertyStructureType = portalFormData.propertyStructureType || listing?.propertyStructureType || listing?.property_structure_type
  const followUpActions = buildFollowUpActions({ declarations, portalInvite })
  const attentionItems = [
    readiness.missing ? `${readiness.missing} intake fact${readiness.missing === 1 ? '' : 's'} missing` : '',
    ...declarations
      .filter((row) => row.held !== true)
      .map((row) => `${row.label}: ${row.statusLabel}`),
    ...followUpActions.map((action) => action.attentionLabel),
    portalInvite.requested && !portalInvite.sent && !portalInvite.activated ? 'Seller portal invite not sent yet' : '',
    portalInvite.error ? `Seller portal invite error: ${portalInvite.error}` : '',
  ].filter(Boolean)

  return {
    hasIntake: true,
    title: 'Direct listing intake',
    source: intake.source || 'direct_listing_intake',
    version: intake.version || '',
    capturedAt: intake.capturedAt || intake.captured_at || '',
    capturedBy: intake.capturedBy || intake.captured_by || '',
    declarationOnly: true,
    uploadsRequired: false,
    creationBlocked: false,
    creationUploadsRequired: false,
    postCreateActionsRequired: followUpActions.some((action) => !action.complete),
    sellerType,
    sellerTypeLabel: humanize(sellerType),
    ownerModelLabel: [portalFormData.ownerEntityType, portalFormData.ownerStructureType].filter(Boolean).map(humanize).join(' / '),
    propertyStructureType,
    propertyStructureLabel: humanize(propertyStructureType),
    sellerName: firstText(
      [portalFormData.sellerFirstName, portalFormData.sellerSurname].filter(Boolean).join(' '),
      listing?.seller?.name,
      listing?.sellerName,
      listing?.seller_name,
    ),
    sellerEmail: firstText(portalFormData.email, listing?.seller?.email, listing?.sellerEmail, listing?.seller_email),
    propertyAddress: firstText(portalFormData.propertyAddress, listing?.formattedAddress, listing?.propertyAddress, listing?.addressLine1),
    declarations,
    readiness,
    portalInvite,
    followUpActions,
    attentionItems: [...new Set(attentionItems)],
  }
}

export default {
  buildDirectListingOperationalSummary,
}
