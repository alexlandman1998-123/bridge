export const SELLER_POST_MANDATE_DOCUMENT_WORKFLOW = Object.freeze({
  key: 'seller_post_mandate_document_request',
  eventType: 'seller_portal_documents_ready',
  communicationType: 'seller_portal_link_seller',
  emailType: 'seller_portal_link',
  emailKind: 'portal_documents',
  version: 'seller_post_mandate_document_request_v1',
})

export const SELLER_POST_MANDATE_DOCUMENT_STATUS = Object.freeze({
  READY: 'ready',
  SKIPPED: 'skipped',
})

export const SELLER_POST_MANDATE_DOCUMENT_REASON = Object.freeze({
  READY: 'ready',
  ONBOARDING_NOT_SUBMITTED: 'onboarding_not_submitted',
  MANDATE_NOT_SIGNED: 'mandate_not_signed',
  MISSING_SELLER_EMAIL: 'missing_seller_email',
  MISSING_PORTAL_CONTEXT: 'missing_portal_context',
  NO_OUTSTANDING_DOCUMENTS: 'no_outstanding_documents',
})

const ONBOARDING_SUBMITTED_STATUSES = new Set([
  'complete',
  'completed',
  'submitted',
  'under_review',
])

const SIGNED_MANDATE_STATUS_KEYS = new Set([
  'active',
  'approved',
  'completed',
  'finalised',
  'finalized',
  'fully_signed',
  'live',
  'mandate_signed',
  'published',
  'signed',
  'signed_uploaded',
  'sold',
  'transaction_created',
  'under_offer',
  'uploaded_signed',
  'verified',
])

const OUTSTANDING_REQUIREMENT_STATUSES = new Set([
  'required',
  'requested',
  'rejected',
])

const SATISFYING_DOCUMENT_STATUSES = new Set([
  'uploaded',
  'under_review',
  'approved',
  'completed',
  'verified',
])

const SELLER_VISIBLE_SCOPES = new Set([
  '',
  'seller',
  'seller_visible',
  'client',
  'client_visible',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function toArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value))
}

function getObject(...values) {
  return values.find(isPlainObject) || {}
}

function getOnboarding(context = {}) {
  const listing = getObject(context.listing)
  return getObject(
    context.onboarding,
    context.sellerOnboarding,
    listing.sellerOnboarding,
    listing.seller_onboarding,
  )
}

function getOnboardingFormData(context = {}) {
  const onboarding = getOnboarding(context)
  return getObject(
    context.formData,
    context.sellerOnboardingFormData,
    onboarding.formData,
    onboarding.form_data,
  )
}

function getMandate(context = {}) {
  const listing = getObject(context.listing)
  return getObject(context.mandate, listing.mandate, listing.sellerMandate, listing.seller_mandate)
}

function getMandatePacket(context = {}) {
  const listing = getObject(context.listing)
  return getObject(
    context.mandatePacket,
    context.mandate_packet,
    listing.mandatePacket,
    listing.mandate_packet,
    getMandate(context).mandatePacket,
    getMandate(context).mandate_packet,
  )
}

function getMandateVersion(context = {}) {
  const packet = getMandatePacket(context)
  return getObject(
    context.mandateVersion,
    context.mandate_version,
    packet.version,
    packet.latestVersion,
    packet.latest_version,
  )
}

function getClientPortalContext(context = {}) {
  const listing = getObject(context.listing)
  return getObject(
    context.portalContext,
    context.clientPortalContext,
    context.sellerPortalContext,
    listing.portalContext,
    listing.clientPortalContext,
    listing.sellerPortalContext,
  )
}

export function resolveSellerPostMandateListingId(context = {}) {
  const listing = getObject(context.listing)
  return firstText(
    context.listingId,
    context.privateListingId,
    context.private_listing_id,
    listing.id,
    listing.listingId,
    listing.listing_id,
    listing.privateListingId,
    listing.private_listing_id,
  )
}

