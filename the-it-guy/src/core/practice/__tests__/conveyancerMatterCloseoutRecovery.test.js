import assert from 'node:assert/strict'
import {
  buildApprovedSupportAccess,
  buildDefensibleMatterArchive,
  buildFailedJobRecoveryIntent,
  buildHistoricalMatterImportBatch,
  buildMatterCloseoutAssessment,
  buildMatterClosureIntent,
  buildOperationalRecoveryEvidence,
  buildOriginalDocumentRegister,
  detectHistoricalMatterDuplicates,
  MATTER_CLOSEOUT_RECOVERY_BOUNDARY,
  previewMatterReopening,
  reconcileHistoricalMatterImport,
  serializeMatterCloseoutRecoveryEvidence,
} from '../conveyancerMatterCloseoutRecovery.js'
import { CONVEYANCER_INFORMATION_GOVERNANCE_VERSION } from '../conveyancerInformationGovernance.js'
import { CONVEYANCER_FINAL_ACCOUNT_VERSION } from '../../../services/attorneyWorkflow/conveyancerFinalAccountWorkflow.js'

const org = '10000000-0000-4000-8000-000000000001'
const firm = '20000000-0000-4000-8000-000000000001'
const branch = '30000000-0000-4000-8000-000000000001'
const team = '40000000-0000-4000-8000-000000000001'
const matterId = '50000000-0000-4000-8000-000000000001'
const attorneyId = '60000000-0000-4000-8000-000000000001'
const managerId = '70000000-0000-4000-8000-000000000001'
const privacyId = '80000000-0000-4000-8000-000000000001'
const securityId = '90000000-0000-4000-8000-000000000001'
const supportId = 'a0000000-0000-4000-8000-000000000001'
const legalId = 'b0000000-0000-4000-8000-000000000001'
const hashA = `sha256:${'a'.repeat(64)}`
const hashB = `sha256:${'b'.repeat(64)}`
const hashC = `sha256:${'c'.repeat(64)}`
const at = '2026-07-16T12:00:00Z'

function identity(operationId = 'g9:operation') { return { organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team, transactionId: matterId, operationId, lane: 'shared' } }
function actor(role = 'responsible_attorney', userId = attorneyId) { return { userId, membershipId: `membership:${userId}`, role, organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team } }
function evidence(reference = 'evidence://g9/1', hash = hashA, occurredAt = at) { return { reference, hash, occurredAt, source: 'manual' } }

function originalRegister(overrides = {}) {
  const result = buildOriginalDocumentRegister({ registerId: 'originals:g9:1', identity: identity('g9:originals'), actor: actor(), createdAt: at, legalHold: false, documents: [{ documentId: 'original:g9:otp', documentType: 'signed_otp', title: 'Original signed OTP', contentHash: hashA, status: 'returned', receivedAt: '2026-01-10T08:00:00Z', requiredDisposition: 'return', dispositionDueAt: '2026-07-01T00:00:00Z', movements: [{ movementId: 'movement:g9:1', type: 'returned_to_client', fromCustodianReference: 'vault://firm/1', toCustodianReference: 'party://seller/1', occurredAt: '2026-07-10T10:00:00Z', evidence: evidence('evidence://g9/original-return', hashB, '2026-07-10T10:00:00Z'), reason: 'Returned after registration.', authorisedBy: attorneyId }] }], ...overrides })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.register
}

function assessment(overrides = {}) {
  const result = buildMatterCloseoutAssessment({ assessmentId: 'closeout:g9:1', identity: identity('g9:closeout'), actor: actor(), assessedAt: at, registrationEvidence: evidence('evidence://g9/registration', hashA, '2026-07-01T10:00:00Z'), finalAccount: { version: CONVEYANCER_FINAL_ACCOUNT_VERSION, finalAccountId: 'final-account:g9:1', status: 'approved', fingerprint: 'fnv1a_1234abcd' }, trustReconciliation: { reconciliationId: 'trust:g9:1', approved: true, unreconciledMinor: 0, fingerprint: 'fnv1a_2345bcde' }, exceptions: [], correspondenceHistory: { historyId: 'history:g9:1', reconstructable: true, crossFirmRecords: 0 }, originalDocumentRegister: originalRegister(), retentionSchedule: { version: CONVEYANCER_INFORMATION_GOVERNANCE_VERSION, scheduleId: 'retention:g9:1', retentionClass: 'conveyancing_matter', retainUntil: '2032-07-16T00:00:00Z' }, matterPlan: { planId: 'plan:g9:1', closeoutActionsComplete: true, openRequiredActions: 0 }, ...overrides })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.assessment
}

