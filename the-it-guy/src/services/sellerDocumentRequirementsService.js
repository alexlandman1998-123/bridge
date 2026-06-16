import { generateSellerDocumentRequirements } from '../lib/privateListingRequirementEngine'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstPresent(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

export function normalizeSellerDocumentRequirementStatus(status = '') {
  const normalized = normalizeKey(status)
  if (['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable', 'cancelled'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'accepted' || normalized === 'verified') return 'approved'
  if (normalized === 'submitted' || normalized === 'received' || normalized === 'pending_review' || normalized === 'pending') return 'uploaded'
  if (normalized === 'missing' || normalized === 'not_uploaded' || normalized === 'outstanding') return 'required'
  return normalized || 'required'
}

export function getSellerDocumentStatusLabel(status = '') {
  const normalized = normalizeSellerDocumentRequirementStatus(status)
  const labels = {
    required: 'Outstanding',
    requested: 'Requested',
    uploaded: 'Uploaded',
    under_review: 'Under Review',
    rejected: 'Rejected',
    approved: 'Approved',
    completed: 'Completed',
    not_applicable: 'Not Applicable',
    cancelled: 'Cancelled',
  }
  return labels[normalized] || normalizeText(status).replace(/_/g, ' ') || 'Outstanding'
}

export function getSellerOnboardingFormData(listing = {}) {
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  return onboarding?.formData ||
    onboarding?.form_data ||
    listing?.sellerOnboardingFormData ||
    listing?.seller_onboarding_form_data ||
    {}
}

function requirementIdentity(requirement = {}) {
  return normalizeKey(
    requirement?.key ||
      requirement?.requirement_key ||
      requirement?.document_key ||
      requirement?.canonicalRequirementInstanceId ||
      requirement?.canonical_requirement_instance_id ||
      requirement?.label ||
      requirement?.requirement_name ||
      requirement?.name,
  )
}

function requirementIsActive(requirement = {}) {
  const status = normalizeSellerDocumentRequirementStatus(
    requirement?.status || requirement?.requiredDocumentStatus || requirement?.required_document_status,
  )
  return requirement?.isRequired !== false &&
    requirement?.is_required !== false &&
    !['not_required', 'waived', 'cancelled', 'archived', 'not_applicable'].includes(status)
}

export function mergeSellerRequiredDocuments(...requirementLists) {
  const merged = []
  const seen = new Set()
  for (const requirement of requirementLists.flat()) {
    if (!requirement || typeof requirement !== 'object') continue
    if (!requirementIsActive(requirement)) continue
    const identity = requirementIdentity(requirement)
    if (identity && seen.has(identity)) continue
    if (identity) seen.add(identity)
    merged.push(requirement)
  }
  return merged
}

export function getSellerRequiredDocuments(listing = {}, formData = {}) {
  const persisted = Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []
  const hasOnboardingFacts = formData && typeof formData === 'object' && Object.keys(formData).length > 0
  try {
    const derived = (!persisted.length || hasOnboardingFacts)
      ? generateSellerDocumentRequirements({
          ...listing,
          sellerOnboarding: {
            ...(listing?.sellerOnboarding && typeof listing.sellerOnboarding === 'object' ? listing.sellerOnboarding : {}),
            status: listing?.sellerOnboardingStatus || listing?.seller_onboarding_status || 'completed',
            formData,
          },
        })
      : []
    return mergeSellerRequiredDocuments(persisted, derived)
  } catch (error) {
    console.warn('[seller-document-requirements] Failed to derive seller document requirements', {
      listingId: listing?.id || null,
      error,
    })
    return mergeSellerRequiredDocuments(persisted)
  }
}

function normalizeDocumentMatchKey(value = '') {
  return normalizeKey(value)
}

function isSignedMandateRequirement(requirement = {}) {
  const source = normalizeDocumentMatchKey([
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    requirement?.name,
  ].filter(Boolean).join(' '))
  return source.includes('signed_mandate') || source.includes('mandate_signature') || (source.includes('mandate') && source.includes('signed'))
}

function isSignedMandateDocument(document = {}) {
  const source = normalizeDocumentMatchKey([
    document?.requirementKey,
    document?.requirement_key,
    document?.document_type,
    document?.documentType,
    document?.category,
    document?.document_category,
    document?.name,
    document?.document_name,
  ].filter(Boolean).join(' '))
  return source.includes('mandate_signature') || source.includes('signed_mandate') || (source.includes('mandate') && source.includes('signed'))
}

export function documentMatchesSellerRequirement(document = {}, requirement = {}) {
  const requirementId = normalizeText(requirement?.id || requirement?.requirement_id)
  const documentRequirementId = normalizeText(document?.requirementId || document?.requirement_id)
  if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true

  if (isSignedMandateRequirement(requirement) && isSignedMandateDocument(document)) return true

  const requirementKey = normalizeDocumentMatchKey(requirement?.key || requirement?.requirement_key)
  const documentRequirementKey = normalizeDocumentMatchKey(document?.requirementKey || document?.requirement_key)
  const documentType = normalizeDocumentMatchKey(document?.document_type || document?.documentType)
  const documentCategory = normalizeDocumentMatchKey(document?.category || document?.document_category)
  const documentName = normalizeDocumentMatchKey(document?.document_name || document?.name || document?.file_name)
  return Boolean(
    requirementKey &&
      (
        documentRequirementKey === requirementKey ||
        documentType === requirementKey ||
        documentCategory === requirementKey ||
        documentName === requirementKey
      ),
  )
}

function resolveDocumentUrl(document = {}) {
  return normalizeText(
    document?.url ||
      document?.fileUrl ||
      document?.file_url ||
      document?.publicUrl ||
      document?.public_url ||
      document?.signedUrl ||
      document?.signed_url,
  )
}

function documentHasFile(document = {}) {
  return Boolean(
    resolveDocumentUrl(document) ||
      normalizeText(document?.storagePath || document?.storage_path || document?.filePath || document?.file_path),
  )
}

function normalizeRequirementTitle(requirement = {}, document = {}) {
  const raw = firstPresent(
    requirement?.label,
    requirement?.requirement_name,
    requirement?.requirementName,
    requirement?.name,
    requirement?.key,
    requirement?.requirement_key,
    document?.document_name,
    document?.name,
    document?.title,
    document?.document_type,
    document?.documentType,
  )
  return normalizeText(raw).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Seller document'
}

function normalizeRequirementDescription(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.description ||
      requirement?.requirement_description ||
      requirement?.notes ||
      document?.description ||
      document?.notes,
  )
}

function normalizeRequirementWhyNeeded(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.whyNeeded ||
      requirement?.why_needed ||
      requirement?.reason ||
      document?.whyNeeded ||
      document?.why_needed,
  )
}

