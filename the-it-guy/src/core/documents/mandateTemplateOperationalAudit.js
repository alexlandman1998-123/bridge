import {
  MANDATE_TEMPLATE_CONTENT_RULE_VERSION,
  listMandateTemplateContentRules,
} from './mandateTemplateContentRules.js'
import {
  MANDATE_TEMPLATE_PUBLISH_GATE_VERSION,
  buildMandateTemplatePublishGateReport,
  formatMandateTemplatePublishGateIssue,
} from './mandateTemplatePublishGate.js'
import {
  normalizeMandateTemplateVariant,
} from './mandateTemplateRouting.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cloneList(value = []) {
  return Array.isArray(value) ? [...value] : []
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
  return normalizeText(template.template_label || template.templateLabel || template.label || template.template_key || template.templateKey || 'Untitled mandate template')
}

function normalizeStatus(value = '') {
  return normalizeText(value).toLowerCase()
}

function isMandateTemplate(template = {}) {
  return normalizeStatus(template.packet_type || template.packetType || templateMetadata(template).packet_type || templateMetadata(template).packetType) === 'mandate'
}

function isLiveTemplate(template = {}) {
  const status = normalizeStatus(template.status || template.template_status || templateMetadata(template).template_status || templateMetadata(template).lifecycle_status)
  if (['published', 'active', 'approved', 'live'].includes(status)) return true
  if (['draft', 'archived', 'deprecated', 'superseded'].includes(status)) return false
  return Boolean(template.is_active || template.isActive || template.is_default || template.isDefault)
}

function isDraftTemplate(template = {}) {
  if (isLiveTemplate(template)) return false
  const status = normalizeStatus(template.status || template.template_status || templateMetadata(template).template_status || templateMetadata(template).lifecycle_status)
  return !status || ['draft', 'in_review', 'review'].includes(status)
}

function resolveTemplateRouteKey(template = {}) {
  const metadata = templateMetadata(template)
  return normalizeMandateTemplateVariant(
    template.mandateTemplateVariant ||
      template.mandate_template_variant ||
      metadata.mandate_template_variant ||
      metadata.mandateTemplateVariant ||
      metadata.template_variant ||
      metadata.templateVariant ||
      '',
  ) || 'default'
}

function resolvePersistedContentScan(template = {}) {
  const metadata = templateMetadata(template)
  return asRecord(
    metadata.last_mandate_content_scan ||
      metadata.lastMandateContentScan ||
      metadata.mandate_content_publish_scan ||
      template.last_mandate_content_scan ||
      template.lastMandateContentScan,
  )
}

function persistedScanIsCurrent(scan = {}) {
  return normalizeText(scan.gateVersion) === MANDATE_TEMPLATE_PUBLISH_GATE_VERSION &&
    normalizeText(scan.ruleVersion) === MANDATE_TEMPLATE_CONTENT_RULE_VERSION
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
    code: normalizeText(issue.code) || 'MANDATE_TEMPLATE_CONTENT_ISSUE',
    routeKey: normalizeText(issue.routeKey) || routeKey,
    routeLabel: normalizeText(issue.routeLabel),
    signalGroupKey: normalizeText(issue.signalGroupKey),
    signalGroupLabel: normalizeText(issue.signalGroupLabel),
    sectionKey: normalizeText(issue.sectionKey),
    sectionLabel: normalizeText(issue.sectionLabel),
    conditionalPackKey: normalizeText(issue.conditionalPackKey),
    message,
    remediation,
    summary: message && remediation ? `${message} ${remediation}` : message || remediation,
  }
}

function addAction(actions, action = {}) {
  const key = [
    action.code,
    action.routeKey,
    action.templateId,
    action.message,
  ].map((item) => normalizeText(item)).join('|')
  if (actions.some((item) => [
    item.code,
    item.routeKey,
    item.templateId,
    item.message,
  ].map((value) => normalizeText(value)).join('|') === key)) return
  actions.push(action)
}

export const MANDATE_TEMPLATE_OPERATIONAL_AUDIT_VERSION = 'mandate_template_operational_audit_v1'