function archive(overrides = {}) {
  const closeout = overrides.assessment || assessment()
  const result = buildDefensibleMatterArchive({ archiveId: 'archive:g9:1', identity: identity('g9:archive'), actor: actor(), assessment: closeout, items: [{ itemId: 'archive-item:g9:registration', recordType: 'registration_evidence', recordId: 'registration:g9:1', recordVersion: '1', reference: 'evidence://g9/registration', contentHash: hashA, classifications: ['confidential'], retentionClass: 'conveyancing_matter' }, { itemId: 'archive-item:g9:privileged', recordType: 'legal_note', recordId: 'note:g9:1', recordVersion: '2', reference: 'note://g9/1', contentHash: hashB, classifications: ['privileged'], retentionClass: 'privileged_matter_record' }], retentionScheduleId: 'retention:g9:1', legalHold: false, preparedAt: at, ...overrides })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.archive
}

function importBatch(overrides = {}) {
  const result = buildHistoricalMatterImportBatch({ batchId: 'import:g9:1', identity: identity('g9:import'), actor: actor('firm_manager', managerId), sourceSystem: 'legacy_practice_system', sourceManifest: evidence('manifest://g9/import', hashA), mappingVersion: '1.0.0', preparedAt: at, items: [{ importItemId: 'import-item:g9:1', sourceMatterReference: 'LEGACY-42', sourceRecordReference: 'legacy://matter/42', sourceRecordHash: hashB, canonicalTransactionId: matterId, matterReference: 'TR-2026-0042', partyKeys: ['party-key:seller', 'party-key:buyer'], propertyKey: 'erf_42_cape_town', documentCount: 2, documentManifestReference: 'legacy://matter/42/documents', documentManifestHash: hashC, status: 'proposed' }], ...overrides })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.batch
}

function approvals() { return [{ role: 'operations', decision: 'approved', approvedBy: managerId, reason: 'Operational replay reviewed.', approvedAt: at }, { role: 'security', decision: 'approved', approvedBy: securityId, reason: 'Signature and replay controls reviewed.', approvedAt: at }] }
function recoverySignoffs() { return [{ role: 'operations', decision: 'approved', approvedBy: managerId, reason: 'Recovery objectives met.', approvedAt: at }, { role: 'security', decision: 'approved', approvedBy: securityId, reason: 'Integrity controls passed.', approvedAt: at }, { role: 'legal', decision: 'approved', approvedBy: legalId, reason: 'Retention and legal controls passed.', approvedAt: at }] }
function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

test('registers original documents with immutable custody movements', () => {
  const value = originalRegister()
  assert.equal(value.documents[0].status, 'returned')
  assert.equal(value.unresolvedCount, 0)
  assert.match(value.fingerprint, /^fnv1a_/)
})

test('requires custody references while an original remains held', () => {
  const result = buildOriginalDocumentRegister({ registerId: 'originals:g9:held', identity: identity(), actor: actor(), createdAt: at, documents: [{ documentId: 'original:g9:held', documentType: 'title_deed', title: 'Original title deed', contentHash: hashA, status: 'held', receivedAt: at, requiredDisposition: 'return' }] })
  assert.ok(result.errors.includes('original_document_custody_missing:original:g9:held'))
})

