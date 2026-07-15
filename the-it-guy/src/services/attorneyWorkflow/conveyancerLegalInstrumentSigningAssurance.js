import {
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerGovernedContentHash } from './conveyancerCorrespondenceGenerator.js'
import {
  buildConveyancerLegalInstrumentAssurance,
  runConveyancerLegalInstrumentPilotScenario,
} from './conveyancerLegalInstrumentPilot.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CAPABILITIES,
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS,
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS,
  CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_STATUSES,
  canConveyancerLegalInstrumentReviewActor,
  executeConveyancerLegalInstrumentReview,
  startConveyancerLegalInstrumentReview,
  validateConveyancerLegalInstrumentReview,
} from './conveyancerLegalInstrumentReview.js'
import {
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_CAPABILITIES,
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_COMMANDS,
  CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_STATUSES,
  canConveyancerLegalInstrumentSigningActor,
  executeConveyancerLegalInstrumentSigningEvidence,
  startConveyancerLegalInstrumentSigningEvidence,
  validateConveyancerLegalInstrumentSigningEvidence,
} from './conveyancerLegalInstrumentSigningEvidence.js'

export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_ASSURANCE_VERSION = 'conveyancer_legal_instrument_signing_assurance_v1'
export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_VERSION = 'conveyancer_legal_instrument_signing_pilot_v1'

export const DEFAULT_CONVEYANCER_SIGNING_ASSURANCE_THRESHOLDS = Object.freeze({
  minimumScenarioPassRate: 1,
  maximumSigningFailureRate: 0.05,
  observeSigningFailureRate: 0.02,
  maximumOverdueSigningRate: 0.1,
  observeOverdueSigningRate: 0.05,
  maximumDeclineRate: 0.2,
  observeDeclineRate: 0.1,
  maximumEvidenceIntegrityFailures: 0,
  maximumAuditGaps: 0,
  maximumIdentityVerificationFailures: 0,
  maximumCompletionCertificateFailures: 0,
  maximumSideEffectAttempts: 0,
})

export const CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'completed_transfer_signing', label: 'Completed transfer signing with certificate', scenarioId: 'residential_transfer_instruction', workflow: 'complete', expectedOutcome: 'ready' }),
  Object.freeze({ id: 'completed_bond_signing', label: 'Completed bond signing with certificate', scenarioId: 'bank_bond_application', workflow: 'complete', expectedOutcome: 'ready' }),
  Object.freeze({ id: 'completed_cancellation_signing', label: 'Completed cancellation signing with certificate', scenarioId: 'lender_cancellation_instruction', workflow: 'complete', expectedOutcome: 'ready' }),
  Object.freeze({ id: 'signing_in_progress', label: 'Signing awaiting remaining evidence', scenarioId: 'residential_transfer_instruction', workflow: 'in_progress', expectedOutcome: 'observe' }),
  Object.freeze({ id: 'signer_declined', label: 'Signer declined with governed evidence', scenarioId: 'residential_transfer_instruction', workflow: 'declined', expectedOutcome: 'observe' }),
  Object.freeze({ id: 'tampered_signature_chain', label: 'Tampered signature artifact chain fails safely', scenarioId: 'residential_transfer_instruction', workflow: 'tamper', expectedOutcome: 'safe_block' }),
])

const REVIEW_COMMAND = CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_COMMANDS
const REVIEW_CAPABILITY = CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CAPABILITIES
const REVIEW_STATUS = CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_STATUSES
const SIGNING_COMMAND = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_COMMANDS
const SIGNING_CAPABILITY = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_CAPABILITIES
const SIGNING_STATUS = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_STATUSES

function text(value = '') { return String(value ?? '').trim() }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function clone(value) { return typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value) }

function check({ id, label, category = 'platform', severity = 'warning', passed, detail, evidence = null }) {
  return { id, label, category, severity, status: passed ? 'passed' : 'failed', passed: passed === true, detail, evidence }
}

function laneAuthorised(role, lane) {
  const normalized = normalizeMatterPlanOwnerRole(role)
  if ([R.firmManager, R.system].includes(normalized)) return true
  if (lane === 'transfer') return [R.conveyancer, R.transferAttorney, R.secretary].includes(normalized)
  if (lane === 'bond') return [R.bondAttorney, R.secretary].includes(normalized)
  if (lane === 'cancellation') return [R.cancellationAttorney, R.secretary].includes(normalized)
  return false
}

function reviewEventCapability(commandType) {
  if (commandType === 'submit_review') return REVIEW_CAPABILITY.submit
  if (commandType === REVIEW_COMMAND.reject) return REVIEW_CAPABILITY.reject
  if (commandType === REVIEW_COMMAND.approve) return REVIEW_CAPABILITY.approve
  if ([REVIEW_COMMAND.recommendApproval, REVIEW_COMMAND.requestChanges].includes(commandType)) return REVIEW_CAPABILITY.review
  return ''
}