export function buildMandateTemplateAuditTemplateRow(template = {}, options = {}) {
  const routeKey = normalizeMandateTemplateVariant(options.routeKey || resolveTemplateRouteKey(template)) || 'default'
  const hasLoadedSections = Array.isArray(template.sections)
  const live = isLiveTemplate(template)
  const persistedScan = resolvePersistedContentScan(template)
  let gate = null
  let scanSource = 'none'
  let blockers = []
  let warnings = []
  let scanCurrent = false
  let validForGeneration = false

  if (hasLoadedSections) {
    gate = buildMandateTemplatePublishGateReport({
      ...template,
      packet_type: 'mandate',
      packetType: 'mandate',
    }, {
      packetType: 'mandate',
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
    live,
    draft: isDraftTemplate(template),
    status,
    validForGeneration,
    scanSource,
    scanCurrent,
    hasLoadedSections,
    blockingCount: blockers.length,
    warningCount,
    blockers,
    warnings,
    blockerMessages: blockers.map((issue) => issue.summary || formatMandateTemplatePublishGateIssue(issue)),
    warningMessages: warnings.map((issue) => issue.summary || formatMandateTemplatePublishGateIssue(issue)),
    persistedScan: Object.keys(persistedScan).length ? persistedScan : null,
    gate,
  }
}

function buildRouteAuditRow(route = {}, templateRows = []) {
  const routeTemplates = templateRows.filter((row) => row.routeKey === route.key)
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

export function buildMandateTemplateOperationalAudit(templates = [], options = {}) {
  const rules = listMandateTemplateContentRules()
  const includeDefaultRoute = options.includeDefaultRoute !== false
  const routeRules = includeDefaultRoute ? rules : rules.filter((rule) => rule.key !== 'default')
  const mandateTemplates = (Array.isArray(templates) ? templates : []).filter(isMandateTemplate)
  const templateRows = mandateTemplates.map((template) => buildMandateTemplateAuditTemplateRow(template))
  const routeRows = routeRules.map((route) => buildRouteAuditRow(route, templateRows))
  const actions = []

  for (const row of templateRows) {
    if (row.live && row.blockingCount) {
      addAction(actions, {
        priority: 'blocker',
        code: 'FIX_LIVE_TEMPLATE_CONTENT',
        routeKey: row.routeKey,
        templateId: row.templateId,
        templateLabel: row.templateLabel,
        message: `${row.templateLabel} is live but fails the mandate content gate.`,
        remediation: row.blockerMessages[0] || 'Open the template, fix the route wording, and republish.',
      })
    }
    if (row.live && row.status === 'unverified') {
      addAction(actions, {
        priority: 'warning',
        code: 'SCAN_LEGACY_LIVE_TEMPLATE',
        routeKey: row.routeKey,
        templateId: row.templateId,
        templateLabel: row.templateLabel,
        message: `${row.templateLabel} is live but has no persisted mandate content scan.`,
        remediation: 'Open the template and publish it through the mandate content gate so the scan is stored.',
      })
    }
    if (row.live && row.status === 'stale_scan') {
      addAction(actions, {
        priority: 'warning',
        code: 'REFRESH_STALE_TEMPLATE_SCAN',
        routeKey: row.routeKey,
        templateId: row.templateId,
        templateLabel: row.templateLabel,
        message: `${row.templateLabel} has a stale mandate content scan.`,
        remediation: 'Re-run the publish review so the latest scanner and rule versions are stored.',
      })
    }
  }

  for (const route of routeRows.filter((row) => row.routeKey !== 'default')) {
    if (route.status === 'missing') {
      addAction(actions, {
        priority: 'warning',
        code: 'CREATE_MISSING_ROUTE_TEMPLATE',
        routeKey: route.routeKey,
        templateId: '',
        templateLabel: '',
        message: `${route.routeLabel} has no mandate template yet.`,
        remediation: 'Create the missing route template from the mandate variant pack.',
      })
    } else if (route.status === 'draft_only') {
      addAction(actions, {
        priority: 'warning',
        code: 'PUBLISH_DRAFT_ROUTE_TEMPLATE',
        routeKey: route.routeKey,
        templateId: route.preferredTemplate?.templateId || '',
        templateLabel: route.preferredTemplate?.templateLabel || '',
        message: `${route.routeLabel} only has draft mandate templates.`,
        remediation: 'Review the draft wording, run the content gate, and publish the route.',
      })
    } else if (route.status === 'live_blocked' || route.status === 'live_unverified') {
      addAction(actions, {
        priority: route.status === 'live_blocked' ? 'blocker' : 'warning',
        code: route.status === 'live_blocked' ? 'ROUTE_LIVE_TEMPLATE_BLOCKED' : 'ROUTE_LIVE_TEMPLATE_UNVERIFIED',
        routeKey: route.routeKey,
        templateId: route.preferredTemplate?.templateId || '',
        templateLabel: route.preferredTemplate?.templateLabel || '',
        message: `${route.routeLabel} has no verified live mandate template.`,
        remediation: 'Fix or republish the route template before relying on this route.',
      })
    }
  }

  const blockedLiveTemplateCount = templateRows.filter((row) => row.live && row.blockingCount).length
  const unverifiedLiveTemplateCount = templateRows.filter((row) => row.live && (row.status === 'unverified' || row.status === 'stale_scan')).length
  const missingRouteCount = routeRows.filter((row) => row.routeKey !== 'default' && row.status === 'missing').length
  const draftOnlyRouteCount = routeRows.filter((row) => row.routeKey !== 'default' && row.status === 'draft_only').length
  const warningCount = unverifiedLiveTemplateCount + missingRouteCount + draftOnlyRouteCount + templateRows.reduce((total, row) => total + row.warnings.length, 0)
  const status = blockedLiveTemplateCount
    ? 'blocked'
    : warningCount
      ? 'attention'
      : 'ready'

  return {
    auditVersion: MANDATE_TEMPLATE_OPERATIONAL_AUDIT_VERSION,
    gateVersion: MANDATE_TEMPLATE_PUBLISH_GATE_VERSION,
    ruleVersion: MANDATE_TEMPLATE_CONTENT_RULE_VERSION,
    status,
    summary: {
      totalTemplates: Array.isArray(templates) ? templates.length : 0,
      mandateTemplateCount: templateRows.length,
      liveTemplateCount: templateRows.filter((row) => row.live).length,
      verifiedLiveTemplateCount: templateRows.filter((row) => row.live && row.validForGeneration).length,
      blockedLiveTemplateCount,
      unverifiedLiveTemplateCount,
      missingRouteCount,
      draftOnlyRouteCount,
      actionCount: actions.length,
      warningCount,
    },
    templateRows,
    routeRows,
    actions,
  }
}
