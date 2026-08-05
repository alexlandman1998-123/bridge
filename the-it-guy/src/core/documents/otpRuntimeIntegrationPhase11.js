import {
  listOtpLegalContentTemplateSections,
} from './otpLegalContentTemplates.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  buildOtpSignatureInitialsManifest,
} from './otpSignatureInitials.js'
import {
  buildOtpStructuredTermsManifest,
} from './otpStructuredTerms.js'
import {
  buildOtpBrandedShellManifest,
} from './otpTemplateBrandedShell.js'
import {
  buildOtpTemplateRuntimeLaunchReadiness,
} from './otpTemplateLaunchReadiness.js'
import {
  OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
  OTP_SETTINGS_ADMIN_READY_STATUS,
  buildOtpSettingsAdminReadiness,
} from './otpSettingsAdminReadiness.js'

export const OTP_RUNTIME_INTEGRATION_PHASE11_VERSION = 'otp_runtime_integration_phase11_v1'
export const OTP_RUNTIME_INTEGRATION_READY_STATUS = 'OTP_RUNTIME_INTEGRATION_READY_FOR_PDF_PROOF'
export const OTP_RUNTIME_RENDERER_CONTRACT = 'otp_native_structured_pdf_runtime_phase11_v1'

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

function routeTemplateKey(routeKey = '', settings = OTP_SETTINGS_ADMIN_READY_CONFIGURATION) {
  return normalizeText(asRecord(settings.route_defaults || settings.routeDefaults)[routeKey])
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function buildRuntimeTemplate(variant, settings = OTP_SETTINGS_ADMIN_READY_CONFIGURATION) {
  const templateKey = routeTemplateKey(variant.key, settings)
  return {
    id: templateKey,
    packet_type: 'otp',
    template_key: templateKey,
    template_label: `${variant.label} native PDF runtime template`,
    template_status: 'published',
    is_active: true,
    is_default: false,
    render_mode: 'native_structured',
    metadata_json: {
      packet_type: 'otp',
      lifecycle_status: 'published',
      otp_document_variant: variant.key,
      otpDocumentVariant: variant.key,
      render_mode: 'native_structured',
      renderer_contract: OTP_RUNTIME_RENDERER_CONTRACT,
      generation_artifact: 'pdf',
      docx_generation_enabled: false,
      last_render_validation: {
        renderable: true,
        blockingIssues: [],
        warnings: [],
      },
    },
    sections: listOtpLegalContentTemplateSections({ variant: variant.key }),
  }
}

function buildRuntimeRow(variant, settings = OTP_SETTINGS_ADMIN_READY_CONFIGURATION) {
  const template = buildRuntimeTemplate(variant, settings)
  const launchReadiness = buildOtpTemplateRuntimeLaunchReadiness({
    packetType: 'otp',
    validationAction: 'generate',
    legalDocumentScenarioProfile: { otpDocumentVariant: variant.key },
    placeholders: {
      otp_document_variant: variant.key,
      document_variant: variant.key,
    },
  }, {
    source: 'legal_scenario_variant',
    packetType: 'otp',
    template,
    legalDocumentScenarioProfile: { otpDocumentVariant: variant.key },
    legalDocumentTemplateRouting: {
      otpDocumentVariant: variant.key,
      matchedSpecificRoute: true,
    },
  })
  const shell = buildOtpBrandedShellManifest({ variant: variant.key })
  const structuredTerms = buildOtpStructuredTermsManifest({ variant: variant.key })
  const signatures = buildOtpSignatureInitialsManifest({ variant: variant.key })

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    templateKey: template.template_key,
    templateRenderMode: template.render_mode,
    rendererContract: template.metadata_json.renderer_contract,
    artifactType: template.metadata_json.generation_artifact,
    docxGenerationEnabled: template.metadata_json.docx_generation_enabled,
    launchReadiness,
    shellSlotCount: shell.slots.length,
    shellPlaceholderCount: shell.placeholderKeys.length,
    structuredGroupCount: structuredTerms.groupCount,
    structuredFieldCount: structuredTerms.fieldKeys.length,
    signingRoleCount: signatures.roles.length,
    signingFieldCount: signatures.fields.length,
    pass: launchReadiness.status === 'ready' &&
      launchReadiness.shouldBlockGeneration === false &&
      launchReadiness.canGenerateWithoutFallback === true &&
      template.render_mode === 'native_structured' &&
      template.metadata_json.generation_artifact === 'pdf' &&
      template.metadata_json.docx_generation_enabled === false,
  }
}

