import {
  buildOtpContentScannerPhase9Audit,
} from './otpContentScannerPhase9.js'
import {
  buildOtpLegalContentTemplateReport,
} from './otpLegalContentTemplates.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  buildOtpSignatureInitialsAudit,
} from './otpSignatureInitials.js'
import {
  buildOtpStructuredTermsAudit,
} from './otpStructuredTerms.js'
import {
  buildOtpBrandedShellAudit,
} from './otpTemplateBrandedShell.js'

export const OTP_SETTINGS_ADMIN_READINESS_VERSION = 'otp_settings_admin_readiness_phase10_v1'
export const OTP_SETTINGS_ADMIN_READY_STATUS = 'OTP_SETTINGS_ADMIN_READY_FOR_RENDERER_PROOF'

export const OTP_SETTINGS_ADMIN_READY_CONFIGURATION = Object.freeze({
  otp_enabled: true,
  document_renderer: 'native_structured_pdf',
  otp_generation_artifact: 'pdf',
  docx_generation_enabled: false,
  template_fallback_enabled: false,
  branded_pdf_shell_enabled: true,
  structured_terms_enabled: true,
  signature_initials_enabled: true,
  phase9_content_scanner_required: true,
  counsel_review_required: true,
  admin_publish_approval_required: true,
  organisation_branding_required: true,
  route_defaults: Object.freeze({
    resale_existing_property: 'otp_resale_existing_property_native_pdf_v1',
    new_development: 'otp_new_development_native_pdf_v1',
  }),
})

export const OTP_SETTINGS_ADMIN_CHECKLIST = Object.freeze([
  Object.freeze({
    key: 'otp_enabled',
    label: 'OTP automation switch',
    owner: 'settings_admin',
    source: 'settings.otp_enabled',
    requiredValue: true,
    category: 'enablement',
  }),
  Object.freeze({
    key: 'document_renderer',
    label: 'Native structured PDF renderer',
    owner: 'document_runtime',
    source: 'settings.document_renderer',
    requiredValue: 'native_structured_pdf',
    category: 'renderer',
  }),
  Object.freeze({
    key: 'otp_generation_artifact',
    label: 'PDF generation artifact',
    owner: 'document_runtime',
    source: 'settings.otp_generation_artifact',
    requiredValue: 'pdf',
    category: 'renderer',
  }),
  Object.freeze({
    key: 'docx_generation_enabled',
    label: 'DOCX generation disabled',
    owner: 'document_runtime',
    source: 'settings.docx_generation_enabled',
    requiredValue: false,
    category: 'legacy_safety',
  }),
  Object.freeze({
    key: 'template_fallback_enabled',
    label: 'Generic OTP fallback disabled',
    owner: 'legal_template_registry',
    source: 'settings.template_fallback_enabled',
    requiredValue: false,
    category: 'route_safety',
  }),
  Object.freeze({
    key: 'branded_pdf_shell_enabled',
    label: 'Branded PDF shell enabled',
    owner: 'organisation_agent_settings',
    source: 'settings.branded_pdf_shell_enabled',
    requiredValue: true,
    category: 'branding',
  }),
  Object.freeze({
    key: 'structured_terms_enabled',
    label: 'Structured terms enabled',
    owner: 'transaction_offer_terms',
    source: 'settings.structured_terms_enabled',
    requiredValue: true,
    category: 'terms',
  }),
  Object.freeze({
    key: 'signature_initials_enabled',
    label: 'Signature and initials plan enabled',
    owner: 'signing_runtime',
    source: 'settings.signature_initials_enabled',
    requiredValue: true,
    category: 'signing',
  }),
  Object.freeze({
    key: 'phase9_content_scanner_required',
    label: 'Phase 9 scanner required before publish',
    owner: 'legal_template_registry',
    source: 'settings.phase9_content_scanner_required',
    requiredValue: true,
    category: 'publish_gate',
  }),
  Object.freeze({
    key: 'counsel_review_required',
    label: 'Counsel review required',
    owner: 'legal_template_registry',
    source: 'settings.counsel_review_required',
    requiredValue: true,
    category: 'approval',
  }),
  Object.freeze({
    key: 'admin_publish_approval_required',
    label: 'Admin publish approval required',
    owner: 'settings_admin',
    source: 'settings.admin_publish_approval_required',
    requiredValue: true,
    category: 'approval',
  }),
  Object.freeze({
    key: 'organisation_branding_required',
    label: 'Organisation branding required',
    owner: 'organisation_agent_settings',
    source: 'settings.organisation_branding_required',
    requiredValue: true,
    category: 'branding',
  }),
])

