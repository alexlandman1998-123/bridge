import { validateCanonicalTemplateDefinition } from './canonicalTemplateDefinition.js'
import {
  buildMandateTemplateApprovalReleaseGate,
} from './mandateTemplateApprovalReleaseGate.js'
import {
  buildMandateTemplateOrganisationSyncPlan,
  MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT,
} from './mandateTemplateOrganisationSync.js'
import {
  buildMandateTemplatePdfLayoutVNextReport,
} from './mandateTemplatePdfLayoutVNext.js'
import {
  buildMandateTemplateWordingVNext,
  listMandateTemplateWordingVNextSections,
  MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT,
  MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
} from './mandateTemplateWordingVNext.js'

export const MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_VERSION = 'mandate_template_vnext_phase8_forward_enforcement_v1'
export const MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_CONTRACT = 'mandate-template-vnext-forward-enforcement-v1'

export const MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN = Object.freeze([
  'test:mandate-template-baseline-audit-phase1',
  'test:mandate-template-merge-field-registry-phase2',
  'test:mandate-template-data-source-map-phase3',
  'test:mandate-template-wording-vnext-phase4',
  'test:mandate-template-pdf-layout-vnext-phase5',
  'test:mandate-template-approval-release-gate-phase6',
  'test:mandate-template-organisation-sync-phase7',
  'test:mandate-template-forward-enforcement-phase8',
  'verify:mandate-template-global-routes',
])