test('prevents destruction of originals under legal hold', () => {
  const result = buildOriginalDocumentRegister({ registerId: 'originals:g9:hold', identity: identity(), actor: actor(), createdAt: at, legalHold: true, documents: [{ documentId: 'original:g9:destroyed', documentType: 'affidavit', title: 'Affidavit', contentHash: hashA, status: 'destroyed', receivedAt: at, requiredDisposition: 'destroy' }] })
  assert.ok(result.errors.includes('original_document_destroyed_under_legal_hold:original:g9:destroyed'))
})

test('assesses an evidence-backed matter as ready for close-out', () => {
  const value = assessment()
  assert.equal(value.readyForCloseout, true)
  assert.equal(value.state, 'ready')
  assert.ok(value.checks.every((item) => item.satisfied))
})

test('blocks close-out for unreconciled money and open exceptions', () => {
  const result = buildMatterCloseoutAssessment({ assessmentId: 'closeout:g9:blocked', identity: identity(), actor: actor(), assessedAt: at, registrationEvidence: evidence(), finalAccount: { version: CONVEYANCER_FINAL_ACCOUNT_VERSION, status: 'approved', fingerprint: 'fnv1a_1234abcd' }, trustReconciliation: { approved: true, unreconciledMinor: 100, fingerprint: 'fnv1a_2345bcde' }, exceptions: [{ exceptionId: 'exception:g9:1', status: 'investigating' }], correspondenceHistory: { reconstructable: true, crossFirmRecords: 0 }, originalDocumentRegister: originalRegister(), retentionSchedule: { version: CONVEYANCER_INFORMATION_GOVERNANCE_VERSION, retentionClass: 'matter', retainUntil: '2032-01-01' }, matterPlan: { closeoutActionsComplete: true, openRequiredActions: 0 } })
  assert.equal(result.assessment.readyForCloseout, false)
  assert.ok(result.assessment.blockers.includes('trust_not_fully_reconciled'))
  assert.ok(result.assessment.blockers.includes('open_exception:exception:g9:1'))
})

test('builds a defensible reference-only archive manifest', () => {
  const value = archive()
  assert.equal(value.itemCount, 2)
  assert.equal(value.archiveWritten, false)
  assert.equal(value.items[1].classifications[0], 'privileged')
})

test('requires archive exclusions to be explained', () => {
  const result = buildDefensibleMatterArchive({ archiveId: 'archive:g9:bad', identity: identity(), actor: actor(), assessment: assessment(), items: [{ itemId: 'item:bad', recordType: 'note', recordId: 'note:1', recordVersion: '1', reference: 'note://1', contentHash: hashA, classifications: ['confidential'], retentionClass: 'matter', included: false }], retentionScheduleId: 'retention:g9:1', preparedAt: at })
  assert.ok(result.errors.includes('matter_archive_manifest_invalid'))
})

test('prepares closure without changing the matter state', () => {
  const closeout = assessment(); const result = buildMatterClosureIntent({ assessment: closeout, archive: archive({ assessment: closeout }), actor: actor(), reason: 'All close-out checks and archive evidence approved.', preparedAt: at })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.intent.targetState, 'closed')
  assert.equal(result.intent.executed, false)
  assert.equal(result.intent.controls.matterClosed, false)
})

test('previews reopening while preserving closed evidence', () => {
  const result = previewMatterReopening({ closureRecord: { version: 'conveyancer_matter_closeout_recovery_g9_v1', state: 'closed', transactionId: matterId, fingerprint: 'fnv1a_3456cdef' }, actor: actor(), reason: 'Post-registration correction requires a new controlled plan.', targetPlanDefinition: { planDefinitionId: 'plan:reopen', version: '2.0.0', fingerprint: 'fnv1a_4567def0' }, previewedAt: at })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.preview.reopened, false)
  assert.ok(result.preview.acknowledgementsRequired.includes('closed_evidence_remains_immutable'))
})

test('builds a reference-only historical matter and document import batch', () => {
  const value = importBatch()
  assert.equal(value.itemCount, 1)
  assert.equal(value.documentCount, 2)
  assert.equal(value.importPersisted, false)
  assert.equal(value.documentsCopied, false)
})

