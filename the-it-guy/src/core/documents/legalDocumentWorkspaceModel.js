import { listLegalDocumentPreviewScenarios } from './legalDocumentPreviewScenarios.js'
import { templateSectionsToLegalDocumentBlocks } from './legalDocumentBlockAdapter.js'
import { resolveLegalTemplateGovernance } from './legalTemplateGovernance.js'

export const LEGAL_DOCUMENT_WORKSPACE_MODEL_VERSION = 'legal_document_workspace_v1'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getTemplateStatus(template = {}) {
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  const status = normalizeText(
    template.status || template.template_status || metadata.lifecycle_status || metadata.template_status,
  ).toLowerCase()
  if (status) return status
  if (template.is_active === false) return 'draft'
  return template.is_default ? 'published' : 'draft'
}

function isLiveTemplate(template = {}) {
  return template.is_active !== false && (
    Boolean(template.is_default) || ['active', 'approved', 'published', 'live'].includes(getTemplateStatus(template))
  )
}

function buildDocumentSummary(definition = {}, documentModel = {}, template = null) {
  const liveTemplate = documentModel.liveTemplate || (template && isLiveTemplate(template) ? template : null)
  return {
    key: definition.key || documentModel.key || '',
    packetType: definition.packetType || documentModel.packetType || normalizeText(template?.packet_type || template?.packetType),
    label: definition.label || documentModel.label || normalizeText(template?.template_label || template?.templateLabel) || 'Legal document',
    shortLabel: definition.shortLabel || documentModel.shortLabel || '',
    status: documentModel.status || (liveTemplate ? 'live' : template ? 'draft' : 'missing'),
    liveVersion: normalizeText(liveTemplate?.version_tag || liveTemplate?.versionTag) || null,
    liveTemplateId: liveTemplate?.id || null,
    lastPublishedAt: liveTemplate?.published_at || liveTemplate?.updated_at || liveTemplate?.created_at || null,
  }
}

function buildWorkingDraft(template = null) {
  if (!template) {
    return {
      templateId: null,
      version: null,
      updatedAt: null,
      status: 'missing',
      dirty: false,
      saveStatus: 'idle',
    }
  }
  return {
    templateId: template.id || null,
    version: normalizeText(template.version_tag || template.versionTag) || null,
    updatedAt: template.updated_at || template.updatedAt || null,
    status: getTemplateStatus(template),
    dirty: false,
    saveStatus: 'saved',
  }
}

const PUBLICATION_STEP_LABELS = Object.freeze({
  structure: 'Document content',
  wording: 'Conditional wording',
  approval: 'Legal approval',
  runtime: 'Publication validation',
  certification: 'Scenario testing',
  activation: 'Live version',
})

function buildPublicationProjection(documentModel = {}, template = null) {
  if (!template) {
    return {
      status: 'blocked',
      ready: false,
      passedChecks: 0,
      totalChecks: 1,
      checks: [{ key: 'content', label: 'Document content', passed: false, detail: 'Set up the document before publishing.' }],
      blockingItems: [{ key: 'content', message: 'Set up the document before publishing.', blockKey: null }],
      warnings: [],
    }
  }

  const launchReadiness = documentModel.launchReadiness
  if (launchReadiness?.steps?.length) {
    const checks = launchReadiness.steps.map((step) => ({
      key: step.key,
      label: PUBLICATION_STEP_LABELS[step.key] || step.label,
      passed: Boolean(step.passed),
      detail: step.detail || '',
    }))
    const ready = Boolean(launchReadiness.canActivate || launchReadiness.canGenerateLive)
    return {
      status: launchReadiness.canGenerateLive ? 'live' : ready ? 'ready' : 'blocked',
      ready,
      passedChecks: checks.filter((check) => check.passed).length,
      totalChecks: checks.length,
      checks,
      blockingItems: (launchReadiness.blockers || []).map((message, index) => ({
        key: `publication-blocker-${index + 1}`,
        message,
        blockKey: null,
      })),
      warnings: [],
    }
  }

  const live = isLiveTemplate(template)
  const draftCount = Number(documentModel.draftCount || 0)
  const ready = !live || draftCount > 0
  return {
    status: ready ? 'ready' : 'live',
    ready,
    passedChecks: 1,
    totalChecks: 1,
    checks: [{ key: 'content', label: 'Document content', passed: true, detail: 'Document content is available.' }],
    blockingItems: [],
    warnings: [],
  }
}

function buildVersionHistory(template = null, documentModel = {}) {
  const explicitVersions = Array.isArray(template?.versions)
    ? template.versions
    : Array.isArray(template?.template_versions)
      ? template.template_versions
      : []
  const templates = explicitVersions.length ? explicitVersions : Array.isArray(documentModel.templates) ? documentModel.templates : []
  return templates
    .filter(Boolean)
    .map((version) => ({
      id: version.id || version.template_version_id || null,
      version: normalizeText(version.version_tag || version.versionTag) || null,
      status: getTemplateStatus(version),
      updatedAt: version.updated_at || version.updatedAt || version.created_at || null,
      live: isLiveTemplate(version),
    }))
}