function signingEventCapability(commandType) {
  if (commandType === 'prepare_signing') return SIGNING_CAPABILITY.prepare
  if ([SIGNING_COMMAND.recordViewed, SIGNING_COMMAND.recordSignature, SIGNING_COMMAND.recordDecline].includes(commandType)) return SIGNING_CAPABILITY.recordEvidence
  if (commandType === SIGNING_COMMAND.complete) return SIGNING_CAPABILITY.complete
  if (commandType === SIGNING_COMMAND.expire) return SIGNING_CAPABILITY.expire
  if (commandType === SIGNING_COMMAND.void) return SIGNING_CAPABILITY.void
  return ''
}

function snapshotsEqual(left, right, fields) {
  return fields.every((field) => JSON.stringify(left?.[field] ?? null) === JSON.stringify(right?.[field] ?? null))
}

function reviewRuntimeSnapshot(review = {}) {
  return {
    status: review.status,
    reviewDecision: clone(review.reviewDecision || null),
    approval: clone(review.approval || null),
    runtimeRevision: Number(review.runtimeRevision || 0),
    updatedAt: review.updatedAt || null,
    lastEventId: review.lastEventId || null,
  }
}

function signingRuntimeSnapshot(signing = {}) {
  return {
    status: signing.status,
    signerStates: clone(signing.signerStates || []),
    currentArtifactHash: signing.currentArtifactHash,
    signedDocumentEvidence: clone(signing.signedDocumentEvidence || null),
    terminalDecision: clone(signing.terminalDecision || null),
    runtimeRevision: Number(signing.runtimeRevision || 0),
    updatedAt: signing.updatedAt || null,
    lastEventId: signing.lastEventId || null,
  }
}

function auditReview(review, events = []) {
  const issues = []
  const scoped = (Array.isArray(events) ? events : []).filter((event) => event.reviewId === review.reviewId).sort((left, right) => Number(left.reviewRevision) - Number(right.reviewRevision))
  if (scoped.length !== Number(review.runtimeRevision)) issues.push('review_event_count_mismatch')
  const ids = scoped.map((event) => text(event.eventId))
  const commands = scoped.map((event) => text(event.commandId))
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) issues.push('review_event_identity_invalid')
  if (commands.some((id) => !id) || new Set(commands).size !== commands.length) issues.push('review_command_identity_invalid')
  scoped.forEach((event, index) => {
    const revision = index + 1
    if (Number(event.reviewRevision) !== revision || Number(event.after?.runtimeRevision) !== revision || Number(event.before?.runtimeRevision) !== revision - 1) issues.push(`review_revision_gap:${revision}`)
    if (event.documentId !== review.documentId || event.planId !== review.planId || event.lane !== review.lane || event.bindingFingerprint !== review.bindingFingerprint || event.contentFingerprint !== review.contentFingerprint || event.provenanceFingerprint !== review.provenanceFingerprint) issues.push(`review_event_binding_mismatch:${revision}`)
    if (!validDate(event.occurredAt) || event.actor?.userId == null) issues.push(`review_event_evidence_invalid:${revision}`)
    const capability = reviewEventCapability(event.commandType)
    if (!capability || !canConveyancerLegalInstrumentReviewActor(event.actor?.role, capability) || !laneAuthorised(event.actor?.role, review.lane)) issues.push(`review_event_authority_invalid:${revision}`)
    if (revision > 1 && !sha(event.commandFingerprint)) issues.push(`review_command_fingerprint_invalid:${revision}`)
    if ([event.renderingPerformed, event.persistencePerformed, event.signingPerformed, event.dispatchPerformed].some(Boolean)) issues.push(`review_side_effect_evidence:${revision}`)
    if (index > 0 && !snapshotsEqual(scoped[index - 1].after, event.before, ['status', 'reviewDecision', 'approval', 'runtimeRevision', 'updatedAt', 'lastEventId'])) issues.push(`review_snapshot_chain_break:${revision}`)
  })
  const latest = scoped.at(-1)
  if (latest && (!snapshotsEqual(latest.after, reviewRuntimeSnapshot(review), ['status', 'reviewDecision', 'approval', 'runtimeRevision', 'updatedAt', 'lastEventId']) || review.lastEventId !== latest.eventId)) issues.push('review_final_snapshot_mismatch')
  return { valid: issues.length === 0, eventCount: scoped.length, issues: unique(issues) }
}

