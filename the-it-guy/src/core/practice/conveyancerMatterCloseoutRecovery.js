import {
  buildPracticeActor,
  buildPracticeOperationIdentity,
  evaluatePracticeOperationAuthority,
  PRACTICE_OPERATION_CAPABILITIES,
  PRACTICE_OPERATION_ROLES,
} from './conveyancerPracticeOperationsContract.js'
import { CONVEYANCER_INFORMATION_GOVERNANCE_VERSION } from './conveyancerInformationGovernance.js'
import { CONVEYANCER_FINAL_ACCOUNT_VERSION } from '../../services/attorneyWorkflow/conveyancerFinalAccountWorkflow.js'
import { CONVEYANCER_PROVIDER_TRANSPORT_VERSION } from '../productisation/conveyancerProviderTransport.js'
import { CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION } from '../productisation/conveyancerOperationalAssurance.js'

export const CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION = 'conveyancer_matter_closeout_recovery_g9_v1'
export const ORIGINAL_DOCUMENT_STATUSES = Object.freeze({ held: 'held', released: 'released', returned: 'returned', archived: 'archived', destroyed: 'destroyed', missing: 'missing' })
export const MATTER_CLOSEOUT_STATES = Object.freeze({ blocked: 'blocked', ready: 'ready', closed: 'closed', reopened: 'reopened' })
export const IMPORT_ITEM_STATUSES = Object.freeze({ proposed: 'proposed', accepted: 'accepted', rejected: 'rejected', quarantined: 'quarantined' })
export const RECOVERY_JOB_TYPES = Object.freeze({ outboundCommand: 'outbound_command', inboundWebhook: 'inbound_webhook', documentJob: 'document_job', importJob: 'import_job', notificationJob: 'notification_job' })