function buildFallbackProbe(settings = OTP_SETTINGS_ADMIN_READY_CONFIGURATION) {
  const route = OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === 'new_development') || OTP_DOCUMENT_VARIANTS[0]
  const fallbackTemplate = {
    ...buildRuntimeTemplate(route, settings),
    id: 'otp_default_legacy_fallback',
    template_key: 'otp_default_legacy_fallback',
    template_label: 'Default OTP fallback',
    is_default: true,
    metadata_json: {
      packet_type: 'otp',
      lifecycle_status: 'published',
      render_mode: 'native_structured',
      generation_artifact: 'pdf',
      docx_generation_enabled: false,
      last_render_validation: {
        renderable: true,
        blockingIssues: [],
        warnings: [],
      },
    },
  }
  delete fallbackTemplate.metadata_json.otp_document_variant
  delete fallbackTemplate.metadata_json.otpDocumentVariant

  const readiness = buildOtpTemplateRuntimeLaunchReadiness({
    packetType: 'otp',
    validationAction: 'generate',
    legalDocumentScenarioProfile: { otpDocumentVariant: route.key },
    placeholders: {
      otp_document_variant: route.key,
      document_variant: route.key,
    },
  }, {
    source: 'legal_scenario_fallback',
    packetType: 'otp',
    template: fallbackTemplate,
    legalDocumentScenarioProfile: { otpDocumentVariant: route.key },
  })

  return {
    routeKey: route.key,
    routeLabel: route.label,
    status: readiness.status,
    shouldBlockGeneration: readiness.shouldBlockGeneration,
    blockerCodes: readiness.blockerCodes,
    pass: readiness.status === 'blocked' &&
      readiness.shouldBlockGeneration === true &&
      readiness.blockerCodes.includes('OTP_RUNTIME_UNAPPROVED_FALLBACK'),
    readiness,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase11_runtime_integration') {
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

export function buildOtpRuntimeIntegrationPhase11Audit({
  settings = OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
  checkedAt = new Date().toISOString(),
} = {}) {
  const settingsReadiness = buildOtpSettingsAdminReadiness({ settings, checkedAt })
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) => buildRuntimeRow(variant, settings))
  const fallbackProbe = buildFallbackProbe(settings)
  const routeTemplateKeys = routeRows.map((row) => row.templateKey).filter(Boolean)
  const distinctRouteTemplates = routeTemplateKeys.length === routeRows.length && new Set(routeTemplateKeys).size === routeTemplateKeys.length
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, settingsReadiness.status === OTP_SETTINGS_ADMIN_READY_STATUS, 'PHASE11_SETTINGS_ADMIN_READY', 'Runtime integration consumes the Phase 10 settings/admin readiness contract.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.launchReadiness.status === 'ready'), 'PHASE11_RUNTIME_ROUTES_READY', 'Runtime launch readiness is ready for both resale and new-development routes.')
  addCheck(checks, routeRows.every((row) => row.launchReadiness.canGenerateWithoutFallback === true), 'PHASE11_GENERATES_WITHOUT_FALLBACK', 'Generation uses first-class route templates and does not need fallback.')
  addCheck(checks, distinctRouteTemplates, 'PHASE11_ROUTE_TEMPLATE_KEYS_DISTINCT', 'Resale and new-development runtime routes resolve distinct template keys.')
  addCheck(checks, routeRows.every((row) => row.templateRenderMode === 'native_structured' && row.artifactType === 'pdf'), 'PHASE11_NATIVE_PDF_RUNTIME_BOUND', 'Runtime templates use native_structured render mode and produce PDF artifacts.')
  addCheck(checks, routeRows.every((row) => row.docxGenerationEnabled === false) && settings.docx_generation_enabled === false, 'PHASE11_DOCX_RUNTIME_PATH_DISABLED', 'Runtime integration has no OTP DOCX generation path enabled.')
  addCheck(checks, routeRows.every((row) => row.shellSlotCount > 0 && row.shellPlaceholderCount > 0), 'PHASE11_BRANDED_SHELL_BOUND', 'Runtime integration carries branded shell slots and placeholders for every route.')
  addCheck(checks, routeRows.every((row) => row.structuredGroupCount > 0 && row.structuredFieldCount > 0), 'PHASE11_STRUCTURED_TERMS_BOUND', 'Runtime integration carries structured commercial term manifests for every route.')
  addCheck(checks, routeRows.every((row) => row.signingRoleCount > 0 && row.signingFieldCount > 0), 'PHASE11_SIGNING_PLAN_BOUND', 'Runtime integration carries signing roles, signatures, initials and date fields for every route.')
  addCheck(checks, fallbackProbe.pass, 'PHASE11_FALLBACK_GENERATION_BLOCKED', 'Runtime generation blocks unapproved generic OTP fallback.')

  for (const check of checks.filter((row) => !row.pass)) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair the OTP runtime integration contract before starting rendered PDF proof.',
    })
  }

  return {
    version: OTP_RUNTIME_INTEGRATION_PHASE11_VERSION,
    rendererContract: OTP_RUNTIME_RENDERER_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_RUNTIME_INTEGRATION_REMEDIATION_REQUIRED' : OTP_RUNTIME_INTEGRATION_READY_STATUS,
    canProceedToPdfProof: blockers.length === 0,
    summary: {
      routeCount: routeRows.length,
      readyRuntimeRouteCount: routeRows.filter((row) => row.pass).length,
      distinctRouteTemplateCount: new Set(routeTemplateKeys).size,
      fallbackBlocked: fallbackProbe.pass,
      docxGenerationEnabled: boolLabel(settings.docx_generation_enabled),
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    settingsReadiness: {
      version: settingsReadiness.version,
      status: settingsReadiness.status,
      canProceedToRendererProof: settingsReadiness.canProceedToRendererProof,
      blockerCount: settingsReadiness.summary.blockerCount,
    },
    routeRows,
    fallbackProbe,
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

export function formatOtpRuntimeIntegrationPhase11Markdown(report = buildOtpRuntimeIntegrationPhase11Audit()) {
  return [
    '# OTP Template vNext Phase 11 Runtime Integration',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Renderer contract: ${report.rendererContract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Ready runtime routes', report.summary.readyRuntimeRouteCount],
        ['Distinct route templates', report.summary.distinctRouteTemplateCount],
        ['Fallback blocked', report.summary.fallbackBlocked ? 'yes' : 'no'],
        ['DOCX generation enabled', report.summary.docxGenerationEnabled],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to PDF proof', report.canProceedToPdfProof ? 'yes' : 'no'],
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
    '## Runtime Routes',
    '',
    table(
      ['Route', 'Template Key', 'Launch Status', 'Renderer', 'Artifact', 'Fallback Free', 'Signing Fields'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.templateKey,
        row.launchReadiness.status,
        row.templateRenderMode,
        row.artifactType,
        row.launchReadiness.canGenerateWithoutFallback ? 'yes' : 'no',
        row.signingFieldCount,
      ]),
    ),
    '',
    '## Fallback Probe',
    '',
    table(
      ['Route', 'Status', 'Blocks Generation', 'Blocker Codes'],
      [[
        report.fallbackProbe.routeLabel,
        report.fallbackProbe.status,
        report.fallbackProbe.shouldBlockGeneration ? 'yes' : 'no',
        report.fallbackProbe.blockerCodes.join(', '),
      ]],
    ),
    '',
    '## Boundary',
    '',
    'Phase 11 proves runtime integration against deterministic OTP vNext contracts. It does not render or visually inspect the final PDF; that belongs to the next PDF proof phase.',
    '',
  ].join('\n')
}
