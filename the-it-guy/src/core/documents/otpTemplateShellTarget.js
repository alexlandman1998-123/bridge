import {
  OTP_LEGAL_CONTENT_TEMPLATE_VERSION,
  listOtpLegalContentTemplateSections,
} from './otpLegalContentTemplates.js'
import {
  OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
  OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
  OTP_TEMPLATE_BRANDED_SHELL_VERSION,
  buildOtpBrandedShellManifest,
} from './otpTemplateBrandedShell.js'
import {
  OTP_TRANSITION_TEMPLATE_KEY,
  getOtpTargetRouteTemplate,
  listOtpTargetRouteTemplates,
} from './otpTemplateTargetFreeze.js'

export const OTP_TEMPLATE_SHELL_TARGET_VERSION = 'otp_template_shell_target_phase1_v1'

export const OTP_TEMPLATE_SHELL_TARGET_RENDER_MODE = 'native_structured'
export const OTP_TEMPLATE_SHELL_TARGET_SCOPE = 'global_route_default'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function cloneJson(value = {}) {
  return value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : value
}

function shellSlotToSection(slot = {}, target = {}) {
  return {
    section_key: `shell_${normalizeKey(slot.key)}`,
    section_label: slot.label,
    section_type: `document_shell_${normalizeKey(slot.slotType)}`,
    sort_order: Number(slot.sortOrder || 0) - 1000,
    variants: [target.routeKey],
    is_required: Boolean(slot.required),
    is_repeatable: false,
    condition_json: {},
    placeholder_keys: [...(slot.placeholderKeys || [])],
    source_owners: [...(slot.sourceOwners || [])],
    legal_text: '',
    metadata_json: {
      template_key: target.templateKey,
      otp_document_variant: target.routeKey,
      shell_slot_key: slot.key,
      shell_slot_region: slot.region,
      shell_slot_type: slot.slotType,
      shell_version: OTP_TEMPLATE_BRANDED_SHELL_VERSION,
      shell_layout_contract: OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
      signature_layout_contract: slot.layout?.signatureLayoutContract || '',
      blank_render_policy: slot.blankRenderPolicy,
      fallback_text: slot.fallbackText,
      native_pdf_layout: cloneJson(slot.layout || {}),
      signing: cloneJson(slot.signing || {}),
    },
  }
}

function publicationGate(code, label, status = 'required') {
  return { code, label, status }
}

export function buildOtpTemplateShellTarget({ routeKey = '' } = {}) {
  const target = getOtpTargetRouteTemplate(routeKey)
  if (!target) return null

  const shellManifest = buildOtpBrandedShellManifest({ variant: target.routeKey })
  const shellSections = shellManifest.slots.map((slot) => shellSlotToSection(slot, target))
  const contentSections = listOtpLegalContentTemplateSections({ variant: target.routeKey })

  return {
    version: OTP_TEMPLATE_SHELL_TARGET_VERSION,
    routeKey: target.routeKey,
    targetTemplateKey: target.templateKey,
    label: target.label,
    defaultRole: target.defaultRole,
    packetType: 'otp',
    templateFormat: 'html',
    renderMode: OTP_TEMPLATE_SHELL_TARGET_RENDER_MODE,
    templateScope: OTP_TEMPLATE_SHELL_TARGET_SCOPE,
    status: 'target_shell_ready_for_persistence',
    metadataJson: {
      template_key: target.templateKey,
      packet_type: 'otp',
      otp_document_variant: target.routeKey,
      otpDocumentVariant: target.routeKey,
      route_label: shellManifest.variantLabel,
      template_scope: OTP_TEMPLATE_SHELL_TARGET_SCOPE,
      render_mode: OTP_TEMPLATE_SHELL_TARGET_RENDER_MODE,
      transition_from: OTP_TRANSITION_TEMPLATE_KEY,
      shell_version: OTP_TEMPLATE_BRANDED_SHELL_VERSION,
      shell_layout_contract: OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
      signature_layout_contract: OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
      legal_content_version: OTP_LEGAL_CONTENT_TEMPLATE_VERSION,
      legal_review_required: true,
      counsel_approval_required: true,
      render_validation_required: true,
      publish_default_candidate: true,
    },
    requiredPublicationGates: [
      publicationGate('route_template_persisted', 'Route template exists in legal template registry'),
      publicationGate('content_scan_current', 'Content scanner passes against current wording'),
      publicationGate('render_validation_current', 'PDF/DOCX render validation is current'),
      publicationGate('counsel_approval_recorded', 'Counsel approval is recorded before publication'),
      publicationGate('organisation_default_sync_ready', 'Organisation defaults can sync from this route template'),
    ],
    shellManifest,
    shellSections,
    contentSections,
  }
}

