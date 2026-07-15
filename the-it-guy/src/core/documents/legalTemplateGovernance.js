export const LEGAL_TEMPLATE_LIFECYCLE_STATUSES = Object.freeze([
  'draft',
  'attorney_review',
  'approved',
  'published',
  'superseded',
  'withdrawn',
])

const LEGACY_STATUS_ALIASES = Object.freeze({
  active: 'published',
  live: 'published',
  review: 'attorney_review',
  in_review: 'attorney_review',
  under_review: 'attorney_review',
  archived: 'withdrawn',
  deprecated: 'superseded',
})

export const LEGAL_TEMPLATE_STATUS_TRANSITIONS = Object.freeze({
  draft: ['attorney_review', 'withdrawn'],
  attorney_review: ['draft', 'approved', 'withdrawn'],
  approved: ['draft', 'published', 'withdrawn'],
  published: ['superseded', 'withdrawn'],
  superseded: [],
  withdrawn: [],
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function normalizeLegalTemplateLifecycleStatus(value = '', fallback = 'draft') {
  const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  const resolved = LEGACY_STATUS_ALIASES[normalized] || normalized
  return LEGAL_TEMPLATE_LIFECYCLE_STATUSES.includes(resolved) ? resolved : fallback
}

export function canTransitionLegalTemplateStatus(fromStatus = '', toStatus = '') {
  const from = normalizeLegalTemplateLifecycleStatus(fromStatus)
  const to = normalizeLegalTemplateLifecycleStatus(toStatus)
  return from === to || (LEGAL_TEMPLATE_STATUS_TRANSITIONS[from] || []).includes(to)
}

function parseDate(value) {
  const timestamp = Date.parse(normalizeText(value))
  return Number.isFinite(timestamp) ? timestamp : null
}

export function resolveLegalTemplateGovernance(template = {}, { at = new Date(), allowLegacy = true } = {}) {
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  const rawStatus = normalizeText(template.status || metadata.lifecycle_status)
  const status = normalizeLegalTemplateLifecycleStatus(rawStatus || (template.is_active === false ? 'draft' : 'published'))
  const governanceVersion = Number(template.governance_version ?? metadata.governance_version ?? 0) || 0
  const effectiveFrom = template.effective_from || metadata.effective_from || null
  const effectiveUntil = template.effective_until || metadata.effective_until || null
  const now = at instanceof Date ? at.getTime() : parseDate(at) ?? Date.now()
  const effectiveFromTime = parseDate(effectiveFrom)
  const effectiveUntilTime = parseDate(effectiveUntil)
  const hasStarted = effectiveFromTime === null || effectiveFromTime <= now
  const hasEnded = effectiveUntilTime !== null && effectiveUntilTime < now
  const legacyCompatible = allowLegacy && governanceVersion === 0
  const approvalRecorded = Boolean(
    template.approved_at || metadata.approved_at || template.approved_by || metadata.approved_by || legacyCompatible,
  )
  const published = status === 'published'
  const active = template.is_active !== false
  const selectableForSigning = published && active && approvalRecorded && hasStarted && !hasEnded

  return {
    status,
    governanceVersion,
    jurisdictionCode: normalizeText(template.jurisdiction_code || metadata.jurisdiction_code || 'ZA') || 'ZA',
    languageCode: normalizeText(template.language_code || metadata.language_code || 'en-ZA') || 'en-ZA',
    effectiveFrom,
    effectiveUntil,
    hasStarted,
    hasEnded,
    legacyCompatible,
    approvalRecorded,
    published,
    active,
    selectableForSigning,
    immutable: ['published', 'superseded', 'withdrawn'].includes(status),
    blockingReasons: [
      !published ? 'not_published' : '',
      !active ? 'inactive' : '',
      !approvalRecorded ? 'approval_not_recorded' : '',
      !hasStarted ? 'not_yet_effective' : '',
      hasEnded ? 'expired' : '',
    ].filter(Boolean),
  }
}

export function isLegalTemplateSelectableForSigning(template = {}, options = {}) {
  return resolveLegalTemplateGovernance(template, options).selectableForSigning
}

