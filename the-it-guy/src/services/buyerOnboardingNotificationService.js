import { invokeEdgeFunction } from '../lib/supabaseClient'
import { prepareNotificationOutbox, updateNotificationOutboxStatus } from './notificationOutboxService'
import { NOTIFICATION_MODE, normalizeNotificationMode } from './communicationDeliveryService'

function text(value) {
  return String(value ?? '').trim()
}

/**
 * Buyer onboarding is a controlled notification: a hard-copy or agent-assisted
 * intake never silently falls through to email delivery.
 */
export function resolveBuyerOnboardingNotificationMode({ notificationMode = '', clientIntakePreference = '' } = {}) {
  if (text(notificationMode)) return normalizeNotificationMode(notificationMode)
  const intake = text(clientIntakePreference).toLowerCase().replace(/[\s-]+/g, '_')
  if (['agent_assisted', 'agent', 'assisted', 'hard_copy', 'hardcopy', 'paper'].includes(intake)) {
    return NOTIFICATION_MODE.AGENT_ASSISTED
  }
  return NOTIFICATION_MODE.EMAIL
}

/**
 * Prepares a durable onboarding event before invoking the email provider. Test
 * recipients are recorded as skipped; failures remain failed for an operator
 * to prepare for review through the recovery action.
 */
export async function prepareBuyerOnboardingNotification({
  organisationId = '',
  transactionId = '',
  leadId = '',
  assignedUserId = '',
  recipientName = '',
  email = '',
  phone = '',
  notificationMode = '',
  clientIntakePreference = '',
  source = 'buyer_lead_offer_conversion',
  metadata = {},
} = {}) {
  const mode = resolveBuyerOnboardingNotificationMode({ notificationMode, clientIntakePreference })
  const prepared = await prepareNotificationOutbox({
    organisationId,
    assignedUserId,
    leadId,
    transactionId,
    communicationType: 'client_onboarding',
    notificationMode: mode,
    recipientName,
    recipientRole: 'buyer',
    email,
    phone,
    subject: 'Complete your Arch9 buyer onboarding',
    message: 'Buyer onboarding is ready. Complete the requested details and documents in Arch9.',
    source: 'agent_workspace',
    dedupeKey: `buyer-onboarding:${text(transactionId)}`,
    metadata: {
      ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
      workflowSource: text(source) || 'buyer_lead_offer_conversion',
      clientIntakePreference: text(clientIntakePreference) || null,
      controlledDelivery: true,
    },
  })

  if (prepared.plan.suppressed) {
    return { attempted: false, sent: false, suppressed: true, handoffRequired: false, mode, outbox: prepared.items }
  }
  if (prepared.plan.handoffRequired) {
    return { attempted: false, sent: false, suppressed: false, handoffRequired: true, mode, outbox: prepared.items }
  }

  const emailItem = (prepared.items || []).find((item) => item.channel === 'email')
  if (!emailItem?.id) {
    return {
      attempted: false,
      sent: false,
      suppressed: false,
      handoffRequired: false,
      mode,
      outbox: prepared.items || [],
      error: new Error('Buyer onboarding delivery requires a prepared email outbox item.'),
    }
  }

  try {
    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'client_onboarding',
        transactionId: text(transactionId),
        source: text(source) || 'buyer_lead_offer_conversion',
        deliveryMode: mode,
      },
    })
    if (response?.error || response?.data?.error) throw response.error || new Error(response.data.error)
    const sentItem = await updateNotificationOutboxStatus({ eventId: emailItem.id, status: 'sent', provider: 'send-email' })
    return { attempted: true, sent: true, suppressed: false, handoffRequired: false, mode, outbox: [sentItem] }
  } catch (error) {
    const failedItem = await updateNotificationOutboxStatus({
      eventId: emailItem.id,
      status: 'failed',
      errorMessage: error?.message || 'Buyer onboarding email delivery failed.',
      provider: 'send-email',
    }).catch(() => emailItem)
    return { attempted: true, sent: false, suppressed: false, handoffRequired: false, mode, outbox: [failedItem], error }
  }
}