test('detects exact and probable duplicate matters without merging', () => {
  const result = detectHistoricalMatterDuplicates({ batch: importBatch(), existingMatters: [{ transactionId: '50000000-0000-4000-8000-000000000002', matterReference: 'TR-2026-0042', propertyKey: 'erf_42_cape_town', partyKeys: ['party-key:seller'] }] })
  assert.equal(result.candidateCount, 1)
  assert.equal(result.candidates[0].confidence, 'exact')
  assert.equal(result.duplicateMerged, false)
})

test('reconciles every imported source matter and document', () => {
  const batch = importBatch(); const result = reconcileHistoricalMatterImport({ batch, reconciledBy: actor('firm_manager', managerId), reconciledAt: at, outcomes: [{ importItemId: 'import-item:g9:1', result: 'imported', canonicalTransactionId: matterId, sourceRecordHash: hashB, importedRecordHash: hashA, documentExpected: 2, documentImported: 2 }] })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.report.balanced, true)
  assert.equal(result.report.counts.documentsImported, 2)
})

test('blocks incomplete or document-unbalanced import reconciliation', () => {
  const batch = importBatch(); const result = reconcileHistoricalMatterImport({ batch, reconciledBy: actor('firm_manager', managerId), reconciledAt: at, outcomes: [{ importItemId: 'import-item:g9:1', result: 'imported', canonicalTransactionId: matterId, sourceRecordHash: hashB, importedRecordHash: hashA, documentExpected: 2, documentImported: 1 }] })
  assert.ok(result.errors.includes('historical_import_reconciliation_invalid'))
  assert.equal(result.report.balanced, false)
})

test('prepares an independently approved failed-job retry intent', () => {
  const result = buildFailedJobRecoveryIntent({ intentId: 'recovery-intent:g9:1', identity: identity('g9:retry'), actor: actor('firm_manager', managerId), jobType: 'document_job', jobId: 'job:g9:1', jobFingerprint: 'fnv1a_5678ef01', failureEvidence: evidence('failure://g9/job', hashA), failureCode: 'renderer_timeout', idempotencyKey: 'retry:g9:job:1', retryable: true, killSwitchActive: false, approvals: approvals(), preparedAt: at })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.intent.eligibleForReplay, true)
  assert.equal(result.intent.replayed, false)
})

test('requires verified signatures and event hashes before webhook replay', () => {
  const result = buildFailedJobRecoveryIntent({ intentId: 'recovery-intent:g9:webhook', identity: identity('g9:webhook'), actor: actor('firm_manager', managerId), jobType: 'inbound_webhook', jobId: 'webhook:g9:1', jobFingerprint: 'fnv1a_6789f012', failureEvidence: evidence(), failureCode: 'handler_failed', idempotencyKey: 'retry:g9:webhook:1', retryable: true, signatureVerified: false, providerEventId: 'event:g9:1', providerEventHash: '', approvals: approvals(), preparedAt: at })
  assert.ok(result.errors.includes('webhook_replay_integrity_invalid'))
  assert.equal(result.intent.replayed, false)
})

test('blocks recovery while the operational kill switch is active', () => {
  const result = buildFailedJobRecoveryIntent({ intentId: 'recovery-intent:g9:killed', identity: identity(), actor: actor('firm_manager', managerId), jobType: 'import_job', jobId: 'job:g9:2', jobFingerprint: 'fnv1a_7890a123', failureEvidence: evidence(), failureCode: 'worker_failed', idempotencyKey: 'retry:g9:2', retryable: true, killSwitchActive: true, approvals: approvals(), preparedAt: at })
  assert.ok(result.errors.includes('failed_job_recovery_kill_switch_active'))
})

test('creates narrow, time-limited and independently approved support access', () => {
  const result = buildApprovedSupportAccess({ accessId: 'support:g9:1', supportUserId: supportId, organisationId: org, attorneyFirmId: firm, transactionIds: [matterId], incidentId: 'incident:g9:1', reason: 'Inspect redacted diagnostics for failed import.', startsAt: at, endsAt: '2026-07-16T14:00:00Z', manager: actor('firm_manager', managerId), approvals: [{ role: 'firm_manager', decision: 'approved', approvedBy: managerId, reason: 'Scoped support approved.', approvedAt: at }, { role: 'privacy', decision: 'approved', approvedBy: privacyId, reason: 'Redacted diagnostics only.', approvedAt: at }] })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.access.capabilities, ['view_redacted_diagnostics'])
  assert.equal(result.access.granted, false)
  assert.equal(result.access.privilegedContentAccess, false)
})

