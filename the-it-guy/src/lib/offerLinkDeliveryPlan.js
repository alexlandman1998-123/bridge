import { NOTIFICATION_MODE, resolveNotificationDispatchPlan } from '../services/communicationDeliveryService.js'

function text(value) {
  return String(value || '').trim()
}

/** Determines whether an offer link may be delivered and, if so, by which channels. */
export function resolveOfferLinkDeliveryPlan({ clientIntakePreference = '', notificationMode = NOTIFICATION_MODE.EMAIL, email = '', phone = '', recipientName = '', metadata = {} } = {}) {
  const intake = text(clientIntakePreference).toLowerCase()
  if (intake === 'agent_assisted') {
    return { kind: 'agent_assisted', deliversLink: false, handoffRequired: false, channels: [], blockers: [] }
  }
  if (intake === 'hard_copy') {
    return { kind: 'hard_copy', deliversLink: false, handoffRequired: true, channels: [], blockers: [], notificationMode: NOTIFICATION_MODE.AGENT_ASSISTED }
  }
  const dispatch = resolveNotificationDispatchPlan({ mode: notificationMode, email, phone, recipientName, metadata })
  return { ...dispatch, kind: 'digital_portal', deliversLink: dispatch.autoDispatch, notificationMode: dispatch.mode }
}
