import {
  buildOtpContentPublishGateReport,
} from './otpContentPublishGate.js'
import {
  buildOtpTemplateLaunchReadiness,
} from './otpTemplateLaunchReadiness.js'

export const OTP_TEMPLATE_LIVE_AUDIT_VERSION = 'otp_template_live_audit_phase9_v1'
export const OTP_TEMPLATE_CORRECTIVE_MIGRATION_PLAN_VERSION = 'otp_template_corrective_migration_plan_phase9_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeStatus(value = '') {
  return normalizeText(value).toLowerCase()
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

function isLiveTemplate(template = {}) {
  const metadata = templateMetadata(template)
  const status = normalizeStatus(template.status || template.template_status || template.templateStatus || metadata.template_status || metadata.lifecycle_status)
  if (['published', 'active', 'approved', 'live'].includes(status)) return true
  if (['draft', 'archived', 'deprecated', 'superseded'].includes(status)) return false
  return Boolean(template.is_active || template.isActive || template.is_default || template.isDefault)
}

function isOtpTemplate(template = {}) {
  const metadata = templateMetadata(template)
  return normalizeStatus(template.packet_type || template.packetType || metadata.packet_type || metadata.packetType) === 'otp'
}

function attachSections(template = {}, sectionsByTemplateId = {}) {
  if (Array.isArray(template.sections)) return template
  const id = templateId(template)
  const sections = sectionsByTemplateId instanceof Map
    ? sectionsByTemplateId.get(id)
    : sectionsByTemplateId[id]
  return Array.isArray(sections) ? { ...template, sections } : template
}

function compactIssue(issue = {}) {
  return {
    code: normalizeText(issue.code),
    severity: normalizeText(issue.severity) || 'blocking',
    routeKey: normalizeText(issue.routeKey),
    routeLabel: normalizeText(issue.routeLabel),
    templateId: normalizeText(issue.templateId),
    templateLabel: normalizeText(issue.templateLabel),
    sectionKey: normalizeText(issue.sectionKey),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  }
}

function addAction(actions, action = {}) {
  const key = [
    action.code,
    action.templateId,
    action.routeKey,
    action.sectionKey,
    action.message,
  ].map((item) => normalizeText(item)).join('|')
  if (actions.some((item) => [
    item.code,
    item.templateId,
    item.routeKey,
    item.sectionKey,
    item.message,
  ].map((value) => normalizeText(value)).join('|') === key)) return
  actions.push(action)
}

function findUniversalRouteSpecificSections(template = {}) {
  const metadata = templateMetadata(template)
  const explicitRoute = normalizeText(
    metadata.otp_document_variant ||
      metadata.otpDocumentVariant ||
      metadata.document_variant ||
      metadata.documentVariant,
  )
  if (explicitRoute) return []
  const sections = Array.isArray(template.sections) ? template.sections : []
  const resaleGate = buildOtpContentPublishGateReport({
    ...template,
    packet_type: 'otp',
    metadata_json: {
      ...metadata,
      otp_document_variant: 'resale_existing_property',
    },
    sections,
  }, {
    packetType: 'otp',
    routeKey: 'resale_existing_property',
  })
  const developmentGate = buildOtpContentPublishGateReport({
    ...template,
    packet_type: 'otp',
    metadata_json: {
      ...metadata,
      otp_document_variant: 'new_development',
    },
    sections,
  }, {
    packetType: 'otp',
    routeKey: 'new_development',
  })

  return [
    ...resaleGate.blockers,
    ...developmentGate.blockers,
  ]
    .filter((issue) => issue.code === 'OTP_FORBIDDEN_ROUTE_SIGNAL')
    .map(compactIssue)
}

export function buildOtpTemplateLiveAudit({
  templates = [],
  sectionsByTemplateId = {},
  checkedAt = new Date().toISOString(),
} = {}) {
  const hydratedTemplates = (Array.isArray(templates) ? templates : [])
    .filter(isOtpTemplate)
    .map((template) => attachSections(template, sectionsByTemplateId))
  const liveTemplates = hydratedTemplates.filter(isLiveTemplate)
  const launchReadiness = buildOtpTemplateLaunchReadiness(hydratedTemplates)
  const actions = []
  const baselineTemplates = liveTemplates.filter((template) => normalizeText(template.template_key || template.templateKey) === 'otp_default_v1')
  const universalRouteSpecificIssues = liveTemplates.flatMap((template) =>
    findUniversalRouteSpecificSections(template).map((issue) => ({
      ...issue,
      templateId: templateId(template),
      templateLabel: templateLabel(template),
    })),
  )

  for (const issue of launchReadiness.blockers || []) {
    addAction(actions, {
      priority: 'blocker',
      ...compactIssue(issue),
    })
  }
  for (const issue of universalRouteSpecificIssues) {
    addAction(actions, {
      priority: 'blocker',
      code: 'OTP_LIVE_UNIVERSAL_ROUTE_SPECIFIC_WORDING',
      ...issue,
      message: `${issue.templateLabel} is a universal OTP template carrying route-specific wording.`,
      remediation: 'Split resale and new-development wording into first-class route templates before migrating live content.',
    })
  }

  const blockerCount = actions.filter((action) => action.priority === 'blocker').length
  const warningCount = (launchReadiness.warnings || []).length

  return {
    auditVersion: OTP_TEMPLATE_LIVE_AUDIT_VERSION,
    checkedAt,
    mutatedData: false,
    auditCompleted: true,
    status: blockerCount ? 'OTP_LIVE_AUDIT_REMEDIATION_REQUIRED' : 'OTP_LIVE_AUDIT_READY_FOR_RUNTIME_LOCK',
    summary: {
      otpTemplateCount: hydratedTemplates.length,
      liveTemplateCount: liveTemplates.length,
      baselineDefaultCount: baselineTemplates.length,
      routeCount: launchReadiness.summary.requiredRouteCount,
      readyRouteCount: launchReadiness.summary.readyRouteCount,
      blockerCount,
      warningCount,
      universalRouteSpecificIssueCount: universalRouteSpecificIssues.length,
      blankRenderRiskCount: launchReadiness.summary.blankRenderRiskCount,
      staleScanCount: launchReadiness.summary.staleScanCount,
      unsafeFallbackCount: launchReadiness.summary.unsafeFallbackCount,
      sourceOwnerGapCount: launchReadiness.summary.sourceOwnerGapCount,
    },
    baselineTemplates: baselineTemplates.map((template) => ({
      id: templateId(template),
      label: templateLabel(template),
      status: normalizeText(template.status || template.template_status || templateMetadata(template).lifecycle_status),
      sectionCount: Array.isArray(template.sections) ? template.sections.length : null,
    })),
    launchReadiness,
    universalRouteSpecificIssues,
    actions,
  }
}

