import { resolveLegalDocumentScenarioProfile } from './legalDocumentScenarioProfile.js'
import {
  buildLegalDocumentTemplateRoutingAudit,
  scoreLegalDocumentTemplateCandidate,
} from './legalDocumentTemplateRouting.js'
import {
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'
import {
  OTP_TRANSITION_TEMPLATE_KEY,
} from './otpTemplateTargetFreeze.js'
import {
  buildOtpTemplateShellTarget,
  listOtpTemplateShellTargets,
} from './otpTemplateShellTarget.js'

export const OTP_TEMPLATE_ROUTE_SPLIT_VERSION = 'otp_template_route_split_phase2_v1'

export const OTP_TEMPLATE_ROUTE_SPLIT_STATUS_READY = 'OTP_TEMPLATE_ROUTE_SPLIT_READY_FOR_RUNTIME_WIRING'

export const OTP_ROUTE_SPLIT_SIGNAL_PATHS = Object.freeze({
  explicitRoute: Object.freeze([
    'otp_document_variant',
    'otpDocumentVariant',
    'document_variant',
    'documentVariant',
    'invite.otp_document_variant',
    'invite.otpDocumentVariant',
    'listing.otp_document_variant',
    'listing.otpDocumentVariant',
    'transaction_type',
    'transactionType',
    'sale_type',
    'saleType',
    'property.transaction_type',
    'property.transactionType',
    'listing.transaction_type',
    'listing.transactionType',
    'canonicalFacts.transaction.transaction_type',
    'canonical_facts.transaction.transaction_type',
  ]),
  developmentFlag: Object.freeze([
    'is_new_development',
    'isNewDevelopment',
  ]),
  developmentIdentity: Object.freeze([
    'development_id',
    'developmentId',
    'development.id',
    'listing.development_id',
    'listing.developmentId',
    'property.development_id',
    'property.developmentId',
    'unit.development_id',
    'unit.developmentId',
  ]),
  developmentPropertyTitle: Object.freeze([
    'property_title_type',
    'property.title_type',
    'propertyTitle',
    'propertyTitleType',
  ]),
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readPath(source = {}, path = '') {
  const key = normalizeText(path)
  if (!key) return undefined
  if (Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  if (!key.includes('.')) return undefined
  return key.split('.').reduce((current, part) => (
    current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)
      ? current[part]
      : undefined
  ), source)
}

function firstValueWithPath(sources = [], paths = []) {
  for (const path of paths) {
    for (const source of sources) {
      const value = readPath(asRecord(source), path)
      if (value !== null && value !== undefined && normalizeText(value) !== '') {
        return { value, path }
      }
    }
  }
  return { value: '', path: '' }
}

function hasTruthySignal(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', 'y', '1', 'development', 'development_sale', 'new_development', 'off_plan', 'developer_sale'].includes(normalized)
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || normalizeText(routeKey).replace(/_/g, ' ')
}

function sourceRecords(options = {}) {
  return [
    options.placeholders,
    options.transaction,
    options.property,
    options.development,
    options.flow,
    options.facts,
    options.sourceContext,
    options.context,
    options,
  ].filter(Boolean)
}

export function resolveOtpRouteSplitSignal(options = {}) {
  const sources = sourceRecords(options)
  const explicit = firstValueWithPath(sources, OTP_ROUTE_SPLIT_SIGNAL_PATHS.explicitRoute)
  const explicitRouteKey = normalizeOtpDocumentVariant(explicit.value)

  const developmentSignals = []
  const developmentFlag = firstValueWithPath(sources, OTP_ROUTE_SPLIT_SIGNAL_PATHS.developmentFlag)
  if (hasTruthySignal(developmentFlag.value)) {
    developmentSignals.push({
      type: 'development_flag',
      path: developmentFlag.path,
      value: developmentFlag.value,
    })
  }

  const developmentIdentity = firstValueWithPath(sources, OTP_ROUTE_SPLIT_SIGNAL_PATHS.developmentIdentity)
  if (normalizeText(developmentIdentity.value)) {
    developmentSignals.push({
      type: 'development_identity',
      path: developmentIdentity.path,
      value: developmentIdentity.value,
    })
  }

  const propertyTitle = firstValueWithPath(sources, OTP_ROUTE_SPLIT_SIGNAL_PATHS.developmentPropertyTitle)
  if (normalizeKey(propertyTitle.value) === 'new_development_unit') {
    developmentSignals.push({
      type: 'development_property_title',
      path: propertyTitle.path,
      value: propertyTitle.value,
    })
  }

  const inferredDevelopment = developmentSignals.length > 0
  const routeKey = explicitRouteKey || (inferredDevelopment ? 'new_development' : 'resale_existing_property')
  const source = explicitRouteKey
    ? 'explicit_route_signal'
    : inferredDevelopment
      ? 'inferred_new_development_signal'
      : 'default_resale_existing_property'
  const conflicts = explicitRouteKey === 'resale_existing_property' && inferredDevelopment
    ? [{
        code: 'OTP_ROUTE_SPLIT_CONFLICTING_DEVELOPMENT_SIGNALS',
        severity: 'blocking',
        explicitRouteKey,
        inferredRouteKey: 'new_development',
        message: 'The input explicitly asks for a resale OTP but also contains new-development signals.',
        remediation: 'Correct the transaction type or remove the development/unit signals before generation.',
        signals: developmentSignals,
      }]
    : []

  return {
    routeKey,
    routeLabel: routeLabel(routeKey),
    source,
    explicitRouteKey,
    explicitSignalPath: explicit.path,
    developmentSignals,
    conflicts,
  }
}

export function buildOtpTemplateRouteSplitDecision(options = {}) {
  const signal = resolveOtpRouteSplitSignal(options)
  const profile = resolveLegalDocumentScenarioProfile({
    ...options,
    packetType: 'otp',
    placeholders: {
      ...(asRecord(options.placeholders)),
      otp_document_variant: signal.routeKey,
    },
  })
  const target = buildOtpTemplateShellTarget({ routeKey: signal.routeKey })
  const blockers = [
    ...signal.conflicts,
    ...(!target
      ? [{
          code: 'OTP_ROUTE_SPLIT_TARGET_TEMPLATE_MISSING',
          severity: 'blocking',
          routeKey: signal.routeKey,
          message: `No Phase 1 shell target is available for ${signal.routeKey}.`,
          remediation: 'Create and freeze the route-specific OTP shell target before routing generation.',
        }]
      : []),
  ]

  return {
    version: OTP_TEMPLATE_ROUTE_SPLIT_VERSION,
    packetType: 'otp',
    status: blockers.length ? 'route_split_blocked' : 'route_split_ready',
    routeKey: signal.routeKey,
    routeLabel: signal.routeLabel,
    source: signal.source,
    explicitRouteKey: signal.explicitRouteKey,
    explicitSignalPath: signal.explicitSignalPath,
    developmentSignals: signal.developmentSignals,
    selectedTemplateKey: target?.targetTemplateKey || '',
    selectedTemplateLabel: target?.label || '',
    selectedTemplateRole: target?.defaultRole || '',
    transitionTemplateKey: OTP_TRANSITION_TEMPLATE_KEY,
    mayUseTransitionFallback: false,
    shellTarget: target
      ? {
          version: target.version,
          targetTemplateKey: target.targetTemplateKey,
          renderMode: target.renderMode,
          templateScope: target.templateScope,
          shellSlotCount: target.shellManifest.slots.length,
          contentSectionCount: target.contentSections.length,
        }
      : null,
    legalDocumentScenarioProfile: profile,
    legalDocumentTemplateRouting: buildLegalDocumentTemplateRoutingAudit(null, {
      profile,
    }),
    blockers,
  }
}

export function resolveOtpRouteSplitTemplateKey(options = {}) {
  return buildOtpTemplateRouteSplitDecision(options).selectedTemplateKey
}

function addCheck(checks, pass, code, detail, severity = 'blocking') {
  checks.push({
    code,
    pass: Boolean(pass),
    severity,
    detail,
  })
}

function routeTemplate(templateKey = '', routeKey = '') {
  return {
    id: templateKey,
    packet_type: 'otp',
    template_key: templateKey,
    template_label: routeLabel(routeKey),
    metadata_json: {
      packet_type: 'otp',
      otp_document_variant: routeKey,
    },
  }
}

export function buildOtpTemplateRouteSplitAudit({ checkedAt = new Date().toISOString() } = {}) {
  const targets = listOtpTemplateShellTargets()
  const decisions = [
    buildOtpTemplateRouteSplitDecision({
      label: 'Explicit resale',
      placeholders: { otp_document_variant: 'resale_existing_property' },
    }),
    buildOtpTemplateRouteSplitDecision({
      label: 'Explicit new development',
      placeholders: { otp_document_variant: 'new_development' },
    }),
    buildOtpTemplateRouteSplitDecision({
      label: 'Off-plan transaction',
      transaction: { transaction_type: 'off_plan' },
    }),
    buildOtpTemplateRouteSplitDecision({
      label: 'Development listing identity',
      property: { development_id: 'development-1' },
    }),
    buildOtpTemplateRouteSplitDecision({
      label: 'No route signal defaults to resale',
      transaction: {},
      property: {},
    }),
  ]
  const conflictDecision = buildOtpTemplateRouteSplitDecision({
    label: 'Conflicting explicit resale and development identity',
    placeholders: { otp_document_variant: 'resale_existing_property' },
    property: { development_id: 'development-1' },
  })
  const resaleProfile = decisions.find((decision) => decision.routeKey === 'resale_existing_property')?.legalDocumentScenarioProfile
  const developmentProfile = decisions.find((decision) => decision.routeKey === 'new_development')?.legalDocumentScenarioProfile
  const resaleTemplate = routeTemplate('otp_resale_existing_property_v1', 'resale_existing_property')
  const developmentTemplate = routeTemplate('otp_new_development_v1', 'new_development')
  const resaleAgainstDevelopment = scoreLegalDocumentTemplateCandidate(developmentTemplate, { scenarioProfile: resaleProfile })
  const developmentAgainstResale = scoreLegalDocumentTemplateCandidate(resaleTemplate, { scenarioProfile: developmentProfile })
  const checks = []

  addCheck(checks, targets.length === 2, 'PHASE2_ROUTE_TARGETS_AVAILABLE', 'Both Phase 1 target shells are available to the route splitter.')
  addCheck(checks, decisions.every((decision) => decision.selectedTemplateKey && decision.selectedTemplateKey !== OTP_TRANSITION_TEMPLATE_KEY), 'PHASE2_NO_TRANSITION_TEMPLATE_SELECTION', `${OTP_TRANSITION_TEMPLATE_KEY} is never selected by the route split.`)
  addCheck(checks, decisions.find((decision) => decision.source === 'default_resale_existing_property')?.selectedTemplateKey === 'otp_resale_existing_property_v1', 'PHASE2_DEFAULT_ROUTE_IS_RESALE', 'Missing route signals default to the normal existing-property resale OTP.')
  addCheck(checks, decisions.filter((decision) => decision.routeKey === 'new_development').every((decision) => decision.selectedTemplateKey === 'otp_new_development_v1'), 'PHASE2_DEVELOPMENT_SIGNALS_SELECT_DEVELOPMENT_TEMPLATE', 'Explicit and inferred development signals select the new-development OTP.')
  addCheck(checks, decisions.filter((decision) => decision.routeKey === 'resale_existing_property').every((decision) => decision.selectedTemplateKey === 'otp_resale_existing_property_v1'), 'PHASE2_RESALE_SIGNALS_SELECT_RESALE_TEMPLATE', 'Explicit resale and default normal-sale signals select the resale OTP.')
  addCheck(checks, conflictDecision.status === 'route_split_blocked' && conflictDecision.blockers.some((issue) => issue.code === 'OTP_ROUTE_SPLIT_CONFLICTING_DEVELOPMENT_SIGNALS'), 'PHASE2_CONFLICTING_ROUTE_SIGNALS_BLOCKED', 'Conflicting resale/development signals are blocked instead of silently choosing a template.')
  addCheck(checks, resaleAgainstDevelopment.compatible === false && resaleAgainstDevelopment.reasons.includes('otp_document_variant_mismatch'), 'PHASE2_RESALE_CANNOT_SCORE_DEVELOPMENT_TEMPLATE', 'Resale route cannot score a new-development template as compatible.')
  addCheck(checks, developmentAgainstResale.compatible === false && developmentAgainstResale.reasons.includes('otp_document_variant_mismatch'), 'PHASE2_DEVELOPMENT_CANNOT_SCORE_RESALE_TEMPLATE', 'New-development route cannot score a resale template as compatible.')

  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')

  return {
    version: OTP_TEMPLATE_ROUTE_SPLIT_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_TEMPLATE_ROUTE_SPLIT_REMEDIATION_REQUIRED' : OTP_TEMPLATE_ROUTE_SPLIT_STATUS_READY,
    summary: {
      routeTargetCount: targets.length,
      decisionCount: decisions.length,
      transitionTemplateSelected: decisions.some((decision) => decision.selectedTemplateKey === OTP_TRANSITION_TEMPLATE_KEY),
      conflictBlocked: conflictDecision.status === 'route_split_blocked',
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    checks,
    blockers,
    warnings,
    decisions,
    conflictDecision,
    targets: targets.map((target) => ({
      routeKey: target.routeKey,
      targetTemplateKey: target.targetTemplateKey,
      defaultRole: target.defaultRole,
    })),
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

export function formatOtpTemplateRouteSplitMarkdown(report = buildOtpTemplateRouteSplitAudit()) {
  return [
    '# OTP Template vNext Phase 2 Route Split',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Route targets', report.summary.routeTargetCount],
        ['Route decisions tested', report.summary.decisionCount],
        ['Transition template selected', report.summary.transitionTemplateSelected ? 'yes' : 'no'],
        ['Conflict blocked', report.summary.conflictBlocked ? 'yes' : 'no'],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Decisions',
    '',
    table(
      ['Source', 'Route', 'Template key'],
      report.decisions.map((decision) => [
        decision.source,
        decision.routeKey,
        decision.selectedTemplateKey,
      ]),
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 2 routes OTP generation to the correct route template key. It does not persist or publish templates, approve wording, or replace render validation.',
    '',
  ].join('\n')
}
