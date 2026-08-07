export const KINGSTONS_SELLER_PACK_TRANSACTION_READINESS_VERSION = 'kingstons_seller_pack_transaction_readiness_phase5_v1'
export const KINGSTONS_SELLER_PACK_TRANSACTION_ENFORCEMENT_VERSION = 'kingstons_seller_pack_transaction_enforcement_phase6_v1'

export const KINGSTONS_SELLER_PACK_TRANSACTION_REQUIREMENTS = Object.freeze([
  {
    key: 'signed_mandate',
    label: 'Signed Mandate',
    aliases: ['signed_mandate', 'mandate', 'mandate_signature'],
  },
  {
    key: 'property_condition_disclosure',
    label: 'Signed Defect Form',
    aliases: ['property_condition_disclosure', 'signed_defect_form', 'defect_form', 'defects', 'disclosure'],
  },
  {
    key: 'signed_fica_form',
    label: 'Signed FICA Form',
    aliases: ['signed_fica_form', 'fica_form', 'fica'],
  },
])

export const KINGSTONS_SELLER_PACK_TRANSACTION_GATE_STAGE_KEYS = Object.freeze(['ATTY', 'XFER', 'REG'])

const TRANSACTION_STAGE_ORDER = Object.freeze(['AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG'])
const TRANSACTION_STAGE_ALIASES = Object.freeze({
  ATTORNEY: 'ATTY',
  TRANSFER: 'XFER',
  REGISTRATION: 'REG',
  REGISTERED: 'REG',
  COMPLETE: 'REG',
})

const ATTENTION_STATUSES = new Set(['rejected', 'failed', 'error', 'blocked', 'archived'])
const READY_STATUSES = new Set(['approved', 'complete', 'completed', 'signed', 'verified', 'uploaded', 'under_review', 'received'])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function values(...items) {
  return items.flatMap((item) => {
    if (Array.isArray(item)) return item
    return item ? [item] : []
  })
}

function documentSignals(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  return values(
    row.key,
    row.id,
    row.name,
    row.label,
    row.title,
    row.category,
    row.documentType,
    row.document_type,
    row.portalDocumentType,
    row.portal_document_type,
    row.requiredDocumentId,
    row.required_document_id,
    row.requiredDocumentKey,
    row.required_document_key,
    document.name,
    document.category,
    document.documentType,
    document.document_type,
    document.portalDocumentType,
    document.portal_document_type,
  ).map(key).filter(Boolean)
}

function matchesRequirement(row = {}, requirement = {}) {
  const signals = documentSignals(row)
  const aliases = values(requirement.key, requirement.aliases).map(key).filter(Boolean)
  return aliases.some((alias) =>
    signals.some((signal) => signal === alias || signal.includes(alias) || alias.includes(signal)),
  )
}

function normalizeStatus(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  return key(row.status || row.reviewStatus || row.review_status || document.status || document.reviewStatus || document.review_status)
}

function sourceLabel(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const source = key(row.source || document.source)
  if (source === 'seller_portal') return 'Listing Seller Pack'
  if (source === 'document') return 'Transaction upload'
  if (source === 'required') return 'Transaction requirement'
  if (source === 'request') return 'Document request'
  if (source) return source.replace(/_/g, ' ')
  return 'Transaction document'
}

function resolveDocumentId(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  return text(document.id || row.documentId || row.document_id || row.id)
}

function resolveSourceDocumentId(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  return text(document.sourceDocumentId || document.source_document_id || row.sourceDocumentId || row.source_document_id)
}

function normalizeCandidate(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  return {
    ...row,
    document,
    documentId: resolveDocumentId(row),
    sourceDocumentId: resolveSourceDocumentId(row),
    status: normalizeStatus(row),
    sourceLabel: sourceLabel(row),
    uploadedAt: text(document.created_at || document.createdAt || row.uploadedAt || row.uploaded_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at),
  }
}

