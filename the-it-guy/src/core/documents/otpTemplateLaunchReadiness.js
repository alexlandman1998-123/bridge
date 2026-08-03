import {
  OTP_CONTENT_PUBLISH_GATE_VERSION,
  buildOtpContentPublishGateReport,
  formatOtpContentPublishGateIssue,
} from './otpContentPublishGate.js'
import {
  OTP_CONTENT_RULE_VERSION,
} from './otpContentRules.js'
import {
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
  resolveOtpDocumentVariant,
} from './otpRouteUniverse.js'

export const OTP_TEMPLATE_LAUNCH_READINESS_VERSION = 'otp_template_launch_readiness_phase8_v1'
export const OTP_TEMPLATE_RUNTIME_ENFORCEMENT_VERSION = 'otp_template_runtime_enforcement_phase9_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeStatus(value = '') {
  return normalizeText(value).toLowerCase()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cloneList(value = []) {
  return Array.isArray(value) ? [...value] : []
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function templateMetadata(template = {}) {
  return template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
}

function templateId(template = {}) {
  return normalizeText(template.id || template.template_id || template.templateId)
}

function templateLabel(template = {}) {
  return normalizeText(template.template_label || template.templateLabel || template.label || template.template_key || template.templateKey || 'Untitled OTP template')
}

function isOtpTemplate(template = {}) {
  const metadata = templateMetadata(template)
  return normalizeStatus(template.packet_type || template.packetType || metadata.packet_type || metadata.packetType) === 'otp'
}

function isLiveTemplate(template = {}) {
  const metadata = templateMetadata(template)
  const status = normalizeStatus(template.status || template.template_status || template.templateStatus || metadata.template_status || metadata.lifecycle_status)
  if (['published', 'active', 'approved', 'live'].includes(status)) return true
  if (['draft', 'archived', 'deprecated', 'superseded'].includes(status)) return false
  return Boolean(template.is_active || template.isActive || template.is_default || template.isDefault)
}

function isDraftTemplate(template = {}) {
  if (isLiveTemplate(template)) return false
  const metadata = templateMetadata(template)
  const status = normalizeStatus(template.status || template.template_status || template.templateStatus || metadata.template_status || metadata.lifecycle_status)
  return !status || ['draft', 'in_review', 'review'].includes(status)
}

function firstMetadataValue(metadata = {}, keys = []) {
  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value) && value.length && normalizeText(value[0])) return value[0]
    if (normalizeText(value)) return value
  }
  return ''
}

function resolveExplicitOtpRouteKey(template = {}) {
  const metadata = templateMetadata(template)
  return normalizeOtpDocumentVariant(
    template.otpDocumentVariant ||
      template.otp_document_variant ||
      template.documentVariant ||
      template.document_variant ||
      firstMetadataValue(metadata, [
        'otp_document_variant',
        'otpDocumentVariant',
        'document_variant',
        'documentVariant',
        'transaction_type',
        'transactionType',
        'sale_type',
        'saleType',
      ]),
  )
}

export function resolveOtpTemplateLaunchRouteKey(template = {}) {
  const explicit = resolveExplicitOtpRouteKey(template)
  if (explicit) return explicit
  const metadata = templateMetadata(template)
  const inferred = resolveOtpDocumentVariant({ ...metadata, ...template })
  return inferred || 'resale_existing_property'
}

function resolvePersistedOtpContentScan(template = {}) {
  const metadata = templateMetadata(template)
  return asRecord(
    metadata.last_otp_content_scan ||
      metadata.lastOtpContentScan ||
      metadata.otp_content_publish_scan ||
      template.last_otp_content_scan ||
      template.lastOtpContentScan,
  )
}

function persistedScanIsCurrent(scan = {}) {
  return normalizeText(scan.gateVersion) === OTP_CONTENT_PUBLISH_GATE_VERSION &&
    normalizeText(scan.ruleVersion) === OTP_CONTENT_RULE_VERSION
}

function persistedScanIsValid(scan = {}) {
  if (!Object.keys(scan).length) return false
  return scan.isValidForPublish === true || scan.isValidForGeneration === true
}

