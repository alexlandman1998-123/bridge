import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const service = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const {
    NOTIFICATION_MODE,
    buildDefaultLeadCommunicationPreferences,
    buildNotificationModePreferencePatch,
    getNotificationModeLabel,
    normalizeLeadCommunicationPreferences,
    normalizeNotificationMode,
    resolveNotificationDispatchPlan,
    validateCommunicationPreferences,
    __communicationDeliveryServiceTestUtils,
  } = service
  const { buildPreferenceDbPayload } = __communicationDeliveryServiceTestUtils
  const organisationId = '11111111-1111-4111-8111-111111111111'
  const leadId = '22222222-2222-4222-8222-222222222222'

  assert.equal(normalizeNotificationMode('both'), NOTIFICATION_MODE.EMAIL_AND_WHATSAPP)
  assert.equal(normalizeNotificationMode('manual'), NOTIFICATION_MODE.AGENT_ASSISTED)
  assert.equal(getNotificationModeLabel('whatsapp'), 'WhatsApp')

  assert.deepEqual(buildNotificationModePreferencePatch(NOTIFICATION_MODE.EMAIL), {
    emailEnabled: true,
    whatsappEnabled: false,
    preferredChannel: 'email',
  })
  assert.deepEqual(buildNotificationModePreferencePatch(NOTIFICATION_MODE.AGENT_ASSISTED), {
    emailEnabled: false,
    whatsappEnabled: false,
    preferredChannel: 'email',
  })

  const defaults = buildDefaultLeadCommunicationPreferences({ organisationId, leadId })
  assert.equal(defaults.notificationMode, NOTIFICATION_MODE.EMAIL, 'existing default preferences must remain email-first')
  assert.equal(normalizeLeadCommunicationPreferences({ email_enabled: true, whatsapp_enabled: true }).notificationMode, NOTIFICATION_MODE.EMAIL_AND_WHATSAPP)

  const storedPatch = buildPreferenceDbPayload({
    organisationId,
    leadId,
    updates: { notificationMode: NOTIFICATION_MODE.WHATSAPP },
  })
  assert.equal(storedPatch.email_enabled, false)
  assert.equal(storedPatch.whatsapp_enabled, true)
  assert.equal(storedPatch.preferred_channel, 'whatsapp')

  const dualPlan = resolveNotificationDispatchPlan({
    mode: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP,
    email: 'buyer@example.com',
    phone: '+27820000001',
  })
  assert.deepEqual(dualPlan.channels, ['email', 'whatsapp'])
  assert.equal(dualPlan.autoDispatch, true)
  assert.deepEqual(resolveNotificationDispatchPlan({ mode: 'whatsapp', email: 'buyer@example.com' }).blockers, [
    'Add a mobile number for this notification mode.',
  ])
  const handoffPlan = resolveNotificationDispatchPlan({ mode: 'agent_assisted' })
  assert.equal(handoffPlan.handoffRequired, true)
  assert.equal(handoffPlan.autoDispatch, false)

  const assistedPreferences = normalizeLeadCommunicationPreferences({ email_enabled: false, whatsapp_enabled: false })
  assert.equal(validateCommunicationPreferences(assistedPreferences, { channel: 'email' }).reason, 'agent_assisted')
} finally {
  await server.close()
}

console.log('notification mode checks passed')
