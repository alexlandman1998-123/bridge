import { BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION } from './bondAttorneyModulePhase0.js'
import {
  buildBondAttorneyDataFingerprint,
  evaluateBondAttorneyDraftInvalidation,
  resolveBondAttorneyCanonicalData,
} from './bondAttorneyModulePhase2.js'

export const BOND_ATTORNEY_PHASE3_VERSION = 'bond_attorney_module_phase3_pack_workspace_v1'

export const BOND_PACK_WORKSPACE_STATUSES = Object.freeze({
  notStarted: 'not_started',
  missingInfo: 'missing_info',
  readyToDraft: 'ready_to_draft',
  draftGenerated: 'draft_generated',
  attorneyReview: 'attorney_review',
  approved: 'approved',
  sentForSignature: 'sent_for_signature',
  partiallySigned: 'partially_signed',
  fullySigned: 'fully_signed',
  bankSubmitted: 'bank_submitted',
  bankAccepted: 'bank_accepted',
  superseded: 'superseded',
  withdrawn: 'withdrawn',
})

export const BOND_PACK_ITEM_TYPES = Object.freeze({
  operationalDraft: 'operational_draft',
  legalInstrument: 'legal_instrument',
  bankControlled: 'bank_controlled',
  externalEvidence: 'external_evidence',
})

export const BOND_PACK_DRAFT_WATERMARK = 'DRAFT - ATTORNEY REVIEW REQUIRED'

const S = BOND_PACK_WORKSPACE_STATUSES

const STATUS_TRANSITIONS = Object.freeze({
  [S.notStarted]: Object.freeze([S.missingInfo, S.readyToDraft, S.withdrawn]),
  [S.missingInfo]: Object.freeze([S.readyToDraft, S.withdrawn]),
  [S.readyToDraft]: Object.freeze([S.draftGenerated, S.withdrawn]),
  [S.draftGenerated]: Object.freeze([S.attorneyReview, S.superseded, S.withdrawn]),
  [S.attorneyReview]: Object.freeze([S.approved, S.readyToDraft, S.superseded, S.withdrawn]),
  [S.approved]: Object.freeze([S.sentForSignature, S.bankSubmitted, S.superseded, S.withdrawn]),
  [S.sentForSignature]: Object.freeze([S.partiallySigned, S.fullySigned, S.superseded, S.withdrawn]),
  [S.partiallySigned]: Object.freeze([S.fullySigned, S.superseded, S.withdrawn]),
  [S.fullySigned]: Object.freeze([S.bankSubmitted, S.superseded, S.withdrawn]),
  [S.bankSubmitted]: Object.freeze([S.bankAccepted, S.superseded, S.withdrawn]),
  [S.bankAccepted]: Object.freeze([S.superseded]),
  [S.superseded]: Object.freeze([]),
  [S.withdrawn]: Object.freeze([]),
})

const DOCUMENT_FACTS = Object.freeze({
  instruction_acknowledgement: Object.freeze(['bank_name', 'bank_reference']),
  buyer_fica_request_pack: Object.freeze(['mortgagor_identity_and_capacity', 'buyer_marital_or_entity_authority']),
  bank_condition_schedule: Object.freeze(['bank_name', 'bank_reference', 'bank_conditions']),
  bond_signing_appointment_pack: Object.freeze(['mortgagor_identity_and_capacity', 'signing_method_and_signed_pack_status']),
  guarantee_request_cover: Object.freeze(['bank_name', 'bank_reference', 'guarantee_values_and_expiry']),
  lodgement_readiness_cover: Object.freeze(['approval_to_lodge_reference', 'lodgement_reference']),
  registration_notification: Object.freeze(['registration_date']),
  bank_closeout_report: Object.freeze(['bank_name', 'bank_reference', 'registration_date']),
  power_of_attorney_to_pass_mortgage_bond: Object.freeze(['mortgagor_identity_and_capacity', 'mortgagee_identity', 'property_legal_description', 'title_deed_or_deeds_office_reference']),
  company_or_trust_authority_resolution: Object.freeze(['mortgagor_identity_and_capacity', 'buyer_marital_or_entity_authority']),
  mortgage_bond_draft: Object.freeze(['bank_name', 'bank_reference', 'approved_bond_amount', 'mortgagor_identity_and_capacity', 'mortgagee_identity', 'property_legal_description', 'title_deed_or_deeds_office_reference']),
  banking_mandate_or_debit_order: Object.freeze(['bank_name', 'bank_reference', 'mortgagor_identity_and_capacity']),
  bond_instruction: Object.freeze(['bank_name', 'bank_reference']),
  bond_grant_letter: Object.freeze(['bank_name', 'approved_bond_amount']),
  bank_approval_to_lodge: Object.freeze(['approval_to_lodge_reference']),
  deeds_registration_evidence: Object.freeze(['registration_date']),
})