function auditSigning(signing, events = []) {
  const issues = []
  const scoped = (Array.isArray(events) ? events : []).filter((event) => event.signingId === signing.signingId).sort((left, right) => Number(left.signingRevision) - Number(right.signingRevision))
  if (scoped.length !== Number(signing.runtimeRevision)) issues.push('signing_event_count_mismatch')
  const ids = scoped.map((event) => text(event.eventId))
  const commands = scoped.map((event) => text(event.commandId))
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) issues.push('signing_event_identity_invalid')
  if (commands.some((id) => !id) || new Set(commands).size !== commands.length) issues.push('signing_command_identity_invalid')
  scoped.forEach((event, index) => {
    const revision = index + 1
    if (Number(event.signingRevision) !== revision || Number(event.after?.runtimeRevision) !== revision || Number(event.before?.runtimeRevision) !== revision - 1) issues.push(`signing_revision_gap:${revision}`)
    if (event.reviewId !== signing.reviewId || event.documentId !== signing.documentId || event.planId !== signing.planId || event.lane !== signing.lane || event.bindingFingerprint !== signing.bindingFingerprint || event.c6ApprovalFingerprint !== signing.c6ApprovalFingerprint) issues.push(`signing_event_binding_mismatch:${revision}`)
    if (!validDate(event.occurredAt) || event.actor?.userId == null) issues.push(`signing_event_evidence_invalid:${revision}`)
    const capability = signingEventCapability(event.commandType)
    if (!capability || !canConveyancerLegalInstrumentSigningActor(event.actor?.role, capability) || !laneAuthorised(event.actor?.role, signing.lane)) issues.push(`signing_event_authority_invalid:${revision}`)
    if (revision > 1 && !sha(event.commandFingerprint)) issues.push(`signing_command_fingerprint_invalid:${revision}`)
    if ([event.renderingPerformed, event.persistencePerformed, event.signingPerformed, event.dispatchPerformed].some(Boolean)) issues.push(`signing_side_effect_evidence:${revision}`)
    if (index > 0 && !snapshotsEqual(scoped[index - 1].after, event.before, ['status', 'signerStates', 'currentArtifactHash', 'signedDocumentEvidence', 'terminalDecision', 'runtimeRevision', 'updatedAt', 'lastEventId'])) issues.push(`signing_snapshot_chain_break:${revision}`)
  })
  const latest = scoped.at(-1)
  if (latest && (!snapshotsEqual(latest.after, signingRuntimeSnapshot(signing), ['status', 'signerStates', 'currentArtifactHash', 'signedDocumentEvidence', 'terminalDecision', 'runtimeRevision', 'updatedAt', 'lastEventId']) || signing.lastEventId !== latest.eventId)) issues.push('signing_final_snapshot_mismatch')
  return { valid: issues.length === 0, eventCount: scoped.length, issues: unique(issues) }
}

