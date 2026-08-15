import {
  SELLER_BASE_PACK_COMPLETION_ROUTES,
  SELLER_BASE_PACK_KEYS,
  getSellerBasePackAliases,
  normalizeSellerBasePackKey,
} from '../../lib/sellerBasePackContract.js'

export const KINGSTONS_SELLER_PACK_TRANSACTION_READINESS_VERSION = 'kingstons_seller_pack_transaction_readiness_phase5_v1'
export const KINGSTONS_SELLER_PACK_TRANSACTION_ENFORCEMENT_VERSION = 'kingstons_seller_pack_transaction_enforcement_phase6_v1'

export const KINGSTONS_SELLER_PACK_TRANSACTION_REQUIREMENTS = Object.freeze([
  {
    key: SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
    label: 'Signed Mandate',
    aliases: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_MANDATE),
  },
  {
    key: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
    label: 'Signed Mandatory Disclosure / Defects Form',
    aliases: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM),
  },
  {
    key: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    label: 'Signed FICA Declaration',
    aliases: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION),
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

function keyContainsAlias(value = '', alias = '') {
  const normalizedValue = key(value)
  const normalizedAlias = key(alias)
  if (!normalizedValue || !normalizedAlias) return false
  if (normalizedValue === normalizedAlias) return true
  return normalizedValue.startsWith(`${normalizedAlias}_`) ||
    normalizedValue.endsWith(`_${normalizedAlias}`) ||
    normalizedValue.includes(`_${normalizedAlias}_`)
}