function text(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key])
      return result
    }, {})
  }
  return value
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(stable(value))
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

function strategyToItemType(strategy, riskTier) {
  if (strategy === 'ingest_only') return riskTier === 'external_registry' ? BOND_PACK_ITEM_TYPES.externalEvidence : BOND_PACK_ITEM_TYPES.bankControlled
  if (strategy === 'template_controlled') return BOND_PACK_ITEM_TYPES.legalInstrument
  return BOND_PACK_ITEM_TYPES.operationalDraft
}

function normalizeStatus(value = '') {
  const normalized = normalizeKey(value)
  return Object.values(BOND_PACK_WORKSPACE_STATUSES).includes(normalized) ? normalized : ''
}

function normalizeVersionStatus(input = {}) {
  return normalizeStatus(input.status || input.lifecycleStatus || input.lifecycle_status) || S.draftGenerated
}

function immutableVersion(input = {}, index = 0) {
  const status = normalizeVersionStatus(input)
  const versionId = text(input.versionId || input.version_id || input.id) || `bond-pack-version-${index + 1}`
  return Object.freeze({
    versionId,
    versionNumber: Number(input.versionNumber || input.version_number || index + 1) || index + 1,
    status,
    templateVersionId: text(input.templateVersionId || input.template_version_id),
    templateFingerprint: text(input.templateFingerprint || input.template_fingerprint),
    contentHash: text(input.contentHash || input.content_hash),
    dataFingerprint: text(input.dataFingerprint || input.sourceFactsFingerprint || input.source_facts_fingerprint),
    factFingerprints: Object.freeze(input.factFingerprints || input.sourceFactFingerprints || input.source_fact_fingerprints || {}),
    watermark: text(input.watermark) || (status === S.draftGenerated || status === S.attorneyReview ? BOND_PACK_DRAFT_WATERMARK : ''),
    generatedAt: input.generatedAt || input.generated_at || null,
    generatedBy: input.generatedBy || input.generated_by || null,
    reviewRequired: input.reviewRequired !== false && ![S.approved, S.sentForSignature, S.partiallySigned, S.fullySigned, S.bankSubmitted, S.bankAccepted].includes(status),
    approvedAt: input.approvedAt || input.approved_at || null,
    approvedBy: input.approvedBy || input.approved_by || null,
    supersedesVersionId: text(input.supersedesVersionId || input.supersedes_version_id) || null,
    contentImmutable: true,
  })
}

function latestVersion(versions = []) {
  const normalized = (Array.isArray(versions) ? versions : []).map(immutableVersion)
  return normalized.sort((left, right) => Number(right.versionNumber) - Number(left.versionNumber))[0] || null
}

function factProblemKeys(canonicalData, requiredFactKeys = []) {
  const byKey = canonicalData?.factsByKey || {}
  return requiredFactKeys.filter((key) => {
    const status = byKey[key]?.status
    return status !== 'verified'
  })
}

function buildPackItem(document, canonicalData) {
  const requiredFactKeys = DOCUMENT_FACTS[document.id] || Object.freeze([])
  const blockingFactKeys = factProblemKeys(canonicalData, requiredFactKeys)
  const itemType = strategyToItemType(document.strategy, document.riskTier)
  const readyForWorkspace = blockingFactKeys.length === 0
  const generationState = document.strategy === 'ingest_only'
    ? 'source_evidence_required'
    : !readyForWorkspace
      ? 'missing_verified_facts'
      : document.strategy === 'template_controlled'
        ? 'waiting_for_governed_template'
        : 'ready_for_phase4_generator'

  return Object.freeze({
    id: document.id,
    label: document.label,
    itemType,
    strategy: document.strategy,
    riskTier: document.riskTier,
    targetPhase: document.targetPhase,
    requiredApproval: document.requiredApproval,
    requiredFactKeys,
    blockingFactKeys: Object.freeze(blockingFactKeys),
    readyForWorkspace,
    generationState,
    reviewRequired: document.strategy !== 'ingest_only',
    sourceEvidenceRequired: document.strategy === 'ingest_only',
  })
}