export function buildConveyancerLegalInstrumentSigningAssurance({
  plan = {},
  template = {},
  document = {},
  generationEvent = {},
  review = {},
  reviewEvents = [],
  signing = {},
  signingEvents = [],
  asOf = '',
} = {}) {
  const resolvedAsOf = validDate(asOf) ? new Date(asOf).toISOString() : new Date().toISOString()
  const planValidation = validateConveyancerMatterPlan(plan)
  const c5 = buildConveyancerLegalInstrumentAssurance({ plan, template, document, event: generationEvent, asOf: resolvedAsOf })
  const reviewValidation = validateConveyancerLegalInstrumentReview(review)
  const signingValidation = validateConveyancerLegalInstrumentSigningEvidence(signing)
  const reviewAudit = auditReview(review, reviewEvents)
  const signingAudit = auditSigning(signing, signingEvents)
  const c6BindingIssues = []
  if (review.documentId !== document.documentId) c6BindingIssues.push('review_document_id_mismatch')
  if (review.planId !== document.planId || Number(review.planVersion) !== Number(document.planVersion)) c6BindingIssues.push('review_plan_binding_mismatch')
  if (review.contentFingerprint !== document.contentFingerprint) c6BindingIssues.push('review_content_fingerprint_mismatch')
  if (review.provenanceFingerprint !== document.provenanceFingerprint) c6BindingIssues.push('review_provenance_fingerprint_mismatch')
  const c7BindingIssues = []
  if (signing.reviewId !== review.reviewId || signing.documentId !== review.documentId) c7BindingIssues.push('signing_review_binding_mismatch')
  if (signing.c6BindingFingerprint !== review.bindingFingerprint) c7BindingIssues.push('signing_c6_binding_fingerprint_mismatch')
  if (signing.c6ApprovalFingerprint !== review.approval?.approvalFingerprint || signing.c6ApprovalEventId !== review.lastEventId) c7BindingIssues.push('signing_c6_approval_mismatch')
  if (signing.contentFingerprint !== document.contentFingerprint || signing.provenanceFingerprint !== document.provenanceFingerprint) c7BindingIssues.push('signing_document_fingerprint_mismatch')
  const sideEffectIssues = [generationEvent, ...reviewEvents, ...signingEvents].flatMap((event, index) => [
    event?.renderingPerformed && `rendering_performed:${index}`,
    event?.persistencePerformed && `persistence_performed:${index}`,
    event?.signingPerformed && `signing_performed:${index}`,
    event?.dispatchPerformed && `dispatch_performed:${index}`,
  ]).filter(Boolean)
  const completed = signing.status === SIGNING_STATUS.completed
  const activePastExpiry = [SIGNING_STATUS.prepared, SIGNING_STATUS.inProgress, SIGNING_STATUS.awaitingCompletionEvidence].includes(signing.status) && validDate(signing.expiresAt) && new Date(signing.expiresAt) <= new Date(resolvedAsOf)
  const checks = [
    check({ id: 'active_plan_context', label: 'The signed instrument belongs to a valid active matter plan', severity: 'critical', passed: planValidation.valid && plan.status === MATTER_PLAN_STATUSES.active, detail: planValidation.valid ? `Plan status: ${plan.status || 'missing'}.` : `${planValidation.errors.length} plan error(s).`, evidence: planValidation.errors }),
    check({ id: 'c1_c5_draft_assurance', label: 'C1-C5 template, data, document and assurance controls remain intact', severity: 'critical', passed: c5.decision !== 'blocked', detail: `C5 decision: ${c5.decision}.`, evidence: c5.failedChecks.map((item) => item.id) }),
    check({ id: 'c6_review_contract', label: 'The C6 review and approval contract is structurally valid', severity: 'critical', passed: reviewValidation.valid, detail: reviewValidation.valid ? 'C6 contract valid.' : `${reviewValidation.errors.length} C6 error(s).`, evidence: reviewValidation.errors }),
    check({ id: 'c6_exact_document_binding', label: 'C6 approval binds to the exact assured C4 document', severity: 'critical', passed: c6BindingIssues.length === 0, detail: `${c6BindingIssues.length} C6 binding issue(s).`, evidence: c6BindingIssues }),
    check({ id: 'c6_final_approval', label: 'The exact document version has final legal approval', severity: 'critical', passed: review.status === REVIEW_STATUS.approved && review.approvedForRelease === true && sha(review.approval?.approvalFingerprint), detail: `Review status: ${review.status || 'missing'}.` }),
    check({ id: 'c6_audit_continuity', label: 'C6 submission, recommendation and approval have a complete authorised audit chain', severity: 'critical', passed: reviewAudit.valid, detail: `${reviewAudit.eventCount} C6 event(s), ${reviewAudit.issues.length} issue(s).`, evidence: reviewAudit.issues }),
    check({ id: 'c7_signing_contract', label: 'The C7 signing and document-evidence contract is valid', severity: 'critical', passed: signingValidation.valid, detail: signingValidation.valid ? 'C7 contract valid.' : `${signingValidation.errors.length} C7 error(s).`, evidence: signingValidation.errors }),
    check({ id: 'c7_exact_approval_binding', label: 'C7 binds to the exact C6 approval and C4 fingerprints', severity: 'critical', passed: c7BindingIssues.length === 0, detail: `${c7BindingIssues.length} C7 binding issue(s).`, evidence: c7BindingIssues }),
    check({ id: 'c7_render_and_signer_provenance', label: 'Render, signer-role and identity evidence remain governed', severity: 'critical', passed: signingValidation.valid && sha(signing.renderEvidence?.artifactHash) && (signing.requiredSignerRoles || []).length > 0 && (signing.signerStates || []).filter((item) => item.status === 'signed').every((item) => sha(item.signatureEvidence?.identityVerification?.referenceHash)), detail: `${signing.signerContract?.length || 0} signer contract(s), ${signing.signerStates?.filter((item) => item.status === 'signed').length || 0} signature(s).` }),
    check({ id: 'c7_artifact_and_completion_integrity', label: 'The signature hash chain and completed document certificate remain intact', severity: 'critical', passed: signingValidation.valid && (!completed || (sha(signing.completionFingerprint) && sha(signing.signedDocumentEvidence?.completionCertificateHash))), detail: completed ? 'Completed artifact and certificate verified.' : 'No completion claimed.' }),
    check({ id: 'c7_audit_continuity', label: 'C7 preparation and signing evidence have a complete authorised audit chain', severity: 'critical', passed: signingAudit.valid, detail: `${signingAudit.eventCount} C7 event(s), ${signingAudit.issues.length} issue(s).`, evidence: signingAudit.issues }),
    check({ id: 'no_embedded_side_effects', label: 'Assurance inputs contain no hidden rendering, persistence, signing or dispatch action', severity: 'critical', passed: sideEffectIssues.length === 0 && signing.externalSigningRequested === false && signing.persistenceAllowed === false && signing.dispatchAllowed === false, detail: `${sideEffectIssues.length} side-effect issue(s).`, evidence: sideEffectIssues }),
    check({ id: 'completed_signing_outcome', label: 'The signing run has a completed signed-document evidence packet', category: 'matter', passed: completed, detail: `Signing status: ${signing.status || 'missing'}.` }),
    check({ id: 'signing_window_health', label: 'An active signing run has not passed its expiry window', category: 'matter', passed: !activePastExpiry, detail: activePastExpiry ? `Signing expired at ${signing.expiresAt}.` : 'Signing window healthy or terminal.' }),
  ]
  const failedCritical = checks.filter((item) => item.status === 'failed' && item.severity === 'critical')
  const failedWarnings = checks.filter((item) => item.status === 'failed' && item.severity !== 'critical')
  const decision = failedCritical.length ? 'blocked' : failedWarnings.length ? 'observe' : 'ready'
  const evidence = {
    version: CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_ASSURANCE_VERSION,
    generatedAt: resolvedAsOf,
    decision,
    planId: plan.planId || null,
    planVersion: Number(plan.version || 0),
    documentId: document.documentId || null,
    reviewId: review.reviewId || null,
    signingId: signing.signingId || null,
    lane: signing.lane || document.lane || null,
    signingStatus: signing.status || null,
    templateVersionId: document.template?.templateVersionId || null,
    contentFingerprint: document.contentFingerprint || null,
    approvalFingerprint: review.approval?.approvalFingerprint || null,
    signingBindingFingerprint: signing.bindingFingerprint || null,
    completionFingerprint: signing.completionFingerprint || null,
    checks: checks.map((item) => ({ id: item.id, status: item.status, detail: item.detail })),
  }
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_ASSURANCE_VERSION,
    decision,
    decisionLabel: decision === 'ready' ? 'Signed legal instrument independently assured' : decision === 'observe' ? 'Signing evidence assured with matter observations' : 'Signing evidence assurance blocked',
    releaseReady: decision === 'ready',
    checks,
    failedChecks: checks.filter((item) => item.status === 'failed'),
    failedCriticalCount: failedCritical.length,
    failedWarningCount: failedWarnings.length,
    evidence,
  })
}

