import { verifyTargetFlowPerformanceEvidence } from './targetFlowPerformanceBudget.js'

export const TARGET_FLOW_PROMOTION_MAX_AGE_HOURS = 24

function resolveEvidenceAgeHours(evidence = {}, now = Date.now()) {
  const generatedAt = Date.parse(String(evidence.generatedAt || ''))
  if (!Number.isFinite(generatedAt)) return null
  return Math.max(0, (now - generatedAt) / 3_600_000)
}

export function evaluateTargetFlowPromotionReadiness(evidence = {}, {
  now = Date.now(),
  maxAgeHours = TARGET_FLOW_PROMOTION_MAX_AGE_HOURS,
  expectedPreviewUrl = '',
  observedPreviewUrl = '',
} = {}) {
  const verification = verifyTargetFlowPerformanceEvidence(evidence)
  const ageHours = resolveEvidenceAgeHours(evidence, now)
  const expectedUrl = String(expectedPreviewUrl || '').trim()
  const observedUrl = String(observedPreviewUrl || '').trim()
  const previewMatches = !expectedUrl || expectedUrl === observedUrl
  const evidenceFresh = ageHours != null && ageHours <= maxAgeHours
  const reasons = []
  if (verification.status !== 'PASS') reasons.push(`performance_gate_${verification.status.toLowerCase()}`)
  if (!evidenceFresh) reasons.push(ageHours == null ? 'evidence_timestamp_invalid' : 'evidence_expired')
  if (!previewMatches) reasons.push('preview_mismatch')

  return {
    contract: 'arch9-target-flow-promotion-readiness-v1',
    status: reasons.length ? 'BLOCKED' : 'READY_FOR_MANUAL_PROMOTION',
    ready: reasons.length === 0,
    reasons,
    evidenceAgeHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    maxAgeHours,
    previewMatches,
    verification,
  }
}