function summarizePersistedIssue(issue = {}, routeKey = '') {
  const message = normalizeText(issue.message)
  const remediation = normalizeText(issue.remediation)
  return {
    severity: normalizeText(issue.severity) || 'blocking',
    code: normalizeText(issue.code) || 'OTP_TEMPLATE_CONTENT_ISSUE',
    routeKey: normalizeText(issue.routeKey) || routeKey,
    routeLabel: normalizeText(issue.routeLabel),
    signalGroupKey: normalizeText(issue.signalGroupKey),
    signalGroupLabel: normalizeText(issue.signalGroupLabel),
    sectionKey: normalizeText(issue.sectionKey),
    sectionLabel: normalizeText(issue.sectionLabel),
    conditionalSectionKey: normalizeText(issue.conditionalSectionKey),
    message,
    remediation,
    summary: message && remediation ? `${message} ${remediation}` : message || remediation,
  }
}

function getRenderValidation(template = {}) {
  const metadata = templateMetadata(template)
  return asRecord(metadata.last_render_validation || metadata.lastRenderValidation || template.last_render_validation)
}

function hasBlankRenderRisk(template = {}, sectionsLoaded = false) {
  const metadata = templateMetadata(template)
  const renderMode = normalizeStatus(template.render_mode || template.renderMode || metadata.render_mode)
  const validation = getRenderValidation(template)
  const hasValidation = Object.keys(validation).length > 0
  if (sectionsLoaded) return false
  if (renderMode === 'native_structured') return validation.renderable !== true
  return !normalizeText(template.template_storage_path || template.templateStoragePath || metadata.template_storage_path || metadata.templateStoragePath) && !hasValidation
}

function sectionPlaceholderKeys(section = {}) {
  const metadata = asRecord(section.metadata_json || section.metadataJson)
  const raw = [
    ...(Array.isArray(section.placeholder_keys) ? section.placeholder_keys : []),
    ...(Array.isArray(section.placeholderKeys) ? section.placeholderKeys : []),
    ...String(section.placeholderKeysText || section.placeholder_keys_text || metadata.placeholderKeysText || '').split(','),
  ]
  return raw.map((item) => normalizeText(item)).filter(Boolean)
}

function sectionSourceOwners(section = {}) {
  const metadata = asRecord(section.metadata_json || section.metadataJson)
  const raw = [
    ...(Array.isArray(section.source_owners) ? section.source_owners : []),
    ...(Array.isArray(section.sourceOwners) ? section.sourceOwners : []),
    ...(Array.isArray(metadata.source_owners) ? metadata.source_owners : []),
    ...(Array.isArray(metadata.sourceOwners) ? metadata.sourceOwners : []),
  ]
  return raw.map((item) => normalizeText(item)).filter(Boolean)
}

function findSourceOwnerGaps(sections = []) {
  return sections
    .map((section, index) => ({
      sectionKey: normalizeText(section.section_key || section.sectionKey || section.key || `section_${index + 1}`),
      sectionLabel: normalizeText(section.section_label || section.sectionLabel || section.label || section.section_key || section.sectionKey || `Section ${index + 1}`),
      placeholderCount: sectionPlaceholderKeys(section).length,
      sourceOwnerCount: sectionSourceOwners(section).length,
    }))
    .filter((section) => section.placeholderCount > 0 && section.sourceOwnerCount === 0)
}

function addIssue(issues, issue = {}) {
  const key = [
    issue.code,
    issue.routeKey,
    issue.templateId,
    issue.sectionKey,
    issue.message,
  ].map((item) => normalizeText(item)).join('|')
  if (issues.some((item) => [
    item.code,
    item.routeKey,
    item.templateId,
    item.sectionKey,
    item.message,
  ].map((value) => normalizeText(value)).join('|') === key)) return
  issues.push(issue)
}

