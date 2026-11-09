// transactions owns these operations and their existing recovery behavior.
import { normalizeNullableText, requireClient } from '../../lib/api/shared/readHelpers.js'
import { requireOnboardingTokenClient, resolveOnboardingTokenContext } from '../onboarding/tokenApi.js'
import { resolveTransactionWhatsAppContactsWithClient } from './contactSupport.js'

export async function resolveTransactionWhatsAppContacts(transactionId) {
  const client = requireClient()
  return resolveTransactionWhatsAppContactsWithClient(client, transactionId)
}

export async function resolveOnboardingWhatsAppContacts({ token, transactionId = null } = {}) {
  const client = requireOnboardingTokenClient(token)
  const normalizedTransactionId = normalizeNullableText(transactionId)
  const onboardingContext = normalizedTransactionId ? null : await resolveOnboardingTokenContext(client, token)
  const targetTransactionId = normalizedTransactionId || onboardingContext?.transactionId
  return resolveTransactionWhatsAppContactsWithClient(client, targetTransactionId)
}