function uniqueRows(rows = []) {
  const seen = new Set()
  return rows.filter((row, index) => {
    const id = resolveDocumentId(row) || `${key(row.name || row.label || row.title)}:${index}`
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function uniqueTextList(rows = []) {
  return [...new Set((rows || []).map((item) => text(item)).filter(Boolean))]
}

function normalizeTransactionStageKey(value = '') {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return TRANSACTION_STAGE_ALIASES[normalized] || normalized
}

function stageIndex(value = '') {
  return TRANSACTION_STAGE_ORDER.indexOf(normalizeTransactionStageKey(value))
}

function shouldGateTransition({ currentStage = '', targetStage = '', gateStageKeys = KINGSTONS_SELLER_PACK_TRANSACTION_GATE_STAGE_KEYS } = {}) {
  const normalizedTarget = normalizeTransactionStageKey(targetStage)
  if (!gateStageKeys.includes(normalizedTarget)) return false

  const currentIndex = stageIndex(currentStage)
  const targetIndex = stageIndex(normalizedTarget)
  if (currentIndex === -1 || targetIndex === -1) return true
  return targetIndex > currentIndex
}

export function buildKingstonsSellerPackProgressBlockers(readiness = null) {
  if (!readiness || readiness?.gate?.attorneyHandoffReady) return []

  return uniqueTextList(
    (Array.isArray(readiness.blockers) ? readiness.blockers : [])
      .map((blocker) => blocker?.reason || blocker?.label || blocker?.documentKey),
  )
}

export function applyKingstonsSellerPackReadinessToProgress(
  progressModel = {},
  readiness = null,
  {
    enabled = true,
    gateStageKeys = KINGSTONS_SELLER_PACK_TRANSACTION_GATE_STAGE_KEYS,
  } = {},
) {
  if (!progressModel || typeof progressModel !== 'object') return progressModel

  const sellerPackBlockers = enabled ? buildKingstonsSellerPackProgressBlockers(readiness) : []
  if (!sellerPackBlockers.length) {
    return {
      ...progressModel,
      sellerPackTransactionReadiness: readiness || progressModel.sellerPackTransactionReadiness || null,
    }
  }

  const currentStageBlockers = uniqueTextList([
    ...(progressModel.currentStageBlockers || []),
    ...sellerPackBlockers,
  ])
  const normalizedGateStageKeys = uniqueTextList(gateStageKeys.map(normalizeTransactionStageKey))
  const currentStage = progressModel.mainStage

  const appendGateBlockersByStage = (rows = {}, { includeCurrentStage = false } = {}) => {
    const nextRows = { ...rows }
    for (const stageKey of normalizedGateStageKeys) {
      const currentIndex = stageIndex(currentStage)
      const targetIndex = stageIndex(stageKey)
      const shouldApply =
        includeCurrentStage
          ? currentIndex === -1 || targetIndex === -1 || targetIndex >= currentIndex
          : shouldGateTransition({ currentStage, targetStage: stageKey, gateStageKeys: normalizedGateStageKeys })
      if (!shouldApply) continue
      nextRows[stageKey] = uniqueTextList([...(nextRows[stageKey] || []), ...sellerPackBlockers])
    }
    return nextRows
  }

  const transitionBlockersByStage = appendGateBlockersByStage(progressModel.transitionBlockersByStage || {})
  const stepBlockersByStage = appendGateBlockersByStage(progressModel.stepBlockersByStage || {}, {
    includeCurrentStage: true,
  })
  const stageSummaryByKey = { ...(progressModel.stageSummaryByKey || {}) }
  for (const stageKey of normalizedGateStageKeys) {
    const summary = stageSummaryByKey[stageKey]
    if (!summary) continue
    const currentIndex = stageIndex(currentStage)
    const targetIndex = stageIndex(stageKey)
    if (currentIndex !== -1 && targetIndex !== -1 && targetIndex < currentIndex) continue
    stageSummaryByKey[stageKey] = {
      ...summary,
      blockers: uniqueTextList([...(summary.blockers || []), ...sellerPackBlockers]),
    }
  }

  return {
    ...progressModel,
    isAtRisk: true,
    currentStageBlockers,
    transitionBlockersByStage,
    stepBlockersByStage,
    stageSummaryByKey,
    sellerPackTransactionReadiness: readiness,
    sellerPackTransactionGate: {
      version: KINGSTONS_SELLER_PACK_TRANSACTION_ENFORCEMENT_VERSION,
      status: 'blocked',
      label: readiness?.gate?.label || 'Seller Pack blocked',
      blockerCount: sellerPackBlockers.length,
      blockers: sellerPackBlockers,
    },
    canMoveTo(targetStage) {
      if (shouldGateTransition({ currentStage, targetStage, gateStageKeys: normalizedGateStageKeys })) return false
      return progressModel.canMoveTo ? progressModel.canMoveTo(targetStage) : !(transitionBlockersByStage[normalizeTransactionStageKey(targetStage)] || []).length
    },
    getTransitionBlockers(targetStage) {
      const baseBlockers = progressModel.getTransitionBlockers
        ? progressModel.getTransitionBlockers(targetStage)
        : transitionBlockersByStage[normalizeTransactionStageKey(targetStage)] || []
      if (!shouldGateTransition({ currentStage, targetStage, gateStageKeys: normalizedGateStageKeys })) {
        return uniqueTextList(baseBlockers)
      }
      return uniqueTextList([...baseBlockers, ...sellerPackBlockers])
    },
  }
}

export function buildKingstonsSellerPackTransactionReadiness({
  documents = [],
  documentLibraryRows = [],
  requirements = KINGSTONS_SELLER_PACK_TRANSACTION_REQUIREMENTS,
} = {}) {
  const candidates = uniqueRows([
    ...(Array.isArray(documentLibraryRows) ? documentLibraryRows : []),
    ...(Array.isArray(documents) ? documents : []),
  ]).map(normalizeCandidate)

  const rows = requirements.map((requirement) => {
    const candidate = candidates.find((row) => matchesRequirement(row, requirement)) || null
    const status = candidate?.status || ''
    const attention = Boolean(candidate && (ATTENTION_STATUSES.has(status) || candidate.document?.is_archived || candidate.document?.archived_at))
    const ready = Boolean(candidate && !attention && (READY_STATUSES.has(status) || !status))
    const state = !candidate ? 'missing' : attention ? 'attention' : ready ? 'ready' : 'pending'
    return {
      key: requirement.key,
      label: requirement.label,
      aliases: requirement.aliases,
      state,
      ready,
      attention,
      missing: !candidate,
      status: status || (candidate ? 'uploaded' : 'missing'),
      statusLabel: state === 'missing'
        ? 'Missing'
        : state === 'attention'
          ? 'Needs attention'
          : state === 'ready'
            ? 'Ready'
            : 'Pending review',
      documentId: candidate?.documentId || '',
      sourceDocumentId: candidate?.sourceDocumentId || '',
      sourceLabel: candidate?.sourceLabel || '',
      uploadedAt: candidate?.uploadedAt || '',
      document: candidate?.document || null,
    }
  })

  const readyCount = rows.filter((row) => row.ready).length
  const attentionCount = rows.filter((row) => row.attention).length
  const missingCount = rows.filter((row) => row.missing).length
  const pendingCount = rows.length - readyCount - attentionCount - missingCount
  const gateStatus = attentionCount || missingCount ? 'blocked' : pendingCount ? 'warning' : 'pass'

  return {
    version: KINGSTONS_SELLER_PACK_TRANSACTION_READINESS_VERSION,
    rows,
    summary: {
      total: rows.length,
      ready: readyCount,
      missing: missingCount,
      pending: pendingCount,
      attention: attentionCount,
    },
    gate: {
      status: gateStatus,
      attorneyHandoffReady: gateStatus === 'pass',
      label: gateStatus === 'pass' ? 'Attorney-ready' : gateStatus === 'blocked' ? 'Blocked' : 'Pending review',
      reason: gateStatus === 'pass'
        ? 'Signed Seller Pack is available in transaction documents.'
        : attentionCount
          ? `${attentionCount} Seller Pack document${attentionCount === 1 ? '' : 's'} need attention before attorney handoff.`
          : missingCount
            ? `${missingCount} Seller Pack document${missingCount === 1 ? '' : 's'} still missing from transaction documents.`
            : `${pendingCount} Seller Pack document${pendingCount === 1 ? '' : 's'} are waiting for review.`,
    },
    blockers: rows
      .filter((row) => !row.ready)
      .map((row) => ({
        key: `kingstons_seller_pack:${row.key}`,
        documentKey: row.key,
        label: row.label,
        reason: row.missing
          ? `${row.label} is missing from transaction documents.`
          : `${row.label} is not attorney-handoff ready yet.`,
      })),
  }
}