function getSellerDocumentCategoryKey({ requirement = {}, document = {} } = {}) {
  const group = normalizeKey(requirement?.requirement_group || requirement?.group)
  const category = normalizeKey(document?.category || document?.document_category || requirement?.category)
  const signal = normalizeKey([
    group,
    category,
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    document?.document_type,
    document?.document_name,
  ].filter(Boolean).join(' '))

  if (group === 'additional' || category === 'additional_requests' || signal.includes('additional_request')) return 'additional'
  if (['seller_identity', 'marital', 'company', 'trust', 'deceased_estate', 'power_of_attorney', 'fica'].includes(group)) return 'fica'
  return 'property'
}

function resolveRequirementStatus(requirement = {}, document = null) {
  const requirementStatus = normalizeSellerDocumentRequirementStatus(
    requirement?.status || requirement?.requiredDocumentStatus || requirement?.required_document_status,
  )
  const documentStatus = normalizeSellerDocumentRequirementStatus(
    document?.status || document?.documentStatus || document?.document_status,
  )

  if (document && documentHasFile(document)) {
    if (documentStatus && !['required', 'requested'].includes(documentStatus)) return documentStatus
    if (requirementStatus && !['required', 'requested'].includes(requirementStatus)) return requirementStatus
    return documentStatus || 'uploaded'
  }

  return requirementStatus || documentStatus || 'required'
}

function normalizeUploadedBy(document = {}) {
  return normalizeText(document?.uploadedBy || document?.uploaded_by || document?.createdBy || document?.created_by)
}

