const CLOSED_REQUIREMENT_STATUSES = new Set([
  'uploaded',
  'under_review',
  'approved',
  'completed',
  'not_applicable',
  'cancelled',
  'waived',
])

const SATISFYING_DOCUMENT_STATUSES = new Set([
  'uploaded',
  'under_review',
  'approved',
  'completed',
])

const REQUESTABLE_VISIBILITIES = new Set(['seller_visible', 'client_visible'])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function toArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function toRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function requirementKey(requirement = {}) {
  return normalizeKey(
    requirement.requirement_key ||
      requirement.requirementKey ||
      requirement.document_key ||
      requirement.key ||
      requirement.requirement_name ||
      requirement.label,
  )
}

function requirementId(requirement = {}) {
  return normalizeText(requirement.id || requirement.requirement_id)
}

function requirementStatus(requirement = {}) {
  return normalizeKey(requirement.status || 'required')
}

function documentStatus(document = {}) {
  return normalizeKey(document.status || document.review_status || 'uploaded')
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const expectedId = requirementId(requirement)
  const linkedId = normalizeText(document.requirement_id || document.requirementId)
  if (expectedId && linkedId && expectedId === linkedId) return true

  const expectedCanonicalId = normalizeText(
    requirement.canonical_requirement_instance_id || requirement.canonicalRequirementInstanceId,
  )
  const documentCanonicalId = normalizeText(
    document.canonical_requirement_instance_id || document.canonicalRequirementInstanceId,
  )
  if (expectedCanonicalId && documentCanonicalId && expectedCanonicalId === documentCanonicalId) return true

  const expectedKey = requirementKey(requirement)
  const documentKey = normalizeKey(
    document.requirement_key ||
      document.requirementKey ||
      document.document_type ||
      document.documentType ||
      document.category,
  )
  return Boolean(expectedKey && documentKey && expectedKey === documentKey)
}

function hasSatisfyingDocument(requirement = {}, documents = []) {
  return toArray(documents).some(
    (document) =>
      documentMatchesRequirement(document, requirement) &&
      SATISFYING_DOCUMENT_STATUSES.has(documentStatus(document)),
  )
}

function resolveRequestStage(requirement = {}) {
  const group = normalizeKey(requirement.requirement_group || requirement.group)
  if (['mandate', 'seller_identity', 'fica', 'marital', 'company', 'trust', 'deceased_estate', 'seller_authority', 'power_of_attorney'].includes(group)) {
    return 'mandate_ready'
  }
  return 'listing_ready'
}

function resolveRequestPriority(requirement = {}) {
  const level = normalizeKey(requirement.requirement_level || requirement.priority)
  if (level === 'blocker') return 'blocker'
  if (requirement.is_required === false || requirement.required === false || ['optional', 'recommended'].includes(level)) {
    return level === 'recommended' ? 'recommended' : 'optional'
  }
  if (requirementKey(requirement) === 'signed_mandate') return 'blocker'
  return 'required'
}

function resolveRequirementPortalRequest(requirement = {}) {
  const generatedFrom = toRecord(requirement.generated_from || requirement.generatedFrom)
  const requestMetadata = toRecord(requirement.request_metadata || requirement.requestMetadata)
  return toRecord(
    requirement.portalRequest ||
      requirement.portal_request ||
      generatedFrom.portalRequest ||
      generatedFrom.portal_request ||
      requestMetadata.portalRequest ||
      requestMetadata.portal_request,
  )
}

function explicitBoolean(value) {
  if (value === true || value === false) return value
  if (typeof value !== 'string') return null
  const normalized = normalizeKey(value)
  if (normalized === 'true' || normalized === 'yes') return true
  if (normalized === 'false' || normalized === 'no') return false
  return null
}

function portalRequestAllowsSellerDocumentRequest(portalRequest = {}) {
  if (!Object.keys(toRecord(portalRequest)).length) return true
  const requestedFromRole = normalizeKey(portalRequest.requestedFromRole || portalRequest.requested_from_role)
  const agentManaged = explicitBoolean(portalRequest.agentManaged ?? portalRequest.agent_managed)
  const sellerUploadAllowed = explicitBoolean(portalRequest.sellerUploadAllowed ?? portalRequest.seller_upload_allowed)

  if (agentManaged === true) return false
  if (sellerUploadAllowed === false) return false
  if (requestedFromRole && requestedFromRole !== 'seller') return false
  return true
}

