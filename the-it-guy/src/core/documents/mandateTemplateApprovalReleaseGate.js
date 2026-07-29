import {
  PHASE4_B3_RELEASE_CONTRACT,
  readLegalTemplateApproval,
} from './legalTemplateApproval.js'
import {
  buildMandateTemplateDataSourceReport,
  listMandateTemplateDataSourceMappings,
  MANDATE_TEMPLATE_DATA_SOURCE_MAP_VERSION,
} from './mandateTemplateDataSourceMap.js'
import {
  buildMandateTemplatePdfLayoutVNextReport,
  MANDATE_TEMPLATE_PDF_LAYOUT_VNEXT_VERSION,
} from './mandateTemplatePdfLayoutVNext.js'
import {
  buildMandateTemplatePublishGateReport,
  MANDATE_TEMPLATE_PUBLISH_GATE_VERSION,
} from './mandateTemplatePublishGate.js'
import {
  buildMandateTemplateWordingVNext,
  listMandateTemplateWordingVNextSections,
  MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
} from './mandateTemplateWordingVNext.js'

export const MANDATE_TEMPLATE_APPROVAL_RELEASE_GATE_VERSION = 'mandate_template_vnext_phase6_approval_release_gate_v1'
export const MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT = 'mandate-template-vnext-release-v1'

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

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  )
}

export function stringifyMandateTemplateApprovalDigestPayload(payload = {}) {
  return JSON.stringify(sortJson(payload))
}

function sectionForDigest(section = {}) {
  return {
    section_key: normalizeKey(section.section_key || section.sectionKey || section.key),
    section_label: normalizeText(section.section_label || section.sectionLabel || section.label),
    section_type: normalizeKey(section.section_type || section.sectionType || section.type),
    sort_order: Number(section.sort_order ?? section.sortOrder ?? 0),
    is_required: Boolean(section.is_required ?? section.required),
    is_repeatable: Boolean(section.is_repeatable ?? section.repeatable),
    condition_json: sortJson(object(section.condition_json || section.conditionJson || section.condition)),
    placeholder_keys: Array.from(new Set([
      ...((section.placeholder_keys || section.placeholderKeys || []).map(normalizeKey)),
      ...Array.from(String(section.legal_text || section.legalText || '').matchAll(/{{\s*([^{}]+?)\s*}}/g)).map((match) => normalizeKey(match[1])),
    ].filter(Boolean))).sort(),
    legal_text: normalizeText(section.legal_text || section.legalText),
    metadata_json: sortJson(object(section.metadata_json || section.metadataJson || section.metadata)),
  }
}

export function buildMandateTemplateVNextApprovalDigestPayload({
  sections = listMandateTemplateWordingVNextSections(),
} = {}) {
  const wording = buildMandateTemplateWordingVNext({ existingSections: sections })
  return {
    release_contract: MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT,
    runtime_release_contract: PHASE4_B3_RELEASE_CONTRACT,
    wording_version: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
    data_source_map_version: MANDATE_TEMPLATE_DATA_SOURCE_MAP_VERSION,
    pdf_layout_version: MANDATE_TEMPLATE_PDF_LAYOUT_VNEXT_VERSION,
    publish_gate_version: MANDATE_TEMPLATE_PUBLISH_GATE_VERSION,
    packet_type: 'mandate',
    template_key: wording.template.templateKey,
    sections: wording.sections.map(sectionForDigest),
  }
}

