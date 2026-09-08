import { evaluateJourneyRelease } from './shared-journey-release-gate.mjs'

export const HIGH_LEVEL_RELEASE_CHECKS = Object.freeze([
  'active-plan-manifest-migration-applied',
  'otp-finance-facts-authorised-for-all-five-roles',
  'five-milestone-summary-detail-parity',
  'milestone-reopening-and-applicability-parity',
  'missing-facts-display-unknown',
])

// Additive gate: local component tests cannot satisfy live staging evidence.
export function evaluateHighLevelJourneyRelease(input) {
  const result = evaluateJourneyRelease(input)
  const blockers = [...result.blockers]
  if (input.staging?.projectRef !== 'vaszuxjeoajeuhlcnzzf') blockers.push('ARCH9_STAGING_TARGET_NOT_VERIFIED')
  for (const key of HIGH_LEVEL_RELEASE_CHECKS) {
    const check = input.staging?.checks?.[key]
    if (check?.status !== 'passed' || typeof check.evidenceRef !== 'string' || !check.evidenceRef.trim()) {
      blockers.push(`CHECK_NOT_VERIFIED:${key}`)
    }
  }
  return { ...result, decision: blockers.length ? 'blocked' : 'ready_for_controlled_release', blockers }
}