const REQUIRED_AUDIT_STATUSES = Object.freeze({
  brandedShell: 'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES',
  legalContent: 'OTP_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW',
  structuredTerms: 'OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING',
  signatures: 'OTP_SIGNATURE_INITIALS_READY_FOR_RENDERER_WIRING',
  contentScanner: 'OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING',
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function boolLabel(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return normalizeText(value) || 'unset'
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

function mergeSettings(settings = {}) {
  const overrides = asRecord(settings)
  const overrideRouteDefaults = asRecord(overrides.route_defaults || overrides.routeDefaults)
  return {
    ...OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
    ...overrides,
    route_defaults: {
      ...OTP_SETTINGS_ADMIN_READY_CONFIGURATION.route_defaults,
      ...overrideRouteDefaults,
    },
  }
}

function settingValue(settings = {}, key = '') {
  return readPath(settings, key)
}

function addIssue(issues, issue = {}) {
  issues.push({
    severity: issue.severity || 'blocking',
    code: normalizeText(issue.code),
    category: normalizeText(issue.category),
    owner: normalizeText(issue.owner),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  })
}

function addCheck(checks, pass, code, detail, category = 'phase10_admin_readiness') {
  checks.push({ code, pass: Boolean(pass), detail, category })
}

function buildSettingRows(settings = {}) {
  return OTP_SETTINGS_ADMIN_CHECKLIST.map((item) => {
    const actualValue = settingValue(settings, item.key)
    const pass = actualValue === item.requiredValue
    return {
      ...item,
      actualValue,
      pass,
      detail: pass
        ? `${item.label} is ${boolLabel(actualValue)}.`
        : `${item.label} is ${boolLabel(actualValue)} but must be ${boolLabel(item.requiredValue)}.`,
    }
  })
}

function buildRouteRows(settings = {}) {
  const routeDefaults = asRecord(settings.route_defaults || settings.routeDefaults)
  return OTP_DOCUMENT_VARIANTS.map((variant) => {
    const templateKey = normalizeText(
      routeDefaults[variant.key] ||
        settingValue(settings, `${variant.key}_template_key`) ||
        settingValue(settings, `${variant.key}.template_key`),
    )
    return {
      routeKey: variant.key,
      routeLabel: variant.label,
      templateKey,
      pass: Boolean(templateKey),
      detail: templateKey
        ? `${variant.label} resolves to ${templateKey}.`
        : `${variant.label} has no admin template key.`,
    }
  })
}

function buildAuditRows(audits = {}) {
  const resolved = {
    brandedShell: audits.brandedShell || buildOtpBrandedShellAudit(),
    legalContent: audits.legalContent || buildOtpLegalContentTemplateReport(),
    structuredTerms: audits.structuredTerms || buildOtpStructuredTermsAudit(),
    signatures: audits.signatures || buildOtpSignatureInitialsAudit(),
    contentScanner: audits.contentScanner || buildOtpContentScannerPhase9Audit(),
  }
  return Object.entries(REQUIRED_AUDIT_STATUSES).map(([key, requiredStatus]) => {
    const audit = resolved[key] || {}
    const status = normalizeText(audit.status)
    return {
      key,
      requiredStatus,
      status,
      pass: status === requiredStatus && (audit.summary?.blockerCount || 0) === 0,
      blockerCount: audit.summary?.blockerCount || audit.blockers?.length || 0,
      version: audit.version || '',
    }
  })
}

export function buildOtpSettingsAdminReadiness({
  settings = OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
  audits = {},
  checkedAt = new Date().toISOString(),
} = {}) {
  const resolvedSettings = mergeSettings(settings)
  const settingRows = buildSettingRows(resolvedSettings)
  const routeRows = buildRouteRows(resolvedSettings)
  const auditRows = buildAuditRows(audits)
  const blockers = []
  const warnings = []
  const routeTemplateKeys = routeRows.map((row) => row.templateKey).filter(Boolean)
  const routeKeysAreSeparate = routeTemplateKeys.length === routeRows.length && new Set(routeTemplateKeys).size === routeTemplateKeys.length
  const checks = []

  for (const row of auditRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'OTP_SETTINGS_UPSTREAM_AUDIT_NOT_READY',
      category: 'upstream_audit',
      owner: 'document_runtime',
      message: `${row.key} is ${row.status || 'unset'} but must be ${row.requiredStatus}.`,
      remediation: 'Repair the underlying OTP template vNext phase before marking settings/admin ready.',
    })
  }

  for (const row of settingRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: `OTP_SETTINGS_${row.key.toUpperCase()}_NOT_READY`,
      category: row.category,
      owner: row.owner,
      message: row.detail,
      remediation: `Set ${row.source} to ${boolLabel(row.requiredValue)} before enabling OTP admin readiness.`,
    })
  }

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'OTP_SETTINGS_ROUTE_TEMPLATE_KEY_MISSING',
      category: 'route_safety',
      owner: 'legal_template_registry',
      message: row.detail,
      remediation: 'Configure a distinct native PDF OTP template key for every primary route.',
    })
  }

  if (!routeKeysAreSeparate) {
    addIssue(blockers, {
      code: 'OTP_SETTINGS_ROUTE_TEMPLATES_NOT_SEPARATE',
      category: 'route_safety',
      owner: 'legal_template_registry',
      message: 'Resale and new-development OTP admin routes do not have distinct template keys.',
      remediation: 'Keep resale existing property and new-development template keys separate before renderer proof.',
    })
  }

  addCheck(checks, auditRows.every((row) => row.pass), 'PHASE10_UPSTREAM_AUDITS_READY', 'Phase 6 shell, Phase 6 legal content, Phase 7 structured terms, Phase 8 signatures and Phase 9 scanner are ready.')
  addCheck(checks, settingRows.every((row) => row.pass), 'PHASE10_REQUIRED_ADMIN_SETTINGS_LOCKED', 'All required OTP admin settings are explicitly locked to the native PDF path.')
  addCheck(checks, resolvedSettings.docx_generation_enabled === false, 'PHASE10_DOCX_GENERATION_DISABLED', 'DOCX/Word generation is disabled for OTP vNext settings.')
  addCheck(checks, resolvedSettings.document_renderer === 'native_structured_pdf' && resolvedSettings.otp_generation_artifact === 'pdf', 'PHASE10_NATIVE_PDF_RENDERING_SELECTED', 'OTP generation uses the native structured PDF renderer and PDF artifact.')
  addCheck(checks, resolvedSettings.template_fallback_enabled === false, 'PHASE10_GENERIC_FALLBACK_DISABLED', 'Generic OTP fallback templates are disabled for route-specific generation.')
  addCheck(checks, routeRows.every((row) => row.pass) && routeKeysAreSeparate, 'PHASE10_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATE', 'Resale and new-development routes have distinct admin template keys.')
  addCheck(checks, resolvedSettings.branded_pdf_shell_enabled === true && resolvedSettings.organisation_branding_required === true, 'PHASE10_BRANDING_REQUIRED', 'Logo, company details, agency footer, page number and website shell are mandatory.')
  addCheck(checks, resolvedSettings.counsel_review_required === true && resolvedSettings.admin_publish_approval_required === true && resolvedSettings.phase9_content_scanner_required === true, 'PHASE10_APPROVAL_AND_SCANNER_REQUIRED', 'Counsel review, admin approval and Phase 9 scanner are mandatory before publish.')

  return {
    version: OTP_SETTINGS_ADMIN_READINESS_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_SETTINGS_ADMIN_REMEDIATION_REQUIRED' : OTP_SETTINGS_ADMIN_READY_STATUS,
    canProceedToRendererProof: blockers.length === 0,
    summary: {
      routeCount: routeRows.length,
      settingCount: settingRows.length,
      upstreamAuditCount: auditRows.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    requiredSettings: settingRows,
    routeSettings: routeRows,
    upstreamAudits: auditRows,
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

export function formatOtpSettingsAdminReadinessMarkdown(report = buildOtpSettingsAdminReadiness()) {
  return [
    '# OTP Template vNext Phase 10 Settings And Admin Readiness',
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
        ['Routes', report.summary.routeCount],
        ['Required settings', report.summary.settingCount],
        ['Upstream audits', report.summary.upstreamAuditCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to renderer proof', report.canProceedToRendererProof ? 'yes' : 'no'],
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
    '## Admin Settings',
    '',
    table(
      ['Setting', 'Owner', 'Required', 'Actual', 'Pass'],
      report.requiredSettings.map((row) => [row.key, row.owner, boolLabel(row.requiredValue), boolLabel(row.actualValue), row.pass ? 'yes' : 'no']),
    ),
    '',
    '## Route Template Keys',
    '',
    table(
      ['Route', 'Template Key', 'Pass'],
      report.routeSettings.map((row) => [row.routeLabel, row.templateKey, row.pass ? 'yes' : 'no']),
    ),
    '',
    '## Upstream Audits',
    '',
    table(
      ['Audit', 'Version', 'Status', 'Required Status', 'Pass'],
      report.upstreamAudits.map((row) => [row.key, row.version, row.status, row.requiredStatus, row.pass ? 'yes' : 'no']),
    ),
    '',
    '## Boundary',
    '',
    'Phase 10 locks the settings/admin contract for OTP vNext. It does not publish live templates, mutate organisation settings, replace legal counsel sign-off, or replace the next rendered PDF proof pass.',
    '',
  ].join('\n')
}
