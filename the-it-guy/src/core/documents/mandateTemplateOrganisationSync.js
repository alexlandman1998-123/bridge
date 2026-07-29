import { buildCanonicalTemplateDefinition } from './canonicalTemplateDefinition.js'
import { PHASE4_B3_RELEASE_CONTRACT } from './legalTemplateApproval.js'
import {
  MANDATE_TEMPLATE_APPROVAL_RELEASE_GATE_VERSION,
  MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT,
  buildMandateTemplateApprovalReleaseGate,
} from './mandateTemplateApprovalReleaseGate.js'
import {
  listMandateTemplateWordingVNextSections,
  MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
} from './mandateTemplateWordingVNext.js'

export const MANDATE_TEMPLATE_ORGANISATION_SYNC_VERSION = 'mandate_template_vnext_phase7_organisation_sync_v1'
export const MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT = 'mandate-template-vnext-organisation-sync-v1'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function key(value, fallback = 'item') {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function isMandateTemplate(template = {}) {
  return lower(template.packet_type || template.packetType) === 'mandate' &&
    lower(template.module_type || template.moduleType || 'agency') === 'agency'
}

function isImmutableTemplate(template = {}) {
  const status = lower(template.status || template.templateStatus || object(template.metadata_json || template.metadataJson).template_status)
  return ['published', 'active', 'live', 'approved', 'archived', 'superseded'].includes(status) ||
    template.is_default === true ||
    template.isDefault === true ||
    template.is_active === true ||
    template.isActive === true
}

function updatedTime(template = {}) {
  return Date.parse(template.updated_at || template.updatedAt || template.published_at || template.publishedAt || template.created_at || template.createdAt || '') || 0
}

function templateMetadata(template = {}) {
  return object(template.metadata_json || template.metadataJson)
}

function phase7SyncMetadata(template = {}) {
  const metadata = templateMetadata(template)
  return object(metadata.mandate_vnext_phase7_sync || metadata.mandateVnextPhase7Sync)
}

function isSyncedToDigest(template = {}, expectedContentDigest = '') {
  const metadata = templateMetadata(template)
  const sync = phase7SyncMetadata(template)
  return Boolean(expectedContentDigest) && (
    text(sync.source_content_digest || sync.sourceContentDigest) === expectedContentDigest ||
    text(metadata.mandate_vnext_source_content_digest || metadata.mandateVnextSourceContentDigest) === expectedContentDigest
  )
}

function normaliseOrganisation(input = {}) {
  const source = typeof input === 'string' ? { id: input } : object(input)
  return {
    organisationId: text(source.id || source.organisation_id || source.organisationId),
    organisationName: text(source.name || source.organisation_name || source.organisationName),
  }
}

function normaliseSectionForPayload(section = {}, index = 0, syncMetadata = {}) {
  const metadata = object(section.metadata_json || section.metadataJson || section.metadata)
  return {
    sectionKey: key(section.section_key || section.sectionKey || section.key, `section_${index + 1}`),
    sectionLabel: text(section.section_label || section.sectionLabel || section.label) || `Section ${index + 1}`,
    sectionType: key(section.section_type || section.sectionType || section.type, 'legal_text'),
    sortOrder: Number.isFinite(Number(section.sort_order ?? section.sortOrder)) ? Math.trunc(Number(section.sort_order ?? section.sortOrder)) : index,
    isRequired: section.is_required === undefined ? Boolean(section.required ?? true) : Boolean(section.is_required),
    isRepeatable: Boolean(section.is_repeatable ?? section.isRepeatable ?? section.repeatable),
    conditionJson: clone(object(section.condition_json || section.conditionJson || section.condition)),
    placeholderKeys: Array.from(new Set([
      ...((section.placeholder_keys || section.placeholderKeys || []).map(key)),
      ...Array.from(String(section.legal_text || section.legalText || '').matchAll(/{{\s*([^{}]+?)\s*}}/g)).map((match) => key(match[1])),
    ].filter(Boolean))).sort(),
    legalText: String(section.legal_text || section.legalText || ''),
    metadataJson: {
      ...clone(metadata),
      editable: metadata.editable !== false,
      organisation_synced_copy: true,
      phase7_sync_contract: MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT,
      mandate_vnext_phase7_sync: clone(syncMetadata),
    },
  }
}

function approvalMetadata(releaseGate = {}) {
  const approval = object(releaseGate.approval)
  return {
    legal_review_status: approval.status || null,
    legal_approved_at: approval.approvedAt || null,
    legal_approval_reference: approval.reference || null,
    legal_approval_content_digest: approval.contentDigest || null,
    legal_counsel_review_evidence_digest: approval.reviewEvidenceDigest || null,
    legal_revoked_at: approval.revokedAt || null,
    legal_b1_manifest_digest: approval.b1ManifestDigest || null,
    legal_b3_applied_at: approval.b3AppliedAt || null,
    legal_b3_applied_by: approval.b3AppliedBy || null,
    legal_b3_application_reference: approval.b3ApplicationReference || null,
    legal_phase4_b3_release_contract: approval.phase4B3ReleaseContract || null,
  }
}

function buildSyncMetadata({ organisationId, releaseGate, generatedAt }) {
  return {
    contract: MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT,
    version: MANDATE_TEMPLATE_ORGANISATION_SYNC_VERSION,
    synced_at: generatedAt,
    organisation_id: organisationId,
    source_phase6_gate_version: releaseGate.version || MANDATE_TEMPLATE_APPROVAL_RELEASE_GATE_VERSION,
    source_release_contract: releaseGate.releaseContract || MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT,
    runtime_release_contract: releaseGate.runtimeReleaseContract || PHASE4_B3_RELEASE_CONTRACT,
    source_content_digest: releaseGate.expectedContentDigest || null,
    wording_version: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
    section_count: releaseGate.summary?.sectionCount || 0,
    sync_mode: 'draft_or_revision_only',
  }
}

function buildTemplateInput({
  organisation,
  sourceSections,
  releaseGate,
  existingTemplate = null,
  actionType,
  generatedAt,
} = {}) {
  const syncMetadata = buildSyncMetadata({
    organisationId: organisation.organisationId,
    releaseGate,
    generatedAt,
  })
  const suffix = text(releaseGate.expectedContentDigest).replace(/^sha256:/, '').slice(0, 12) || key(generatedAt, 'phase7')
  const existingMetadata = templateMetadata(existingTemplate || {})
  const baseTemplateId = text(existingTemplate?.id || existingTemplate?.templateId || existingMetadata.base_template_id || existingMetadata.source_template_id)
  const sections = sourceSections.map((section, index) => normaliseSectionForPayload(section, index, syncMetadata))
  const templateLabel = 'Mandate vNext'
  const templateKey = key(
    actionType === 'create_revision'
      ? `${existingTemplate?.template_key || existingTemplate?.templateKey || 'mandate_default_v1'}_vnext_${suffix}`
      : `mandate_vnext_${key(organisation.organisationId).slice(0, 16)}_${suffix}`,
    `mandate_vnext_${suffix}`,
  )
  const metadataJson = {
    ...existingMetadata,
    ...approvalMetadata(releaseGate),
    lifecycle_status: 'draft',
    template_status: 'draft',
    template_scope: 'organisation',
    render_mode: 'native_structured',
    native_template: true,
    mandate_template_variant: 'default',
    mandateTemplateVariant: 'default',
    inherit_organisation_branding: true,
    branding: {
      ...object(existingMetadata.branding),
      inheritOrganisationBranding: true,
    },
    organisation_template_sync_contract: MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT,
    mandate_vnext_source_content_digest: releaseGate.expectedContentDigest || null,
    mandate_vnext_phase7_sync: syncMetadata,
  }
  const versionTag = actionType === 'create_revision'
    ? `phase7-v${Math.max(2, Number(existingTemplate?.revision_number || existingTemplate?.revisionNumber || 1) + 1)}`
    : 'phase7-v1'

  return {
    organisationId: organisation.organisationId,
    packetType: 'mandate',
    moduleType: 'agency',
    templateKey,
    templateLabel,
    description: 'Organisation draft synced from the approved mandate vNext wording and PDF layout contract.',
    versionTag,
    templateStatus: 'draft',
    templateFormat: 'structured',
    templateStorageBucket: null,
    templateStoragePath: null,
    templateFileName: null,
    isDefault: false,
    isActive: false,
    revisionRootTemplateId: baseTemplateId || null,
    revisionParentTemplateId: text(existingTemplate?.id || existingTemplate?.templateId) || null,
    revisionNumber: actionType === 'create_revision'
      ? Math.max(2, Number(existingTemplate?.revision_number || existingTemplate?.revisionNumber || 1) + 1)
      : 1,
    metadataJson,
    sections,
    canonicalDefinition: buildCanonicalTemplateDefinition({
      id: text(existingTemplate?.id || existingTemplate?.templateId) || null,
      organisation_id: organisation.organisationId,
      module_type: 'agency',
      packet_type: 'mandate',
      template_key: templateKey,
      template_label: templateLabel,
      template_format: 'structured',
      version_tag: versionTag,
      status: 'draft',
      is_default: false,
      is_active: false,
      metadata_json: metadataJson,
      sections,
    }, sections.map((section) => ({
      section_key: section.sectionKey,
      section_label: section.sectionLabel,
      section_type: section.sectionType,
      sort_order: section.sortOrder,
      is_required: section.isRequired,
      is_repeatable: section.isRepeatable,
      condition_json: section.conditionJson,
      placeholder_keys: section.placeholderKeys,
      legal_text: section.legalText,
      metadata_json: section.metadataJson,
    }))),
  }
}

function selectExistingTemplate(organisation = {}, templates = []) {
  const organisationId = organisation.organisationId
  return (Array.isArray(templates) ? templates : [])
    .filter((template) => text(template.organisation_id || template.organisationId) === organisationId && isMandateTemplate(template))
    .sort((left, right) => {
      const leftDefault = left.is_default === true || left.isDefault === true ? 1 : 0
      const rightDefault = right.is_default === true || right.isDefault === true ? 1 : 0
      if (leftDefault !== rightDefault) return rightDefault - leftDefault
      const leftActive = left.is_active === true || left.isActive === true ? 1 : 0
      const rightActive = right.is_active === true || right.isActive === true ? 1 : 0
      if (leftActive !== rightActive) return rightActive - leftActive
      return updatedTime(right) - updatedTime(left)
    })[0] || null
}

function buildTargetPlan({ organisation, existingTemplates, sourceSections, releaseGate, generatedAt }) {
  const blockers = []
  const warnings = []
  if (!organisation.organisationId) {
    blockers.push({
      code: 'PHASE7_ORGANISATION_ID_MISSING',
      detail: 'Organisation sync target must include an organisation id.',
    })
    return {
      organisationId: null,
      organisationName: organisation.organisationName || null,
      action: 'blocked',
      ready: false,
      blockers,
      warnings,
      templateInput: null,
    }
  }

  const syncedTemplate = (Array.isArray(existingTemplates) ? existingTemplates : [])
    .filter((template) => text(template.organisation_id || template.organisationId) === organisation.organisationId && isMandateTemplate(template))
    .find((template) => isSyncedToDigest(template, releaseGate.expectedContentDigest))
  if (syncedTemplate) {
    return {
      organisationId: organisation.organisationId,
      organisationName: organisation.organisationName || null,
      action: 'already_synced',
      ready: true,
      blockers,
      warnings,
      existingTemplateId: text(syncedTemplate.id || syncedTemplate.templateId),
      existingTemplateKey: text(syncedTemplate.template_key || syncedTemplate.templateKey),
      templateInput: null,
    }
  }

  const existingTemplate = selectExistingTemplate(organisation, existingTemplates)
  const action = existingTemplate
    ? isImmutableTemplate(existingTemplate)
      ? 'create_revision'
      : 'update_draft'
    : 'create_draft'
  const templateInput = buildTemplateInput({
    organisation,
    sourceSections,
    releaseGate,
    existingTemplate,
    actionType: action,
    generatedAt,
  })

  if (existingTemplate && isImmutableTemplate(existingTemplate)) {
    warnings.push({
      code: 'PHASE7_EXISTING_TEMPLATE_IMMUTABLE_REVISION_REQUIRED',
      detail: 'Existing organisation mandate template is immutable; sync creates a draft revision rather than mutating it.',
      templateId: text(existingTemplate.id || existingTemplate.templateId),
    })
  }

  return {
    organisationId: organisation.organisationId,
    organisationName: organisation.organisationName || null,
    action,
    ready: true,
    blockers,
    warnings,
    existingTemplateId: text(existingTemplate?.id || existingTemplate?.templateId) || null,
    existingTemplateKey: text(existingTemplate?.template_key || existingTemplate?.templateKey) || null,
    templateInput,
  }
}

function buildStatus({ releaseGate, targetPlans }) {
  if (!releaseGate.releaseAllowed) return 'SYNC_BLOCKED_PHASE6_GATE'
  if (!targetPlans.length) return 'SYNC_BLOCKED_NO_ORGANISATIONS'
  if (targetPlans.some((plan) => plan.blockers.length)) return 'SYNC_BLOCKED_TARGETS'
  if (targetPlans.every((plan) => plan.action === 'already_synced')) return 'SYNC_ALREADY_CURRENT'
  return 'SYNC_READY_FOR_DRAFT_CREATION'
}

export function buildMandateTemplateOrganisationSyncPlan({
  organisations = [],
  existingTemplates = [],
  sections = listMandateTemplateWordingVNextSections(),
  rendererSource = '',
  approvalEvidence = {},
  expectedContentDigest = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  const releaseGate = buildMandateTemplateApprovalReleaseGate({
    sections,
    rendererSource,
    approvalEvidence,
    expectedContentDigest,
    generatedAt,
  })
  const sourceSections = releaseGate.wording?.summary?.sectionCount ? sections : listMandateTemplateWordingVNextSections()
  const normalisedOrganisations = (Array.isArray(organisations) ? organisations : [])
    .map(normaliseOrganisation)
    .filter((organisation, index, list) => organisation.organisationId || list.length === 1 || index >= 0)
  const targetPlans = releaseGate.releaseAllowed
    ? normalisedOrganisations.map((organisation) => buildTargetPlan({
        organisation,
        existingTemplates,
        sourceSections,
        releaseGate,
        generatedAt,
      }))
    : normalisedOrganisations.map((organisation) => ({
        organisationId: organisation.organisationId || null,
        organisationName: organisation.organisationName || null,
        action: 'blocked',
        ready: false,
        blockers: [{
          code: 'PHASE7_PHASE6_RELEASE_GATE_NOT_PASSED',
          detail: 'Organisation template sync is blocked until the Phase 6 approval release gate passes.',
        }],
        warnings: [],
        templateInput: null,
      }))
  const status = buildStatus({ releaseGate, targetPlans })
  const blockers = [
    ...(!releaseGate.releaseAllowed ? [{
      code: 'PHASE7_PHASE6_RELEASE_GATE_NOT_PASSED',
      detail: `Phase 6 status is ${releaseGate.status}; sync cannot prepare organisation drafts until release evidence matches.`,
    }] : []),
    ...(releaseGate.releaseAllowed && !targetPlans.length ? [{
      code: 'PHASE7_NO_ORGANISATION_TARGETS',
      detail: 'Provide at least one organisation id before preparing sync payloads.',
    }] : []),
    ...targetPlans.flatMap((plan) => plan.blockers.map((blocker) => ({
      ...blocker,
      organisationId: plan.organisationId,
    }))),
  ]
  const warnings = targetPlans.flatMap((plan) => plan.warnings.map((warning) => ({
    ...warning,
    organisationId: plan.organisationId,
  })))
  const actions = targetPlans
    .filter((plan) => ['create_draft', 'create_revision', 'update_draft'].includes(plan.action))
    .map((plan) => ({
      organisationId: plan.organisationId,
      action: plan.action,
      templateKey: plan.templateInput?.templateKey || null,
      templateStatus: plan.templateInput?.templateStatus || null,
      isDefault: plan.templateInput?.isDefault === true,
      isActive: plan.templateInput?.isActive === true,
      sectionCount: plan.templateInput?.sections?.length || 0,
      applyPath: plan.action === 'create_revision'
        ? 'createDocumentPacketTemplateRevision then bridge_publish_template_revision_b4 after inspection'
        : plan.action === 'update_draft'
          ? 'updateDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection'
          : 'createDocumentPacketTemplate draft then bridge_publish_template_revision_b4 after inspection',
    }))

  return {
    version: MANDATE_TEMPLATE_ORGANISATION_SYNC_VERSION,
    contract: MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT,
    generatedAt,
    mutatedData: false,
    status,
    syncAllowed: blockers.length === 0,
    releaseGate: {
      version: releaseGate.version,
      status: releaseGate.status,
      releaseAllowed: releaseGate.releaseAllowed,
      expectedContentDigest: releaseGate.expectedContentDigest,
      releaseContract: releaseGate.releaseContract,
      runtimeReleaseContract: releaseGate.runtimeReleaseContract,
      blockerCount: releaseGate.blockers.length,
    },
    source: {
      packetType: 'mandate',
      templateKey: 'mandate_default_v1',
      wordingVersion: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
      contentDigest: releaseGate.expectedContentDigest || null,
      sectionCount: sourceSections.length,
    },
    summary: {
      status,
      syncAllowed: blockers.length === 0,
      targetCount: targetPlans.length,
      actionCount: actions.length,
      alreadySyncedCount: targetPlans.filter((plan) => plan.action === 'already_synced').length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    actions,
    targetPlans,
    blockers,
    warnings,
    operatorSteps: [
      'Run Phase 6 and keep the approved content digest fixed.',
      'Create or update organisation-owned mandate drafts from this sync plan only after Phase 6 passes.',
      'Render and visually inspect the organisation draft PDF so company branding, spacing, conditional sections and signature panels remain intact.',
      'Promote the inspected organisation draft through the existing bridge_publish_template_revision_b4 flow; do not mark the sync payload live directly.',
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

export function formatMandateTemplateOrganisationSyncMarkdown(report = buildMandateTemplateOrganisationSyncPlan()) {
  return [
    '# Mandate Template vNext Phase 7 Organisation Template Sync',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Sync allowed: ${report.syncAllowed ? 'yes' : 'no'}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Targets', report.summary.targetCount],
        ['Actions', report.summary.actionCount],
        ['Already synced', report.summary.alreadySyncedCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Source digest', report.source.contentDigest || 'missing'],
        ['Source sections', report.source.sectionCount],
      ],
    ),
    '',
    '## Phase 6 Gate',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Status', report.releaseGate.status],
        ['Release allowed', report.releaseGate.releaseAllowed ? 'yes' : 'no'],
        ['Release contract', report.releaseGate.releaseContract],
        ['Runtime B3 contract', report.releaseGate.runtimeReleaseContract],
        ['Expected digest', report.releaseGate.expectedContentDigest || 'missing'],
        ['Blockers', report.releaseGate.blockerCount],
      ],
    ),
    '',
    '## Target Plan',
    '',
    report.targetPlans.length
      ? table(
          ['Organisation', 'Name', 'Action', 'Existing Template', 'Ready'],
          report.targetPlans.map((plan) => [
            plan.organisationId || 'missing',
            plan.organisationName || '',
            plan.action,
            plan.existingTemplateId || '',
            plan.ready ? 'yes' : 'no',
          ]),
        )
      : 'No organisation targets supplied.',
    '',
    '## Actions',
    '',
    report.actions.length
      ? table(
          ['Organisation', 'Action', 'Template Key', 'Status', 'Default', 'Active', 'Sections', 'Apply Path'],
          report.actions.map((action) => [
            action.organisationId,
            action.action,
            action.templateKey,
            action.templateStatus,
            action.isDefault ? 'yes' : 'no',
            action.isActive ? 'yes' : 'no',
            action.sectionCount,
            action.applyPath,
          ]),
        )
      : 'No draft sync actions are currently executable.',
    '',
    '## Blockers',
    '',
    report.blockers.length
      ? table(['Code', 'Organisation', 'Detail'], report.blockers.map((blocker) => [blocker.code, blocker.organisationId || '', blocker.detail]))
      : 'No blockers.',
    '',
    '## Operator Steps',
    '',
    ...report.operatorSteps.map((step) => `- ${step}`),
    '',
    '## Boundary',
    '',
    'This Phase 7 report does not mutate live data. It prepares organisation-owned draft/revision sync payloads only; activation remains a separate publish action after approval evidence and visual PDF inspection.',
    '',
  ].join('\n')
}