function normalizeRequestedBy(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.requestedBy ||
      requirement?.requested_by ||
      requirement?.requestedByName ||
      requirement?.requested_by_name ||
      document?.requestedBy ||
      document?.requested_by,
  )
}

function normalizeFileName(document = {}, title = '') {
  return normalizeText(
    document?.fileName ||
      document?.file_name ||
      document?.document_name ||
      document?.name ||
      title,
  )
}

function normalizeDateValue(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function buildRequirementRow(requirement = {}, document = null, index = 0) {
  const title = normalizeRequirementTitle(requirement, document || {})
  const status = resolveRequirementStatus(requirement, document)
  const url = resolveDocumentUrl(document || {})
  return {
    id: normalizeText(firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id, document?.id)) || `seller-requirement-${index}`,
    requirementId: normalizeText(firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id, '')),
    key: normalizeText(firstPresent(requirement?.key, requirement?.requirementKey, requirement?.requirement_key, title)) || `seller-requirement-${index}`,
    category: getSellerDocumentCategoryKey({ requirement, document: document || {} }),
    title,
    label: title,
    description: normalizeRequirementDescription(requirement, document || {}),
    whyNeeded: normalizeRequirementWhyNeeded(requirement, document || {}),
    required: requirement?.is_required !== false && requirement?.required !== false,
    applicable: status !== 'not_applicable' && requirement?.applicable !== false,
    status,
    statusLabel: getSellerDocumentStatusLabel(status),
    url,
    documentUrl: url,
    uploadedFileName: document ? normalizeFileName(document, title) : '',
    uploadedAt: normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    requestedBy: normalizeRequestedBy(requirement, document || {}),
    uploadedBy: normalizeUploadedBy(document || {}),
    original: {
      requirement,
      document: document || null,
    },
  }
}

function buildExtraDocumentRow(document = {}, index = 0) {
  const title = normalizeRequirementTitle({}, document)
  const status = normalizeSellerDocumentRequirementStatus(
    document?.status || document?.documentStatus || document?.document_status || (documentHasFile(document) ? 'uploaded' : 'required'),
  )
  const url = resolveDocumentUrl(document)
  return {
    id: normalizeText(document?.id || document?.documentId || document?.document_id) || `seller-upload-${index}`,
    requirementId: '',
    key: normalizeText(document?.requirementKey || document?.requirement_key || document?.document_type || title) || `seller-upload-${index}`,
    category: getSellerDocumentCategoryKey({ document }),
    title,
    label: title,
    description: normalizeRequirementDescription({}, document),
    whyNeeded: normalizeRequirementWhyNeeded({}, document),
    required: false,
    applicable: true,
    status,
    statusLabel: getSellerDocumentStatusLabel(status),
    url,
    documentUrl: url,
    uploadedFileName: normalizeFileName(document, title),
    uploadedAt: normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    requestedBy: normalizeRequestedBy({}, document),
    uploadedBy: normalizeUploadedBy(document),
    original: {
      requirement: null,
      document,
    },
  }
}

export function buildSellerDocumentRequirementRows({ listing = {}, documents = [], formData = {} } = {}) {
  const uploadedDocuments = [
    ...(Array.isArray(documents) ? documents : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  const requiredDocuments = getSellerRequiredDocuments(listing, formData)
  if (!requiredDocuments.length) {
    return uploadedDocuments.map((document, index) => buildExtraDocumentRow(document, index))
  }

  const matchedIndexes = new Set()
  const rows = requiredDocuments.map((requirement, index) => {
    const matchIndex = uploadedDocuments.findIndex((document) => documentMatchesSellerRequirement(document, requirement))
    const document = matchIndex >= 0 ? uploadedDocuments[matchIndex] : null
    if (matchIndex >= 0) matchedIndexes.add(matchIndex)
    return buildRequirementRow(requirement, document, index)
  })

  const extraRows = uploadedDocuments
    .filter((_, index) => !matchedIndexes.has(index))
    .map((document, index) => buildExtraDocumentRow(document, index + rows.length))

  return [...rows, ...extraRows]
}