function boundReviewCommand(review, type, payload = {}) {
  return { commandId: `${type}:${review.runtimeRevision}`, type, expectedReviewId: review.reviewId, expectedRuntimeRevision: review.runtimeRevision, expectedDocumentId: review.documentId, expectedContentFingerprint: review.contentFingerprint, expectedProvenanceFingerprint: review.provenanceFingerprint, ...payload }
}

function boundSigningCommand(signing, type, payload = {}) {
  return { commandId: `${type}:${signing.runtimeRevision}`, type, expectedSigningId: signing.signingId, expectedRuntimeRevision: signing.runtimeRevision, expectedBindingFingerprint: signing.bindingFingerprint, expectedArtifactHash: signing.currentArtifactHash, ...payload }
}

function buildPilotEvidence(scenario, generatedAt) {
  const baseTime = new Date(generatedAt)
  const at = (minutes) => new Date(baseTime.getTime() + minutes * 60000).toISOString()
  const pilot = runConveyancerLegalInstrumentPilotScenario({ scenarioId: scenario.scenarioId, generatedAt: at(0), includeArtifacts: true })
  if (!pilot.passed || !pilot.artifacts) return { error: 'c5_pilot_fixture_failed' }
  const artifacts = clone(pilot.artifacts)
  const laneRole = artifacts.document.lane === 'bond' ? R.bondAttorney : artifacts.document.lane === 'cancellation' ? R.cancellationAttorney : R.transferAttorney
  const reviewEvents = []
  const submitted = startConveyancerLegalInstrumentReview({ ...artifacts, generationEvent: artifacts.event, actor: artifacts.document.generatedBy, occurredAt: at(5), commandId: `submit:${scenario.id}` })
  if (!submitted.ok) return { error: submitted.code }
  reviewEvents.push(submitted.event)
  const controls = Object.fromEntries(CONVEYANCER_LEGAL_INSTRUMENT_REVIEW_CONTROLS.map((item) => [item.key, true]))
  const reviewed = executeConveyancerLegalInstrumentReview({ review: submitted.review, command: boundReviewCommand(submitted.review, REVIEW_COMMAND.recommendApproval, { controls, summary: 'C8 pilot legal review.', acknowledgedWarningCodes: submitted.review.warningCodes }), actor: { role: laneRole, userId: `reviewer:${scenario.id}` }, occurredAt: at(10) })
  if (!reviewed.ok) return { error: reviewed.code }
  reviewEvents.push(reviewed.event)
  const approved = executeConveyancerLegalInstrumentReview({ review: reviewed.review, command: boundReviewCommand(reviewed.review, REVIEW_COMMAND.approve, { summary: 'C8 pilot approval.', decisionReferenceId: `approval:${scenario.id}` }), actor: { role: laneRole, userId: `approver:${scenario.id}` }, occurredAt: at(15) })
  if (!approved.ok) return { error: approved.code }
  reviewEvents.push(approved.event)
  const renderHash = buildConveyancerGovernedContentHash(`render:${scenario.id}`)
  const prepared = startConveyancerLegalInstrumentSigningEvidence({
    review: approved.review,
    document: artifacts.document,
    renderEvidence: { artifactId: `artifact:${scenario.id}`, artifactVersionId: `artifact-version:${scenario.id}`, artifactHash: renderHash, mimeType: 'application/pdf', pageCount: 3, rendererName: 'c8-pilot-renderer', rendererVersion: '1', renderedAt: at(20), renderedBy: { role: R.system, userId: 'renderer:c8' }, sourceDocumentId: artifacts.document.documentId, sourceContentFingerprint: artifacts.document.contentFingerprint, sourceProvenanceFingerprint: artifacts.document.provenanceFingerprint, sourceApprovalFingerprint: approved.review.approval.approvalFingerprint },
    signers: [{ signerKey: 'primary', signerRole: laneRole, signerReferenceHash: buildConveyancerGovernedContentHash(`signer:${scenario.id}`), signingOrder: 1, required: true, allowedMethods: ['electronic'] }],
    actor: { role: laneRole, userId: `preparer:${scenario.id}` }, occurredAt: at(25), expiresAt: at(1440), commandId: `prepare:${scenario.id}`,
  })
  if (!prepared.ok) return { error: prepared.code }
  const signingEvents = [prepared.event]
  let signing = prepared.signing
  if (scenario.workflow === 'in_progress') {
    const viewed = executeConveyancerLegalInstrumentSigningEvidence({ signing, command: boundSigningCommand(signing, SIGNING_COMMAND.recordViewed, { signerKey: 'primary' }), actor: { role: laneRole, userId: `operator:${scenario.id}` }, occurredAt: at(30) })
    signing = viewed.signing
    signingEvents.push(viewed.event)
  } else if (scenario.workflow === 'declined') {
    const declined = executeConveyancerLegalInstrumentSigningEvidence({ signing, command: boundSigningCommand(signing, SIGNING_COMMAND.recordDecline, { signerKey: 'primary', reasonCode: 'terms_not_accepted', evidenceReferenceId: `decline-proof:${scenario.id}`, providerEventId: `decline-event:${scenario.id}` }), actor: { role: laneRole, userId: `operator:${scenario.id}` }, occurredAt: at(30) })
    signing = declined.signing
    signingEvents.push(declined.event)
  } else {
    const outputHash = buildConveyancerGovernedContentHash(`signed:${scenario.id}`)
    const signed = executeConveyancerLegalInstrumentSigningEvidence({ signing, command: boundSigningCommand(signing, SIGNING_COMMAND.recordSignature, { signerKey: 'primary', method: 'electronic', signedAt: at(30), evidenceReferenceId: `signature-proof:${scenario.id}`, providerEventId: `signature-event:${scenario.id}`, inputArtifactHash: signing.currentArtifactHash, outputArtifactHash: outputHash, identityVerification: { method: 'provider_otp', verifiedAt: at(30), referenceHash: buildConveyancerGovernedContentHash(`identity:${scenario.id}`) } }), actor: { role: R.system, userId: 'signing-provider:c8' }, occurredAt: at(30) })
    if (!signed.ok) return { error: signed.code }
    signing = signed.signing
    signingEvents.push(signed.event)
    const completed = executeConveyancerLegalInstrumentSigningEvidence({ signing, command: boundSigningCommand(signing, SIGNING_COMMAND.complete, { signedDocumentEvidence: { signedDocumentId: `signed-document:${scenario.id}`, signedDocumentVersionId: `signed-version:${scenario.id}`, finalArtifactHash: signing.currentArtifactHash, storageReferenceHash: buildConveyancerGovernedContentHash(`storage:${scenario.id}`), completionCertificateHash: buildConveyancerGovernedContentHash(`certificate:${scenario.id}`), certificateReferenceHash: buildConveyancerGovernedContentHash(`certificate-reference:${scenario.id}`), providerEnvelopeId: `envelope:${scenario.id}` } }), actor: { role: R.system, userId: 'signing-provider:c8' }, occurredAt: at(35) })
    if (!completed.ok) return { error: completed.code }
    signing = completed.signing
    signingEvents.push(completed.event)
    if (scenario.workflow === 'tamper') {
      signing = clone(signing)
      signing.signerStates[0].signatureEvidence.inputArtifactHash = buildConveyancerGovernedContentHash('tampered-input')
    }
  }
  return { artifacts, review: approved.review, reviewEvents, signing, signingEvents, asOf: at(40) }
}

