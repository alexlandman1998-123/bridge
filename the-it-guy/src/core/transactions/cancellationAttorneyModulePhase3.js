import { CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION } from './cancellationAttorneyModulePhase0.js'
import { buildCancellationAttorneyPhase1Usability } from './cancellationAttorneyModulePhase1.js'
import {
  buildCancellationAttorneyDataFingerprint,
  evaluateCancellationAttorneyDraftInvalidation,
  resolveCancellationAttorneyCanonicalData,
} from './cancellationAttorneyModulePhase2.js'

export const CANCELLATION_ATTORNEY_PHASE3_VERSION = 'cancellation_attorney_module_phase3_pack_workspace_v1'
export const CANCELLATION_ATTORNEY_PHASE3_RELEASE_BLOCKER_ID = 'cancellation_pack_workspace_missing'

export const CANCELLATION_PACK_WORKSPACE_STATUSES = Object.freeze({
  notStarted: 'not_started',
  missingInfo: 'missing_info',
  readyToPrepare: 'ready_to_prepare',
  draftPrepared: 'draft_prepared',
  attorneyReview: 'attorney_review',
  approved: 'approved',
  sentForSignature: 'sent_for_signature',
  partiallySigned: 'partially_signed',
  fullySigned: 'fully_signed',
  lodgementReady: 'lodgement_ready',
  lodged: 'lodged',
  registered: 'registered',
  settlementProofReceived: 'settlement_proof_received',
  closed: 'closed',
  superseded: 'superseded',
  withdrawn: 'withdrawn',
})

export const CANCELLATION_PACK_ITEM_TYPES = Object.freeze({
  operationalDraft: 'operational_draft',
  templateControlled: 'template_controlled',
  bankControlled: 'bank_controlled',
  externalEvidence: 'external_evidence',
  signingEvidence: 'signing_evidence',
})

export const CANCELLATION_PACK_DRAFT_WATERMARK = 'DRAFT - CANCELLATION ATTORNEY REVIEW REQUIRED'

const S = CANCELLATION_PACK_WORKSPACE_STATUSES

const STATUS_TRANSITIONS = Object.freeze({
  [S.notStarted]: Object.freeze([S.missingInfo, S.readyToPrepare, S.withdrawn]),
  [S.missingInfo]: Object.freeze([S.readyToPrepare, S.withdrawn]),
  [S.readyToPrepare]: Object.freeze([S.draftPrepared, S.withdrawn]),
  [S.draftPrepared]: Object.freeze([S.attorneyReview, S.superseded, S.withdrawn]),
  [S.attorneyReview]: Object.freeze([S.approved, S.readyToPrepare, S.superseded, S.withdrawn]),
  [S.approved]: Object.freeze([S.sentForSignature, S.lodgementReady, S.superseded, S.withdrawn]),
  [S.sentForSignature]: Object.freeze([S.partiallySigned, S.fullySigned, S.superseded, S.withdrawn]),
  [S.partiallySigned]: Object.freeze([S.fullySigned, S.superseded, S.withdrawn]),
  [S.fullySigned]: Object.freeze([S.lodgementReady, S.superseded, S.withdrawn]),
  [S.lodgementReady]: Object.freeze([S.lodged, S.superseded, S.withdrawn]),
  [S.lodged]: Object.freeze([S.registered, S.superseded, S.withdrawn]),
  [S.registered]: Object.freeze([S.settlementProofReceived, S.superseded, S.withdrawn]),
  [S.settlementProofReceived]: Object.freeze([S.closed, S.superseded, S.withdrawn]),
  [S.closed]: Object.freeze([S.superseded]),
  [S.superseded]: Object.freeze([]),
  [S.withdrawn]: Object.freeze([]),
})