export const MATTER_CLOSEOUT_RECOVERY_BOUNDARY = Object.freeze({
  matterClosed: false, matterReopened: false, archiveWritten: false, recordDisposed: false,
  importPersisted: false, documentCopied: false, duplicateMerged: false, jobRetried: false,
  webhookReplayed: false, supportSessionOpened: false, databaseRestored: false,
  rollbackExecuted: false, externalCallPerformed: false, notificationSent: false,
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const FINGERPRINT = /^fnv1a_[a-f0-9]{8}$/i
const DOCUMENT_STATUSES = new Set(Object.values(ORIGINAL_DOCUMENT_STATUSES))
const JOB_TYPES = new Set(Object.values(RECOVERY_JOB_TYPES))
const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const integer = (value, fallback = 0) => Number.isSafeInteger(Number(value)) ? Number(value) : fallback
const unique = (values = []) => [...new Set(values.map(text).filter(Boolean))].sort()
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, name) => { result[name] = stable(value[name]); return result }, {}) }
function fingerprint(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function duplicate(values, selector) { return new Set(values.map(selector)).size !== values.length }
function referenceEvidence(value = {}) { return { reference: text(value.reference || value.evidenceReference), hash: text(value.hash || value.evidenceHash), occurredAt: iso(value.occurredAt || value.receivedAt), source: key(value.source) || 'manual' } }
function validEvidence(value = {}) { return Boolean(text(value.reference) && HASH.test(text(value.hash)) && iso(value.occurredAt)) }
function authority(actor, identity, capability, at) { return evaluatePracticeOperationAuthority({ actor, identity, capability, asOf: at }).allowed }

function practice(input = {}, capability = PRACTICE_OPERATION_CAPABILITIES.legalReview, at = '') {
  const identity = buildPracticeOperationIdentity(input.identity || {})
  const actor = buildPracticeActor(input.actor || {})
  const errors = [...identity.errors, ...actor.errors]
  if (!authority(actor.actor, identity.identity, capability, at)) errors.push('closeout_recovery_authority_required')
  return { identity: identity.identity, actor: actor.actor, errors }
}

function normalizeMovements(values = []) {
  return values.map((item) => ({ movementId: text(item.movementId), type: key(item.type), fromCustodianReference: text(item.fromCustodianReference) || null, toCustodianReference: text(item.toCustodianReference) || null, occurredAt: iso(item.occurredAt), evidence: referenceEvidence(item.evidence), reason: text(item.reason), authorisedBy: text(item.authorisedBy) })).sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
}

export function buildOriginalDocumentRegister(input = {}) {
  const at = iso(input.createdAt)
  const context = practice(input, PRACTICE_OPERATION_CAPABILITIES.captureEvidence, at)
  const documents = (input.documents || []).map((item) => ({ documentId: text(item.documentId), documentType: key(item.documentType), title: text(item.title), externalReference: text(item.externalReference) || null, contentHash: text(item.contentHash), status: key(item.status) || ORIGINAL_DOCUMENT_STATUSES.held, custodianReference: text(item.custodianReference) || null, storageLocationReference: text(item.storageLocationReference) || null, receivedAt: iso(item.receivedAt), requiredDisposition: key(item.requiredDisposition) || 'return', dispositionDueAt: iso(item.dispositionDueAt), movements: normalizeMovements(item.movements) }))
  const errors = [...context.errors]
  if (!text(input.registerId) || !at || !documents.length || duplicate(documents, (item) => item.documentId)) errors.push('original_document_register_identity_invalid')
  for (const item of documents) {
    if (!item.documentId || !item.documentType || !item.title || !HASH.test(item.contentHash) || !DOCUMENT_STATUSES.has(item.status) || !item.receivedAt || !['return', 'archive', 'destroy', 'release'].includes(item.requiredDisposition)) errors.push(`original_document_invalid:${item.documentId || 'unknown'}`)
    if (['held', 'archived'].includes(item.status) && (!item.custodianReference || !item.storageLocationReference)) errors.push(`original_document_custody_missing:${item.documentId}`)
    if (item.status === 'destroyed' && input.legalHold === true) errors.push(`original_document_destroyed_under_legal_hold:${item.documentId}`)
    if (duplicate(item.movements, (movement) => movement.movementId) || item.movements.some((movement) => !movement.movementId || !movement.type || !movement.occurredAt || !movement.reason || !UUID.test(movement.authorisedBy) || !validEvidence(movement.evidence))) errors.push(`original_document_movement_invalid:${item.documentId}`)
    if (item.movements.some((movement, index) => index > 0 && new Date(movement.occurredAt) < new Date(item.movements[index - 1].occurredAt))) errors.push(`original_document_movement_chronology_invalid:${item.documentId}`)
  }
  const register = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, registerId: text(input.registerId), identity: context.identity, legalHold: input.legalHold === true, documents, unresolvedCount: documents.filter((item) => item.status === 'missing' || item.status === 'held' && item.requiredDisposition !== 'archive').length, createdAt: at, createdBy: context.actor, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  register.fingerprint = fingerprint(register)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], register })
}

function closeoutCheck(keyName, satisfied, evidenceReference = null, blockers = []) { return { key: keyName, satisfied: satisfied === true, evidenceReference: evidenceReference || null, blockers: unique(blockers) } }

