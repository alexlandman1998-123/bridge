import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const migration = await read('../../supabase/migrations/202606100006_commercial_access_email_notifications_phase9.sql')
for (const marker of [
  'drop function if exists public.bridge_notify_commercial_access_request(uuid)',
  'recipient_email text',
  'recipient_name text',
  'bridge_notify_commercial_access_decision',
  'commercial_access_request:',
  'commercial_access_decision:',
  'grant execute on function public.bridge_notify_commercial_access_request(uuid) to authenticated',
  'grant execute on function public.bridge_notify_commercial_access_decision(uuid) to authenticated',
]) {
  includes(migration, marker, `Phase 9 migration should include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'invokeEdgeFunction',
  'sendCommercialAccessNotificationEmails',
  "type: 'commercial_access_notification'",
  'reviewerEmailCount',
  'requesterEmailCount',
  'emailCount',
  'emailSkippedReason',
]) {
  includes(commercialApi, marker, `Commercial API should include Phase 9 email marker ${marker}`)
}

const handler = await read('../../supabase/functions/send-email/handlers/commercialAccessNotification.ts')
for (const marker of [
  'handleCommercialAccessNotificationEmail',
  'COMMERCIAL_ACCESS_EMAILS_ENABLED',
  'Commercial access requested',
  'Commercial access approved',
  'renderBridgeEmailLayout',
  'sendViaResendApi',
]) {
  includes(handler, marker, `Commercial email handler should include ${marker}`)
}

const emailIndex = await read('../../supabase/functions/send-email/index.ts')
for (const marker of [
  'handleCommercialAccessNotificationEmail',
  'commercial_access_notification',
  'commercial_access_request',
  'commercial_access_decision',
]) {
  includes(emailIndex, marker, `send-email router should include ${marker}`)
}

const emailTypes = await read('../../supabase/functions/send-email/types.ts')
includes(emailTypes, 'SendCommercialAccessNotificationPayload', 'send-email types should include Commercial access payload')

const layout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
includes(layout, 'by email', 'Commercial blocked UI should mention email delivery when present')

const usersPage = await read('../src/pages/settings/SettingsUsersPage.jsx')
for (const marker of [
  'requesterEmailed',
  'Commercial access approved and requester emailed.',
  'Commercial access request rejected and requester emailed.',
]) {
  includes(usersPage, marker, `Settings users page should include Phase 9 email feedback ${marker}`)
}

const phase8Test = await read('./commercial-signup-phase8.test.mjs')
includes(phase8Test, 'CommercialAccessReviewed', 'Phase 9 must preserve Phase 8 decision notification marker')

console.log('commercial signup phase 9 diagnostics passed')