const DOCUMENT_FACTS = Object.freeze({
  cancellation_instruction_acknowledgement: Object.freeze(['cancellation_bank', 'lender_instruction_reference', 'cancellation_instruction_received_at']),
  seller_existing_bond_information_request: Object.freeze(['seller_existing_bond_status']),
  cancellation_figures_request_cover: Object.freeze(['cancellation_bank', 'cancellation_bond_account_number', 'lender_instruction_reference']),
  notice_penalty_risk_summary: Object.freeze(['notice_period_status', 'notice_date', 'penalty_notice_risk']),
  cancellation_guarantee_request_cover: Object.freeze(['cancellation_figures_amount', 'cancellation_figures_expiry_date', 'guarantee_required_amount', 'guarantee_beneficiary_and_wording']),
  guarantee_acceptance_or_variance_note: Object.freeze(['guarantee_required_amount', 'guarantee_reference', 'guarantee_acceptance_status']),
  cancellation_lodgement_readiness_checklist: Object.freeze(['cancellation_figures_expiry_date', 'guarantee_acceptance_status', 'signed_cancellation_document_status']),
  cancellation_registration_notification: Object.freeze(['cancellation_registration_reference', 'cancellation_registration_date']),
  settlement_closeout_report: Object.freeze(['cancellation_registration_reference', 'settlement_amount', 'settlement_payment_reference', 'closeout_status']),
  bank_cancellation_documents: Object.freeze(['cancellation_bank', 'cancellation_bond_account_number', 'lender_instruction_reference', 'seller_cancellation_signing_requirement']),
  cancellation_consent: Object.freeze(['seller_cancellation_signing_requirement']),
  bond_discharge_or_cancellation_instrument: Object.freeze(['cancellation_bank', 'cancellation_bond_account_number', 'lender_instruction_reference', 'seller_cancellation_signing_requirement']),
  seller_authority_resolution_for_cancellation: Object.freeze(['seller_cancellation_signing_requirement']),
  lender_cancellation_instruction: Object.freeze(['lender_instruction_reference', 'cancellation_instruction_received_at']),
  bond_statement: Object.freeze(['cancellation_bank', 'cancellation_bond_account_number']),
  cancellation_figures: Object.freeze(['cancellation_figures_amount', 'cancellation_figures_expiry_date', 'daily_interest_amount']),
  guarantee_letter: Object.freeze(['guarantee_required_amount', 'guarantee_reference', 'guarantee_acceptance_status']),
  cancellation_registration_evidence: Object.freeze(['cancellation_registration_reference', 'cancellation_registration_date']),
  proof_of_settlement: Object.freeze(['settlement_amount', 'settlement_payment_reference']),
})