export function listOtpTemplateShellTargets() {
  return listOtpTargetRouteTemplates()
    .map((target) => buildOtpTemplateShellTarget({ routeKey: target.routeKey }))
    .filter(Boolean)
}

function addCheck(checks, pass, code, detail, severity = 'blocking') {
  checks.push({
    code,
    pass: Boolean(pass),
    severity,
    detail,
  })
}

function hasSlot(target = {}, predicate = () => false) {
  return Boolean(target.shellManifest?.slots?.some(predicate))
}

function buildChecks(targets = []) {
  const checks = []
  const targetKeys = targets.map((target) => target.targetTemplateKey)
  const resale = targets.find((target) => target.routeKey === 'resale_existing_property')
  const development = targets.find((target) => target.routeKey === 'new_development')

  addCheck(checks, targets.length === 2, 'PHASE1_TWO_ROUTE_TARGET_SHELLS', 'The shell target layer resolves exactly the two frozen OTP route templates.')
  addCheck(checks, !targetKeys.includes(OTP_TRANSITION_TEMPLATE_KEY), 'PHASE1_TRANSITION_TEMPLATE_NOT_TARGET', `${OTP_TRANSITION_TEMPLATE_KEY} remains transition-only and is not a Phase 1 target.`)
  addCheck(checks, targets.every((target) => target.templateScope === OTP_TEMPLATE_SHELL_TARGET_SCOPE), 'PHASE1_GLOBAL_ROUTE_DEFAULT_SCOPE', 'Every target shell is scoped as a global route default.')
  addCheck(checks, targets.every((target) => target.renderMode === OTP_TEMPLATE_SHELL_TARGET_RENDER_MODE), 'PHASE1_NATIVE_STRUCTURED_RENDER_MODE', 'Every target shell is bound to native structured rendering.')
  addCheck(checks, targets.every((target) => target.metadataJson?.legal_review_required === true && target.metadataJson?.counsel_approval_required === true), 'PHASE1_COUNSEL_APPROVAL_GATE_PRESENT', 'Every target shell keeps legal review and counsel approval as a publication gate.')
  addCheck(checks, targets.every((target) => target.shellSections.length === target.shellManifest.slots.length), 'PHASE1_SHELL_SLOTS_MAPPED_TO_SECTIONS', 'Every branded shell slot is mapped to a persistence-ready shell section record.')
  addCheck(checks, targets.every((target) => target.contentSections.length > 0), 'PHASE1_CONTENT_SECTIONS_ATTACHED', 'Every target shell is attached to route-specific legal content sections.')
  addCheck(checks, targets.every((target) => hasSlot(target, (slot) => slot.key === 'brand_header' && slot.region === 'top_left' && slot.placeholderKeys.includes('organisation_logo_url'))), 'PHASE1_TOP_LEFT_LOGO_ON_EVERY_TARGET', 'Every target shell has a top-left logo/header slot.')
  addCheck(checks, targets.every((target) => hasSlot(target, (slot) => slot.key === 'document_header_details' && slot.region === 'top_right' && slot.placeholderKeys.includes('otp_document_variant'))), 'PHASE1_TOP_RIGHT_DETAILS_ON_EVERY_TARGET', 'Every target shell has top-right document details.')
  addCheck(checks, Boolean(resale && hasSlot(resale, (slot) => slot.key === 'resale_transaction_summary' && slot.placeholderKeys.includes('seller_full_name') && slot.placeholderKeys.includes('property_address') && slot.placeholderKeys.includes('purchase_price'))), 'PHASE1_RESALE_SUMMARY_BOUND', 'The resale target shell has seller, property and purchase-price summary fields.')
  addCheck(checks, Boolean(development && hasSlot(development, (slot) => slot.key === 'development_transaction_summary' && slot.placeholderKeys.includes('developer_name') && slot.placeholderKeys.includes('development_name') && slot.placeholderKeys.includes('vat_inclusive_purchase_price'))), 'PHASE1_DEVELOPMENT_SUMMARY_BOUND', 'The new-development target shell has developer, development, unit and VAT-aware summary fields.')
  addCheck(checks, Boolean(resale && hasSlot(resale, (slot) => slot.slotType === 'signature_zone' && slot.placeholderKeys.includes('seller_signature') && !slot.placeholderKeys.includes('developer_signature'))), 'PHASE1_RESALE_SIGNATURE_BOUND', 'The resale target shell signs purchaser and seller.')
  addCheck(checks, Boolean(development && hasSlot(development, (slot) => slot.slotType === 'signature_zone' && slot.placeholderKeys.includes('developer_signature') && !slot.placeholderKeys.includes('seller_signature'))), 'PHASE1_DEVELOPMENT_SIGNATURE_BOUND', 'The new-development target shell signs purchaser and developer authorised signatory.')
  addCheck(checks, targets.every((target) => target.shellManifest?.slots?.every((slot) => slot.layout?.contract === OTP_BRANDED_SHELL_LAYOUT_CONTRACT)), 'PHASE1_LAYOUT_CONTRACT_ON_EVERY_SLOT', 'Every shell slot carries the branded shell layout contract.')

  return checks
}

