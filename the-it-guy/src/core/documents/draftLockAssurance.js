import { assessDraftReviewApproval } from './draftReviewApproval.js'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function buildDraftLockSnapshot({ packet = {}, version = {}, lockedByUserId = '', lockedByRole = '', lockedAt = new Date().toISOString(), lockReference = '' } = {}) {
  const validation = record(version.validation_summary_json || version.validationSummaryJson)
  const approval = record(validation.approval_snapshot || validation.approvalSnapshot)
  const render = record(validation.render_provenance || validation.renderProvenance)
  const artifact = record(validation.artifact_provenance || validation.artifactProvenance)
  const timestamp = Number.isFinite(Date.parse(lockedAt)) ? new Date(lockedAt).toISOString() : ''
  return {
    lockDecision: 'locked',
    lockedAt: timestamp,
    lockedByUserId: text(lockedByUserId),
    lockedByRole: text(lockedByRole),
    lockReference: text(lockReference),
    packetId: text(packet.id),
    versionId: text(version.id),
    versionNumber: Number(version.version_number || version.versionNumber || 0) || null,
    approvalReference: text(approval.approvalReference),
    artifactSha256: text(artifact.sha256).toLowerCase(),
    artifactPath: text(artifact.path),
    contentFingerprint: text(render.contentFingerprint),
    generationAttemptId: text(render.generationAttemptId),
  }
}

export function assessDraftLock({ packet = {}, version = {} } = {}) {
  const approval = assessDraftReviewApproval({ packet, version })
  const validation = record(version.validation_summary_json || version.validationSummaryJson)
  const snapshot = record(validation.lock_snapshot || validation.lockSnapshot)
  const expected = buildDraftLockSnapshot({ packet, version, lockedByUserId: snapshot.lockedByUserId, lockedByRole: snapshot.lockedByRole, lockedAt: snapshot.lockedAt, lockReference: snapshot.lockReference })
  const reasons = approval.approved ? [] : ['E2_E1_APPROVAL_INVALID']
  if (snapshot.lockDecision !== 'locked' || validation.content_locked !== true) reasons.push('E2_LOCK_DECISION_MISSING')
  if (text(validation.review_state) !== 'locked') reasons.push('E2_REVIEW_STATE_NOT_LOCKED')
  if (!Number.isFinite(Date.parse(snapshot.lockedAt || ''))) reasons.push('E2_LOCK_TIME_MISSING')
  if (Number.isFinite(Date.parse(snapshot.lockedAt || '')) && Number.isFinite(Date.parse(approval.snapshot?.approvedAt || '')) && Date.parse(snapshot.lockedAt) < Date.parse(approval.snapshot.approvedAt)) reasons.push('E2_LOCK_PREDATES_APPROVAL')
  if (Number.isFinite(Date.parse(snapshot.lockedAt || '')) && Date.parse(snapshot.lockedAt) > Date.now() + 5 * 60 * 1000) reasons.push('E2_LOCK_TIME_IN_FUTURE')
  if (!UUID.test(text(snapshot.lockedByUserId))) reasons.push('E2_LOCKER_ID_MISSING')
  if (!text(snapshot.lockedByRole)) reasons.push('E2_LOCKER_ROLE_MISSING')
  if (!text(snapshot.lockReference)) reasons.push('E2_LOCK_REFERENCE_MISSING')
  for (const key of ['packetId', 'versionId', 'versionNumber', 'approvalReference', 'artifactSha256', 'artifactPath', 'contentFingerprint', 'generationAttemptId']) {
    if (snapshot[key] !== expected[key]) reasons.push(`E2_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}_MISMATCH`)
  }
  if (Number(packet.current_version_number || packet.currentVersionNumber || 0) !== expected.versionNumber) reasons.push('E2_CURRENT_VERSION_POINTER_MISMATCH')
  return { locked: reasons.length === 0, reasons: [...new Set(reasons)], snapshot, expected, approval }
}

export function assertDraftLock(input = {}) {
  const assessment = assessDraftLock(input)
  if (assessment.locked) return assessment
  const error = new Error('This exact approved draft has not been immutably locked for signing.')
  error.code = 'DRAFT_LOCK_REQUIRED'
  error.details = assessment
  throw error
}
