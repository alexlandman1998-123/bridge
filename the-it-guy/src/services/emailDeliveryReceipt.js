// A successful HTTP request is not, on its own, an email delivery receipt.
export function requireEmailDeliveryReceipt(response, label = 'Invitation') {
  const data = response?.data
  if (response?.error) throw typeof response.error === 'string' ? new Error(response.error) : response.error
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error.message || `${label} email failed.`)
  if (data?.ok === false || data?.sent === false || data?.queued || data?.suppressed || data?.skipped || data?.needsAttention
    || ['pending', 'processing', 'waiting_recipient', 'needs_attention', 'failed', 'skipped'].includes(data?.deliveryStatus)) {
    throw new Error(`${label} email was not confirmed as sent. Check the delivery status before sending another invitation.`)
  }
  const receipt = data?.emailId || data?.providerMessageId || (data?.sent === true ? data?.deliveryId : '')
  if (typeof receipt !== 'string' || !receipt.trim()) {
    throw new Error(`${label} email acceptance could not be confirmed. Check the delivery status before retrying.`)
  }
  return receipt.trim()
}

export function requireBuyerOnboardingDelivery(response, deliveryMode = 'digital_portal') {
  const assisted = ['agent_assisted', 'hard_copy'].includes(deliveryMode)
  if (assisted && !response?.error && !response?.data?.error && !response?.data?.needsAttention && !response?.data?.queued
    && response?.data?.ok === true && response.data.manualHandoff === true && response.data.emailSkipped === true) return null
  return requireEmailDeliveryReceipt(response, 'Buyer onboarding')
}
