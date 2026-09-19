import { resolveSellerLeadOwnershipRoute } from './sellerLeadOwnershipSetupModel.js'

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

const REPLACEABLE_ONBOARDING_STATUSES = new Set(['not_started', 'in_progress', 'sent', 'opened'])

/**
 * A live onboarding link is a frozen instruction. Changing its legal owner
 * must create a replacement rather than mutating the instruction in place.
 */
export function needsSellerOnboardingReplacement({ previousFormData = {}, nextFormData = {}, onboardingStatus = '', onboardingToken = '' } = {}) {
  const previousRoute = resolveSellerLeadOwnershipRoute(previousFormData)
  const nextRoute = resolveSellerLeadOwnershipRoute(nextFormData)
  const status = normalize(onboardingStatus)
  return Boolean(
    onboardingToken &&
      previousRoute &&
      nextRoute &&
      previousRoute !== nextRoute &&
      REPLACEABLE_ONBOARDING_STATUSES.has(status),
  )
}

export default { needsSellerOnboardingReplacement }