function text(value) {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sectionContent(section = {}) {
  return String(section.legal_text ?? section.legalText ?? section.content ?? '')
}

function sectionMetadata(section = {}) {
  return object(section.metadata_json || section.metadataJson || section.metadata)
}

function sectionLayout(section = {}) {
  return object(sectionMetadata(section).native_pdf_layout || sectionMetadata(section).nativePdfLayout)
}

function sectionKeys(sections = []) {
  return sections.map((section) => key(section.section_key || section.sectionKey || section.key))
}

function hasPackHeading(section = {}) {
  const label = text(section.section_label || section.sectionLabel || section.label)
  const heading = text(sectionContent(section).split(/\r?\n/).find((line) => text(line)) || '')
  return /\b(pack|packet)\b/i.test(`${label} ${heading}`)
}

function placeholderTokens(sections = []) {
  const tokens = new Set()
  for (const section of sections) {
    for (const token of section.placeholder_keys || section.placeholderKeys || []) {
      const normalized = key(token)
      if (normalized) tokens.add(normalized)
    }
    for (const match of sectionContent(section).matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
      const normalized = key(match[1])
      if (normalized) tokens.add(normalized)
    }
  }
  return Array.from(tokens).sort()
}

function addCheck(checks, pass, code, detail, severity = 'blocking') {
  checks.push({
    code,
    pass: Boolean(pass),
    severity,
    detail,
  })
}

function scriptValue(scripts = {}, name = '') {
  return text(object(scripts)[name])
}

function buildScriptChecks(packageScripts = {}) {
  const checks = []
  for (const scriptName of MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN) {
    addCheck(
      checks,
      Boolean(scriptValue(packageScripts, scriptName)),
      'PHASE8_SCRIPT_CHAIN_PRESENT',
      `${scriptName} is present in package.json.`,
    )
  }
  addCheck(
    checks,
    scriptValue(packageScripts, 'verify:mandate-template-vnext') === MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN.map((name) => `npm run ${name}`).join(' && '),
    'PHASE8_VERIFY_CHAIN_BOUND',
    'verify:mandate-template-vnext runs the full mandate vNext and global route enforcement chain.',
  )
  addCheck(
    checks,
    scriptValue(packageScripts, 'report:mandate-template-forward-enforcement') === 'node scripts/report-mandate-template-forward-enforcement.mjs',
    'PHASE8_REPORT_SCRIPT_PRESENT',
    'Phase 8 forward-enforcement report script is present.',
  )
  return checks
}

function buildTemplateDriftChecks({ sections, wording, pdfLayout }) {
  const checks = []
  const keys = sectionKeys(sections)
  const duplicateKeys = keys.filter((item, index) => keys.indexOf(item) !== index)
  const signatureSections = sections.filter((section) => key(section.section_type || section.sectionType || section.type) === 'signature_zone' || key(section.section_key || section.sectionKey || section.key) === 'signature_pages')
  const signature = signatureSections[0] || {}
  const signatureLayout = sectionLayout(signature)
  const optionalUnsafe = sections.filter((section) => {
    const required = section.is_required === undefined ? Boolean(section.required) : Boolean(section.is_required)
    const metadata = sectionMetadata(section)
    const condition = object(section.condition_json || section.conditionJson || section.condition)
    return !required &&
      !Object.keys(condition).length &&
      metadata.hide_when_empty !== true &&
      metadata.hideWhenEmpty !== true &&
      metadata.blank_safe !== true &&
      metadata.blankSafe !== true
  })

  addCheck(checks, wording.summary.status === 'WORDING_VNEXT_READY_FOR_COUNSEL_REVIEW', 'PHASE8_WORDING_GATE_STILL_PASSING', 'Phase 4 wording report still passes.')
  addCheck(checks, pdfLayout.summary.status === 'PDF_LAYOUT_PRESERVED_AND_REFINED', 'PHASE8_PDF_LAYOUT_GATE_STILL_PASSING', 'Phase 5 PDF layout report still passes.')
  addCheck(checks, duplicateKeys.length === 0, 'PHASE8_NO_DUPLICATE_SECTION_KEYS', duplicateKeys.length ? `Duplicate sections: ${duplicateKeys.join(', ')}` : 'No duplicate section keys.')
  addCheck(checks, sections.length === 16, 'PHASE8_SECTION_COUNT_STABLE', 'The mandate vNext template keeps the 16-section contract.')
  addCheck(checks, sections.every((section) => !hasPackHeading(section)), 'PHASE8_CLIENT_HEADINGS_STAY_CLEAN', 'Client-facing labels and rendered headings avoid Pack/Packet wording.')
  addCheck(checks, optionalUnsafe.length === 0, 'PHASE8_OPTIONAL_SECTIONS_STAY_BLANK_SAFE', optionalUnsafe.length ? `Unsafe optional sections: ${optionalUnsafe.map((section) => key(section.section_key || section.sectionKey || section.key)).join(', ')}` : 'Optional sections remain conditional or blank-safe.')
  addCheck(checks, signatureSections.length === 1, 'PHASE8_SINGLE_SIGNATURE_ZONE_ENFORCED', 'Exactly one signature zone is present.')
  addCheck(checks, key(signature.section_key || signature.sectionKey || signature.key) === 'signature_pages', 'PHASE8_SIGNATURE_ZONE_KEY_STABLE', 'Signature zone key remains signature_pages.')
  addCheck(checks, signatureLayout.suppress_section_body === true, 'PHASE8_SIGNATURE_BODY_SUPPRESSION_ENFORCED', 'Signature section body remains suppressed for native PDF rendering.')
  addCheck(checks, signatureLayout.signature_layout_contract === 'arch9-mandate-branded-signature-layout-v1', 'PHASE8_SIGNATURE_LAYOUT_CONTRACT_ENFORCED', 'Signature section remains bound to the authoritative branded signature layout.')
  addCheck(checks, sections.every((section) => sectionMetadata(section).wording_version === MANDATE_TEMPLATE_WORDING_VNEXT_VERSION), 'PHASE8_WORDING_VERSION_ON_EVERY_SECTION', 'Every section carries the vNext wording version.')
  addCheck(checks, sections.every((section) => sectionLayout(section).contract === MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT), 'PHASE8_PDF_LAYOUT_CONTRACT_ON_EVERY_SECTION', 'Every section carries the Phase 5 native PDF layout contract.')

  return checks
}

function buildReleaseChecks({ releaseGate, organisationSync }) {
  const checks = []
  addCheck(
    checks,
    releaseGate.status === 'AWAITING_COUNSEL_APPROVAL' || releaseGate.releaseAllowed === true,
    'PHASE8_RELEASE_GATE_FAILS_CLOSED',
    'Phase 6 either blocks pending counsel approval or passes only with matching approval evidence.',
  )
  addCheck(
    checks,
    releaseGate.releaseAllowed === false || releaseGate.summary?.approvalBlockerCount === 0,
    'PHASE8_RELEASE_ALLOWED_ONLY_WITH_APPROVAL_EVIDENCE',
    'Release allowed requires complete Phase 6 approval evidence.',
  )
  addCheck(
    checks,
    organisationSync.status === 'SYNC_BLOCKED_PHASE6_GATE' || organisationSync.syncAllowed === true,
    'PHASE8_ORGANISATION_SYNC_BOUND_TO_PHASE6',
    'Organisation sync is blocked until Phase 6 passes.',
  )
  addCheck(
    checks,
    organisationSync.actions.every((action) => action.isDefault === false && action.isActive === false),
    'PHASE8_ORGANISATION_SYNC_DRAFT_ONLY',
    'Organisation sync actions stay draft/revision-only and never directly mark templates active/default.',
  )
  addCheck(
    checks,
    organisationSync.actions.every((action) => text(action.applyPath).includes('bridge_publish_template_revision_b4')),
    'PHASE8_ORGANISATION_ACTIVATION_PUBLISH_FLOW_BOUND',
    'Any later organisation activation remains bound to bridge_publish_template_revision_b4 after inspection.',
  )
  addCheck(
    checks,
    organisationSync.contract === MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT,
    'PHASE8_ORGANISATION_SYNC_CONTRACT_BOUND',
    'Organisation sync plan uses the Phase 7 sync contract.',
  )
  return checks
}

function buildCanonicalPayloadChecks(organisationSync = {}) {
  const checks = []
  const payloads = organisationSync.targetPlans
    .map((plan) => plan.templateInput)
    .filter(Boolean)
  const validations = payloads.map((payload) => ({
    organisationId: payload.organisationId,
    validation: validateCanonicalTemplateDefinition(payload.canonicalDefinition),
    payload,
  }))
  const invalid = validations.filter((item) => !item.validation.valid)
  const unsafePayloads = payloads.filter((payload) => payload.templateStatus !== 'draft' || payload.isActive === true || payload.isDefault === true)

  addCheck(checks, invalid.length === 0, 'PHASE8_ORGANISATION_PAYLOADS_CANONICAL', invalid.length ? invalid.map((item) => `${item.organisationId}: ${item.validation.blockers.join(', ')}`).join('; ') : 'Organisation sync payloads have valid canonical definitions.')
  addCheck(checks, unsafePayloads.length === 0, 'PHASE8_ORGANISATION_PAYLOADS_NOT_LIVE', unsafePayloads.length ? `Unsafe payloads: ${unsafePayloads.map((payload) => payload.organisationId).join(', ')}` : 'Organisation sync payloads remain draft and inactive.')
  addCheck(checks, payloads.every((payload) => payload.sections?.every((section) => section.metadataJson?.phase7_sync_contract === MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT)), 'PHASE8_PHASE7_METADATA_ON_SYNCED_SECTIONS', 'Every synced section carries the Phase 7 sync contract metadata.')

  return checks
}

function buildStatus({ blockers = [], releaseGate = {}, organisationSync = {} } = {}) {
  if (blockers.length) return 'ENFORCEMENT_BROKEN'
  if (!releaseGate.releaseAllowed || organisationSync.status === 'SYNC_BLOCKED_PHASE6_GATE') return 'ENFORCEMENT_ACTIVE_RELEASE_BLOCKED'
  return 'ENFORCEMENT_ACTIVE'
}

export function buildMandateTemplateForwardEnforcementReport({
  packageScripts = {},
  sections = listMandateTemplateWordingVNextSections(),
  rendererSource = '',
  organisations = [],
  existingTemplates = [],
  approvalEvidence = {},
  expectedContentDigest = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  const wording = buildMandateTemplateWordingVNext({ existingSections: sections, generatedAt })
  const resolvedSections = wording.sections
  const pdfLayout = buildMandateTemplatePdfLayoutVNextReport({
    sections: resolvedSections,
    rendererSource,
    generatedAt,
  })
  const releaseGate = buildMandateTemplateApprovalReleaseGate({
    sections: resolvedSections,
    rendererSource,
    approvalEvidence,
    expectedContentDigest,
    generatedAt,
  })
  const organisationSync = buildMandateTemplateOrganisationSyncPlan({
    organisations,
    existingTemplates,
    sections: resolvedSections,
    rendererSource,
    approvalEvidence,
    expectedContentDigest,
    generatedAt,
  })
  const checks = [
    ...buildScriptChecks(packageScripts),
    ...buildTemplateDriftChecks({ sections, wording, pdfLayout }),
    ...buildReleaseChecks({ releaseGate, organisationSync }),
    ...buildCanonicalPayloadChecks(organisationSync),
  ]
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')
  const status = buildStatus({ blockers, releaseGate, organisationSync })

  return {
    version: MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_VERSION,
    contract: MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_CONTRACT,
    generatedAt,
    mutatedData: false,
    status,
    enforcementActive: blockers.length === 0,
    releaseBlockedByApproval: !releaseGate.releaseAllowed,
    checks,
    blockers,
    warnings,
    summary: {
      status,
      enforcementActive: blockers.length === 0,
      checkCount: checks.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
      sectionCount: resolvedSections.length,
      tokenCount: placeholderTokens(resolvedSections).length,
      releaseGateStatus: releaseGate.status,
      organisationSyncStatus: organisationSync.status,
      organisationSyncActionCount: organisationSync.actions.length,
    },
    scriptChain: MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN,
    wording: {
      version: wording.version,
      status: wording.summary.status,
    },
    pdfLayout: {
      version: pdfLayout.version,
      status: pdfLayout.summary.status,
      maxEstimatedPages: pdfLayout.summary.maxEstimatedPages,
    },
    releaseGate: {
      version: releaseGate.version,
      status: releaseGate.status,
      releaseAllowed: releaseGate.releaseAllowed,
      expectedContentDigest: releaseGate.expectedContentDigest,
      blockerCount: releaseGate.blockers.length,
    },
    organisationSync: {
      version: organisationSync.version,
      contract: organisationSync.contract,
      status: organisationSync.status,
      syncAllowed: organisationSync.syncAllowed,
      actionCount: organisationSync.actions.length,
      blockerCount: organisationSync.blockers.length,
    },
    enforcementRules: [
      'Any wording or layout change must keep the Phase 1-5 gates passing.',
      'Any legal approval or release must pass Phase 6 with matching content digest and service-owned B3 evidence.',
      'Any organisation template propagation must use Phase 7 draft/revision sync payloads before publish.',
      'Any production activation must use the existing publish flow after rendered PDF visual inspection.',
      'The verify:mandate-template-vnext script is the standing regression chain for future changes.',
    ],
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => text(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatMandateTemplateForwardEnforcementMarkdown(report = buildMandateTemplateForwardEnforcementReport()) {
  return [
    '# Mandate Template vNext Phase 8 Enforcement Going Forward',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Enforcement active: ${report.enforcementActive ? 'yes' : 'no'}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Checks', report.summary.checkCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Sections', report.summary.sectionCount],
        ['Merge fields', report.summary.tokenCount],
        ['Phase 6 status', report.summary.releaseGateStatus],
        ['Phase 7 status', report.summary.organisationSyncStatus],
        ['Organisation sync actions', report.summary.organisationSyncActionCount],
      ],
    ),
    '',
    '## Script Chain',
    '',
    ...report.scriptChain.map((script) => `- ${script}`),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Enforcement Rules',
    '',
    ...report.enforcementRules.map((rule) => `- ${rule}`),
    '',
    '## Boundary',
    '',
    'This Phase 8 report is a non-mutating forward-enforcement guard. It does not approve legal wording, publish templates, sync organisation records, or replace rendered PDF visual inspection.',
    '',
  ].join('\n')
}