export function addSellerRequestBusinessDays(dateInput, businessDays = 5) {
  const date = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return null
  let remaining = Math.max(0, Number(businessDays || 0))
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const day = date.getUTCDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return date.toISOString().slice(0, 10)
}

export function buildSellerDocumentRequestDedupeKey(listingId = '', key = '', revision = 1) {
  const normalizedListingId = normalizeText(listingId)
  const normalizedKey = normalizeKey(key)
  return normalizedListingId && normalizedKey
    ? `seller-document-request:${normalizedListingId}:${normalizedKey}:v${Math.max(1, Number(revision || 1))}`
    : ''
}

export function buildSellerDocumentRequestPlan({
  listing = {},
  requirements = [],
  documents = [],
  now = new Date(),
  dueBusinessDays = 5,
  reason = 'requirements_synced',
} = {}) {
  const listingId = normalizeText(listing.id || listing.private_listing_id || listing.privateListingId)
  const sellerEmail = normalizeText(
    listing.sellerContactEmail ||
      listing.seller_contact_email ||
      listing.seller?.email ||
      listing.sellerOnboarding?.formData?.email ||
      listing.seller_onboarding?.form_data?.email,
  ).toLowerCase()
  const requestedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString()
  const dueDate = addSellerRequestBusinessDays(now, dueBusinessDays)

  const issued = []
  const existing = []
  const suppressed = []

  for (const requirement of toArray(requirements)) {
    const key = requirementKey(requirement)
    const status = requirementStatus(requirement)
    const visibility = normalizeKey(
      requirement.document_visibility || requirement.visibility || 'seller_visible',
    )
    const isReupload = status === 'rejected'
    const rejectionAlreadyReissued = normalizeKey(requirement.last_request_reason || requirement.lastRequestReason) === 'rejected_document_reupload_required'
    const requestRevision = isReupload
      ? rejectionAlreadyReissued
        ? Math.max(2, Number(requirement.request_revision || requirement.requestRevision || 2))
        : Math.max(2, Number(requirement.request_revision || requirement.requestRevision || 1) + 1)
      : Math.max(1, Number(requirement.request_revision || requirement.requestRevision || 0))
    const requestable =
      Boolean(listingId && requirementId(requirement) && key) &&
      requirement.is_required !== false &&
      requirement.required !== false &&
      REQUESTABLE_VISIBILITIES.has(visibility) &&
      !CLOSED_REQUIREMENT_STATUSES.has(status)

    if (!requestable) {
      suppressed.push({ requirement, key, reason: CLOSED_REQUIREMENT_STATUSES.has(status) ? 'closed_requirement' : 'not_seller_requestable' })
      continue
    }
    if (hasSatisfyingDocument(requirement, documents)) {
      suppressed.push({ requirement, key, reason: 'document_already_supplied' })
      continue
    }

    const portalRequest = resolveRequirementPortalRequest(requirement)
    if (!portalRequestAllowsSellerDocumentRequest(portalRequest)) {
      suppressed.push({ requirement, key, reason: 'agent_managed_portal_request', portalRequest })
      continue
    }
    const portalDeliveryChannels = toArray(
      portalRequest.requestDeliveryChannels ||
        portalRequest.request_delivery_channels ||
        portalRequest.deliveryChannels ||
        portalRequest.delivery_channels,
    ).map(normalizeKey).filter(Boolean)
    const dedupeKey = buildSellerDocumentRequestDedupeKey(listingId, key, requestRevision)
    const existingDedupeKey = normalizeText(requirement.request_dedupe_key || requirement.requestDedupeKey)
    const requestDedupeKey = normalizeText(portalRequest.requestDedupeKey || portalRequest.request_dedupe_key) || dedupeKey
    const request = {
      requirementId: requirementId(requirement),
      requirementKey: key,
      requirementName: normalizeText(requirement.requirement_name || requirement.name || requirement.label || key),
      requestedFromRole: normalizeText(portalRequest.requestedFromRole || portalRequest.requested_from_role) || 'seller',
      requestStage: normalizeText(portalRequest.requestStage || portalRequest.request_stage) || resolveRequestStage(requirement),
      requestPriority: isReupload ? 'blocker' : normalizeText(portalRequest.requestPriority || portalRequest.request_priority) || resolveRequestPriority(requirement),
      requestDueDate: normalizeText(requirement.request_due_date || requirement.requestDueDate) || dueDate,
      requestDeliveryChannels: portalDeliveryChannels.length ? portalDeliveryChannels : ['in_app', ...(sellerEmail ? ['email'] : [])],
      requestDedupeKey,
      requestSource: normalizeText(portalRequest.requestSource || portalRequest.request_source) || 'seller_document_request_orchestrator',
      requestedAt: normalizeText(requirement.requested_at || requirement.requestedAt) || requestedAt,
      requestRevision,
      reason: isReupload ? 'rejected_document_reupload_required' : reason,
      sellerEmail: sellerEmail || null,
      isReupload,
      portalRequest,
    }

    if ((status === 'requested' || status === 'rejected') && existingDedupeKey === requestDedupeKey) {
      existing.push({ requirement, ...request })
    } else {
      issued.push({ requirement, ...request })
    }
  }

  return {
    listingId,
    generatedAt: requestedAt,
    issued,
    existing,
    suppressed,
    counts: {
      issued: issued.length,
      existing: existing.length,
      suppressed: suppressed.length,
    },
  }
}