export function buildMatterCloseoutAssessment(input = {}) {
  const at = iso(input.assessedAt)
  const context = practice(input, PRACTICE_OPERATION_CAPABILITIES.legalReview, at)
  const registration = referenceEvidence(input.registrationEvidence)
  const finalAccount = input.finalAccount || {}
  const trust = input.trustReconciliation || {}
  const originals = input.originalDocumentRegister || {}
  const retention = input.retentionSchedule || {}
  const openExceptions = (input.exceptions || []).filter((item) => !['resolved', 'waived', 'cancelled', 'superseded'].includes(key(item.status)))
  const checks = [
    closeoutCheck('registration_evidence', validEvidence(registration), registration.reference, validEvidence(registration) ? [] : ['registration_evidence_required']),
    closeoutCheck('final_account', finalAccount.version === CONVEYANCER_FINAL_ACCOUNT_VERSION && finalAccount.status === 'approved' && FINGERPRINT.test(text(finalAccount.fingerprint)), finalAccount.finalAccountId, ['final_account_not_approved'].filter(() => !(finalAccount.version === CONVEYANCER_FINAL_ACCOUNT_VERSION && finalAccount.status === 'approved' && FINGERPRINT.test(text(finalAccount.fingerprint))))),
    closeoutCheck('trust_reconciliation', trust.approved === true && integer(trust.unreconciledMinor, -1) === 0 && FINGERPRINT.test(text(trust.fingerprint)), trust.reconciliationId, ['trust_not_fully_reconciled'].filter(() => !(trust.approved === true && integer(trust.unreconciledMinor, -1) === 0 && FINGERPRINT.test(text(trust.fingerprint))))),
    closeoutCheck('exceptions', openExceptions.length === 0, null, openExceptions.map((item) => `open_exception:${text(item.exceptionId)}`)),
    closeoutCheck('correspondence_history', input.correspondenceHistory?.reconstructable === true && input.correspondenceHistory?.crossFirmRecords === 0, input.correspondenceHistory?.historyId, ['correspondence_history_incomplete'].filter(() => !(input.correspondenceHistory?.reconstructable === true && input.correspondenceHistory?.crossFirmRecords === 0))),
    closeoutCheck('original_documents', originals.version === CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION && originals.identity?.transactionId === context.identity.transactionId && originals.unresolvedCount === 0 && FINGERPRINT.test(text(originals.fingerprint)), originals.registerId, ['original_document_disposition_incomplete'].filter(() => !(originals.version === CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION && originals.identity?.transactionId === context.identity.transactionId && originals.unresolvedCount === 0 && FINGERPRINT.test(text(originals.fingerprint))))),
    closeoutCheck('retention_schedule', retention.version === CONVEYANCER_INFORMATION_GOVERNANCE_VERSION && text(retention.retentionClass) && iso(retention.retainUntil) && new Date(retention.retainUntil) > new Date(at), retention.scheduleId, ['retention_schedule_invalid'].filter(() => !(retention.version === CONVEYANCER_INFORMATION_GOVERNANCE_VERSION && text(retention.retentionClass) && iso(retention.retainUntil) && new Date(retention.retainUntil) > new Date(at)))),
    closeoutCheck('matter_plan', input.matterPlan?.closeoutActionsComplete === true && input.matterPlan?.openRequiredActions === 0, input.matterPlan?.planId, ['matter_plan_closeout_incomplete'].filter(() => !(input.matterPlan?.closeoutActionsComplete === true && input.matterPlan?.openRequiredActions === 0))),
  ]
  const errors = [...context.errors]
  if (!text(input.assessmentId) || !at) errors.push('matter_closeout_assessment_identity_invalid')
  const blockers = checks.flatMap((item) => item.blockers)
  const assessment = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, assessmentId: text(input.assessmentId), identity: context.identity, state: blockers.length || errors.length ? MATTER_CLOSEOUT_STATES.blocked : MATTER_CLOSEOUT_STATES.ready, readyForCloseout: blockers.length === 0 && errors.length === 0, checks, blockers, assessedAt: at, assessedBy: context.actor, legalHold: input.legalHold === true, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  assessment.fingerprint = fingerprint(assessment)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], assessment })
}