export function runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId = '', generatedAt = '', includeArtifacts = false } = {}) {
  const scenario = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_SCENARIOS.find((item) => item.id === scenarioId)
  if (!scenario) return deepFreeze({ scenarioId, passed: false, expectedOutcome: null, actualOutcome: 'scenario_not_found', errors: ['pilot_scenario_not_found'], assurance: null })
  const resolvedGeneratedAt = validDate(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString()
  const fixture = buildPilotEvidence(scenario, resolvedGeneratedAt)
  if (fixture.error) return deepFreeze({ scenarioId, passed: false, expectedOutcome: scenario.expectedOutcome, actualOutcome: 'fixture_failed', errors: [fixture.error], assurance: null })
  const assurance = buildConveyancerLegalInstrumentSigningAssurance({ plan: fixture.artifacts.plan, template: fixture.artifacts.template, document: fixture.artifacts.document, generationEvent: fixture.artifacts.event, review: fixture.review, reviewEvents: fixture.reviewEvents, signing: fixture.signing, signingEvents: fixture.signingEvents, asOf: fixture.asOf })
  const actualOutcome = scenario.expectedOutcome === 'safe_block' && assurance.decision === 'blocked' ? 'safe_block' : assurance.decision
  const passed = actualOutcome === scenario.expectedOutcome
  return deepFreeze({ scenarioId: scenario.id, label: scenario.label, lane: fixture.signing.lane, expectedOutcome: scenario.expectedOutcome, actualOutcome, passed, errors: passed ? [] : [`expected_${scenario.expectedOutcome}_received_${actualOutcome}`], assurance, artifacts: includeArtifacts ? fixture : undefined })
}

function normalizeThresholds(input = {}) {
  const unsafe = []
  const thresholds = { ...DEFAULT_CONVEYANCER_SIGNING_ASSURANCE_THRESHOLDS }
  Object.keys(thresholds).forEach((thresholdKey) => {
    if (!(thresholdKey in input)) return
    const supplied = number(input[thresholdKey], NaN)
    const defaultValue = DEFAULT_CONVEYANCER_SIGNING_ASSURANCE_THRESHOLDS[thresholdKey]
    const minimum = thresholdKey.startsWith('minimum')
    if (!Number.isFinite(supplied) || supplied < 0 || (minimum ? supplied < defaultValue : supplied > defaultValue)) unsafe.push(`unsafe_pilot_threshold:${thresholdKey}`)
    else thresholds[thresholdKey] = supplied
  })
  return { thresholds, unsafe }
}

export function runConveyancerLegalInstrumentSigningPilotSuite({ scenarios = CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_SCENARIOS, generatedAt = '', operationalMetrics = {}, thresholds: inputThresholds = {} } = {}) {
  const resolvedGeneratedAt = validDate(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString()
  const { thresholds, unsafe } = normalizeThresholds(inputThresholds)
  const results = (Array.isArray(scenarios) ? scenarios : []).map((scenario) => runConveyancerLegalInstrumentSigningPilotScenario({ scenarioId: typeof scenario === 'string' ? scenario : scenario.id, generatedAt: resolvedGeneratedAt }))
  const scenarioPassRate = results.length ? results.filter((item) => item.passed).length / results.length : 0
  const attempts = Math.max(1, number(operationalMetrics.signingAttempts))
  const completions = number(operationalMetrics.completedSignings)
  const failures = number(operationalMetrics.signingFailures)
  const overdue = number(operationalMetrics.overdueSignings)
  const declines = number(operationalMetrics.declinedSignings)
  const rates = { signingFailureRate: failures / attempts, overdueSigningRate: overdue / attempts, declineRate: declines / attempts, completionRate: completions / attempts }
  const triggers = [
    { key: 'scenario_pass_rate', value: scenarioPassRate, severity: scenarioPassRate < thresholds.minimumScenarioPassRate ? 'critical' : 'healthy' },
    { key: 'signing_failure_rate', value: rates.signingFailureRate, severity: rates.signingFailureRate > thresholds.maximumSigningFailureRate ? 'critical' : rates.signingFailureRate > thresholds.observeSigningFailureRate ? 'warning' : 'healthy' },
    { key: 'overdue_signing_rate', value: rates.overdueSigningRate, severity: rates.overdueSigningRate > thresholds.maximumOverdueSigningRate ? 'critical' : rates.overdueSigningRate > thresholds.observeOverdueSigningRate ? 'warning' : 'healthy' },
    { key: 'decline_rate', value: rates.declineRate, severity: rates.declineRate > thresholds.maximumDeclineRate ? 'critical' : rates.declineRate > thresholds.observeDeclineRate ? 'warning' : 'healthy' },
    { key: 'evidence_integrity_failures', value: number(operationalMetrics.evidenceIntegrityFailures), severity: number(operationalMetrics.evidenceIntegrityFailures) > thresholds.maximumEvidenceIntegrityFailures ? 'critical' : 'healthy' },
    { key: 'audit_gaps', value: number(operationalMetrics.auditGaps), severity: number(operationalMetrics.auditGaps) > thresholds.maximumAuditGaps ? 'critical' : 'healthy' },
    { key: 'identity_verification_failures', value: number(operationalMetrics.identityVerificationFailures), severity: number(operationalMetrics.identityVerificationFailures) > thresholds.maximumIdentityVerificationFailures ? 'critical' : 'healthy' },
    { key: 'completion_certificate_failures', value: number(operationalMetrics.completionCertificateFailures), severity: number(operationalMetrics.completionCertificateFailures) > thresholds.maximumCompletionCertificateFailures ? 'critical' : 'healthy' },
    { key: 'side_effect_attempts', value: number(operationalMetrics.sideEffectAttempts), severity: number(operationalMetrics.sideEffectAttempts) > thresholds.maximumSideEffectAttempts ? 'critical' : 'healthy' },
  ]
  const critical = triggers.filter((item) => item.severity === 'critical')
  const warnings = triggers.filter((item) => item.severity === 'warning')
  const decision = unsafe.length || critical.length ? 'hold' : warnings.length ? 'observe' : 'go'
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_VERSION,
    generatedAt: resolvedGeneratedAt,
    decision,
    scenarioResults: results,
    metrics: { scenarioCount: results.length, passedCount: results.filter((item) => item.passed).length, scenarioPassRate, ...rates },
    thresholds,
    thresholdErrors: unsafe,
    rollbackTriggers: triggers,
    releaseBlockers: unique([...unsafe, ...critical.map((item) => item.key), ...(results.length ? [] : ['no_pilot_scenarios'])]),
  })
}

