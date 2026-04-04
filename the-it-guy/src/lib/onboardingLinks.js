import { getOrCreateTransactionOnboarding } from './api'

export async function resolveTransactionOnboardingLink({ transactionId, purchaserType = 'individual' }) {
  const onboarding = await getOrCreateTransactionOnboarding({
    transactionId,
    purchaserType,
  })

  if (!onboarding?.token) {
    throw new Error('Onboarding link is not available for this transaction yet.')
  }

  return {
    ...onboarding,
    url: `${window.location.origin}/client/onboarding/${onboarding.token}`,
  }
}

export async function openTransactionOnboardingLink({ transactionId, purchaserType = 'individual' }) {
  const onboarding = await resolveTransactionOnboardingLink({
    transactionId,
    purchaserType,
  })

  const opened = window.open(onboarding.url, '_blank', 'noopener,noreferrer')

  if (!opened) {
    window.location.href = onboarding.url
  }

  return onboarding
}