export function buildDefensibleMatterArchive(input = {}) {
  const at = iso(input.preparedAt)
  const context = practice(input, PRACTICE_OPERATION_CAPABILITIES.legalReview, at)
  const assessment = input.assessment || {}
  const items = (input.items || []).map((item) => ({ itemId: text(item.itemId), recordType: key(item.recordType), recordId: text(item.recordId), recordVersion: text(item.recordVersion), reference: text(item.reference), contentHash: text(item.contentHash), classifications: unique(item.classifications), retentionClass: key(item.retentionClass), included: item.included !== false, exclusionReason: text(item.exclusionReason) || null }))
  const errors = [...context.errors]
  if (!text(input.archiveId) || !at || assessment.version !== CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION || assessment.identity?.transactionId !== context.identity.transactionId || assessment.readyForCloseout !== true || !FINGERPRINT.test(text(assessment.fingerprint))) errors.push('matter_archive_closeout_binding_invalid')
  if (!items.length || duplicate(items, (item) => item.itemId) || items.some((item) => !item.itemId || !item.recordType || !item.recordId || !item.recordVersion || !item.reference || !HASH.test(item.contentHash) || !item.classifications.length || !item.retentionClass || (!item.included && !item.exclusionReason))) errors.push('matter_archive_manifest_invalid')
  const archive = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, archiveId: text(input.archiveId), identity: context.identity, assessmentId: assessment.assessmentId, assessmentFingerprint: assessment.fingerprint, formatVersion: text(input.formatVersion) || '1.0.0', items, itemCount: items.length, includedCount: items.filter((item) => item.included).length, legalHold: input.legalHold === true || assessment.legalHold === true, retentionScheduleId: text(input.retentionScheduleId), exportPolicy: key(input.exportPolicy) || 'watermarked_reference_only', preparedAt: at, preparedBy: context.actor, archiveWritten: false, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  if (!archive.retentionScheduleId) errors.push('matter_archive_retention_binding_required')
  archive.fingerprint = fingerprint(archive)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], archive })
}

export function buildMatterClosureIntent({ assessment = {}, archive = {}, actor = {}, reason = '', preparedAt = '' } = {}) {
  const at = iso(preparedAt); const actorResult = buildPracticeActor(actor); const errors = [...actorResult.errors]
  if (assessment.version !== CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION || assessment.readyForCloseout !== true || archive.version !== CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION || archive.assessmentFingerprint !== assessment.fingerprint || archive.identity?.transactionId !== assessment.identity?.transactionId || !text(reason) || !at) errors.push('matter_closure_intent_invalid')
  if (!authority(actorResult.actor, assessment.identity || {}, PRACTICE_OPERATION_CAPABILITIES.legalReview, at)) errors.push('matter_closure_authority_required')
  const intent = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, intentId: `close:${assessment.identity?.transactionId}:${assessment.assessmentId}`, transactionId: assessment.identity?.transactionId || null, expectedAssessmentFingerprint: assessment.fingerprint || null, expectedArchiveFingerprint: archive.fingerprint || null, targetState: MATTER_CLOSEOUT_STATES.closed, reason: text(reason), preparedAt: at, preparedBy: actorResult.actor.userId, executed: false, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  intent.fingerprint = fingerprint(intent)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], intent })
}

export function previewMatterReopening({ closureRecord = {}, actor = {}, reason = '', targetPlanDefinition = {}, previewedAt = '' } = {}) {
  const at = iso(previewedAt); const actorResult = buildPracticeActor(actor); const errors = [...actorResult.errors]
  const manager = actorResult.actor.role === PRACTICE_OPERATION_ROLES.firmManager
  const attorney = [PRACTICE_OPERATION_ROLES.responsibleAttorney, PRACTICE_OPERATION_ROLES.supervisingAttorney].includes(actorResult.actor.role)
  if (closureRecord.version !== CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION || closureRecord.state !== MATTER_CLOSEOUT_STATES.closed || !closureRecord.transactionId || !FINGERPRINT.test(text(closureRecord.fingerprint)) || !text(reason) || !at || !text(targetPlanDefinition.planDefinitionId) || !text(targetPlanDefinition.version) || !text(targetPlanDefinition.fingerprint)) errors.push('matter_reopening_preview_invalid')
  if (!manager && !attorney) errors.push('matter_reopening_authority_required')
  const preview = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, transactionId: closureRecord.transactionId || null, closureFingerprint: closureRecord.fingerprint || null, targetPlanDefinition: { planDefinitionId: text(targetPlanDefinition.planDefinitionId), version: text(targetPlanDefinition.version), fingerprint: text(targetPlanDefinition.fingerprint) }, reason: text(reason), previewedAt: at, previewedBy: actorResult.actor.userId, acknowledgementsRequired: ['retention_and_legal_hold_preserved', 'closed_evidence_remains_immutable', 'new_plan_revision_required'], reopened: false, command: { type: 'reopen_closed_matter', transactionId: closureRecord.transactionId, expectedClosureFingerprint: closureRecord.fingerprint, targetPlanDefinitionFingerprint: text(targetPlanDefinition.fingerprint) }, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  preview.fingerprint = fingerprint(preview)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], preview })
}

