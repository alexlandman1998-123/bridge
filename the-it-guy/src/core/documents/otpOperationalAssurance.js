export const OTP_OPERATIONAL_ASSURANCE_VERSION = 'otp_operational_assurance_v2'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function uniqueMessages(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

export function buildOtpOperationalAssurance({ rolloutOperations = null, releaseDiagnostics = null } = {}) {
  const auditRun = Boolean(releaseDiagnostics?.gate?.status)
  const queryWarnings = asArray(releaseDiagnostics?.queryWarnings)
  const dataComplete = auditRun && queryWarnings.length === 0
  const gateStatus = normalizeText(releaseDiagnostics?.gate?.status).toLowerCase()
  const summary = releaseDiagnostics?.summary || {}
  const governedPackets = Number(summary.governedPackets || 0)
  const criticalPackets = Number(summary.criticalPackets || 0)
  const warningPackets = Number(summary.warningPackets || 0)
  const canonicalPackets = Number(summary.canonicalPackets || 0)
  const invalidCanonicalVersions = Number(summary.canonicalVersionEvidenceInvalid || 0)
  const outstandingPackets = Number(summary.awaitingAttorney || 0) + Number(summary.awaitingApproval || 0)
  const templateHealthy = rolloutOperations?.status === 'healthy'
  const templateNeedsAttention = ['degraded', 'critical'].includes(rolloutOperations?.status)
  const releaseDecision = !auditRun
    ? 'not_assessed'
    : !dataComplete
      ? 'incomplete'
      : gateStatus === 'fail'
        ? 'stop'
        : gateStatus === 'warning'
          ? 'hold'
          : governedPackets === 0
            ? 'no_evidence'
            : 'continue'
  const canContinueSignatureRelease = releaseDecision === 'continue'
  const templateDecision = templateNeedsAttention
    ? 'review_recovery'
    : templateHealthy
      ? 'keep_live'
      : 'not_governed'
  const status = !auditRun
    ? 'not_run'
    : !dataComplete
      ? 'incomplete'
      : releaseDecision === 'stop'
        ? 'critical'
        : releaseDecision === 'hold'
          ? 'review_required'
          : templateNeedsAttention
            ? 'recovery_attention'
            : releaseDecision === 'no_evidence'
              ? 'no_evidence'
              : 'healthy'

  const steps = [
    {
      key: 'template_route',
      label: 'Live template and recovery route',
      passed: templateHealthy,
      detail: templateHealthy
        ? 'The governed live OTP and its rollback anchor passed the operational checks.'
        : templateNeedsAttention
          ? rolloutOperations?.blockers?.[0] || 'The template recovery route needs attention.'
          : 'A governed activation and verified rollback anchor have not been recorded yet.',
    },
    {
      key: 'audit_completeness',
      label: 'Audit data complete',
      passed: dataComplete,
      detail: dataComplete
        ? 'Packet and generated-version evidence was read successfully.'
        : !auditRun
          ? 'Run the read-only operational audit.'
          : `${queryWarnings.length} diagnostic quer${queryWarnings.length === 1 ? 'y was' : 'ies were'} incomplete.`,
    },
    {
      key: 'release_evidence',
      label: 'Release evidence safe',
      passed: dataComplete && criticalPackets === 0,
      detail: criticalPackets
        ? invalidCanonicalVersions
          ? `${invalidCanonicalVersions} canonical OTP${invalidCanonicalVersions === 1 ? '' : 's'} do not match their immutable template-version evidence.`
          : `${criticalPackets} governed OTP${criticalPackets === 1 ? '' : 's'} have unsafe release evidence.`
        : dataComplete
          ? canonicalPackets
            ? `${canonicalPackets} canonical OTP${canonicalPackets === 1 ? '' : 's'} match their recorded immutable template version; no unsafe approval evidence was found.`
            : 'No governed OTP was released with unsafe approval evidence.'
          : 'Release evidence has not been fully assessed.',
    },
    {
      key: 'review_queues',
      label: 'Review queues clear',
      passed: dataComplete && warningPackets === 0 && outstandingPackets === 0,
      detail: outstandingPackets || warningPackets
        ? `${Math.max(outstandingPackets, warningPackets)} governed OTP${Math.max(outstandingPackets, warningPackets) === 1 ? '' : 's'} still require review.`
        : dataComplete
          ? 'No governed OTP approval or attorney-review queues remain.'
          : 'Review queues have not been fully assessed.',
    },
  ]
  const blockers = uniqueMessages([
    ...(!dataComplete ? [steps[1].detail] : []),
    ...(criticalPackets ? [steps[2].detail] : []),
    ...(templateNeedsAttention ? [steps[0].detail] : []),
  ])
  const warnings = uniqueMessages([
    ...(releaseDecision === 'hold' ? [releaseDiagnostics?.gate?.reason] : []),
    ...(releaseDecision === 'no_evidence' ? ['No governed OTP packets exist yet, so release behaviour cannot be evidenced.'] : []),
    ...(rolloutOperations && !templateHealthy && !templateNeedsAttention ? [steps[0].detail] : []),
  ])

  return {
    schemaVersion: OTP_OPERATIONAL_ASSURANCE_VERSION,
    status,
    auditRun,
    dataComplete,
    releaseDecision,
    templateDecision,
    canContinueSignatureRelease,
    recommendation: releaseDecision === 'stop'
      ? 'Stop signature progression and investigate the critical OTP packets. Do not roll back automatically.'
      : releaseDecision === 'hold'
        ? 'Hold affected OTPs for operational or attorney review before signature release.'
        : releaseDecision === 'incomplete'
          ? 'Repair the diagnostic data path and re-run the audit before relying on the result.'
          : templateNeedsAttention
            ? 'Keep document release controlled while an administrator repairs the template recovery route.'
            : releaseDecision === 'no_evidence'
              ? 'Keep the governed template live and re-run after the first OTP is generated.'
              : releaseDecision === 'continue'
                ? 'The governed OTP may remain live and approved packets may continue to signature release.'
                : 'Run the read-only audit before making an operational release decision.',
    steps,
    blockers,
    warnings,
    summary: {
      governedPackets,
      criticalPackets,
      warningPackets,
      outstandingPackets,
      canonicalPackets,
      invalidCanonicalVersions,
      score: Number(summary.score ?? 0),
    },
  }
}