test('rejects excessive support windows and self-approved access', () => {
  const result = buildApprovedSupportAccess({ accessId: 'support:g9:bad', supportUserId: supportId, organisationId: org, attorneyFirmId: firm, transactionIds: [matterId], incidentId: 'incident:g9:1', reason: 'Too broad.', startsAt: at, endsAt: '2026-07-17T12:00:00Z', manager: actor('firm_manager', managerId), approvals: [{ role: 'firm_manager', decision: 'approved', approvedBy: managerId, reason: 'Approved.', approvedAt: at }, { role: 'privacy', decision: 'approved', approvedBy: managerId, reason: 'Self approved.', approvedAt: at }] })
  assert.ok(result.errors.includes('support_access_identity_invalid'))
  assert.ok(result.errors.includes('support_access_independent_approval_required'))
})

test('records tested backup, restore, rollback and business-continuity evidence', () => {
  const result = buildOperationalRecoveryEvidence({ recoveryId: 'recovery:g9:1', identity: identity('g9:recovery'), actor: actor('firm_manager', managerId), recoveryEnvironment: 'isolated_restore_test', runbookVersion: '2.0.0', backupEvidence: evidence('backup://g9/1', hashA), restoreTestEvidence: evidence('restore://g9/1', hashB), rollbackEvidence: evidence('rollback://g9/1', hashC), businessContinuityEvidence: evidence('bcp://g9/1', hashA), rpoTargetMinutes: 15, rpoActualMinutes: 10, rtoTargetMinutes: 60, rtoActualMinutes: 45, restoreTestPassed: true, rollbackTestPassed: true, businessContinuityExercisePassed: true, signoffs: recoverySignoffs(), assessedAt: at })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.evidence.ready, true)
  assert.equal(result.evidence.databaseRestored, false)
  assert.equal(result.evidence.rollbackExecuted, false)
})

test('fails recovery evidence when RPO or RTO objectives are missed', () => {
  const result = buildOperationalRecoveryEvidence({ recoveryId: 'recovery:g9:failed', identity: identity(), actor: actor('firm_manager', managerId), recoveryEnvironment: 'test', runbookVersion: '2.0.0', backupEvidence: evidence(), restoreTestEvidence: evidence(), rollbackEvidence: evidence(), businessContinuityEvidence: evidence(), rpoTargetMinutes: 15, rpoActualMinutes: 30, rtoTargetMinutes: 60, rtoActualMinutes: 90, restoreTestPassed: true, rollbackTestPassed: true, businessContinuityExercisePassed: true, signoffs: recoverySignoffs(), assessedAt: at })
  assert.ok(result.errors.includes('operational_recovery_objective_failed'))
  assert.equal(result.evidence.ready, false)
})

test('serializes only redacted close-out and recovery assurance evidence', () => {
  const value = serializeMatterCloseoutRecoveryEvidence({ assessment: { ...assessment(), rawPartyData: 'secret' }, archive: archive(), recovery: { recoveryId: 'recovery:g9:1', recoveryEnvironment: 'test', runbookVersion: '2', objectives: {}, outcomes: {}, ready: true, assessedAt: at, fingerprint: 'fnv1a_8901b234', rawBackup: 'secret' } })
  assert.equal(value.includes('rawPartyData'), false)
  assert.equal(value.includes('rawBackup'), false)
  assert.equal(JSON.parse(value).closeout.readyForCloseout, true)
})

test('keeps every G9 operation inside its non-mutating boundary', () => {
  assert.ok(Object.values(MATTER_CLOSEOUT_RECOVERY_BOUNDARY).every((value) => value === false))
})