function normalizeImportItem(item = {}) {
  return { importItemId: text(item.importItemId), sourceMatterReference: text(item.sourceMatterReference), sourceRecordReference: text(item.sourceRecordReference), sourceRecordHash: text(item.sourceRecordHash), canonicalTransactionId: text(item.canonicalTransactionId), matterReference: text(item.matterReference), partyKeys: unique(item.partyKeys), propertyKey: key(item.propertyKey), documentCount: Math.max(0, integer(item.documentCount)), documentManifestReference: text(item.documentManifestReference), documentManifestHash: text(item.documentManifestHash), status: key(item.status) || IMPORT_ITEM_STATUSES.proposed, rejectionReason: text(item.rejectionReason) || null }
}

export function buildHistoricalMatterImportBatch(input = {}) {
  const at = iso(input.preparedAt); const context = practice(input, PRACTICE_OPERATION_CAPABILITIES.managePractice, at)
  const items = (input.items || []).map(normalizeImportItem); const sourceManifest = referenceEvidence(input.sourceManifest); const errors = [...context.errors]
  if (!text(input.batchId) || !text(input.sourceSystem) || !text(input.mappingVersion) || !at || !validEvidence(sourceManifest) || !items.length || duplicate(items, (item) => item.importItemId)) errors.push('historical_import_batch_identity_invalid')
  for (const item of items) if (!item.importItemId || !item.sourceMatterReference || !item.sourceRecordReference || !HASH.test(item.sourceRecordHash) || !UUID.test(item.canonicalTransactionId) || !item.matterReference || !item.partyKeys.length || !item.propertyKey || !item.documentManifestReference || !HASH.test(item.documentManifestHash) || !Object.values(IMPORT_ITEM_STATUSES).includes(item.status) || (item.status === IMPORT_ITEM_STATUSES.rejected && !item.rejectionReason)) errors.push(`historical_import_item_invalid:${item.importItemId || 'unknown'}`)
  const batch = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, batchId: text(input.batchId), organisationId: context.identity.organisationId, attorneyFirmId: context.identity.attorneyFirmId, sourceSystem: text(input.sourceSystem), sourceManifest, mappingVersion: text(input.mappingVersion), items, itemCount: items.length, documentCount: items.reduce((sum, item) => sum + item.documentCount, 0), preparedAt: at, preparedBy: context.actor, importPersisted: false, documentsCopied: false, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  batch.fingerprint = fingerprint(batch)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], batch })
}

export function detectHistoricalMatterDuplicates({ batch = {}, existingMatters = [] } = {}) {
  const candidates = []
  for (const item of batch.items || []) for (const existing of existingMatters) {
    const reasons = []
    if (text(existing.matterReference) === item.matterReference) reasons.push('same_matter_reference')
    if (key(existing.propertyKey) === item.propertyKey) reasons.push('same_property')
    const partyOverlap = item.partyKeys.filter((party) => (existing.partyKeys || []).map(text).includes(party)).length
    if (partyOverlap) reasons.push(`party_overlap:${partyOverlap}`)
    if (reasons.includes('same_matter_reference') || reasons.includes('same_property') && partyOverlap) candidates.push({ importItemId: item.importItemId, existingTransactionId: text(existing.transactionId), confidence: reasons.includes('same_matter_reference') ? 'exact' : 'possible', reasons, action: 'human_duplicate_review_required', merged: false })
  }
  return freeze({ version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, batchId: batch.batchId || null, candidates, candidateCount: candidates.length, duplicateMerged: false, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY })
}