function buildRecoveryProjection(definition = {}, documentModel = {}) {
  if (definition.key !== 'otp') return null
  const operations = documentModel.rolloutOperations
  if (!operations) {
    return {
      status: 'not_available',
      healthy: false,
      canRestore: false,
      canonical: false,
      liveTemplateId: documentModel.liveTemplateId || null,
      liveVersionId: null,
      restoreVersionId: null,
      restoreVersionLabel: null,
      checks: [],
      blockers: ['Recovery checks are not available for this live OTP.'],
    }
  }
  return {
    status: operations.status || 'not_available',
    healthy: Boolean(operations.healthy),
    canRestore: Boolean(operations.canRollback),
    canonical: Boolean(operations.canonical),
    liveTemplateId: operations.liveTemplateId || documentModel.liveTemplateId || null,
    liveVersionId: operations.liveVersionId || null,
    restoreVersionId: operations.rollbackVersionId || operations.rollbackTemplateId || null,
    restoreVersionLabel: operations.rollbackTemplateLabel || 'Previous live OTP version',
    checks: Array.isArray(operations.checks) ? operations.checks : [],
    blockers: Array.isArray(operations.blockers) ? operations.blockers : [],
  }
}

export function buildLegalDocumentRecoveryPermission(liveTemplate = null, organisationId = '', {
  appRole = '',
  membershipRole = '',
} = {}) {
  if (!liveTemplate) return { allowed: false, reason: 'No live OTP is available to recover.' }
  const templateOrganisationId = normalizeText(liveTemplate.organisation_id || liveTemplate.organisationId)
  const activeOrganisationId = normalizeText(organisationId)
  const roles = [appRole, membershipRole].map((role) => normalizeText(role).toLowerCase().replace(/\s+/g, '_'))
  const canManage = roles.some((role) => ['developer', 'owner', 'principal', 'admin', 'super_admin'].includes(role))
  if (!canManage) return { allowed: false, reason: 'Only an agency administrator can restore a previous live OTP.' }
  if (!templateOrganisationId || templateOrganisationId !== activeOrganisationId) {
    return { allowed: false, reason: 'The live OTP does not belong to the active organisation.' }
  }
  return { allowed: true, reason: '' }
}

export function buildLegalDocumentWorkspaceEditPermission(template = null, organisationId = '', {
  appRole = '',
  membershipRole = '',
} = {}) {
  if (!template) return { editable: false, reason: 'Set up a draft before editing.' }
  const governance = resolveLegalTemplateGovernance(template)
  const templateOrganisationId = normalizeText(template.organisation_id || template.organisationId)
  const activeOrganisationId = normalizeText(organisationId)
  const roles = [appRole, membershipRole].map((role) => normalizeText(role).toLowerCase().replace(/\s+/g, '_'))
  const canManage = roles.some((role) => ['developer', 'owner', 'principal', 'admin', 'super_admin'].includes(role))
  if (!canManage) {
    return { editable: false, reason: 'Only an agency administrator can change legal document drafts.' }
  }
  if (!templateOrganisationId || templateOrganisationId !== activeOrganisationId) {
    return { editable: false, reason: 'Create an agency-owned draft before editing this document.' }
  }
  if (governance.immutable) {
    return { editable: false, reason: 'The live version is protected. Create a new draft to change its wording.' }
  }
  return { editable: true, reason: '' }
}

export function buildLegalDocumentWorkspaceModel({
  definition = {},
  documentModel = {},
  template = null,
  selectedBlockId = '',
} = {}) {
  const document = buildDocumentSummary(definition, documentModel, template)
  const blocks = templateSectionsToLegalDocumentBlocks(template?.sections, {
    packetType: document.packetType,
    templateId: template?.id,
  })
  const requestedBlockId = normalizeText(selectedBlockId)
  const resolvedSelectedBlockId = blocks.some((block) => block.id === requestedBlockId)
    ? requestedBlockId
    : blocks[0]?.id || null

  return {
    schemaVersion: LEGAL_DOCUMENT_WORKSPACE_MODEL_VERSION,
    document,
    workingDraft: buildWorkingDraft(template),
    outline: blocks.map((block, index) => ({
      id: block.id,
      key: block.key,
      label: block.label,
      position: index + 1,
      kind: block.kind,
      conditional: block.classification.conditional,
      signing: block.classification.signing,
    })),
    blocks,
    selectedBlockId: resolvedSelectedBlockId,
    selectedBlock: blocks.find((block) => block.id === resolvedSelectedBlockId) || null,
    publication: buildPublicationProjection(documentModel, template),
    recovery: buildRecoveryProjection(definition, documentModel),
    scenarios: listLegalDocumentPreviewScenarios(),
    versionHistory: buildVersionHistory(template, documentModel),
  }
}
