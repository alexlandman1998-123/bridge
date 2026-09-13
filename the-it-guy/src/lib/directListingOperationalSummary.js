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
  const accessIntent = normalizeKey(
    portalFormData.sellerPortalAccessIntent ||
      portalFormData.seller_portal_access_intent ||
      onboarding.sellerPortalAccessIntent ||
      onboarding.seller_portal_access_intent ||
      localInvite.accessIntent ||
      localInvite.access_intent,
  )
  const agentManaged = Boolean(
    portalFormData.sellerPortalOptedOut ||
      portalFormData.seller_portal_opted_out ||
      onboarding.sellerPortalOptedOut ||
      onboarding.seller_portal_opted_out ||
      localInvite.optedOut ||
      localInvite.opted_out ||
      accessIntent === 'agent_managed',
  )
  const optOutReason = firstText(
    portalFormData.sellerPortalOptOutReason,
    portalFormData.seller_portal_opt_out_reason,
    onboarding.sellerPortalOptOutReason,
    onboarding.seller_portal_opt_out_reason,
    localInvite.optOutReason,
    localInvite.opt_out_reason,
  )
  const requested = Boolean(
    !agentManaged && (portalFormData.sellerPortalInviteRequested ||
      portalFormData.seller_portal_invite_requested ||
      localInvite.requested ||
      onboarding.sellerPortalActivationSource ||
      onboarding.seller_portal_activation_source),
  )
  const token = firstText(onboarding.sellerPortalToken, onboarding.seller_portal_token, onboarding.token, listing?.sellerPortalToken, listing?.seller_portal_token)
  const sentAt = firstText(onboarding.invitationLastSentAt, onboarding.seller_portal_invitation_last_sent_at, onboarding.inviteCreatedAt, onboarding.seller_portal_invite_created_at)
  const activatedAt = firstText(onboarding.activatedAt, onboarding.seller_portal_activated_at, onboarding.termsAcceptedAt, onboarding.seller_portal_terms_accepted_at)
  const status = normalizeKey(localInvite.status || onboarding.sellerPortalStatus || onboarding.seller_portal_status)

  return {
    requested,
    accessIntent: agentManaged ? 'agent_managed' : accessIntent || (requested ? 'send_now' : 'later'),
    agentManaged,
    optOutReason,
    prepared: Boolean(token || localInvite.link || localInvite.portalLinkPresent),
    sent: Boolean(localInvite.sent || sentAt || status === 'invitation_sent'),
    activated: Boolean(activatedAt || status === 'activated' || status === 'profile_complete'),
    status: agentManaged ? 'agent_managed' : status || (activatedAt ? 'activated' : sentAt ? 'invitation_sent' : token ? 'invitation_pending' : requested ? 'requested' : 'not_requested'),
    label: agentManaged
      ? 'Agent-managed (no portal)'
      : activatedAt
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
    captureSource: row.captureSource,
    requiresUpload: row.requiresUpload === true,
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
  const reportedHeld = declaration?.held === true
  return {
    key,
    label,
    complete: false,
    status: reportedHeld ? 'reported_held_pending_upload' : 'required',
    statusLabel: reportedHeld ? 'Reported received — upload pending' : 'Required after listing',
    detail: reportedHeld ? reportedDetail : requiredDetail,
    attentionLabel: reportedHeld
      ? `${label}: reported received${declaration?.captureSource ? ` via ${humanize(declaration.captureSource)}` : ''}; upload and verify before activation`
      : `${label}: required after listing creation`,
    declarationStatusLabel: declaration?.statusLabel || 'Not captured',
  }
}

function buildFollowUpActions({ declarations = [], portalInvite = {} } = {}) {
  const portalComplete = Boolean(portalInvite.sent || portalInvite.activated || portalInvite.agentManaged)
  return [
    buildDocumentFollowUpAction({
      declarations,
      key: 'mandate',
      label: 'Mandate',
      requiredDetail: 'Update the mandate record and get the signed mandate into the seller document pack.',
      reportedDetail: 'An agent recorded the mandate as received. Upload and verify it before activation or publish.',
    }),
    buildDocumentFollowUpAction({
      declarations,
      key: 'fica_form',
      label: 'FICA documents',
      requiredDetail: 'Collect and upload the seller FICA documents through the seller portal or document centre.',
      reportedDetail: 'An agent recorded FICA as received. Upload and verify the approved documents before activation or publish.',
    }),
    buildDocumentFollowUpAction({
      declarations,
      key: 'property_condition_disclosure',
      label: 'Disclosure form',
      requiredDetail: 'Collect and upload the signed property condition disclosure form.',
      reportedDetail: 'An agent recorded the disclosure as received. Upload and verify it before activation or publish.',
    }),
    {
      key: 'seller_portal',
      label: 'Seller portal link',
      complete: portalComplete,
      status: portalInvite.agentManaged ? 'agent_managed' : portalComplete ? 'sent' : portalInvite.prepared ? 'prepared' : 'required',
      statusLabel: portalInvite.agentManaged ? 'Agent-managed (no portal)' : portalComplete ? 'Sent' : portalInvite.prepared ? 'Prepared, not sent' : 'Required after listing',
      detail: portalInvite.agentManaged
        ? `Seller is being managed offline${portalInvite.optOutReason ? `: ${portalInvite.optOutReason}` : '.'}`
        : portalComplete
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
      .map((row) => `${row.label}: ${row.statusLabel}${row.captureSource ? ` (${humanize(row.captureSource)})` : ''}`),
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