export function buildOtpTemplateCorrectiveMigrationPlan(audit = null) {
  if (!audit?.auditCompleted || audit?.auditVersion !== OTP_TEMPLATE_LIVE_AUDIT_VERSION) {
    return {
      planVersion: OTP_TEMPLATE_CORRECTIVE_MIGRATION_PLAN_VERSION,
      status: 'OTP_CORRECTIVE_MIGRATION_BLOCKED_AUDIT_REQUIRED',
      mutatedData: false,
      canApply: false,
      blockers: [{
        code: 'OTP_LIVE_AUDIT_REQUIRED',
        message: 'Run the live OTP template audit before preparing a corrective migration.',
        remediation: 'Execute the read-only OTP live audit and bind the migration plan to that audit output.',
      }],
      steps: [],
    }
  }

  const correctiveIssues = [
    ...(audit.universalRouteSpecificIssues || []),
    ...(audit.actions || []).filter((action) => [
      'OTP_LAUNCH_BLANK_RENDER_RISK',
      'OTP_LAUNCH_SOURCE_OWNER_MISSING',
      'OTP_LIVE_UNIVERSAL_ROUTE_SPECIFIC_WORDING',
    ].includes(action.code)),
  ]
  const uniqueIssues = Array.from(new Map(correctiveIssues.map((issue) => [
    [issue.code, issue.templateId, issue.sectionKey, issue.routeKey].map(normalizeText).join('|'),
    issue,
  ])).values())

  if (!uniqueIssues.length) {
    return {
      planVersion: OTP_TEMPLATE_CORRECTIVE_MIGRATION_PLAN_VERSION,
      auditVersion: audit.auditVersion,
      auditCheckedAt: audit.checkedAt,
      status: 'OTP_CORRECTIVE_MIGRATION_NOT_REQUIRED',
      mutatedData: false,
      canApply: false,
      blockers: [],
      steps: [],
    }
  }

  const steps = uniqueIssues.map((issue, index) => ({
    order: index + 1,
    code: issue.code,
    templateId: normalizeText(issue.templateId),
    templateLabel: normalizeText(issue.templateLabel),
    sectionKey: normalizeText(issue.sectionKey),
    routeKey: normalizeText(issue.routeKey),
    action: issue.code === 'OTP_LAUNCH_SOURCE_OWNER_MISSING'
      ? 'Backfill missing OTP section source-owner metadata from the Phase 4 field registry.'
      : issue.code === 'OTP_LAUNCH_BLANK_RENDER_RISK'
        ? 'Regenerate blank-safe native section metadata and persist render validation.'
        : 'Move route-specific wording out of the universal OTP default into route-specific templates.',
    requiresApproval: true,
  }))

  return {
    planVersion: OTP_TEMPLATE_CORRECTIVE_MIGRATION_PLAN_VERSION,
    auditVersion: audit.auditVersion,
    auditCheckedAt: audit.checkedAt,
    status: 'OTP_CORRECTIVE_MIGRATION_READY_FOR_DRY_RUN',
    mutatedData: false,
    canApply: false,
    blockers: [],
    steps,
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpTemplateLiveAuditMarkdown(audit = buildOtpTemplateLiveAudit()) {
  return [
    '# OTP Template vNext Phase 9 Runtime Enforcement, Live Audit, And Migration',
    '',
    `Generated: ${audit.checkedAt}`,
    `Version: ${audit.auditVersion}`,
    `Status: ${audit.status}`,
    `Mutated data: ${audit.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['OTP templates', audit.summary.otpTemplateCount],
        ['Live templates', audit.summary.liveTemplateCount],
        ['Baseline defaults', audit.summary.baselineDefaultCount],
        ['Ready routes', `${audit.summary.readyRouteCount}/${audit.summary.routeCount}`],
        ['Blockers', audit.summary.blockerCount],
        ['Unsafe fallback', audit.summary.unsafeFallbackCount],
        ['Blank-render risk', audit.summary.blankRenderRiskCount],
        ['Source-owner gaps', audit.summary.sourceOwnerGapCount],
      ],
    ),
    '',
    '## Actions',
    '',
    audit.actions.length
      ? table(['Code', 'Template', 'Route', 'Section', 'Message'], audit.actions.map((action) => [
          action.code,
          action.templateLabel,
          action.routeKey,
          action.sectionKey,
          action.message,
        ]))
      : 'No actions.',
    '',
    '## Boundary',
    '',
    'Phase 9 live audit is read-only. Corrective migration planning is blocked unless it is bound to a completed live audit output.',
    '',
  ].join('\n')
}