function deriveWorkspaceStatus({ canonicalData, version }) {
  if (!version && canonicalData.facts.every((fact) => fact.status === 'missing')) return S.notStarted
  if (!canonicalData.readyForDrafting) return S.missingInfo
  if (!version) return S.readyToDraft
  const invalidation = evaluateBondAttorneyDraftInvalidation({ draft: version, canonicalData })
  if (invalidation.invalidated && ![S.superseded, S.withdrawn].includes(version.status)) return S.readyToDraft
  return normalizeVersionStatus(version)
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: text(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

export function buildBondPackWorkspace({
  transaction = {},
  lane = {},
  evidence = {},
  canonicalData = null,
  versions = [],
  status = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  const data = canonicalData || resolveBondAttorneyCanonicalData({ transaction, lane, evidence, resolvedAt: generatedAt })
  const normalizedVersions = Object.freeze((Array.isArray(versions) ? versions : []).map(immutableVersion))
  const version = latestVersion(normalizedVersions)
  const invalidation = version
    ? evaluateBondAttorneyDraftInvalidation({ draft: version, canonicalData: data })
    : Object.freeze({ invalidated: false, reason: 'no_version', changedFactKeys: Object.freeze([]), currentDataFingerprint: data.dataFingerprint })
  const resolvedStatus = normalizeStatus(status) || deriveWorkspaceStatus({ canonicalData: data, version })
  const packItems = Object.freeze(BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.map((document) => buildPackItem(document, data)))

  return Object.freeze({
    version: BOND_ATTORNEY_PHASE3_VERSION,
    workspaceId: text(lane.workspaceId || lane.workspace_id || transaction.bondPackWorkspaceId || transaction.bond_pack_workspace_id || transaction.id || transaction.transaction_id) || null,
    transactionId: text(transaction.id || transaction.transaction_id || lane.transactionId || lane.transaction_id) || null,
    laneKey: 'bond',
    generatedAt,
    status: resolvedStatus,
    canonicalData: data,
    dataFingerprint: data.dataFingerprint,
    factFingerprints: data.factFingerprints,
    latestVersion: version,
    versions: normalizedVersions,
    draftInvalidation: invalidation,
    requiresRegeneration: invalidation.invalidated === true,
    packItems,
    counts: Object.freeze({
      itemCount: packItems.length,
      readyItemCount: packItems.filter((item) => item.readyForWorkspace).length,
      blockedItemCount: packItems.filter((item) => !item.readyForWorkspace).length,
      missingFactCount: data.missingFactKeys.length,
      unverifiedFactCount: data.unverifiedFactKeys.length,
      staleFactCount: data.staleFactKeys.length,
      conflictFactCount: data.conflictFactKeys.length,
      versionCount: normalizedVersions.length,
    }),
    controls: Object.freeze({
      immutableVersions: true,
      templateVersionRequired: true,
      factFingerprintRequired: true,
      noSilentRegeneration: true,
      draftWatermark: BOND_PACK_DRAFT_WATERMARK,
      auditTrailRequired: true,
    }),
  })
}

export function canTransitionBondPackWorkspaceStatus({ from, to, workspace = {}, reason = '' } = {}) {
  const current = normalizeStatus(from || workspace.status) || S.notStarted
  const target = normalizeStatus(to)
  if (!target) return Object.freeze({ allowed: false, reason: 'invalid_target_status' })
  if (current === target) return Object.freeze({ allowed: true, reason: 'already_in_target_status' })
  if (!(STATUS_TRANSITIONS[current] || []).includes(target)) return Object.freeze({ allowed: false, reason: 'transition_not_allowed' })
  if ([S.superseded, S.withdrawn].includes(target) && !text(reason)) return Object.freeze({ allowed: false, reason: 'transition_reason_required' })
  if (target === S.draftGenerated && workspace.canonicalData?.readyForDrafting !== true) return Object.freeze({ allowed: false, reason: 'canonical_data_not_ready' })
  if (target === S.approved && (!workspace.latestVersion || workspace.latestVersion.status !== S.attorneyReview)) return Object.freeze({ allowed: false, reason: 'attorney_review_required_before_approval' })
  if ([S.sentForSignature, S.bankSubmitted].includes(target) && (!workspace.latestVersion || workspace.latestVersion.status !== S.approved)) return Object.freeze({ allowed: false, reason: 'approved_version_required' })
  return Object.freeze({ allowed: true, reason: 'transition_allowed' })
}

export function prepareBondPackDraftVersion({
  workspace = {},
  templateVersionId = '',
  templateFingerprint = '',
  contentHash = '',
  commandId = '',
  actor = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const errors = []
  if (workspace.canonicalData?.readyForDrafting !== true) errors.push('canonical_data_not_ready')
  if (!text(templateVersionId)) errors.push('template_version_required')
  if (!text(contentHash)) errors.push('content_hash_required')
  if (!text(commandId)) errors.push('generation_command_required')
  if (workspace.requiresRegeneration && !text(workspace.draftInvalidation?.reason)) errors.push('regeneration_reason_required')
  if (errors.length) return Object.freeze({ ok: false, code: 'bond_pack_draft_blocked', errors: Object.freeze(errors), version: null, auditEvent: null })

  const versionNumber = (workspace.versions || []).length + 1
  const versionId = hash({ commandId, workspaceId: workspace.workspaceId, versionNumber, contentHash })
  const version = immutableVersion({
    versionId,
    versionNumber,
    status: S.draftGenerated,
    templateVersionId,
    templateFingerprint,
    contentHash,
    dataFingerprint: workspace.dataFingerprint || buildBondAttorneyDataFingerprint(workspace.canonicalData?.facts || []),
    factFingerprints: workspace.factFingerprints || {},
    watermark: BOND_PACK_DRAFT_WATERMARK,
    generatedAt,
    generatedBy: actorSummary(actor),
    supersedesVersionId: workspace.draftInvalidation?.invalidated ? workspace.latestVersion?.versionId : null,
  }, versionNumber - 1)

  return Object.freeze({
    ok: true,
    code: 'bond_pack_draft_prepared',
    errors: Object.freeze([]),
    version,
    auditEvent: buildBondPackWorkspaceAuditEvent({
      workspace,
      eventType: 'bond_pack_draft_prepared',
      actor,
      version,
      commandId,
      occurredAt: generatedAt,
    }),
  })
}

export function buildBondPackWorkspaceAuditEvent({
  workspace = {},
  eventType = '',
  actor = {},
  version = null,
  commandId = '',
  reason = '',
  occurredAt = new Date().toISOString(),
} = {}) {
  const normalizedEventType = normalizeKey(eventType) || 'bond_pack_workspace_event'
  const safeVersion = version ? immutableVersion(version) : null
  return Object.freeze({
    eventId: hash({ workspaceId: workspace.workspaceId, eventType: normalizedEventType, commandId, versionId: safeVersion?.versionId || null, occurredAt }),
    version: BOND_ATTORNEY_PHASE3_VERSION,
    eventType: normalizedEventType,
    workspaceId: workspace.workspaceId || null,
    transactionId: workspace.transactionId || null,
    laneKey: 'bond',
    status: workspace.status || null,
    commandId: text(commandId) || null,
    reason: text(reason) || null,
    actor: actorSummary(actor),
    occurredAt: validDate(occurredAt) ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    dataFingerprint: workspace.dataFingerprint || null,
    changedFactKeys: Object.freeze(workspace.draftInvalidation?.changedFactKeys || []),
    versionBinding: safeVersion
      ? Object.freeze({
          versionId: safeVersion.versionId,
          versionNumber: safeVersion.versionNumber,
          status: safeVersion.status,
          templateVersionId: safeVersion.templateVersionId,
          contentHash: safeVersion.contentHash,
          dataFingerprint: safeVersion.dataFingerprint,
          watermark: safeVersion.watermark,
        })
      : null,
  })
}

export function validateBondPackWorkspace(workspace = {}) {
  const errors = []
  if (workspace.version !== BOND_ATTORNEY_PHASE3_VERSION) errors.push('workspace_version_invalid')
  if (!Object.values(BOND_PACK_WORKSPACE_STATUSES).includes(workspace.status)) errors.push('workspace_status_invalid')
  if (!workspace.canonicalData?.dataFingerprint) errors.push('canonical_data_fingerprint_required')
  if (workspace.latestVersion) {
    if (!workspace.latestVersion.templateVersionId) errors.push('latest_version_template_version_required')
    if (!workspace.latestVersion.contentHash) errors.push('latest_version_content_hash_required')
    if (!workspace.latestVersion.dataFingerprint) errors.push('latest_version_data_fingerprint_required')
    if (workspace.latestVersion.contentImmutable !== true) errors.push('latest_version_must_be_immutable')
    if ([S.draftGenerated, S.attorneyReview].includes(workspace.latestVersion.status) && workspace.latestVersion.watermark !== BOND_PACK_DRAFT_WATERMARK) errors.push('draft_watermark_required')
  }
  if (workspace.controls?.noSilentRegeneration !== true) errors.push('no_silent_regeneration_control_required')
  if (!Array.isArray(workspace.packItems) || !workspace.packItems.length) errors.push('pack_items_required')
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) })
}

export function buildBondAttorneyPhase3BaselineReport(input = {}) {
  const workspace = buildBondPackWorkspace(input)
  const validation = validateBondPackWorkspace(workspace)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE3_VERSION,
    statusCount: Object.keys(BOND_PACK_WORKSPACE_STATUSES).length,
    packItemCount: workspace.packItems.length,
    readyItemCount: workspace.counts.readyItemCount,
    blockedItemCount: workspace.counts.blockedItemCount,
    workspaceStatus: workspace.status,
    controls: workspace.controls,
    validation,
    readyForPhase4: validation.valid && workspace.controls.immutableVersions && workspace.controls.noSilentRegeneration && workspace.packItems.some((item) => item.strategy === 'generate_now'),
  })
}
