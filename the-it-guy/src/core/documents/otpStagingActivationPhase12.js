import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_RUNTIME_INTEGRATION_READY_STATUS,
  buildOtpRuntimeIntegrationPhase11Audit,
} from './otpRuntimeIntegrationPhase11.js'
import {
  OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
} from './otpSettingsAdminReadiness.js'

export const OTP_STAGING_ACTIVATION_PHASE12_VERSION = 'otp_staging_activation_phase12_v1'
export const OTP_STAGING_ACTIVATION_READY_STATUS = 'OTP_STAGING_ACTIVATION_READY_FOR_GUARDED_ENABLEMENT'
export const OTP_STAGING_ACTIVATION_CONTRACT = 'otp-vnext-staging-activation-phase12-v1'

export const OTP_STAGING_ACTIVATION_READY_PLAN = Object.freeze({
  contract: OTP_STAGING_ACTIVATION_CONTRACT,
  environment: 'staging',
  projectRef: 'staging-project-ref',
  activationMode: 'guarded_staging_canary',
  activationReference: 'OTP-VNEXT-STAGING-PHASE12',
  approvedBy: 'settings_admin',
  counselApprovalReference: 'otp-vnext-counsel-review',
  rollbackReference: 'otp-vnext-disable-runtime-flag',
  dryRunOnly: true,
  canaryOrganisationIds: Object.freeze(['staging-otp-sandbox-agency']),
  enabledRoutes: Object.freeze(['resale_existing_property', 'new_development']),
  runtimeFlags: Object.freeze({
    otp_vnext_enabled: true,
    otp_vnext_native_pdf_enabled: true,
    otp_vnext_docx_generation_enabled: false,
    otp_vnext_generic_fallback_enabled: false,
  }),
  requiredEvidence: Object.freeze([
    'phase10_settings_admin_readiness',
    'phase11_runtime_integration',
    'phase9_content_scanner',
    'counsel_review_reference',
    'rollback_reference',
  ]),
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function list(value = []) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function boolLabel(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return normalizeText(value) || 'unset'
}

function mergePlan(plan = {}) {
  const overrides = asRecord(plan)
  return {
    ...OTP_STAGING_ACTIVATION_READY_PLAN,
    ...overrides,
    canaryOrganisationIds: list(overrides.canaryOrganisationIds || OTP_STAGING_ACTIVATION_READY_PLAN.canaryOrganisationIds),
    enabledRoutes: list(overrides.enabledRoutes || OTP_STAGING_ACTIVATION_READY_PLAN.enabledRoutes),
    runtimeFlags: {
      ...OTP_STAGING_ACTIVATION_READY_PLAN.runtimeFlags,
      ...asRecord(overrides.runtimeFlags),
    },
    requiredEvidence: list(overrides.requiredEvidence || OTP_STAGING_ACTIVATION_READY_PLAN.requiredEvidence),
  }
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function addCheck(checks, pass, code, detail, category = 'phase12_staging_activation') {
  checks.push({ code, pass: Boolean(pass), detail, category })
}

function addIssue(issues, issue = {}) {
  issues.push({
    severity: issue.severity || 'blocking',
    code: normalizeText(issue.code),
    category: normalizeText(issue.category),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  })
}

function routeRows(plan = {}, runtimeAudit = {}) {
  const enabled = new Set(list(plan.enabledRoutes))
  const runtimeByRoute = new Map((runtimeAudit.routeRows || []).map((row) => [row.routeKey, row]))
  return OTP_DOCUMENT_VARIANTS.map((variant) => {
    const runtime = runtimeByRoute.get(variant.key) || {}
    return {
      routeKey: variant.key,
      routeLabel: variant.label,
      enabled: enabled.has(variant.key),
      templateKey: normalizeText(runtime.templateKey),
      runtimeStatus: normalizeText(runtime.launchReadiness?.status),
      fallbackFree: runtime.launchReadiness?.canGenerateWithoutFallback === true,
      renderer: normalizeText(runtime.templateRenderMode),
      artifact: normalizeText(runtime.artifactType),
      pass: enabled.has(variant.key) &&
        normalizeText(runtime.templateKey) &&
        runtime.launchReadiness?.status === 'ready' &&
        runtime.launchReadiness?.canGenerateWithoutFallback === true &&
        runtime.templateRenderMode === 'native_structured' &&
        runtime.artifactType === 'pdf',
    }
  })
}

export function buildOtpStagingActivationPhase12Audit({
  plan = OTP_STAGING_ACTIVATION_READY_PLAN,
  settings = OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
  runtimeAudit = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const resolvedPlan = mergePlan(plan)
  const resolvedRuntimeAudit = runtimeAudit || buildOtpRuntimeIntegrationPhase11Audit({ settings, checkedAt })
  const routes = routeRows(resolvedPlan, resolvedRuntimeAudit)
  const flags = asRecord(resolvedPlan.runtimeFlags)
  const requiredEvidence = new Set(list(resolvedPlan.requiredEvidence))
  const checks = []
  const blockers = []
  const warnings = []
  const activationMode = normalizeKey(resolvedPlan.activationMode)
  const stagingTarget = normalizeKey(resolvedPlan.environment) === 'staging'
  const canaryScoped = list(resolvedPlan.canaryOrganisationIds).length > 0
  const requiredRoutesEnabled = routes.every((row) => row.enabled)
  const rollbackReady = Boolean(normalizeText(resolvedPlan.rollbackReference))
  const approvalsReady = Boolean(normalizeText(resolvedPlan.approvedBy)) && Boolean(normalizeText(resolvedPlan.counselApprovalReference))
  const evidenceReady = [
    'phase10_settings_admin_readiness',
    'phase11_runtime_integration',
    'phase9_content_scanner',
    'counsel_review_reference',
    'rollback_reference',
  ].every((key) => requiredEvidence.has(key))

  addCheck(checks, resolvedRuntimeAudit.status === OTP_RUNTIME_INTEGRATION_READY_STATUS, 'PHASE12_RUNTIME_INTEGRATION_READY', 'Phase 11 runtime integration is ready before staging activation.')
  addCheck(checks, resolvedPlan.contract === OTP_STAGING_ACTIVATION_CONTRACT, 'PHASE12_ACTIVATION_CONTRACT_CURRENT', 'Staging activation uses the current Phase 12 contract.')
  addCheck(checks, stagingTarget && normalizeText(resolvedPlan.projectRef), 'PHASE12_STAGING_TARGET_LOCKED', 'Activation target is explicitly staging with a project reference.')
  addCheck(checks, activationMode === 'guarded_staging_canary', 'PHASE12_GUARDED_CANARY_MODE', 'Activation is limited to guarded staging canary mode.')
  addCheck(checks, resolvedPlan.dryRunOnly === true, 'PHASE12_TEST_SUITE_READ_ONLY', 'Phase 12 verification remains read-only and does not mutate staging.')
  addCheck(checks, canaryScoped, 'PHASE12_CANARY_ORGANISATION_SCOPED', 'Staging activation is scoped to at least one canary organisation.')
  addCheck(checks, requiredRoutesEnabled && routes.every((row) => row.pass), 'PHASE12_BOTH_ROUTES_ACTIVATED', 'Resale and new-development routes are included and runtime-ready.')
  addCheck(checks, flags.otp_vnext_enabled === true && flags.otp_vnext_native_pdf_enabled === true, 'PHASE12_NATIVE_PDF_FLAGS_ENABLED', 'Staging flags enable OTP vNext and native PDF rendering.')
  addCheck(checks, flags.otp_vnext_docx_generation_enabled === false, 'PHASE12_DOCX_FLAG_DISABLED', 'Staging keeps OTP DOCX generation disabled.')
  addCheck(checks, flags.otp_vnext_generic_fallback_enabled === false, 'PHASE12_GENERIC_FALLBACK_FLAG_DISABLED', 'Staging keeps generic OTP fallback disabled.')
  addCheck(checks, approvalsReady, 'PHASE12_APPROVAL_REFERENCES_PRESENT', 'Settings admin and counsel approval references are present.')
  addCheck(checks, rollbackReady, 'PHASE12_ROLLBACK_REFERENCE_PRESENT', 'Rollback/disable reference is present before activation.')
  addCheck(checks, evidenceReady, 'PHASE12_REQUIRED_EVIDENCE_BOUND', 'Activation plan carries Phase 10, Phase 11, Phase 9, counsel and rollback evidence markers.')

  for (const check of checks.filter((row) => !row.pass)) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Fix the staging activation plan before enabling OTP vNext in staging.',
    })
  }

  return {
    version: OTP_STAGING_ACTIVATION_PHASE12_VERSION,
    contract: OTP_STAGING_ACTIVATION_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_STAGING_ACTIVATION_REMEDIATION_REQUIRED' : OTP_STAGING_ACTIVATION_READY_STATUS,
    canActivateStaging: blockers.length === 0,
    activationPlan: {
      contract: resolvedPlan.contract,
      environment: resolvedPlan.environment,
      projectRef: resolvedPlan.projectRef,
      activationMode: resolvedPlan.activationMode,
      activationReference: resolvedPlan.activationReference,
      approvedBy: resolvedPlan.approvedBy,
      counselApprovalReference: resolvedPlan.counselApprovalReference,
      rollbackReference: resolvedPlan.rollbackReference,
      dryRunOnly: resolvedPlan.dryRunOnly,
      canaryOrganisationIds: list(resolvedPlan.canaryOrganisationIds),
      enabledRoutes: list(resolvedPlan.enabledRoutes),
      runtimeFlags: flags,
      requiredEvidence: list(resolvedPlan.requiredEvidence),
    },
    runtimeIntegration: {
      version: resolvedRuntimeAudit.version,
      status: resolvedRuntimeAudit.status,
      canProceedToPdfProof: resolvedRuntimeAudit.canProceedToPdfProof,
      fallbackBlocked: resolvedRuntimeAudit.summary?.fallbackBlocked === true,
      blockerCount: resolvedRuntimeAudit.summary?.blockerCount || 0,
    },
    summary: {
      routeCount: routes.length,
      activatedRouteCount: routes.filter((row) => row.enabled).length,
      runtimeReadyRouteCount: routes.filter((row) => row.pass).length,
      canaryOrganisationCount: list(resolvedPlan.canaryOrganisationIds).length,
      docxFlag: boolLabel(flags.otp_vnext_docx_generation_enabled),
      fallbackFlag: boolLabel(flags.otp_vnext_generic_fallback_enabled),
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    routeRows: routes,
    checks,
    blockers,
    warnings,
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

export function formatOtpStagingActivationPhase12Markdown(report = buildOtpStagingActivationPhase12Audit()) {
  return [
    '# OTP Template vNext Phase 12 Staging Activation',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Activated routes', report.summary.activatedRouteCount],
        ['Runtime-ready routes', report.summary.runtimeReadyRouteCount],
        ['Canary organisations', report.summary.canaryOrganisationCount],
        ['DOCX flag', report.summary.docxFlag],
        ['Fallback flag', report.summary.fallbackFlag],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Can activate staging', report.canActivateStaging ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Activation Plan',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Environment', report.activationPlan.environment],
        ['Project ref', report.activationPlan.projectRef],
        ['Mode', report.activationPlan.activationMode],
        ['Reference', report.activationPlan.activationReference],
        ['Approved by', report.activationPlan.approvedBy],
        ['Counsel approval', report.activationPlan.counselApprovalReference],
        ['Rollback', report.activationPlan.rollbackReference],
        ['Dry run only', report.activationPlan.dryRunOnly ? 'true' : 'false'],
        ['Canaries', report.activationPlan.canaryOrganisationIds.join(', ')],
      ],
    ),
    '',
    '## Route Activation',
    '',
    table(
      ['Route', 'Enabled', 'Template Key', 'Runtime', 'Renderer', 'Artifact', 'Fallback Free'],
      report.routeRows.map((row) => [
        routeLabel(row.routeKey),
        row.enabled ? 'yes' : 'no',
        row.templateKey,
        row.runtimeStatus,
        row.renderer,
        row.artifact,
        row.fallbackFree ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Runtime Flags',
    '',
    table(
      ['Flag', 'Value'],
      Object.entries(report.activationPlan.runtimeFlags).map(([key, value]) => [key, boolLabel(value)]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 12 certifies the guarded staging activation plan and remains read-only in tests. It does not write staging flags, publish templates, or replace post-activation smoke testing.',
    '',
  ].join('\n')
}