function values(...items) {
  return items.flatMap((item) => {
    if (Array.isArray(item)) return item
    return item ? [item] : []
  })
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function resolveMetadata(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  return asRecord(
    row.metadata ||
      row.meta ||
      row.document_metadata ||
      upload.metadata ||
      upload.meta ||
      upload.document_metadata ||
      document.metadata ||
      document.meta ||
      document.document_metadata,
  )
}

function documentSignals(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
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
    upload.name,
    upload.category,
    upload.documentType,
    upload.document_type,
    upload.requirementKey,
    upload.requirement_key,
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
  const aliases = values(requirement.key, requirement.aliases, normalizeSellerBasePackKey(requirement.key)).map(key).filter(Boolean)
  return aliases.some((alias) =>
    signals.some((signal) =>
      keyContainsAlias(signal, alias) ||
        (normalizeSellerBasePackKey(signal) && normalizeSellerBasePackKey(signal) === normalizeSellerBasePackKey(alias)),
    ),
  )
}

function normalizeStatus(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  return key(row.status || row.reviewStatus || row.review_status || upload.status || upload.reviewStatus || upload.review_status || document.status || document.reviewStatus || document.review_status)
}

function sourceLabel(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  const source = key(row.source || upload.source || document.source)
  if (source === 'seller_onboarding_fica_declaration') return 'Seller onboarding'
  if (source === 'seller_portal') return 'Listing Seller Pack'
  if (source === 'document') return 'Transaction upload'
  if (source === 'required') return 'Transaction requirement'
  if (source === 'request') return 'Document request'
  if (source) return source.replace(/_/g, ' ')
  return 'Transaction document'
}

function resolveDocumentId(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  return text(document.id || upload.id || row.documentId || row.document_id || row.id)
}

function resolveSourceDocumentId(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  return text(document.sourceDocumentId || document.source_document_id || upload.sourceDocumentId || upload.source_document_id || row.sourceDocumentId || row.source_document_id)
}

function resolveCompletionRoute(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  const metadata = resolveMetadata(row)
  return key(
    row.completionRoute ||
      row.completion_route ||
      upload.completionRoute ||
      upload.completion_route ||
      document.completionRoute ||
      document.completion_route ||
      metadata.completionRoute ||
      metadata.completion_route,
  )
}

function resolveFicaDeclarationContext(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  const metadata = resolveMetadata(row)
  return asRecord(
    row.ficaDeclarationContext ||
      row.fica_declaration_context ||
      row.uploadContext ||
      row.upload_context ||
      upload.ficaDeclarationContext ||
      upload.fica_declaration_context ||
      upload.uploadContext ||
      upload.upload_context ||
      document.ficaDeclarationContext ||
      document.fica_declaration_context ||
      document.uploadContext ||
      document.upload_context ||
      metadata.ficaDeclarationContext ||
      metadata.fica_declaration_context ||
      metadata.uploadContext ||
      metadata.upload_context,
  )
}

function hasFicaDeclarationPhysicalUploadContext(row = {}) {
  const context = resolveFicaDeclarationContext(row)
  if (!Object.keys(context).length) return false
  return Boolean(
    text(context.sellerType || context.seller_type || context.legalPathType || context.legal_path_type) ||
      text(context.contextCapturedAt || context.context_captured_at || context.capturedAt || context.captured_at),
  )
}

function requiresFicaDeclarationPhysicalUploadContext(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  const metadata = resolveMetadata(row)
  const completionRoute = resolveCompletionRoute(row)
  if (completionRoute === SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK) return false
  return Boolean(
    completionRoute === SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT ||
      completionRoute === SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD ||
      row.physicalUploadContextRequired === true ||
      row.physical_upload_context_required === true ||
      upload.physicalUploadContextRequired === true ||
      upload.physical_upload_context_required === true ||
      document.physicalUploadContextRequired === true ||
      document.physical_upload_context_required === true ||
      metadata.physicalUploadContextRequired === true ||
      metadata.physical_upload_context_required === true ||
      !completionRoute,
  )
}

function completionRouteLabel(route = '') {
  if (route === SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK) return 'Seller onboarding'
  if (route === SELLER_BASE_PACK_COMPLETION_ROUTES.DISCLOSURE_LINK) return 'Disclosure link'
  if (route === SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT) return 'Physical upload with context'
  if (route === SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD) return 'Physical upload'
  return ''
}

function normalizeCandidate(row = {}) {
  const document = row?.document && typeof row.document === 'object' ? row.document : row
  const upload = row?.upload && typeof row.upload === 'object' ? row.upload : {}
  const metadata = resolveMetadata(row)
  const completionRoute = resolveCompletionRoute(row)
  const supportingFicaDocumentsDynamic =
    row.supportingFicaDocumentsDynamic === true ||
    row.supporting_fica_documents_dynamic === true ||
    upload.supportingFicaDocumentsDynamic === true ||
    upload.supporting_fica_documents_dynamic === true ||
    document.supportingFicaDocumentsDynamic === true ||
    document.supporting_fica_documents_dynamic === true ||
    metadata.supportingFicaDocumentsDynamic === true ||
    metadata.supporting_fica_documents_dynamic === true
  return {
    ...row,
    document,
    documentId: resolveDocumentId(row),
    sourceDocumentId: resolveSourceDocumentId(row),
    status: normalizeStatus(row),
    sourceLabel: sourceLabel(row),
    uploadedAt: text(upload.uploadedAt || upload.uploaded_at || upload.createdAt || upload.created_at || document.created_at || document.createdAt || row.uploadedAt || row.uploaded_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at),
    completionRoute,
    completionRouteLabel: completionRouteLabel(completionRoute),
    uploadContext: resolveFicaDeclarationContext(row),
    hasFicaDeclarationPhysicalUploadContext: hasFicaDeclarationPhysicalUploadContext(row),
    requiresFicaDeclarationPhysicalUploadContext: requiresFicaDeclarationPhysicalUploadContext(row),
    supportingFicaDocumentsDynamic,
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

export function buildKingstonsSellerPackProgressBlockerDetails(readiness = null) {
  if (!readiness || readiness?.gate?.attorneyHandoffReady) return []

  return (Array.isArray(readiness.blockers) ? readiness.blockers : [])
    .map((blocker) => ({
      key: text(blocker?.key || blocker?.documentKey || blocker?.label),
      documentKey: text(blocker?.documentKey),
      label: text(blocker?.label || blocker?.documentKey || 'Seller Pack document'),
      reason: text(blocker?.reason || blocker?.label || blocker?.documentKey),
    }))
    .filter((blocker) => blocker.reason)
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

  const sellerPackBlockerDetails = enabled ? buildKingstonsSellerPackProgressBlockerDetails(readiness) : []
  const sellerPackBlockers = uniqueTextList(sellerPackBlockerDetails.map((blocker) => blocker.reason))
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
      blockerDetails: sellerPackBlockerDetails,
      gateStageKeys: normalizedGateStageKeys,
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
    const ficaDeclarationNeedsContext = Boolean(
      candidate &&
        requirement.key === SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION &&
        candidate.requiresFicaDeclarationPhysicalUploadContext &&
        !candidate.hasFicaDeclarationPhysicalUploadContext,
    )
    const attentionReason = ficaDeclarationNeedsContext
      ? 'Physical FICA declaration upload is missing seller-context metadata.'
      : ''
    const attention = Boolean(
      candidate &&
        (
          ATTENTION_STATUSES.has(status) ||
          candidate.document?.is_archived ||
          candidate.document?.archived_at ||
          ficaDeclarationNeedsContext
        ),
    )
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
      completionRoute: candidate?.completionRoute || '',
      completionRouteLabel: candidate?.completionRouteLabel || '',
      requiresFicaDeclarationPhysicalUploadContext: candidate?.requiresFicaDeclarationPhysicalUploadContext || false,
      hasFicaDeclarationPhysicalUploadContext: candidate?.hasFicaDeclarationPhysicalUploadContext || false,
      supportingFicaDocumentsDynamic: candidate?.supportingFicaDocumentsDynamic || false,
      attentionReason,
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
          : row.attentionReason || row.attention_reason
            ? row.attentionReason || row.attention_reason
          : `${row.label} is not attorney-handoff ready yet.`,
      })),
  }
}