export function resolveSellerPostMandateMandatePacketId(context = {}) {
  const listing = getObject(context.listing)
  const mandate = getMandate(context)
  const packet = getMandatePacket(context)
  const version = getMandateVersion(context)
  return firstText(
    context.mandatePacketId,
    context.mandate_packet_id,
    mandate.mandatePacketId,
    mandate.mandate_packet_id,
    listing.mandatePacketId,
    listing.mandate_packet_id,
    packet.id,
    packet.packetId,
    packet.packet_id,
    packet.packet?.id,
    version.packet_id,
  )
}

export function resolveSellerPostMandateSellerEmail(context = {}) {
  const listing = getObject(context.listing)
  const onboarding = getOnboarding(context)
  const formData = getOnboardingFormData(context)
  const portal = getClientPortalContext(context)
  const seller = getObject(context.seller, listing.seller, listing.seller_contact)
  return firstText(
    context.sellerEmail,
    context.seller_email,
    formData.email,
    formData.sellerEmail,
    formData.contactEmail,
    onboarding.email,
    onboarding.sellerEmail,
    portal.client_email,
    portal.clientEmail,
    listing.sellerContactEmail,
    listing.seller_contact_email,
    listing.sellerEmail,
    listing.seller_email,
    seller.email,
  ).toLowerCase()
}

export function resolveSellerPostMandatePortalToken(context = {}) {
  const listing = getObject(context.listing)
  const onboarding = getOnboarding(context)
  const portal = getClientPortalContext(context)
  return firstText(
    context.portalToken,
    context.sellerPortalToken,
    context.seller_portal_token,
    portal.seller_workspace_token,
    portal.sellerWorkspaceToken,
    portal.token,
    onboarding.seller_portal_token,
    onboarding.sellerPortalToken,
    listing.sellerPortalToken,
    listing.seller_portal_token,
    listing.sellerOnboarding?.sellerPortalToken,
    listing.sellerOnboarding?.seller_portal_token,
    onboarding.token,
    listing.sellerOnboardingToken,
    listing.seller_onboarding_token,
    listing.sellerOnboarding?.token,
  )
}

export function canCreateSellerPostMandatePortalContext(context = {}) {
  if (context.canCreatePortalContext === false || context.canCreateSellerPortalContext === false) return false
  if (context.canCreatePortalContext === true || context.canCreateSellerPortalContext === true) return true
  const listing = getObject(context.listing)
  const organisationId = firstText(
    context.organisationId,
    context.organisation_id,
    listing.organisationId,
    listing.organisation_id,
  )
  return Boolean(resolveSellerPostMandateListingId(context) && organisationId && resolveSellerPostMandateSellerEmail(context))
}

export function isSellerPostMandateOnboardingSubmitted(context = {}) {
  if (context.onboardingSubmitted === true || context.sellerOnboardingSubmitted === true) return true
  if (context.onboardingCompleted === true || context.sellerOnboardingCompleted === true) return true
  const listing = getObject(context.listing)
  const onboarding = getOnboarding(context)
  const status = normalizeKey(firstText(
    context.onboardingStatus,
    context.sellerOnboardingStatus,
    listing.sellerOnboardingStatus,
    listing.seller_onboarding_status,
    onboarding.status,
    onboarding.onboarding_status,
  ))
  return ONBOARDING_SUBMITTED_STATUSES.has(status) ||
    Boolean(
      onboarding.submittedAt ||
        onboarding.submitted_at ||
        onboarding.completedAt ||
        onboarding.completed_at ||
        listing.sellerOnboardingSubmittedAt ||
        listing.seller_onboarding_submitted_at,
    )
}