export function buildConveyancerLegalInstrumentSigningPilotManifest({
  firmIds = [], templateVersionIds = [], signingProviderIds = [], lanes = [], startsAt = '', endsAt = '', maximumMatters = 10, maximumDocumentsPerMatter = 5, assuranceOwnerId = '', signingOwnerId = '', rollbackOwnerId = '', supportOwnerId = '',
} = {}) {
  const firms = unique((Array.isArray(firmIds) ? firmIds : []).map(text))
  const templates = unique((Array.isArray(templateVersionIds) ? templateVersionIds : []).map(text))
  const providers = unique((Array.isArray(signingProviderIds) ? signingProviderIds : []).map(text))
  const normalizedLanes = unique((Array.isArray(lanes) ? lanes : []).map(text))
  const errors = []
  if (!firms.length || firms.length > 3) errors.push('pilot_firm_count_out_of_range')
  if (!templates.length) errors.push('pilot_template_version_required')
  if (!providers.length || providers.length > 2) errors.push('pilot_signing_provider_count_out_of_range')
  if (!normalizedLanes.length || normalizedLanes.some((lane) => !['transfer', 'bond', 'cancellation'].includes(lane))) errors.push('valid_pilot_lane_required')
  if (!validDate(startsAt) || !validDate(endsAt) || (validDate(startsAt) && validDate(endsAt) && new Date(endsAt) <= new Date(startsAt))) errors.push('valid_pilot_window_required')
  if (!Number.isInteger(Number(maximumMatters)) || Number(maximumMatters) < 5 || Number(maximumMatters) > 25) errors.push('pilot_matter_limit_out_of_range')
  if (!Number.isInteger(Number(maximumDocumentsPerMatter)) || Number(maximumDocumentsPerMatter) < 1 || Number(maximumDocumentsPerMatter) > 10) errors.push('pilot_document_limit_out_of_range')
  if (!text(assuranceOwnerId)) errors.push('assurance_owner_required')
  if (!text(signingOwnerId)) errors.push('signing_owner_required')
  if (!text(rollbackOwnerId)) errors.push('rollback_owner_required')
  if (!text(supportOwnerId)) errors.push('support_owner_required')
  return deepFreeze({
    version: CONVEYANCER_LEGAL_INSTRUMENT_SIGNING_PILOT_VERSION,
    valid: errors.length === 0,
    errors: unique(errors),
    cohort: { firmIds: firms, templateVersionIds: templates, signingProviderIds: providers, lanes: normalizedLanes, startsAt: validDate(startsAt) ? new Date(startsAt).toISOString() : null, endsAt: validDate(endsAt) ? new Date(endsAt).toISOString() : null, maximumMatters: Number(maximumMatters), maximumDocumentsPerMatter: Number(maximumDocumentsPerMatter) },
    owners: { assuranceOwnerId: text(assuranceOwnerId) || null, signingOwnerId: text(signingOwnerId) || null, rollbackOwnerId: text(rollbackOwnerId) || null, supportOwnerId: text(supportOwnerId) || null },
    controls: { killSwitchRequired: true, legacySigningFallback: true, providerWebhookVerificationRequired: true, completionCertificateRequired: true, humanLegalApprovalRequired: true, databaseWritesEnabledByManifest: false, automaticRendering: false, automaticSigningRequestDispatch: false, automaticSignatureCapture: false, automaticDocumentDispatch: false, productionPacketIntegration: false },
    entryCriteria: ['A1-A7, B1-B7 and C1-C8 tests passing', 'exact C6 approval and C7 signer contracts pinned', 'provider webhook and completion-certificate verification available', 'named assurance, signing, rollback and support owners', 'legacy signing fallback and kill switch available'],
    exitCriteria: ['100% expected scenario outcomes', 'no critical assurance or audit failure', 'no identity, artifact-chain or certificate integrity failure', 'no side-effect attempt inside the C8 boundary', 'operational thresholds remain within pilot limits'],
  })
}

export function serializeConveyancerLegalInstrumentSigningAssuranceEvidence(assurance) {
  return JSON.stringify(assurance?.evidence || {}, null, 2)
}
