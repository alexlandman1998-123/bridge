import { validateOnboardingCompletion } from '../onboarding/onboardingValidation'
import { createIntegrityIssue, INTEGRITY_ISSUES, INTEGRITY_SEVERITIES, summarizeIssues } from './integrityChecks'

export async function validateOnboardingIntegrity(userId, options = {}) {
  const completion = await validateOnboardingCompletion(userId, options)
  const issues = []

  if (!completion.ok) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.onboardingCorrupted,
      severity: options.profile?.onboardingCompleted ? INTEGRITY_SEVERITIES.critical : INTEGRITY_SEVERITIES.error,
      entityType: 'onboarding',
      entityId: userId,
      message: `Onboarding contract is incomplete: ${completion.reason || 'unknown'}.`,
      metadata: {
        reason: completion.reason,
        missingRecords: completion.missingRecords || [],
      },
    }))
  }

  return {
    entityType: 'onboarding',
    entityId: userId,
    validation: completion,
    issues,
    ...summarizeIssues(issues),
  }
}
