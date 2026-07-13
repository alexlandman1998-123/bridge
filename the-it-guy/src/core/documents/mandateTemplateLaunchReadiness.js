import {
  MANDATE_TEMPLATE_OPERATIONAL_AUDIT_VERSION,
  buildMandateTemplateOperationalAudit,
} from './mandateTemplateOperationalAudit.js'
import {
  listMandateTemplateContentRules,
} from './mandateTemplateContentRules.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function cloneList(value = []) {
  return Array.isArray(value) ? [...value] : []
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function addIssue(issues, issue = {}) {
  const key = [
    issue.code,
    issue.routeKey,
    issue.templateId,
    issue.message,
  ].map((item) => normalizeText(item)).join('|')
  if (issues.some((item) => [
    item.code,
    item.routeKey,
    item.templateId,
    item.message,
  ].map((value) => normalizeText(value)).join('|') === key)) return
  issues.push(issue)
}

function issueFromRoute(route = {}, code = '', message = '', remediation = '') {
  return {
    severity: 'blocking',
    code,
    routeKey: normalizeText(route.routeKey),
    routeLabel: normalizeText(route.routeLabel),
    templateId: normalizeText(route.preferredTemplate?.templateId),
    templateLabel: normalizeText(route.preferredTemplate?.templateLabel),
    message,
    remediation,
  }
}

function issueFromTemplate(row = {}, code = '', message = '', remediation = '') {
  return {
    severity: 'blocking',
    code,
    routeKey: normalizeText(row.routeKey),
    routeLabel: normalizeText(row.gate?.routeLabel),
    templateId: normalizeText(row.templateId),
    templateLabel: normalizeText(row.templateLabel),
    message,
    remediation,
  }
}

function warningFromTemplate(row = {}) {
  return {
    severity: 'warning',
    code: 'MANDATE_LAUNCH_LIVE_TEMPLATE_WARNINGS',
    routeKey: normalizeText(row.routeKey),
    routeLabel: normalizeText(row.gate?.routeLabel),
    templateId: normalizeText(row.templateId),
    templateLabel: normalizeText(row.templateLabel),
    message: `${row.templateLabel} is live and verified, but still has mandate content warnings.`,
    remediation: row.warningMessages?.[0] || 'Review the route warnings before launch sign-off.',
  }
}

function formatRouteLabel(value = '') {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function isAuditReport(value = {}) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray(value.templateRows) &&
      Array.isArray(value.routeRows) &&
      value.summary,
  )
}

function runtimeActionBlocksLaunch(value = '') {
  return ['generate', 'upload_signed', 'finalise', 'finalize'].includes(normalizeText(value).toLowerCase())
}

function resolveRuntimeRouteKey(validation = {}, templateResolution = null) {
  const routing = templateResolution?.mandateTemplateRouting || {}
  return normalizeText(
    validation?.mandateTemplateVariant ||
      validation?.placeholders?.mandate_template_variant ||
      routing?.mandateTemplateVariant ||
      templateResolution?.mandateScenarioProfile?.templateVariant ||
      '',
  )
}

function buildRuntimeLaunchIssue({
  severity = 'blocking',
  code = '',
  routeKey = '',
  routeLabel = '',
  template = null,
  templateResolution = null,
  message = '',
  remediation = '',
} = {}) {
  return {
    severity,
    code,
    routeKey: normalizeText(routeKey),
    routeLabel: normalizeText(routeLabel),
    templateId: normalizeText(template?.id),
    templateKey: normalizeText(template?.template_key || template?.key),
    templateLabel: normalizeText(template?.template_label || template?.label),
    templateResolutionSource: normalizeText(templateResolution?.source),
    message,
    remediation,
  }
}

export const MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION = 'mandate_template_launch_readiness_v1'

export function formatMandateTemplateLaunchReadinessIssue(issue = {}) {
  const message = normalizeText(issue.message)
  const remediation = normalizeText(issue.remediation)
  if (!message) return remediation || 'Mandate template launch readiness needs review.'
  if (!remediation || message.toLowerCase().includes(remediation.toLowerCase())) return message
  return `${message} ${remediation}`
}