function buildIssue({
  severity = 'blocking',
  code = '',
  routeKey = '',
  routeLabel = '',
  templateId: id = '',
  templateLabel: label = '',
  sectionKey = '',
  message = '',
  remediation = '',
} = {}) {
  return {
    severity,
    code,
    routeKey: normalizeText(routeKey),
    routeLabel: normalizeText(routeLabel),
    templateId: normalizeText(id),
    templateLabel: normalizeText(label),
    sectionKey: normalizeText(sectionKey),
    message: normalizeText(message),
    remediation: normalizeText(remediation),
  }
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || normalizeText(routeKey).replace(/_/g, ' ')
}

function runtimeActionBlocksLaunch(value = '') {
  return ['generate', 'upload_signed', 'finalise', 'finalize'].includes(normalizeText(value).toLowerCase())
}

function resolveRuntimeRouteKey(validation = {}, templateResolution = null) {
  return normalizeOtpDocumentVariant(
    validation?.otpDocumentVariant ||
      validation?.placeholders?.otp_document_variant ||
      validation?.placeholders?.document_variant ||
      validation?.legalDocumentScenarioProfile?.otpDocumentVariant ||
      validation?.legalDocumentScenarioProfile?.documentVariant ||
      validation?.legalDocumentScenarioProfile?.transactionType ||
      templateResolution?.legalDocumentScenarioProfile?.otpDocumentVariant ||
      templateResolution?.legalDocumentScenarioProfile?.documentVariant ||
      templateResolution?.legalDocumentScenarioProfile?.transactionType ||
      templateResolution?.legalDocumentTemplateRouting?.otpDocumentVariant ||
      templateResolution?.legalDocumentTemplateRouting?.documentVariant ||
      '',
  ) || resolveOtpTemplateLaunchRouteKey(templateResolution?.template || {})
}

export function formatOtpTemplateLaunchReadinessIssue(issue = {}) {
  const message = normalizeText(issue.message)
  const remediation = normalizeText(issue.remediation)
  if (!message) return remediation || 'OTP template launch readiness needs review.'
  if (!remediation || message.toLowerCase().includes(remediation.toLowerCase())) return message
  return `${message} ${remediation}`
}

