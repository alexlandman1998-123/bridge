const DEFAULT_REMINDER_DAYS = Object.freeze([0, 2, 5, 9])
const OPEN_REQUEST_STATUSES = new Set(['requested', 'rejected'])
const SATISFYING_DOCUMENT_STATUSES = new Set(['uploaded', 'under_review', 'approved', 'completed'])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function elapsedCalendarDays(from, to) {
  const start = asDate(from)
  const end = asDate(to)
  if (!start || !end) return -1
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  return Math.floor((endUtc - startUtc) / 86400000)
}

function requirementKey(requirement = {}) {
  return normalizeKey(requirement.requirement_key || requirement.requirementKey || requirement.key)
}

function requirementId(requirement = {}) {
  return normalizeText(requirement.id || requirement.requirement_id)
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const expectedId = requirementId(requirement)
  const linkedId = normalizeText(document.requirement_id || document.requirementId)
  if (expectedId && linkedId && expectedId === linkedId) return true
  const expectedKey = requirementKey(requirement)
  const actualKey = normalizeKey(document.document_type || document.documentType || document.requirement_key || document.category)
  return Boolean(expectedKey && actualKey && expectedKey === actualKey)
}

export function isSellerDocumentRequestSatisfied(requirement = {}, documents = []) {
  return (Array.isArray(documents) ? documents : []).some((document) =>
    documentMatchesRequirement(document, requirement) &&
    SATISFYING_DOCUMENT_STATUSES.has(normalizeKey(document.status || document.review_status || 'uploaded')),
  )
}

export function buildSellerDocumentFollowUpDedupeKey({ listingId = '', requirementId: id = '', revision = 1, day = 0 } = {}) {
  const safeListingId = normalizeText(listingId)
  const safeRequirementId = normalizeText(id)
  if (!safeListingId || !safeRequirementId) return ''
  return `seller-document-follow-up:${safeListingId}:${safeRequirementId}:v${Math.max(1, Number(revision || 1))}:day-${Math.max(0, Number(day || 0))}`
}

export function buildSellerDocumentFollowUpPlan({
  listing = {},
  requirements = [],
  documents = [],
  existingDedupeKeys = [],
  now = new Date(),
  reminderDays = DEFAULT_REMINDER_DAYS,
  escalationDay = 9,
} = {}) {
  const listingId = normalizeText(listing.id || listing.private_listing_id || listing.privateListingId)
  const existing = new Set((Array.isArray(existingDedupeKeys) ? existingDedupeKeys : []).map(normalizeText))
  const reminders = []
  const escalations = []
  const stopped = []

  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const id = requirementId(requirement)
    const status = normalizeKey(requirement.status)
    if (!listingId || !id || !OPEN_REQUEST_STATUSES.has(status) || requirement.is_required === false || requirement.required === false) {
      stopped.push({ requirement, reason: 'not_open_required_request' })
      continue
    }
    if (isSellerDocumentRequestSatisfied(requirement, documents)) {
      stopped.push({ requirement, reason: 'document_supplied' })
      continue
    }

    const requestedAt = requirement.requested_at || requirement.requestedAt || requirement.updated_at || requirement.created_at
    const elapsedDays = elapsedCalendarDays(requestedAt, now)
    if (elapsedDays < 0) {
      stopped.push({ requirement, reason: 'missing_request_timestamp' })
      continue
    }
    const revision = Math.max(1, Number(requirement.request_revision || requirement.requestRevision || 1))
    const dueDays = [...new Set(reminderDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0))].sort((a, b) => a - b)
    for (const day of dueDays) {
      if (elapsedDays < day) continue
      const dedupeKey = buildSellerDocumentFollowUpDedupeKey({ listingId, requirementId: id, revision, day })
      if (existing.has(dedupeKey)) continue
      reminders.push({
        requirement,
        requirementId: id,
        requirementKey: requirementKey(requirement),
        requirementName: normalizeText(requirement.requirement_name || requirement.name || requirement.label),
        revision,
        reminderDay: day,
        dedupeKey,
        isReupload: status === 'rejected',
      })
    }

    if (elapsedDays >= escalationDay) {
      const dedupeKey = `seller-document-escalation:${listingId}:${id}:v${revision}:day-${escalationDay}`
      if (!existing.has(dedupeKey)) {
        escalations.push({ requirement, requirementId: id, revision, escalationDay, dedupeKey })
      }
    }
  }

  return { listingId, reminders, escalations, stopped }
}

export { DEFAULT_REMINDER_DAYS }