function requestUpdatePayload(item = {}) {
  return {
    status: item.isReupload ? 'rejected' : 'requested',
    requested_from_role: item.requestedFromRole,
    request_stage: item.requestStage,
    request_priority: item.requestPriority,
    request_due_date: item.requestDueDate,
    request_delivery_channels: item.requestDeliveryChannels,
    request_dedupe_key: item.requestDedupeKey,
    request_source: item.requestSource,
    requested_at: item.requestedAt,
    request_revision: item.requestRevision,
    last_request_reason: item.reason,
    request_metadata: {
      seller_email: item.sellerEmail,
      orchestration_version: 'seller_document_request_orchestration_v1',
      issued_automatically: true,
      ...(Object.keys(toRecord(item.portalRequest)).length ? { portalRequest: item.portalRequest } : {}),
    },
  }
}

export async function issueSellerDocumentRequests({
  client,
  listing = {},
  requirements = [],
  documents = [],
  now = new Date(),
  dueBusinessDays = 5,
  reason = 'requirements_synced',
} = {}) {
  if (!client?.from) throw new Error('A database client is required to issue seller document requests.')
  const plan = buildSellerDocumentRequestPlan({ listing, requirements, documents, now, dueBusinessDays, reason })
  const applied = []
  const failed = []

  for (const item of plan.issued) {
    let update = await client
      .from('private_listing_document_requirements')
      .update(requestUpdatePayload(item))
      .eq('id', item.requirementId)
      .in('status', ['required', 'requested', 'rejected'])
      .select('id, status, request_dedupe_key, requested_at')
      .maybeSingle()

    if (update.error && (update.error.code === '42703' || /column .* does not exist/i.test(normalizeText(update.error.message)))) {
      update = await client
        .from('private_listing_document_requirements')
        .update({
          status: 'requested',
          generated_from: {
            ...(item.requirement.generated_from && typeof item.requirement.generated_from === 'object' ? item.requirement.generated_from : {}),
            automaticRequest: {
              dedupeKey: item.requestDedupeKey,
              dueDate: item.requestDueDate,
              stage: item.requestStage,
              priority: item.requestPriority,
              channels: item.requestDeliveryChannels,
              requestedAt: item.requestedAt,
              reason: item.reason,
              ...(Object.keys(toRecord(item.portalRequest)).length ? { portalRequest: item.portalRequest } : {}),
            },
          },
        })
        .eq('id', item.requirementId)
        .in('status', ['required', 'requested', 'rejected'])
        .select('id, status')
        .maybeSingle()
    }

    if (update.error) failed.push({ ...item, error: update.error })
    else if (update.data) applied.push({ ...item, row: update.data })
  }

  return {
    ...plan,
    applied,
    failed,
    counts: {
      ...plan.counts,
      applied: applied.length,
      failed: failed.length,
    },
  }
}
