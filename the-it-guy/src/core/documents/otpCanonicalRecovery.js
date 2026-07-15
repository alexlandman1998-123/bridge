export const OTP_CANONICAL_RECOVERY_VERSION = 'kingstons_2026_otp_recovery_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function metadata(template = {}) {
  return asRecord(template.metadata_json || template.metadataJson)
}

function check(key, label, passed, detail) {
  return { key, label, passed: Boolean(passed), detail }
}

export function buildCanonicalOtpRecoveryReadiness({ template = {}, versions = [] } = {}) {
  const meta = metadata(template)
  const rollout = asRecord(meta.otp_rollout || meta.otpRollout)
  const templateId = normalizeText(template.id)
  const liveVersionId = normalizeText(template.live_version_id || template.liveVersionId || meta.live_version_id)
  const previousVersionId = normalizeText(template.previous_live_version_id || template.previousLiveVersionId || meta.previous_live_version_id)
  const live = versions.find((version) => normalizeText(version.id) === liveVersionId) || null
  const previous = versions.find((version) => normalizeText(version.id) === previousVersionId) || null
  const hasVersionEvidence = versions.length > 0
  const pointerReady = Boolean(templateId && liveVersionId && previousVersionId && liveVersionId !== previousVersionId)
  const routeMatches = !hasVersionEvidence || Boolean(
    live && previous &&
    normalizeText(live.template_id || live.templateId) === templateId &&
    normalizeText(previous.template_id || previous.templateId) === templateId &&
    normalizeText(live.status).toLowerCase() === 'published' &&
    normalizeText(previous.status).toLowerCase() === 'superseded',
  )
  const rolloutStatus = normalizeText(rollout.status).toLowerCase()
  const rolloutRecorded = ['activated', 'rolled_back'].includes(rolloutStatus)
  const recordedLiveId = normalizeText(rollout.activatedVersionId || rollout.liveVersionId || rollout.restoredVersionId)
  const recordMatches = !recordedLiveId || recordedLiveId === liveVersionId || normalizeText(rollout.restoredVersionId) === liveVersionId
  const checks = [
    check('recovery_pointer', 'Previous live version retained', pointerReady, 'The canonical template does not have a distinct previous-live version.'),
    check('rollout_record', 'Controlled rollout recorded', rolloutRecorded && recordMatches, 'The rollout record does not match the current canonical live version.'),
    check('version_route', 'Version route is recoverable', routeMatches, 'The live or recovery version is missing, belongs to another template, or has an invalid status.'),
  ]
  const blockers = checks.filter((item) => !item.passed).map((item) => item.detail)
  return {
    schemaVersion: OTP_CANONICAL_RECOVERY_VERSION,
    canonical: true,
    status: checks.every((item) => item.passed) ? 'healthy' : pointerReady ? 'degraded' : 'not_governed',
    healthy: checks.every((item) => item.passed),
    canRollback: checks.every((item) => item.passed),
    liveTemplateId: templateId || null,
    liveTemplateLabel: template.template_label || template.templateLabel || 'Canonical OTP',
    liveVersionId: liveVersionId || null,
    rollbackVersionId: previousVersionId || null,
    rollbackTemplateId: previousVersionId || null,
    rollbackTemplateLabel: previous?.template_label || previous?.templateLabel || rollout.previousVersionLabel || 'Previous canonical OTP version',
    rollbackTarget: previous || (previousVersionId ? { id: previousVersionId, template_label: 'Previous canonical OTP version', canonicalVersion: true } : null),
    checks,
    blockers,
  }
}