export function reconcileHistoricalMatterImport({ batch = {}, outcomes = [], reconciledBy = {}, reconciledAt = '' } = {}) {
  const at = iso(reconciledAt); const actorResult = buildPracticeActor(reconciledBy); const errors = [...actorResult.errors]
  if (actorResult.actor.role !== PRACTICE_OPERATION_ROLES.firmManager || batch.version !== CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION || !FINGERPRINT.test(text(batch.fingerprint)) || !at) errors.push('historical_import_reconciliation_authority_invalid')
  const rows = outcomes.map((item) => ({ importItemId: text(item.importItemId), result: key(item.result), canonicalTransactionId: text(item.canonicalTransactionId) || null, sourceRecordHash: text(item.sourceRecordHash), importedRecordHash: text(item.importedRecordHash) || null, documentExpected: Math.max(0, integer(item.documentExpected)), documentImported: Math.max(0, integer(item.documentImported)), reason: text(item.reason) }))
  if (duplicate(rows, (item) => item.importItemId) || rows.some((row) => !batch.items?.some((item) => item.importItemId === row.importItemId && item.sourceRecordHash === row.sourceRecordHash) || !['imported', 'rejected', 'quarantined'].includes(row.result) || (row.result === 'imported' && (!UUID.test(row.canonicalTransactionId) || !HASH.test(row.importedRecordHash) || row.documentExpected !== row.documentImported)) || (row.result !== 'imported' && !row.reason))) errors.push('historical_import_reconciliation_invalid')
  if (rows.length !== batch.items?.length) errors.push('historical_import_reconciliation_incomplete')
  const report = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, reconciliationId: `import-reconciliation:${batch.batchId}`, batchId: batch.batchId, batchFingerprint: batch.fingerprint, rows, counts: { source: batch.items?.length || 0, imported: rows.filter((row) => row.result === 'imported').length, rejected: rows.filter((row) => row.result === 'rejected').length, quarantined: rows.filter((row) => row.result === 'quarantined').length, documentsExpected: rows.reduce((sum, row) => sum + row.documentExpected, 0), documentsImported: rows.reduce((sum, row) => sum + row.documentImported, 0) }, balanced: errors.length === 0, reconciledAt: at, reconciledBy: actorResult.actor.userId, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  report.fingerprint = fingerprint(report)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], report })
}

export function buildFailedJobRecoveryIntent(input = {}) {
  const at = iso(input.preparedAt); const context = practice(input, PRACTICE_OPERATION_CAPABILITIES.managePractice, at)
  const jobType = key(input.jobType); const failureEvidence = referenceEvidence(input.failureEvidence); const approvals = (input.approvals || []).filter((item) => item.decision === 'approved' && UUID.test(text(item.approvedBy)) && text(item.role) && text(item.reason) && iso(item.approvedAt)); const errors = [...context.errors]
  if (!text(input.intentId) || !JOB_TYPES.has(jobType) || !text(input.jobId) || !FINGERPRINT.test(text(input.jobFingerprint)) || !validEvidence(failureEvidence) || !text(input.failureCode) || !text(input.idempotencyKey) || !at || input.retryable !== true) errors.push('failed_job_recovery_identity_invalid')
  if (jobType === RECOVERY_JOB_TYPES.inboundWebhook && (input.signatureVerified !== true || !text(input.providerEventId) || !HASH.test(text(input.providerEventHash)))) errors.push('webhook_replay_integrity_invalid')
  if (input.killSwitchActive === true) errors.push('failed_job_recovery_kill_switch_active')
  if (!approvals.some((item) => key(item.role) === 'operations') || !approvals.some((item) => key(item.role) === 'security') || new Set(approvals.map((item) => item.approvedBy)).size < 2) errors.push('failed_job_recovery_approval_required')
  const intent = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, transportVersion: CONVEYANCER_PROVIDER_TRANSPORT_VERSION, intentId: text(input.intentId), identity: context.identity, jobType, jobId: text(input.jobId), expectedJobFingerprint: text(input.jobFingerprint), failureEvidence, failureCode: text(input.failureCode), idempotencyKey: text(input.idempotencyKey), providerEventId: text(input.providerEventId) || null, providerEventHash: text(input.providerEventHash) || null, signatureVerified: input.signatureVerified === true, approvals: approvals.map((item) => ({ role: key(item.role), approvedBy: text(item.approvedBy), reason: text(item.reason), approvedAt: iso(item.approvedAt) })), preparedAt: at, preparedBy: context.actor.userId, eligibleForReplay: errors.length === 0, replayed: false, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  intent.fingerprint = fingerprint(intent)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], intent })
}