function normalizeApprovalEvidence({ template = {}, approvalEvidence = {} } = {}) {
  const templateApproval = readLegalTemplateApproval(template)
  const evidence = object(approvalEvidence)
  const nested = object(evidence.legal_review || evidence.legalReview)
  return {
    status: normalizeText(evidence.status || evidence.legalReviewStatus || evidence.legal_review_status || nested.status || templateApproval.status).toLowerCase(),
    approvedAt: normalizeText(evidence.approvedAt || evidence.legalApprovedAt || evidence.legal_approved_at || nested.approvedAt || templateApproval.approvedAt),
    reference: normalizeText(evidence.reference || evidence.legalApprovalReference || evidence.legal_approval_reference || nested.reference || templateApproval.reference),
    contentDigest: normalizeText(evidence.contentDigest || evidence.legalApprovalContentDigest || evidence.legal_approval_content_digest || nested.contentDigest || templateApproval.contentDigest),
    reviewEvidenceDigest: normalizeText(evidence.reviewEvidenceDigest || evidence.legalCounselReviewEvidenceDigest || evidence.legal_counsel_review_evidence_digest || nested.reviewEvidenceDigest || templateApproval.reviewEvidenceDigest),
    revokedAt: normalizeText(evidence.revokedAt || evidence.legalRevokedAt || evidence.legal_revoked_at || nested.revokedAt || templateApproval.revokedAt),
    b1ManifestDigest: normalizeText(evidence.b1ManifestDigest || evidence.legalB1ManifestDigest || evidence.legal_b1_manifest_digest || templateApproval.b1ManifestDigest),
    b3AppliedAt: normalizeText(evidence.b3AppliedAt || evidence.legalB3AppliedAt || evidence.legal_b3_applied_at || templateApproval.b3AppliedAt),
    b3AppliedBy: normalizeText(evidence.b3AppliedBy || evidence.legalB3AppliedBy || evidence.legal_b3_applied_by || templateApproval.b3AppliedBy),
    b3ApplicationReference: normalizeText(evidence.b3ApplicationReference || evidence.legalB3ApplicationReference || evidence.legal_b3_application_reference || templateApproval.b3ApplicationReference),
    phase4B3ReleaseContract: normalizeText(evidence.phase4B3ReleaseContract || evidence.legalPhase4B3ReleaseContract || evidence.legal_phase4_b3_release_contract || templateApproval.phase4B3ReleaseContract),
  }
}

function addCheck(checks, pass, code, detail, severity = 'blocking') {
  checks.push({
    code,
    pass: Boolean(pass),
    severity,
    detail,
  })
}

function isValidTimestamp(value) {
  return Boolean(normalizeText(value)) && Number.isFinite(Date.parse(value))
}

function buildApprovalChecks({ approval = {}, expectedContentDigest = '' } = {}) {
  const checks = []
  const hasAnyEvidence = Object.values(approval).some((value) => Boolean(normalizeText(value)))

  addCheck(checks, hasAnyEvidence, 'PHASE6_COUNSEL_APPROVAL_EVIDENCE_PRESENT', 'Independent counsel approval metadata is present before release.')
  addCheck(checks, approval.status === 'approved', 'PHASE6_COUNSEL_DECISION_APPROVED', 'Counsel review status is approved.')
  addCheck(checks, isValidTimestamp(approval.approvedAt), 'PHASE6_COUNSEL_APPROVAL_DATE_PRESENT', 'Counsel approval timestamp is present and parseable.')
  addCheck(checks, Boolean(approval.reference), 'PHASE6_COUNSEL_APPROVAL_REFERENCE_PRESENT', 'Counsel approval reference is present.')
  addCheck(checks, Boolean(expectedContentDigest), 'PHASE6_EXPECTED_CONTENT_DIGEST_BOUND', 'Phase 6 packet includes the expected vNext content digest.')
  addCheck(
    checks,
    Boolean(expectedContentDigest) && approval.contentDigest === expectedContentDigest,
    'PHASE6_COUNSEL_DIGEST_MATCHES_VNEXT',
    'Counsel approval content digest matches the Phase 6 vNext digest payload.',
  )
  addCheck(checks, Boolean(approval.reviewEvidenceDigest), 'PHASE6_COUNSEL_REVIEW_EVIDENCE_DIGEST_PRESENT', 'Counsel review evidence digest is present.')
  addCheck(checks, !approval.revokedAt, 'PHASE6_COUNSEL_APPROVAL_NOT_REVOKED', 'Counsel approval has not been revoked.')
  addCheck(checks, Boolean(approval.b1ManifestDigest), 'PHASE6_B1_MANIFEST_BOUND', 'Approval is bound to the frozen B1 review manifest.')
  addCheck(checks, isValidTimestamp(approval.b3AppliedAt), 'PHASE6_B3_APPLICATION_TIME_PRESENT', 'Service-owned B3 application timestamp is present and parseable.')
  addCheck(checks, Boolean(approval.b3AppliedBy), 'PHASE6_B3_APPLIED_BY_PRESENT', 'Service-owned B3 applied-by actor is present.')
  addCheck(checks, Boolean(approval.b3ApplicationReference), 'PHASE6_B3_APPLICATION_REFERENCE_PRESENT', 'Service-owned B3 application reference is present.')
  addCheck(
    checks,
    approval.phase4B3ReleaseContract === PHASE4_B3_RELEASE_CONTRACT,
    'PHASE6_B3_RELEASE_CONTRACT_BOUND',
    `Service-owned B3 metadata carries ${PHASE4_B3_RELEASE_CONTRACT}.`,
  )

  return checks
}