export function buildOtpTemplateAuditTemplateRow(template = {}, options = {}) {
  const explicitRouteKey = resolveExplicitOtpRouteKey(template)
  const routeKey = normalizeOtpDocumentVariant(options.routeKey || explicitRouteKey || resolveOtpTemplateLaunchRouteKey(template)) || 'resale_existing_property'
  const hasExplicitRoute = Boolean(explicitRouteKey || options.routeKey)
  const hasLoadedSections = Array.isArray(template.sections)
  const sections = hasLoadedSections ? template.sections : []
  const live = isLiveTemplate(template)
  const persistedScan = resolvePersistedOtpContentScan(template)
  const sourceOwnerGaps = hasLoadedSections ? findSourceOwnerGaps(sections) : []
  const blankRenderRisk = hasBlankRenderRisk(template, hasLoadedSections)
  let gate = null
  let scanSource = 'none'
  let blockers = []
  let warnings = []
  let scanCurrent = false
  let validForGeneration = false

  if (hasLoadedSections) {
    gate = buildOtpContentPublishGateReport({
      ...template,
      packet_type: 'otp',
      packetType: 'otp',
      sections,
    }, {
      packetType: 'otp',
      routeKey,
    })
    scanSource = 'section_scan'
    blockers = cloneList(gate.blockers)
    warnings = cloneList(gate.warnings)
    scanCurrent = true
    validForGeneration = Boolean(gate.isValidForPublish)
  } else if (Object.keys(persistedScan).length) {
    scanSource = 'persisted_scan'
    blockers = cloneList(persistedScan.blockers).map((issue) => summarizePersistedIssue(issue, routeKey))
    warnings = cloneList(persistedScan.warnings).map((issue) => summarizePersistedIssue(issue, routeKey))
    scanCurrent = persistedScanIsCurrent(persistedScan)
    validForGeneration = persistedScanIsValid(persistedScan) && scanCurrent && blockers.length === 0
  }

  const fallback = !hasExplicitRoute
  if (sourceOwnerGaps.length) {
    blockers.push(...sourceOwnerGaps.map((section) => buildIssue({
      code: 'OTP_LAUNCH_SOURCE_OWNER_MISSING',
      routeKey,
      routeLabel: routeLabel(routeKey),
      templateId: templateId(template),
      templateLabel: templateLabel(template),
      sectionKey: section.sectionKey,
      message: `${templateLabel(template)} has OTP fields in "${section.sectionLabel}" without source-owner metadata.`,
      remediation: 'Record source owners for buyer, seller/developer, property/title, transfer, agent/FFC, commission and condition data before publishing.',
    })))
    validForGeneration = false
  }

  if (blankRenderRisk) {
    blockers.push(buildIssue({
      code: 'OTP_LAUNCH_BLANK_RENDER_RISK',
      routeKey,
      routeLabel: routeLabel(routeKey),
      templateId: templateId(template),
      templateLabel: templateLabel(template),
      message: `${templateLabel(template)} has no current render validation or loaded sections.`,
      remediation: 'Open the template, run preview/content validation, and persist a current render validation before launch.',
    }))
    validForGeneration = false
  }

  if (fallback && live) {
    warnings.push(buildIssue({
      severity: 'warning',
      code: 'OTP_LAUNCH_FALLBACK_TEMPLATE_REQUIRES_APPROVAL',
      routeKey,
      routeLabel: routeLabel(routeKey),
      templateId: templateId(template),
      templateLabel: templateLabel(template),
      message: `${templateLabel(template)} is a broad OTP fallback, not an approved resale or new-development route.`,
      remediation: 'Publish first-class resale and new-development OTP templates so fallback wording is not used for route-specific transactions.',
    }))
  }

  const blocked = blockers.length > 0
  const unverified = live && !hasLoadedSections && !Object.keys(persistedScan).length
  const staleScan = live && Object.keys(persistedScan).length > 0 && !scanCurrent
  const warningCount = warnings.length + (unverified ? 1 : 0) + (staleScan ? 1 : 0)
  const status = blocked
    ? 'blocked'
    : unverified
      ? 'unverified'
      : staleScan
        ? 'stale_scan'
        : validForGeneration
          ? warningCount ? 'ready_with_warnings' : 'ready'
          : isDraftTemplate(template)
            ? 'draft'
            : 'unknown'

  return {
    template,
    templateId: templateId(template),
    templateKey: normalizeText(template.template_key || template.templateKey || template.key),
    templateLabel: templateLabel(template),
    routeKey,
    routeLabel: routeLabel(routeKey),
    hasExplicitRoute,
    fallback,
    live,
    draft: isDraftTemplate(template),
    status,
    validForGeneration: validForGeneration && !blocked && !fallback,
    validFallback: validForGeneration && !blocked && fallback,
    scanSource,
    scanCurrent,
    hasLoadedSections,
    blankRenderRisk,
    sourceOwnerGapCount: sourceOwnerGaps.length,
    sourceOwnerGaps,
    blockingCount: blockers.length,
    warningCount,
    blockers,
    warnings,
    blockerMessages: blockers.map((issue) => issue.summary || formatOtpContentPublishGateIssue(issue)),
    warningMessages: warnings.map((issue) => issue.summary || formatOtpContentPublishGateIssue(issue)),
    persistedScan: Object.keys(persistedScan).length ? persistedScan : null,
    gate,
  }
}