export function buildApprovedSupportAccess(input = {}) {
  const startsAt = iso(input.startsAt); const endsAt = iso(input.endsAt); const managerResult = buildPracticeActor(input.manager || {}); const approvals = input.approvals || []; const errors = [...managerResult.errors]
  const approved = approvals.filter((item) => item.decision === 'approved' && UUID.test(text(item.approvedBy)) && ['firm_manager', 'privacy'].includes(key(item.role)) && text(item.reason) && iso(item.approvedAt))
  if (!text(input.accessId) || !UUID.test(text(input.supportUserId)) || !UUID.test(text(input.organisationId)) || !UUID.test(text(input.attorneyFirmId)) || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt) || new Date(endsAt) - new Date(startsAt) > 4 * 60 * 60 * 1000 || !text(input.incidentId) || !text(input.reason) || !unique(input.transactionIds).length) errors.push('support_access_identity_invalid')
  if (managerResult.actor.role !== PRACTICE_OPERATION_ROLES.firmManager || managerResult.actor.organisationId !== text(input.organisationId) || managerResult.actor.attorneyFirmId !== text(input.attorneyFirmId) || !approved.some((item) => key(item.role) === 'firm_manager') || !approved.some((item) => key(item.role) === 'privacy') || new Set(approved.map((item) => item.approvedBy)).size < 2) errors.push('support_access_independent_approval_required')
  const access = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, accessId: text(input.accessId), supportUserId: text(input.supportUserId), organisationId: text(input.organisationId), attorneyFirmId: text(input.attorneyFirmId), transactionIds: unique(input.transactionIds), incidentId: text(input.incidentId), reason: text(input.reason), capabilities: ['view_redacted_diagnostics'], startsAt, endsAt, approvals: approved.map((item) => ({ role: key(item.role), approvedBy: text(item.approvedBy), reason: text(item.reason), approvedAt: iso(item.approvedAt) })), granted: false, rawPayloadAccess: false, credentialAccess: false, privilegedContentAccess: false, exportAllowed: false, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  access.fingerprint = fingerprint(access)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], access })
}