export function buildMandateTemplateLaunchReadiness(input = [], options = {}) {
  const includeDefaultRoute = options.includeDefaultRoute !== false
  const audit = isAuditReport(input)
    ? input
    : buildMandateTemplateOperationalAudit(input, { includeDefaultRoute })
  const requiredRouteRules = listMandateTemplateContentRules()
    .filter((rule) => includeDefaultRoute || rule.key !== 'default')
  const routeRowsByKey = new Map(cloneList(audit.routeRows).map((row) => [row.routeKey, row]))
  const blockers = []
  const warnings = []
  const routeRows = []

  for (const rule of requiredRouteRules) {
    const route = routeRowsByKey.get(rule.key) || {
      routeKey: rule.key,
      routeLabel: rule.label,
      status: 'missing',
      templateCount: 0,
      liveCount: 0,
      safeLiveCount: 0,
      blockedLiveCount: 0,
      unverifiedLiveCount: 0,
      draftCount: 0,
      preferredTemplate: null,
    }
    const safeLiveCount = numberValue(route.safeLiveCount)
    const blockedLiveCount = numberValue(route.blockedLiveCount)
    const unverifiedLiveCount = numberValue(route.unverifiedLiveCount)
    const liveCount = numberValue(route.liveCount)
    const draftCount = numberValue(route.draftCount)
    let launchStatus = 'ready'
    let launchReason = 'Verified live mandate template is available.'

    if (route.status === 'missing' || (!liveCount && !draftCount && !safeLiveCount)) {
      launchStatus = 'blocked'
      launchReason = 'No mandate template exists for this route.'
      addIssue(
        blockers,
        issueFromRoute(
          route,
          'MANDATE_LAUNCH_ROUTE_MISSING',
          `${route.routeLabel} has no mandate template.`,
          'Create the route template, run the mandate content gate, and publish it before launch.',
        ),
      )
    } else if (route.status === 'draft_only' || (!liveCount && draftCount)) {
      launchStatus = 'blocked'
      launchReason = 'Only draft mandate templates exist for this route.'
      addIssue(
        blockers,
        issueFromRoute(
          route,
          'MANDATE_LAUNCH_ROUTE_DRAFT_ONLY',
          `${route.routeLabel} has no live mandate template.`,
          'Publish a verified route template before enabling live mandate automation.',
        ),
      )
    } else if (route.status === 'live_blocked' || blockedLiveCount) {
      launchStatus = 'blocked'
      launchReason = 'At least one live mandate template fails the content gate.'
      addIssue(
        blockers,
        issueFromRoute(
          route,
          'MANDATE_LAUNCH_ROUTE_BLOCKED',
          `${route.routeLabel} has a blocked live mandate template.`,
          'Fix or archive blocked live templates before enabling this route.',
        ),
      )
    } else if (route.status === 'live_unverified' || unverifiedLiveCount || !safeLiveCount) {
      launchStatus = 'blocked'
      launchReason = 'No verified live mandate template is available for this route.'
      addIssue(
        blockers,
        issueFromRoute(
          route,
          'MANDATE_LAUNCH_ROUTE_UNVERIFIED',
          `${route.routeLabel} has no verified live mandate template.`,
          'Open the route template and publish it through the latest mandate content gate.',
        ),
      )
    }

    routeRows.push({
      ...route,
      required: true,
      launchStatus,
      launchReason,
    })
  }

  for (const row of cloneList(audit.templateRows)) {
    if (!row.live) continue
    if (row.blockingCount) {
      addIssue(
        blockers,
        issueFromTemplate(
          row,
          'MANDATE_LAUNCH_LIVE_TEMPLATE_BLOCKED',
          `${row.templateLabel} is live but blocked by the mandate content gate.`,
          row.blockerMessages?.[0] || 'Fix the wording or archive the unsafe live template.',
        ),
      )
      continue
    }
    if (row.status === 'stale_scan') {
      addIssue(
        blockers,
        issueFromTemplate(
          row,
          'MANDATE_LAUNCH_LIVE_TEMPLATE_STALE_SCAN',
          `${row.templateLabel} is live but its mandate content scan is stale.`,
          'Re-run publish review so the latest scanner and rule versions are stored.',
        ),
      )
      continue
    }
    if (row.status === 'unverified') {
      addIssue(
        blockers,
        issueFromTemplate(
          row,
          'MANDATE_LAUNCH_LIVE_TEMPLATE_UNVERIFIED',
          `${row.templateLabel} is live but has no mandate content scan.`,
          'Republish the template through the mandate content gate before live automation.',
        ),
      )
      continue
    }
    if (!row.validForGeneration) {
      addIssue(
        blockers,
        issueFromTemplate(
          row,
          'MANDATE_LAUNCH_LIVE_TEMPLATE_UNKNOWN',
          `${row.templateLabel} is live but is not verified for mandate generation.`,
          'Review the route, run the content gate, and republish the template.',
        ),
      )
      continue
    }
    if (numberValue(row.warningCount)) addIssue(warnings, warningFromTemplate(row))
  }

  const readyRouteCount = routeRows.filter((row) => row.launchStatus === 'ready').length
  const blockedRouteCount = routeRows.length - readyRouteCount
  const warningPolicyBlocks = options.warningPolicy === 'block' && warnings.length > 0
  const status = blockers.length || warningPolicyBlocks
    ? 'blocked'
    : warnings.length
      ? 'attention'
      : 'ready'

  return {
    readinessVersion: MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION,
    auditVersion: audit.auditVersion || MANDATE_TEMPLATE_OPERATIONAL_AUDIT_VERSION,
    gateVersion: audit.gateVersion,
    ruleVersion: audit.ruleVersion,
    status,
    canEnableMandateAutomation: status !== 'blocked',
    canGenerateWithoutFallback: blockers.length === 0,
    summary: {
      requiredRouteCount: routeRows.length,
      readyRouteCount,
      blockedRouteCount,
      liveTemplateCount: numberValue(audit.summary?.liveTemplateCount),
      verifiedLiveTemplateCount: numberValue(audit.summary?.verifiedLiveTemplateCount),
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    blockers,
    warnings,
    blockerMessages: blockers.map(formatMandateTemplateLaunchReadinessIssue),
    warningMessages: warnings.map(formatMandateTemplateLaunchReadinessIssue),
    routeRows,
    audit,
  }
}

export function buildMandateTemplateRuntimeLaunchReadiness(validation = {}, templateResolution = null, options = {}) {
  const packetType = normalizeText(validation?.packetType || templateResolution?.packetType).toLowerCase()
  if (packetType !== 'mandate') return null

  const action = normalizeText(options.action || validation?.validationAction || 'preview').toLowerCase()
  const blocksLaunch = runtimeActionBlocksLaunch(action)
  const routeKey = resolveRuntimeRouteKey(validation, templateResolution)
  const routeLabel = formatRouteLabel(routeKey || 'default')
  const template = templateResolution?.template || null
  const templateResolutionSource = normalizeText(templateResolution?.source || validation?.templateResolutionSource)
  const selectedTemplateLabel = normalizeText(template?.template_label || template?.label || template?.template_key || template?.key || 'the selected mandate template')
  const routeFallback = templateResolutionSource === 'mandate_scenario_fallback' && routeKey && routeKey !== 'default'
  const blockers = []
  const warnings = []

  if (!template?.id && blocksLaunch) {
    blockers.push(buildRuntimeLaunchIssue({
      code: 'MANDATE_LAUNCH_RUNTIME_TEMPLATE_MISSING',
      routeKey,
      routeLabel,
      template,
      templateResolution,
      message: `No live ${routeLabel} mandate template is available for generation.`,
      remediation: 'Create, scan, and publish a live mandate template for this route before generating the mandate.',
    }))
  }

  if (routeFallback) {
    const issue = buildRuntimeLaunchIssue({
      severity: blocksLaunch ? 'blocking' : 'warning',
      code: 'MANDATE_LAUNCH_RUNTIME_ROUTE_FALLBACK',
      routeKey,
      routeLabel,
      template,
      templateResolution,
      message: `No verified live ${routeLabel} mandate template is routable, so ${selectedTemplateLabel} would be used instead.`,
      remediation: 'Publish the route-specific mandate template before generating a final mandate for this seller/property situation.',
    })
    if (blocksLaunch) blockers.push(issue)
    else warnings.push(issue)
  }

  const status = blockers.length
    ? 'blocked'
    : warnings.length
      ? 'attention'
      : 'ready'

  return {
    readinessVersion: MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION,
    status,
    action: action || 'preview',
    shouldBlockGeneration: blocksLaunch && blockers.length > 0,
    canGenerateWithoutFallback: blockers.length === 0 && !routeFallback,
    routeKey: routeKey || 'default',
    routeLabel,
    templateResolutionSource: templateResolutionSource || null,
    selectedTemplateId: normalizeText(template?.id) || null,
    selectedTemplateKey: normalizeText(template?.template_key || template?.key) || null,
    selectedTemplateLabel: selectedTemplateLabel || null,
    blockers,
    warnings,
    blockerMessages: blockers.map(formatMandateTemplateLaunchReadinessIssue),
    warningMessages: warnings.map(formatMandateTemplateLaunchReadinessIssue),
  }
}