const AUTOMATION_REQUIREMENT_IDS = Object.freeze({
  cancellation_instruction_acknowledgement: 'cancellation_instruction',
  seller_existing_bond_information_request: 'seller_bond_cancellation_information',
  cancellation_figures_request_cover: 'cancellation_figures',
  notice_penalty_risk_summary: 'cancellation_figures',
  cancellation_guarantee_request_cover: 'cancellation_guarantees',
  guarantee_acceptance_or_variance_note: 'cancellation_guarantees',
  cancellation_lodgement_readiness_checklist: 'seller_signed_cancellation_documents',
  cancellation_registration_notification: 'cancellation_registration_evidence',
  settlement_closeout_report: 'proof_of_settlement',
  lender_cancellation_instruction: 'cancellation_instruction',
  bond_statement: 'existing_bond_account_details',
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
  if (strategy === 'ingest_only') {
    if (riskTier === 'external_registry') return CANCELLATION_PACK_ITEM_TYPES.externalEvidence
    if (riskTier === 'transfer_or_bond_handoff') return CANCELLATION_PACK_ITEM_TYPES.externalEvidence
    return CANCELLATION_PACK_ITEM_TYPES.bankControlled
  }
  if (strategy === 'template_controlled') {
    if (riskTier === 'bank_controlled') return CANCELLATION_PACK_ITEM_TYPES.bankControlled
    return CANCELLATION_PACK_ITEM_TYPES.templateControlled
  }
  if (riskTier === 'signing_evidence') return CANCELLATION_PACK_ITEM_TYPES.signingEvidence
  return CANCELLATION_PACK_ITEM_TYPES.operationalDraft
}

function normalizeStatus(value = '') {
  const normalized = normalizeKey(value)
  return Object.values(CANCELLATION_PACK_WORKSPACE_STATUSES).includes(normalized) ? normalized : ''
}

function normalizeVersionStatus(input = {}) {
  return normalizeStatus(input.status || input.lifecycleStatus || input.lifecycle_status) || S.draftPrepared
}

function immutableVersion(input = {}, index = 0) {
  const status = normalizeVersionStatus(input)
  const versionId = text(input.versionId || input.version_id || input.id) || `cancellation-pack-version-${index + 1}`
  return Object.freeze({
    versionId,
    versionNumber: Number(input.versionNumber || input.version_number || index + 1) || index + 1,
    status,
    templateVersionId: text(input.templateVersionId || input.template_version_id),
    templateFingerprint: text(input.templateFingerprint || input.template_fingerprint),
    contentHash: text(input.contentHash || input.content_hash),
    dataFingerprint: text(input.dataFingerprint || input.sourceFactsFingerprint || input.source_facts_fingerprint),
    factFingerprints: Object.freeze(input.factFingerprints || input.sourceFactFingerprints || input.source_fact_fingerprints || {}),
    watermark: text(input.watermark) || ([S.draftPrepared, S.attorneyReview].includes(status) ? CANCELLATION_PACK_DRAFT_WATERMARK : ''),
    generatedAt: input.generatedAt || input.generated_at || null,
    generatedBy: input.generatedBy || input.generated_by || null,
    reviewRequired: input.reviewRequired !== false && ![S.approved, S.sentForSignature, S.partiallySigned, S.fullySigned, S.lodgementReady, S.lodged, S.registered, S.settlementProofReceived, S.closed].includes(status),
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
  return requiredFactKeys.filter((key) => byKey[key]?.status !== 'verified')
}

function documentRequirementFor(phase1Usability = {}, documentId = '') {
  const normalized = normalizeKey(documentId)
  const requirementId = AUTOMATION_REQUIREMENT_IDS[normalized] || normalized
  return (phase1Usability.documentRequirements || []).find((requirement) => normalizeKey(requirement.id) === requirementId) || null
}

function evidenceState(document, blockingFactKeys = []) {
  if (document.strategy === 'ingest_only') return blockingFactKeys.length ? 'source_evidence_required' : 'source_evidence_verified'
  if (document.strategy === 'template_controlled') return blockingFactKeys.length ? 'source_facts_required' : 'template_governance_required'
  return blockingFactKeys.length ? 'source_facts_required' : 'ready_for_operational_draft'
}

function generationState(document, readyForWorkspace) {
  if (document.strategy === 'ingest_only') return readyForWorkspace ? 'source_evidence_verified' : 'source_evidence_required'
  if (!readyForWorkspace) return 'missing_verified_facts'
  if (document.strategy === 'template_controlled') return 'waiting_for_governed_template'
  return 'ready_for_phase4_generator'
}

function buildPackItem(document, canonicalData, phase1Usability) {
  const requiredFactKeys = DOCUMENT_FACTS[document.id] || Object.freeze([])
  const blockingFactKeys = factProblemKeys(canonicalData, requiredFactKeys)
  const requirement = documentRequirementFor(phase1Usability, document.id)
  const itemType = strategyToItemType(document.strategy, document.riskTier)
  const readyForWorkspace = blockingFactKeys.length === 0

  return Object.freeze({
    id: document.id,
    label: document.label,
    itemType,
    strategy: document.strategy,
    riskTier: document.riskTier,
    targetPhase: document.targetPhase,
    requiredApproval: document.requiredApproval,
    purpose: document.purpose,
    requirementId: requirement?.id || AUTOMATION_REQUIREMENT_IDS[document.id] || document.id,
    documentStatus: requirement?.status || 'not_tracked',
    documentNextAction: requirement?.nextAction || null,
    reviewState: document.strategy === 'ingest_only'
      ? 'evidence_review'
      : document.strategy === 'template_controlled'
        ? 'template_governance_review'
        : 'attorney_operational_review',
    evidenceState: evidenceState(document, blockingFactKeys),
    requiredFactKeys,
    blockingFactKeys: Object.freeze(blockingFactKeys),
    readyForWorkspace,
    generationState: generationState(document, readyForWorkspace),
    reviewRequired: document.strategy !== 'ingest_only',
    sourceEvidenceRequired: document.strategy === 'ingest_only',
  })
}

function deriveWorkspaceStatus({ canonicalData, version }) {
  if (!version && canonicalData.facts.every((fact) => fact.status === 'missing')) return S.notStarted
  if (!canonicalData.readyForCancellationPack) return S.missingInfo
  if (!version) return S.readyToPrepare
  const invalidation = evaluateCancellationAttorneyDraftInvalidation({ draft: version, canonicalData })
  if (invalidation.invalidated && ![S.superseded, S.withdrawn].includes(version.status)) return S.readyToPrepare
  return normalizeVersionStatus(version)
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: text(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

export function buildCancellationPackWorkspace({
  transaction = {},
  lane = {},
  evidence = {},
  canonicalData = null,
  phase1Usability = null,
  versions = [],
  status = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  const data = canonicalData || resolveCancellationAttorneyCanonicalData({ transaction, lane, evidence, resolvedAt: generatedAt })
  const usability = phase1Usability || buildCancellationAttorneyPhase1Usability({ ...lane, currentStage: lane.currentStage || lane.current_stage || 'cancellation_existing_bond_confirmed' })
  const normalizedVersions = Object.freeze((Array.isArray(versions) ? versions : []).map(immutableVersion))
  const version = latestVersion(normalizedVersions)
  const invalidation = version
    ? evaluateCancellationAttorneyDraftInvalidation({ draft: version, canonicalData: data })
    : Object.freeze({ invalidated: false, reason: 'no_version', changedFactKeys: Object.freeze([]), currentDataFingerprint: data.dataFingerprint })
  const resolvedStatus = normalizeStatus(status) || deriveWorkspaceStatus({ canonicalData: data, version })
  const packItems = Object.freeze(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.map((document) => buildPackItem(document, data, usability)))

  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE3_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE3_RELEASE_BLOCKER_ID,
    workspaceId: text(lane.workspaceId || lane.workspace_id || transaction.cancellationPackWorkspaceId || transaction.cancellation_pack_workspace_id || transaction.id || transaction.transaction_id) || null,
    transactionId: text(transaction.id || transaction.transaction_id || lane.transactionId || lane.transaction_id) || null,
    laneKey: 'cancellation',
    generatedAt,
    status: resolvedStatus,
    canonicalData: data,
    phase1Usability: usability,
    dataFingerprint: data.dataFingerprint,
    factFingerprints: data.factFingerprints,
    latestVersion: version,
    versions: normalizedVersions,
    draftInvalidation: invalidation,
    requiresRegeneration: invalidation.invalidated === true,
    documentRequirements: Object.freeze(usability.documentRequirements || []),
    documentCoverage: usability.documentCoverage || null,
    packItems,
    counts: Object.freeze({
      itemCount: packItems.length,
      readyItemCount: packItems.filter((item) => item.readyForWorkspace).length,
      blockedItemCount: packItems.filter((item) => !item.readyForWorkspace).length,
      evidenceItemCount: packItems.filter((item) => item.sourceEvidenceRequired).length,
      templateControlledItemCount: packItems.filter((item) => item.strategy === 'template_controlled').length,
      operationalDraftItemCount: packItems.filter((item) => item.strategy === 'generate_now').length,
      documentRequirementCount: (usability.documentRequirements || []).length,
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
      draftWatermark: CANCELLATION_PACK_DRAFT_WATERMARK,
      auditTrailRequired: true,
      sourceEvidenceOnlyForBankOutcomes: true,
      noExternalSettlementExecution: true,
      noStageOnlyRegistration: true,
      noMatterMutation: true,
    }),
  })
}

export function canTransitionCancellationPackWorkspaceStatus({ from, to, workspace = {}, reason = '' } = {}) {
  const current = normalizeStatus(from || workspace.status) || S.notStarted
  const target = normalizeStatus(to)
  if (!target) return Object.freeze({ allowed: false, reason: 'invalid_target_status' })
  if (current === target) return Object.freeze({ allowed: true, reason: 'already_in_target_status' })
  if (!(STATUS_TRANSITIONS[current] || []).includes(target)) return Object.freeze({ allowed: false, reason: 'transition_not_allowed' })
  if ([S.superseded, S.withdrawn].includes(target) && !text(reason)) return Object.freeze({ allowed: false, reason: 'transition_reason_required' })
  if (target === S.draftPrepared && workspace.canonicalData?.readyForCancellationPack !== true) return Object.freeze({ allowed: false, reason: 'canonical_data_not_ready' })
  if (target === S.approved && (!workspace.latestVersion || workspace.latestVersion.status !== S.attorneyReview)) return Object.freeze({ allowed: false, reason: 'attorney_review_required_before_approval' })
  if ([S.sentForSignature, S.lodgementReady].includes(target) && (!workspace.latestVersion || workspace.latestVersion.status !== S.approved)) return Object.freeze({ allowed: false, reason: 'approved_version_required' })
  return Object.freeze({ allowed: true, reason: 'transition_allowed' })
}

export function prepareCancellationPackDraftVersion({
  workspace = {},
  templateVersionId = '',
  templateFingerprint = '',
  contentHash = '',
  commandId = '',
  actor = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const errors = []
  if (workspace.canonicalData?.readyForCancellationPack !== true) errors.push('canonical_data_not_ready')
  if (!text(templateVersionId)) errors.push('template_version_required')
  if (!text(contentHash)) errors.push('content_hash_required')
  if (!text(commandId)) errors.push('generation_command_required')
  if (workspace.requiresRegeneration && !text(workspace.draftInvalidation?.reason)) errors.push('regeneration_reason_required')
  if (errors.length) return Object.freeze({ ok: false, code: 'cancellation_pack_draft_blocked', errors: Object.freeze(errors), version: null, auditEvent: null })

  const versionNumber = (workspace.versions || []).length + 1
  const versionId = hash({ commandId, workspaceId: workspace.workspaceId, versionNumber, contentHash })
  const version = immutableVersion({
    versionId,
    versionNumber,
    status: S.draftPrepared,
    templateVersionId,
    templateFingerprint,
    contentHash,
    dataFingerprint: workspace.dataFingerprint || buildCancellationAttorneyDataFingerprint(workspace.canonicalData?.facts || []),
    factFingerprints: workspace.factFingerprints || {},
    watermark: CANCELLATION_PACK_DRAFT_WATERMARK,
    generatedAt,
    generatedBy: actorSummary(actor),
    supersedesVersionId: workspace.draftInvalidation?.invalidated ? workspace.latestVersion?.versionId : null,
  }, versionNumber - 1)

  return Object.freeze({
    ok: true,
    code: 'cancellation_pack_draft_prepared',
    errors: Object.freeze([]),
    version,
    auditEvent: buildCancellationPackWorkspaceAuditEvent({
      workspace,
      eventType: 'cancellation_pack_draft_prepared',
      actor,
      version,
      commandId,
      occurredAt: generatedAt,
    }),
  })
}

export function buildCancellationPackWorkspaceAuditEvent({
  workspace = {},
  eventType = '',
  actor = {},
  version = null,
  commandId = '',
  reason = '',
  occurredAt = new Date().toISOString(),
} = {}) {
  const normalizedEventType = normalizeKey(eventType) || 'cancellation_pack_workspace_event'
  const safeVersion = version ? immutableVersion(version) : null
  return Object.freeze({
    eventId: hash({ workspaceId: workspace.workspaceId, eventType: normalizedEventType, commandId, versionId: safeVersion?.versionId || null, occurredAt }),
    version: CANCELLATION_ATTORNEY_PHASE3_VERSION,
    eventType: normalizedEventType,
    workspaceId: workspace.workspaceId || null,
    transactionId: workspace.transactionId || null,
    laneKey: 'cancellation',
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

export function validateCancellationPackWorkspace(workspace = {}) {
  const errors = []
  if (workspace.version !== CANCELLATION_ATTORNEY_PHASE3_VERSION) errors.push('workspace_version_invalid')
  if (workspace.releaseBlockerId !== CANCELLATION_ATTORNEY_PHASE3_RELEASE_BLOCKER_ID) errors.push('release_blocker_id_invalid')
  if (!Object.values(CANCELLATION_PACK_WORKSPACE_STATUSES).includes(workspace.status)) errors.push('workspace_status_invalid')
  if (!workspace.canonicalData?.dataFingerprint) errors.push('canonical_data_fingerprint_required')
  if (!workspace.phase1Usability?.documentRequirements?.length) errors.push('phase1_document_requirements_required')
  if (workspace.latestVersion) {
    if (!workspace.latestVersion.templateVersionId) errors.push('latest_version_template_version_required')
    if (!workspace.latestVersion.contentHash) errors.push('latest_version_content_hash_required')
    if (!workspace.latestVersion.dataFingerprint) errors.push('latest_version_data_fingerprint_required')
    if (workspace.latestVersion.contentImmutable !== true) errors.push('latest_version_must_be_immutable')
    if ([S.draftPrepared, S.attorneyReview].includes(workspace.latestVersion.status) && workspace.latestVersion.watermark !== CANCELLATION_PACK_DRAFT_WATERMARK) errors.push('draft_watermark_required')
  }
  if (workspace.controls?.noSilentRegeneration !== true) errors.push('no_silent_regeneration_control_required')
  if (workspace.controls?.sourceEvidenceOnlyForBankOutcomes !== true) errors.push('source_evidence_boundary_required')
  if (workspace.controls?.noExternalSettlementExecution !== true) errors.push('settlement_execution_boundary_required')
  if (workspace.controls?.noStageOnlyRegistration !== true) errors.push('registration_evidence_boundary_required')
  if (workspace.controls?.noMatterMutation !== true) errors.push('matter_mutation_boundary_required')
  if (!Array.isArray(workspace.packItems) || !workspace.packItems.length) errors.push('pack_items_required')
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze([...new Set(errors)]) })
}

export function buildCancellationAttorneyPhase3BaselineReport(input = {}) {
  const workspace = buildCancellationPackWorkspace(input)
  const validation = validateCancellationPackWorkspace(workspace)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE3_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE3_RELEASE_BLOCKER_ID,
    statusCount: Object.keys(CANCELLATION_PACK_WORKSPACE_STATUSES).length,
    packItemCount: workspace.packItems.length,
    readyItemCount: workspace.counts.readyItemCount,
    blockedItemCount: workspace.counts.blockedItemCount,
    documentRequirementCount: workspace.counts.documentRequirementCount,
    workspaceStatus: workspace.status,
    controls: workspace.controls,
    validation,
    readyForPhase4: validation.valid &&
      workspace.controls.immutableVersions &&
      workspace.controls.noSilentRegeneration &&
      workspace.controls.noExternalSettlementExecution &&
      workspace.packItems.some((item) => item.strategy === 'generate_now') &&
      workspace.packItems.some((item) => item.strategy === 'template_controlled') &&
      workspace.packItems.some((item) => item.strategy === 'ingest_only'),
  })
}