export function isSellerPostMandateMandateSigned(context = {}) {
  if (context.mandateSigned === true || context.signed === true || context.signedAt || context.mandateSignedAt) return true
  const listing = getObject(context.listing)
  const mandate = getMandate(context)
  const packet = getMandatePacket(context)
  const version = getMandateVersion(context)
  const statuses = [
    context.mandateStatus,
    context.mandate_status,
    context.mandatePacketStatus,
    context.mandate_packet_status,
    listing.mandateStatus,
    listing.mandate_status,
    listing.listingStatus,
    listing.listing_status,
    listing.status,
    mandate.status,
    mandate.mandateStatus,
    mandate.mandate_status,
    packet.status,
    packet.state,
    packet.packetStatus,
    packet.packet_status,
    packet.packet?.status,
    version.status,
  ]
  if (statuses.some((status) => SIGNED_MANDATE_STATUS_KEYS.has(normalizeKey(status)))) return true
  return Boolean(
    context.signedArtifactId ||
      context.signedDocumentId ||
      listing.mandateSignedAt ||
      listing.mandate_signed_at ||
      mandate.signedAt ||
      mandate.signed_at ||
      mandate.finalisedAt ||
      mandate.finalised_at ||
      mandate.finalizedAt ||
      mandate.finalized_at ||
      mandate.finalSignedFilePath ||
      mandate.final_signed_file_path ||
      packet.finalSignedRecorded === true ||
      packet.final_signed_recorded === true ||
      packet.finalDocumentId ||
      packet.finalSignedDocumentId ||
      packet.final_signed_document_id ||
      packet.finalSignedFilePath ||
      packet.final_signed_file_path ||
      packet.finalSignedFileUrl ||
      packet.final_signed_file_url ||
      version.final_signed_document_id ||
      version.final_signed_file_path ||
      version.final_signed_file_url,
  )
}

function requirementId(requirement = {}) {
  return firstText(requirement.id, requirement.requirementId, requirement.requirement_id)
}

function requirementKey(requirement = {}) {
  return normalizeKey(firstText(
    requirement.requirementKey,
    requirement.requirement_key,
    requirement.documentKey,
    requirement.document_key,
    requirement.key,
    requirement.type,
    requirement.requirementName,
    requirement.requirement_name,
    requirement.label,
  ))
}

function requirementStatus(requirement = {}) {
  return normalizeKey(firstText(requirement.status, requirement.requirementStatus, requirement.requirement_status, 'required'))
}

function documentStatus(document = {}) {
  return normalizeKey(firstText(document.status, document.documentStatus, document.document_status, document.reviewStatus, document.review_status, 'uploaded'))
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const expectedId = requirementId(requirement)
  const linkedId = firstText(document.requirementId, document.requirement_id, document.documentRequirementId, document.document_requirement_id)
  if (expectedId && linkedId && expectedId === linkedId) return true

  const expectedCanonicalId = firstText(requirement.canonicalRequirementInstanceId, requirement.canonical_requirement_instance_id)
  const documentCanonicalId = firstText(document.canonicalRequirementInstanceId, document.canonical_requirement_instance_id)
  if (expectedCanonicalId && documentCanonicalId && expectedCanonicalId === documentCanonicalId) return true

  const expectedKey = requirementKey(requirement)
  const linkedKey = normalizeKey(firstText(
    document.requirementKey,
    document.requirement_key,
    document.documentType,
    document.document_type,
    document.category,
    document.type,
  ))
  return Boolean(expectedKey && linkedKey && expectedKey === linkedKey)
}

function hasSatisfyingDocument(requirement = {}, documents = []) {
  return toArray(documents).some((document) =>
    documentMatchesRequirement(document, requirement) &&
      SATISFYING_DOCUMENT_STATUSES.has(documentStatus(document)),
  )
}

function normalizeRequirementForContract(requirement = {}) {
  const status = requirementStatus(requirement)
  const key = requirementKey(requirement)
  return {
    id: requirementId(requirement),
    requirementId: requirementId(requirement),
    requirementKey: key,
    name: firstText(requirement.requirementName, requirement.requirement_name, requirement.name, requirement.label, key),
    description: firstText(requirement.requirementDescription, requirement.requirement_description, requirement.description, requirement.note),
    status,
    priority: normalizeKey(firstText(requirement.requestPriority, requirement.request_priority, requirement.priority, requirement.requirement_level, status === 'rejected' ? 'blocker' : 'required')),
    dueDate: firstText(requirement.requestDueDate, requirement.request_due_date, requirement.dueDate, requirement.due_date),
    isReplacement: status === 'rejected',
    raw: requirement,
  }
}