export function buildOperationalRecoveryEvidence(input = {}) {
  const at = iso(input.assessedAt); const context = practice(input, PRACTICE_OPERATION_CAPABILITIES.managePractice, at); const backup = referenceEvidence(input.backupEvidence); const restore = referenceEvidence(input.restoreTestEvidence); const rollback = referenceEvidence(input.rollbackEvidence); const continuity = referenceEvidence(input.businessContinuityEvidence); const errors = [...context.errors]
  if (!text(input.recoveryId) || !at || ![backup, restore, rollback, continuity].every(validEvidence) || !text(input.runbookVersion) || !text(input.recoveryEnvironment)) errors.push('operational_recovery_evidence_invalid')
  const rpoTargetMinutes = Math.max(0, integer(input.rpoTargetMinutes)); const rpoActualMinutes = Math.max(0, integer(input.rpoActualMinutes)); const rtoTargetMinutes = Math.max(1, integer(input.rtoTargetMinutes)); const rtoActualMinutes = Math.max(0, integer(input.rtoActualMinutes))
  if (rpoActualMinutes > rpoTargetMinutes || rtoActualMinutes > rtoTargetMinutes || input.restoreTestPassed !== true || input.rollbackTestPassed !== true || input.businessContinuityExercisePassed !== true) errors.push('operational_recovery_objective_failed')
  const signoffs = (input.signoffs || []).filter((item) => item.decision === 'approved' && ['operations', 'security', 'legal'].includes(key(item.role)) && UUID.test(text(item.approvedBy)) && text(item.reason) && iso(item.approvedAt)); if (new Set(signoffs.map((item) => item.role)).size !== 3 || new Set(signoffs.map((item) => item.approvedBy)).size !== 3) errors.push('operational_recovery_signoff_required')
  const evidence = { version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, operationalAssuranceVersion: CONVEYANCER_OPERATIONAL_ASSURANCE_VERSION, recoveryId: text(input.recoveryId), organisationId: context.identity.organisationId, attorneyFirmId: context.identity.attorneyFirmId, recoveryEnvironment: text(input.recoveryEnvironment), runbookVersion: text(input.runbookVersion), backup, restoreTest: restore, rollback, businessContinuity: continuity, objectives: { rpoTargetMinutes, rpoActualMinutes, rtoTargetMinutes, rtoActualMinutes }, outcomes: { restoreTestPassed: input.restoreTestPassed === true, rollbackTestPassed: input.rollbackTestPassed === true, businessContinuityExercisePassed: input.businessContinuityExercisePassed === true }, signoffs: signoffs.map((item) => ({ role: key(item.role), approvedBy: text(item.approvedBy), reason: text(item.reason), approvedAt: iso(item.approvedAt) })), ready: errors.length === 0, assessedAt: at, assessedBy: context.actor.userId, databaseRestored: false, rollbackExecuted: false, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }
  evidence.fingerprint = fingerprint(evidence)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], evidence })
}

export function serializeMatterCloseoutRecoveryEvidence(input = {}) {
  return JSON.stringify(stable({ version: CONVEYANCER_MATTER_CLOSEOUT_RECOVERY_VERSION, closeout: input.assessment ? { assessmentId: input.assessment.assessmentId, transactionId: input.assessment.identity?.transactionId, state: input.assessment.state, readyForCloseout: input.assessment.readyForCloseout, checks: input.assessment.checks, blockers: input.assessment.blockers, assessedAt: input.assessment.assessedAt, fingerprint: input.assessment.fingerprint } : null, archive: input.archive ? { archiveId: input.archive.archiveId, assessmentFingerprint: input.archive.assessmentFingerprint, itemCount: input.archive.itemCount, includedCount: input.archive.includedCount, legalHold: input.archive.legalHold, retentionScheduleId: input.archive.retentionScheduleId, preparedAt: input.archive.preparedAt, fingerprint: input.archive.fingerprint } : null, importReconciliation: input.importReconciliation ? { reconciliationId: input.importReconciliation.reconciliationId, batchId: input.importReconciliation.batchId, counts: input.importReconciliation.counts, balanced: input.importReconciliation.balanced, reconciledAt: input.importReconciliation.reconciledAt, fingerprint: input.importReconciliation.fingerprint } : null, recovery: input.recovery ? { recoveryId: input.recovery.recoveryId, recoveryEnvironment: input.recovery.recoveryEnvironment, runbookVersion: input.recovery.runbookVersion, objectives: input.recovery.objectives, outcomes: input.recovery.outcomes, ready: input.recovery.ready, assessedAt: input.recovery.assessedAt, fingerprint: input.recovery.fingerprint } : null, controls: MATTER_CLOSEOUT_RECOVERY_BOUNDARY }))
}