export function buildOtpTemplateShellTargetAudit({ checkedAt = new Date().toISOString() } = {}) {
  const targets = listOtpTemplateShellTargets()
  const checks = buildChecks(targets)
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')

  return {
    version: OTP_TEMPLATE_SHELL_TARGET_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_TEMPLATE_SHELL_TARGET_REMEDIATION_REQUIRED' : 'OTP_TEMPLATE_SHELL_TARGET_READY_FOR_PERSISTENCE',
    summary: {
      routeTargetCount: targets.length,
      shellSectionCount: targets.reduce((count, target) => count + target.shellSections.length, 0),
      contentSectionCount: targets.reduce((count, target) => count + target.contentSections.length, 0),
      topLeftLogo: checks.find((check) => check.code === 'PHASE1_TOP_LEFT_LOGO_ON_EVERY_TARGET')?.pass === true,
      topRightDetails: checks.find((check) => check.code === 'PHASE1_TOP_RIGHT_DETAILS_ON_EVERY_TARGET')?.pass === true,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    checks,
    blockers,
    warnings,
    targets,
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

export function formatOtpTemplateShellTargetMarkdown(report = buildOtpTemplateShellTargetAudit()) {
  return [
    '# OTP Template vNext Phase 1 Template Shell',
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
        ['Route target shells', report.summary.routeTargetCount],
        ['Shell sections', report.summary.shellSectionCount],
        ['Content sections attached', report.summary.contentSectionCount],
        ['Top-left logo', report.summary.topLeftLogo ? 'yes' : 'no'],
        ['Top-right details', report.summary.topRightDetails ? 'yes' : 'no'],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Target Shells',
    '',
    table(
      ['Route', 'Template key', 'Shell slots', 'Signature placeholders'],
      report.targets.map((target) => {
        const signatureSlot = target.shellManifest.slots.find((slot) => slot.slotType === 'signature_zone')
        return [
          target.routeKey,
          target.targetTemplateKey,
          target.shellManifest.slots.map((slot) => slot.key).join(', '),
          (signatureSlot?.placeholderKeys || []).join(', '),
        ]
      }),
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
    'Phase 1 defines the route-specific shell contracts for persistence. It does not mutate Supabase, publish live defaults, approve legal wording, or replace rendered PDF/DOCX visual sign-off.',
    '',
  ].join('\n')
}
