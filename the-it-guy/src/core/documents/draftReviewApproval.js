function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DIGEST = /^sha256:[0-9a-f]{64}$/

export function buildDraftReviewApprovalSnapshot({ packet = {}, version = {}, reviewerUserId = '', reviewerRole = '', approvedAt = new Date().toISOString(), approvalReference = '' } = {}) {
  const validation = record(version.validation_summary_json || version.validationSummaryJson)
  const render = record(validation.render_provenance || validation.renderProvenance)
  const artifact = record(validation.artifact_provenance || validation.artifactProvenance)
  const timestamp = Number.isFinite(Date.parse(approvedAt)) ? new Date(approvedAt).toISOString() : ''
  return {
    approvalDecision: 'approved',
    approvedAt: timestamp,
    approvedByUserId: text(reviewerUserId),
    approvedByRole: text(reviewerRole),
    approvalReference: text(approvalReference),
    packetId: text(packet.id),
    versionId: text(version.id),
    versionNumber: Number(version.version_number || version.versionNumber || 0) || null,
    artifactSha256: text(artifact.sha256).toLowerCase(),
    artifactPath: text(artifact.path),
    contentFingerprint: text(render.contentFingerprint),
    generationAttemptId: text(render.generationAttemptId),
  }
}

export function assessDraftReviewApproval({ packet = {}, version = {} } = {}) {
  const validation = record(version.validation_summary_json || version.validationSummaryJson)
  const snapshot = record(validation.approval_snapshot || validation.approvalSnapshot)
  const expected = buildDraftReviewApprovalSnapshot({ packet, version, reviewerUserId: snapshot.approvedByUserId, reviewerRole: snapshot.approvedByRole, approvedAt: snapshot.approvedAt, approvalReference: snapshot.approvalReference })
  const reasons = []
  if (text(version.render_status || version.renderStatus).toLowerCase() !== 'generated') reasons.push('E1_VERSION_NOT_GENERATED')
  if (snapshot.approvalDecision !== 'approved') reasons.push('E1_APPROVAL_DECISION_MISSING')
  if (!Number.isFinite(Date.parse(snapshot.approvedAt || ''))) reasons.push('E1_APPROVAL_TIME_MISSING')
  if (Number.isFinite(Date.parse(snapshot.approvedAt || '')) && Number.isFinite(Date.parse(version.generated_at || version.generatedAt || '')) && Date.parse(snapshot.approvedAt) < Date.parse(version.generated_at || version.generatedAt)) reasons.push('E1_APPROVAL_PREDATES_VERSION')
  if (Number.isFinite(Date.parse(snapshot.approvedAt || '')) && Date.parse(snapshot.approvedAt) > Date.now() + 5 * 60 * 1000) reasons.push('E1_APPROVAL_TIME_IN_FUTURE')
  if (!UUID.test(text(snapshot.approvedByUserId))) reasons.push('E1_REVIEWER_ID_MISSING')
  if (!text(snapshot.approvedByRole)) reasons.push('E1_REVIEWER_ROLE_MISSING')
  if (!text(snapshot.approvalReference)) reasons.push('E1_APPROVAL_REFERENCE_MISSING')
  for (const key of ['packetId', 'versionId', 'versionNumber', 'artifactSha256', 'artifactPath', 'contentFingerprint', 'generationAttemptId']) {
    if (snapshot[key] !== expected[key]) reasons.push(`E1_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}_MISMATCH`)
  }
  if (!DIGEST.test(expected.artifactSha256)) reasons.push('E1_ARTIFACT_DIGEST_MISSING')
  return { approved: reasons.length === 0, reasons: [...new Set(reasons)], snapshot, expected }
}

export function assertDraftReviewApproval(input = {}) {
  const assessment = assessDraftReviewApproval(input)
  if (assessment.approved) return assessment
  const error = new Error('This exact generated draft has not received a complete accountable review approval.')
  error.code = 'DRAFT_REVIEW_APPROVAL_REQUIRED'
  error.details = assessment
  throw error
}
