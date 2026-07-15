export const OTP_ROLLOUT_OPERATIONS_VERSION = 'otp_rollout_operations_v1'
export const OTP_ROLLBACK_AUDIT_ACTION = 'otp_governed_template_rolled_back'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s./-]+/g, '_')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getMetadata(template = {}) {
  return asRecord(template.metadata_json || template.metadataJson)
}

function getTemplateStatus(template = {}) {
  const metadata = getMetadata(template)
  return normalizeKey(
    template.status ||
      template.template_status ||
      template.lifecycle_status ||
      metadata.lifecycle_status ||
      metadata.template_status,
  )
}

function getOrganisationId(template = {}) {
  return normalizeText(template.organisation_id || template.organisationId)
}

function getPacketType(template = {}) {
  return normalizeKey(template.packet_type || template.packetType)
}

function getDocumentKind(template = {}) {
  const metadata = getMetadata(template)
  return normalizeKey(metadata.document_kind || metadata.documentKind || 'standard') || 'standard'
}

function isUnavailable(template = {}) {
  return template.is_active === false || ['archived', 'withdrawn', 'superseded'].includes(getTemplateStatus(template))
}

function getRollout(template = {}) {
  const metadata = getMetadata(template)
  return asRecord(metadata.otp_rollout || metadata.otpRollout)
}

function check(key, label, passed, detail) {
  return { key, label, passed: Boolean(passed), detail }
}

export function buildOtpRolloutOperations({ liveTemplate = null, templates = [] } = {}) {
  const availableTemplates = Array.isArray(templates) ? templates : []
  const rollout = getRollout(liveTemplate || {})
  const rollbackTemplateId = normalizeText(rollout.previousTemplateId || rollout.previous_template_id)
  const rollbackTarget = rollbackTemplateId
    ? availableTemplates.find((template) => normalizeText(template?.id) === rollbackTemplateId) || null
    : null
  const liveOrganisationId = getOrganisationId(liveTemplate || {})
  const targetOrganisationId = getOrganisationId(rollbackTarget || {})
  const activatedTemplateId = normalizeText(rollout.activatedTemplateId || rollout.activated_template_id)
  const rolloutStatus = normalizeKey(rollout.status)
  const rolloutRecorded = Boolean(liveTemplate && rolloutStatus === 'activated' && rollbackTemplateId)
  const liveIsCurrentDefault = Boolean(liveTemplate?.is_default && liveTemplate?.is_active !== false)
  const activationMatchesLive = !activatedTemplateId || activatedTemplateId === normalizeText(liveTemplate?.id)
  const targetExists = Boolean(rollbackTarget)
  const targetHasSameOwner = Boolean(targetExists && liveOrganisationId && liveOrganisationId === targetOrganisationId)
  const targetIsOtp = Boolean(targetExists && getPacketType(rollbackTarget) === 'otp' && getDocumentKind(rollbackTarget) !== 'addendum')
  const targetIsAvailable = Boolean(targetExists && !isUnavailable(rollbackTarget))
  const targetIsDifferent = Boolean(targetExists && normalizeText(rollbackTarget.id) !== normalizeText(liveTemplate?.id))

  const checks = [
    check('governed_activation', 'Governed activation recorded', rolloutRecorded, rolloutRecorded ? 'The current live OTP has a recorded rollback anchor.' : 'No completed governed activation with a rollback anchor was found.'),
    check('current_default', 'Current live route is stable', liveIsCurrentDefault, liveIsCurrentDefault ? 'The governed OTP is active and the organisation default.' : 'The recorded governed OTP is no longer the active default.'),
    check('activation_identity', 'Activation identity matches', activationMatchesLive, activationMatchesLive ? 'The activation record belongs to the current live OTP.' : 'The activation record points to a different template.'),
    check('rollback_target', 'Previous version still exists', targetExists, targetExists ? 'The previous live template is still available in the library.' : 'The recorded previous template could not be found.'),
    check('rollback_scope', 'Previous version has the same owner', targetHasSameOwner, targetHasSameOwner ? 'Both versions belong to the same organisation.' : 'The previous template does not belong to the current organisation.'),
    check('rollback_document', 'Previous version is an OTP', targetIsOtp, targetIsOtp ? 'The rollback target is a standard OTP template.' : 'The rollback target is not a standard OTP template.'),
    check('rollback_availability', 'Previous version can be restored', targetIsAvailable && targetIsDifferent, targetIsAvailable && targetIsDifferent ? 'The prior OTP remains active and distinct from the current version.' : 'The prior OTP is withdrawn, archived, superseded or invalid.'),
  ]
  const blockers = checks.filter((item) => !item.passed).map((item) => item.detail)
  const canRollback = checks.every((item) => item.passed)
  const status = !liveTemplate
    ? 'not_live'
    : !rolloutRecorded
      ? 'not_governed'
      : canRollback
        ? 'healthy'
        : liveIsCurrentDefault
          ? 'degraded'
          : 'critical'

  return {
    schemaVersion: OTP_ROLLOUT_OPERATIONS_VERSION,
    status,
    healthy: status === 'healthy',
    canRollback,
    liveTemplateId: liveTemplate?.id || null,
    liveTemplateLabel: liveTemplate?.template_label || liveTemplate?.templateLabel || null,
    rollbackTemplateId: rollbackTarget?.id || rollbackTemplateId || null,
    rollbackTemplateLabel: rollbackTarget?.template_label || rollbackTarget?.templateLabel || rollout.previousTemplateLabel || rollout.previous_template_label || null,
    activatedAt: rollout.activatedAt || rollout.activated_at || null,
    rollbackTarget,
    checks,
    blockers,
  }
}

export function buildOtpRollbackAuditEvent({
  liveTemplate,
  rollbackTemplate,
  organisationId = '',
  reason = '',
  occurredAt = new Date().toISOString(),
} = {}) {
  if (!liveTemplate?.id || !rollbackTemplate?.id) {
    throw new Error('Both the live template and rollback template are required for the rollback audit event.')
  }
  const rollout = getRollout(liveTemplate)
  return {
    schemaVersion: OTP_ROLLOUT_OPERATIONS_VERSION,
    action: OTP_ROLLBACK_AUDIT_ACTION,
    occurredAt,
    organisationId: normalizeText(organisationId) || getOrganisationId(liveTemplate),
    reason: normalizeText(reason) || 'Operational rollback requested by an authorised legal-template administrator.',
    fromTemplate: {
      id: liveTemplate.id,
      label: liveTemplate.template_label || liveTemplate.templateLabel || null,
    },
    toTemplate: {
      id: rollbackTemplate.id,
      label: rollbackTemplate.template_label || rollbackTemplate.templateLabel || null,
    },
    activation: {
      activatedAt: rollout.activatedAt || rollout.activated_at || null,
      certificationKey: rollout.certificationKey || rollout.certification_key || null,
      templateFingerprint: rollout.templateFingerprint || rollout.template_fingerprint || null,
    },
  }
}