function buildRouteAuditRow(route = {}, templateRows = []) {
  const routeTemplates = templateRows.filter((row) => row.routeKey === route.key && !row.fallback)
  const liveTemplates = routeTemplates.filter((row) => row.live)
  const safeLiveTemplates = liveTemplates.filter((row) => row.validForGeneration && !row.blockingCount)
  const blockedLiveTemplates = liveTemplates.filter((row) => row.blockingCount)
  const unverifiedLiveTemplates = liveTemplates.filter((row) => row.status === 'unverified' || row.status === 'stale_scan')
  const draftTemplates = routeTemplates.filter((row) => row.draft)
  const status = safeLiveTemplates.length
    ? (blockedLiveTemplates.length || unverifiedLiveTemplates.length ? 'live_with_attention' : 'live_ready')
    : blockedLiveTemplates.length
      ? 'live_blocked'
      : liveTemplates.length
        ? 'live_unverified'
        : draftTemplates.length
          ? 'draft_only'
          : 'missing'

  return {
    routeKey: route.key,
    routeLabel: route.label,
    status,
    templateCount: routeTemplates.length,
    liveCount: liveTemplates.length,
    safeLiveCount: safeLiveTemplates.length,
    blockedLiveCount: blockedLiveTemplates.length,
    unverifiedLiveCount: unverifiedLiveTemplates.length,
    draftCount: draftTemplates.length,
    templates: routeTemplates,
    preferredTemplate: safeLiveTemplates[0] || liveTemplates[0] || draftTemplates[0] || null,
  }
}