function buildStatus({ preApprovalBlockers = [], approvalBlockers = [], approval = {} } = {}) {
  if (preApprovalBlockers.length) return 'RELEASE_BLOCKED_PRE_APPROVAL'
  const hasAnyEvidence = Object.values(approval).some((value) => Boolean(normalizeText(value)))
  if (!hasAnyEvidence) return 'AWAITING_COUNSEL_APPROVAL'
  if (approvalBlockers.length) return 'RELEASE_BLOCKED_APPROVAL_EVIDENCE'
  return 'RELEASE_GATE_PASSED'
}

export function buildMandateTemplateApprovalReleaseGate({
  template = {},
  sections = listMandateTemplateWordingVNextSections(),
  rendererSource = '',
  approvalEvidence = {},
  expectedContentDigest = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  const wording = buildMandateTemplateWordingVNext({ template, existingSections: sections, generatedAt })
  const resolvedSections = wording.sections
  const pdfLayout = buildMandateTemplatePdfLayoutVNextReport({
    sections: resolvedSections,
    rendererSource,
    generatedAt,
  })
  const publishGate = buildMandateTemplatePublishGateReport({
    ...template,
    packet_type: 'mandate',
    template_key: template.template_key || template.templateKey || 'mandate_default_v1',
    sections: resolvedSections,
  }, { routeKey: 'default' })
  const dataSourceReport = buildMandateTemplateDataSourceReport({
    fields: wording.tokens,
    generatedAt,
  })
  const mappedKeys = new Set(listMandateTemplateDataSourceMappings({ fields: wording.tokens }).map((mapping) => mapping.key))
  const unmappedFields = wording.tokens.filter((token) => !mappedKeys.has(token))
  const digestPayload = buildMandateTemplateVNextApprovalDigestPayload({ sections: resolvedSections })
  const approval = normalizeApprovalEvidence({ template, approvalEvidence })
  const checks = []

  addCheck(checks, wording.summary.status === 'WORDING_VNEXT_READY_FOR_COUNSEL_REVIEW', 'PHASE6_WORDING_READY_FOR_COUNSEL', 'Phase 4 wording gate is ready for counsel review.')
  addCheck(checks, pdfLayout.summary.status === 'PDF_LAYOUT_PRESERVED_AND_REFINED', 'PHASE6_PDF_LAYOUT_GATE_PASSED', 'Phase 5 native PDF layout gate is preserved and refined.')
  addCheck(checks, publishGate.canPublish === true, 'PHASE6_CONTENT_PUBLISH_GATE_PASSED', 'Mandate content publish gate has no blocking issues.')
  addCheck(checks, unmappedFields.length === 0, 'PHASE6_DATA_SOURCE_FIELDS_MAPPED', unmappedFields.length ? `Unmapped fields: ${unmappedFields.join(', ')}` : 'Every vNext merge field has a canonical data-source mapping.')
  addCheck(checks, dataSourceReport.summary.total === wording.tokens.length, 'PHASE6_DATA_SOURCE_MAP_COVERS_VNEXT', 'Data source map covers the vNext token set.')
  addCheck(checks, resolvedSections.every((section) => object(section.metadata_json).wording_version === MANDATE_TEMPLATE_WORDING_VNEXT_VERSION), 'PHASE6_SECTIONS_VERSIONED', 'Every section carries the vNext wording version metadata.')
  addCheck(checks, resolvedSections.every((section) => object(object(section.metadata_json).native_pdf_layout).contract), 'PHASE6_SECTIONS_LAYOUT_CONTRACTED', 'Every section carries explicit native PDF layout contract metadata.')

  const approvalChecks = buildApprovalChecks({ approval, expectedContentDigest })
  const preApprovalBlockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const approvalBlockers = approvalChecks.filter((check) => !check.pass && check.severity === 'blocking')
  const status = buildStatus({ preApprovalBlockers, approvalBlockers, approval })

  return {
    version: MANDATE_TEMPLATE_APPROVAL_RELEASE_GATE_VERSION,
    generatedAt,
    mutatedData: false,
    releaseAllowed: status === 'RELEASE_GATE_PASSED',
    status,
    releaseContract: MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT,
    runtimeReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
    expectedContentDigest: normalizeText(expectedContentDigest),
    digestPayload,
    template: {
      templateKey: normalizeText(template.template_key || template.templateKey) || wording.template.templateKey,
      packetType: 'mandate',
      status: normalizeText(template.status),
      isActive: template.is_active === true || template.isActive === true,
    },
    summary: {
      status,
      releaseAllowed: status === 'RELEASE_GATE_PASSED',
      preApprovalBlockerCount: preApprovalBlockers.length,
      approvalBlockerCount: approvalBlockers.length,
      checkCount: checks.length + approvalChecks.length,
      sectionCount: resolvedSections.length,
      tokenCount: wording.tokens.length,
      dataSourceMappingCount: dataSourceReport.summary.total,
      maxEstimatedPages: pdfLayout.summary.maxEstimatedPages,
    },
    checks,
    approvalChecks,
    blockers: [...preApprovalBlockers, ...approvalBlockers],
    approval,
    wording: {
      version: wording.version,
      status: wording.summary.status,
      summary: wording.summary,
    },
    pdfLayout: {
      version: pdfLayout.version,
      status: pdfLayout.summary.status,
      summary: pdfLayout.summary,
    },
    publishGate: {
      version: publishGate.gateVersion,
      canPublish: publishGate.canPublish,
      blockingCount: publishGate.blockingCount,
      warningCount: publishGate.warningCount,
      blockers: publishGate.blockers,
      warnings: publishGate.warnings,
    },
    dataSourceMap: {
      version: dataSourceReport.version,
      summary: dataSourceReport.summary,
      unmappedFields,
    },
    releaseSteps: [
      'Freeze the Phase 6 digest payload and provide the Phase 4 wording plus Phase 5 layout report to counsel.',
      'Record the independent B2 counsel decision against the same content digest.',
      `Apply runtime approval only through the service-owned B3 path carrying ${PHASE4_B3_RELEASE_CONTRACT}.`,
      'Render and visually inspect the native PDF artifact before enabling the vNext mandate template for production use.',
    ],
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

export function formatMandateTemplateApprovalReleaseGateMarkdown(report = buildMandateTemplateApprovalReleaseGate()) {
  return [
    '# Mandate Template vNext Phase 6 Approval and Release Gate',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Release allowed: ${report.releaseAllowed ? 'yes' : 'no'}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Release Contract',
    '',
    table(
      ['Item', 'Value'],
      [
        ['Phase 6 contract', report.releaseContract],
        ['Required service-owned B3 contract', report.runtimeReleaseContract],
        ['Expected content digest', report.expectedContentDigest || 'missing'],
        ['Sections', report.summary.sectionCount],
        ['Merge fields', report.summary.tokenCount],
        ['Max estimated pages', report.summary.maxEstimatedPages],
        ['Pre-approval blockers', report.summary.preApprovalBlockerCount],
        ['Approval evidence blockers', report.summary.approvalBlockerCount],
      ],
    ),
    '',
    '## Pre-Approval Gates',
    '',
    table(
      ['Gate', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Approval Evidence Gate',
    '',
    table(
      ['Gate', 'Pass', 'Detail'],
      report.approvalChecks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Approval Evidence',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Status', report.approval.status || 'missing'],
        ['Approved at', report.approval.approvedAt || 'missing'],
        ['Reference', report.approval.reference || 'missing'],
        ['Content digest', report.approval.contentDigest || 'missing'],
        ['Counsel review evidence digest', report.approval.reviewEvidenceDigest || 'missing'],
        ['B1 manifest digest', report.approval.b1ManifestDigest || 'missing'],
        ['B3 applied at', report.approval.b3AppliedAt || 'missing'],
        ['B3 applied by', report.approval.b3AppliedBy || 'missing'],
        ['B3 application reference', report.approval.b3ApplicationReference || 'missing'],
        ['B3 release contract', report.approval.phase4B3ReleaseContract || 'missing'],
      ],
    ),
    '',
    '## Release Steps',
    '',
    ...report.releaseSteps.map((step) => `- ${step}`),
    '',
    '## Boundary',
    '',
    'This Phase 6 gate does not mutate live data and is not itself legal approval. Release remains blocked until independent counsel evidence and the service-owned B3 runtime approval metadata match this packet digest.',
    '',
  ].join('\n')
}