function compareOutstandingDocuments(left, right) {
  const replacementRank = Number(right.isReplacement) - Number(left.isReplacement)
  if (replacementRank) return replacementRank
  const priorityRank = { blocker: 0, required: 1, recommended: 2, optional: 3 }
  const leftPriority = priorityRank[left.priority] ?? 4
  const rightPriority = priorityRank[right.priority] ?? 4
  if (leftPriority !== rightPriority) return leftPriority - rightPriority
  return left.name.localeCompare(right.name)
}

export function getSellerPostMandateOutstandingDocuments({ requirements = [], documents = [], mandateSigned = false } = {}) {
  return toArray(requirements)
    .filter((requirement) => {
      const visibility = normalizeKey(firstText(requirement.documentVisibility, requirement.document_visibility, requirement.visibility, requirement.visibilityScope, requirement.visibility_scope))
      const key = requirementKey(requirement)
      if (!SELLER_VISIBLE_SCOPES.has(visibility)) return false
      if (requirement.required === false || requirement.is_required === false || requirement.applicable === false) return false
      if (mandateSigned && key === 'signed_mandate') return false
      if (!OUTSTANDING_REQUIREMENT_STATUSES.has(requirementStatus(requirement))) return false
      return !hasSatisfyingDocument(requirement, documents)
    })
    .map(normalizeRequirementForContract)
    .sort(compareOutstandingDocuments)
}

export function evaluateSellerPostMandateDocumentWorkflow(context = {}) {
  const listingId = resolveSellerPostMandateListingId(context)
  const mandatePacketId = resolveSellerPostMandateMandatePacketId(context)
  const sellerEmail = resolveSellerPostMandateSellerEmail(context)
  const portalToken = resolveSellerPostMandatePortalToken(context)
  const onboardingSubmitted = isSellerPostMandateOnboardingSubmitted(context)
  const mandateSigned = isSellerPostMandateMandateSigned(context)
  const portalContextReady = Boolean(portalToken) || canCreateSellerPostMandatePortalContext(context)
  const outstandingDocuments = getSellerPostMandateOutstandingDocuments({
    requirements: context.requirements || context.documentRequirements || context.requiredDocuments || getObject(context.listing).documentRequirements || [],
    documents: context.documents || context.uploadedDocuments || getObject(context.listing).documents || [],
    mandateSigned,
  })

  let reason = SELLER_POST_MANDATE_DOCUMENT_REASON.READY
  if (!onboardingSubmitted) reason = SELLER_POST_MANDATE_DOCUMENT_REASON.ONBOARDING_NOT_SUBMITTED
  else if (!mandateSigned) reason = SELLER_POST_MANDATE_DOCUMENT_REASON.MANDATE_NOT_SIGNED
  else if (!isValidEmail(sellerEmail)) reason = SELLER_POST_MANDATE_DOCUMENT_REASON.MISSING_SELLER_EMAIL
  else if (!portalContextReady) reason = SELLER_POST_MANDATE_DOCUMENT_REASON.MISSING_PORTAL_CONTEXT
  else if (!outstandingDocuments.length) reason = SELLER_POST_MANDATE_DOCUMENT_REASON.NO_OUTSTANDING_DOCUMENTS

  const ready = reason === SELLER_POST_MANDATE_DOCUMENT_REASON.READY
  return {
    ok: true,
    ready,
    eligible: ready,
    status: ready ? SELLER_POST_MANDATE_DOCUMENT_STATUS.READY : SELLER_POST_MANDATE_DOCUMENT_STATUS.SKIPPED,
    reason,
    workflow: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW,
    listingId,
    mandatePacketId,
    sellerEmail: isValidEmail(sellerEmail) ? sellerEmail : '',
    portalToken,
    portalContextReady,
    onboardingSubmitted,
    mandateSigned,
    outstandingDocuments,
    outstandingDocumentCount: outstandingDocuments.length,
  }
}