export function buildOtpTemplateLaunchReadiness(templates = [], options = {}) {
  const otpTemplates = (Array.isArray(templates) ? templates : []).filter(isOtpTemplate)
  const templateRows = otpTemplates.map((template) => buildOtpTemplateAuditTemplateRow(template))
  const routeRows = OTP_DOCUMENT_VARIANTS.map((route) => buildRouteAuditRow(route, templateRows))
  const fallbackRows = templateRows.filter((row) => row.fallback)
  const liveFallbackRows = fallbackRows.filter((row) => row.live)
  const blockers = []
  const warnings = []

  for (const route of routeRows) {
    if (route.status === 'missing') {
      addIssue(blockers, buildIssue({
        code: 'OTP_LAUNCH_ROUTE_MISSING',
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        message: `${route.routeLabel} has no first-class OTP template.`,
        remediation: 'Create and publish a route-approved OTP template for this transaction type.',
      }))
    } else if (route.status === 'draft_only') {
      addIssue(blockers, buildIssue({
        code: 'OTP_LAUNCH_ROUTE_DRAFT_ONLY',
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        templateId: route.preferredTemplate?.templateId || '',
        templateLabel: route.preferredTemplate?.templateLabel || '',
        message: `${route.routeLabel} only has draft OTP templates.`,
        remediation: 'Run the content gate and publish the route before enabling OTP automation.',
      }))
    } else if (route.status === 'live_blocked') {
      addIssue(blockers, buildIssue({
        code: 'OTP_LAUNCH_ROUTE_BLOCKED',
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        templateId: route.preferredTemplate?.templateId || '',
        templateLabel: route.preferredTemplate?.templateLabel || '',
        message: `${route.routeLabel} has a live OTP template blocked by readiness checks.`,
        remediation: route.preferredTemplate?.blockerMessages?.[0] || 'Fix the live route template, then republish it through the OTP content gate.',
      }))
    } else if (route.status === 'live_unverified') {
      addIssue(blockers, buildIssue({
        code: 'OTP_LAUNCH_ROUTE_UNVERIFIED',
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        templateId: route.preferredTemplate?.templateId || '',
        templateLabel: route.preferredTemplate?.templateLabel || '',
        message: `${route.routeLabel} has no verified live OTP template.`,
        remediation: 'Open the route template and publish it through the latest OTP content gate.',
      }))
    }
  }

  for (const row of templateRows.filter((templateRow) => templateRow.live)) {
    if (row.blockingCount) {
      for (const issue of row.blockers) addIssue(blockers, issue)
      continue
    }
    if (row.status === 'stale_scan') {
      addIssue(blockers, buildIssue({
        code: 'OTP_LAUNCH_LIVE_TEMPLATE_STALE_SCAN',
        routeKey: row.routeKey,
        routeLabel: row.routeLabel,
        templateId: row.templateId,
        templateLabel: row.templateLabel,
        message: `${row.templateLabel} is live but its OTP content scan is stale.`,
        remediation: 'Re-run publish review so the latest OTP scanner and rule versions are stored.',
      }))
      continue
    }
    if (row.status === 'unverified') {
      addIssue(blockers, buildIssue({
        code: 'OTP_LAUNCH_LIVE_TEMPLATE_UNVERIFIED',
        routeKey: row.routeKey,
        routeLabel: row.routeLabel,
        templateId: row.templateId,
        templateLabel: row.templateLabel,
        message: `${row.templateLabel} is live but has no OTP content scan.`,
        remediation: 'Republish the template through the OTP content gate before live automation.',
      }))
      continue
    }
    if (row.warningCount) {
      for (const warning of row.warnings) addIssue(warnings, warning)
    }
  }

  const readyRouteCount = routeRows.filter((row) => row.safeLiveCount > 0).length
  const blockedRouteCount = routeRows.length - readyRouteCount
  const fallbackWouldBeUsed = liveFallbackRows.length > 0 && blockedRouteCount > 0
  if (fallbackWouldBeUsed) {
    for (const row of liveFallbackRows) {
      addIssue(blockers, buildIssue({
        code: 'OTP_LAUNCH_UNSAFE_FALLBACK',
        routeKey: row.routeKey,
        routeLabel: row.routeLabel,
        templateId: row.templateId,
        templateLabel: row.templateLabel,
        message: `${row.templateLabel} is the only live fallback while one or more OTP routes are not verified.`,
        remediation: 'Do not launch OTP automation until resale and new-development routes each have verified live templates.',
      }))
    }
  }

  const warningPolicyBlocks = options.warningPolicy === 'block' && warnings.length > 0
  const status = blockers.length || warningPolicyBlocks
    ? 'blocked'
    : warnings.length
      ? 'attention'
      : 'ready'

  return {
    readinessVersion: OTP_TEMPLATE_LAUNCH_READINESS_VERSION,
    gateVersion: OTP_CONTENT_PUBLISH_GATE_VERSION,
    ruleVersion: OTP_CONTENT_RULE_VERSION,
    status,
    canEnableOtpAutomation: status !== 'blocked',
    canGenerateWithoutFallback: blockers.length === 0 && liveFallbackRows.length === 0,
    summary: {
      requiredRouteCount: routeRows.length,
      readyRouteCount,
      blockedRouteCount,
      otpTemplateCount: templateRows.length,
      liveTemplateCount: templateRows.filter((row) => row.live).length,
      verifiedLiveTemplateCount: templateRows.filter((row) => row.live && row.validForGeneration).length,
      fallbackTemplateCount: fallbackRows.length,
      liveFallbackTemplateCount: liveFallbackRows.length,
      unsafeFallbackCount: fallbackWouldBeUsed ? liveFallbackRows.length : 0,
      staleScanCount: templateRows.filter((row) => row.live && row.status === 'stale_scan').length,
      unverifiedLiveTemplateCount: templateRows.filter((row) => row.live && row.status === 'unverified').length,
      blockedLiveTemplateCount: templateRows.filter((row) => row.live && row.blockingCount).length,
      blankRenderRiskCount: templateRows.filter((row) => row.live && row.blankRenderRisk).length,
      sourceOwnerGapCount: templateRows.reduce((total, row) => total + numberValue(row.sourceOwnerGapCount), 0),
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    blockers,
    warnings,
    blockerMessages: blockers.map(formatOtpTemplateLaunchReadinessIssue),
    warningMessages: warnings.map(formatOtpTemplateLaunchReadinessIssue),
    routeRows,
    fallbackRows,
    templateRows,
  }
}

export function buildOtpTemplateRuntimeLaunchReadiness(validation = {}, templateResolution = null, options = {}) {
  const packetType = normalizeText(validation?.packetType || templateResolution?.packetType).toLowerCase()
  if (packetType !== 'otp') return null

  const action = normalizeText(options.action || validation?.validationAction || 'preview').toLowerCase()
  const blocksLaunch = runtimeActionBlocksLaunch(action)
  const template = templateResolution?.template || null
  const routeKey = resolveRuntimeRouteKey(validation, templateResolution)
  const resolvedRouteLabel = routeLabel(routeKey)
  const templateResolutionSource = normalizeText(templateResolution?.source || validation?.templateResolutionSource)
  const selectedTemplateLabel = templateLabel(template || {})
  const fallback = templateResolutionSource === 'legal_scenario_fallback'
  const row = template?.id ? buildOtpTemplateAuditTemplateRow(template, { routeKey }) : null
  const blockers = []
  const warnings = []

  if (!template?.id && blocksLaunch) {
    blockers.push(buildIssue({
      code: 'OTP_RUNTIME_TEMPLATE_MISSING',
      routeKey,
      routeLabel: resolvedRouteLabel,
      message: `No live ${resolvedRouteLabel} template is available for OTP generation.`,
      remediation: 'Create, scan, and publish a live OTP template for this route before generating the OTP.',
    }))
  }

  if (row?.blockingCount) {
    blockers.push(...row.blockers.map((issue) => ({
      ...issue,
      code: normalizeText(issue.code) || 'OTP_RUNTIME_TEMPLATE_BLOCKED',
      routeKey: normalizeText(issue.routeKey) || routeKey,
      routeLabel: normalizeText(issue.routeLabel) || resolvedRouteLabel,
      templateId: normalizeText(issue.templateId) || row.templateId,
      templateLabel: normalizeText(issue.templateLabel) || row.templateLabel,
    })))
  }

  if (row?.status === 'stale_scan') {
    blockers.push(buildIssue({
      code: 'OTP_RUNTIME_STALE_SCAN',
      routeKey,
      routeLabel: resolvedRouteLabel,
      templateId: row.templateId,
      templateLabel: row.templateLabel,
      message: `${row.templateLabel} has a stale OTP content scan.`,
      remediation: 'Republish this OTP template through the latest content gate before generation.',
    }))
  } else if (row?.status === 'unverified') {
    blockers.push(buildIssue({
      code: 'OTP_RUNTIME_UNVERIFIED_TEMPLATE',
      routeKey,
      routeLabel: resolvedRouteLabel,
      templateId: row.templateId,
      templateLabel: row.templateLabel,
      message: `${row.templateLabel} has no persisted OTP content scan.`,
      remediation: 'Republish this OTP template through the OTP content gate before generation.',
    }))
  }

  if (fallback) {
    const issue = buildIssue({
      severity: blocksLaunch ? 'blocking' : 'warning',
      code: 'OTP_RUNTIME_UNAPPROVED_FALLBACK',
      routeKey,
      routeLabel: resolvedRouteLabel,
      templateId: normalizeText(template?.id),
      templateLabel: selectedTemplateLabel,
      message: `No verified live ${resolvedRouteLabel} template is routable, so ${selectedTemplateLabel} would be used instead.`,
      remediation: 'Publish the first-class resale or new-development OTP route before generating a final OTP for this transaction.',
    })
    if (blocksLaunch) blockers.push(issue)
    else warnings.push(issue)
  }

  for (const warning of row?.warnings || []) {
    warnings.push(warning)
  }

  const status = blockers.length
    ? 'blocked'
    : warnings.length
      ? 'attention'
      : 'ready'

  return {
    readinessVersion: OTP_TEMPLATE_RUNTIME_ENFORCEMENT_VERSION,
    launchReadinessVersion: OTP_TEMPLATE_LAUNCH_READINESS_VERSION,
    status,
    action: action || 'preview',
    shouldBlockGeneration: blocksLaunch && blockers.length > 0,
    canGenerateWithoutFallback: blockers.length === 0 && !fallback,
    routeKey,
    routeLabel: resolvedRouteLabel,
    templateResolutionSource: templateResolutionSource || null,
    selectedTemplateId: normalizeText(template?.id) || null,
    selectedTemplateKey: normalizeText(template?.template_key || template?.key) || null,
    selectedTemplateLabel: selectedTemplateLabel || null,
    blockerCodes: blockers.map((issue) => normalizeText(issue.code)).filter(Boolean),
    warningCodes: warnings.map((issue) => normalizeText(issue.code)).filter(Boolean),
    blockers,
    warnings,
    blockerMessages: blockers.map(formatOtpTemplateLaunchReadinessIssue),
    warningMessages: warnings.map(formatOtpTemplateLaunchReadinessIssue),
  }
}
