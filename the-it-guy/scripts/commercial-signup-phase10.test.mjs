import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const migration = await read('../../supabase/migrations/202606100007_commercial_access_request_reminders_phase10.sql')
for (const marker of [
  'bridge_nudge_commercial_access_request',
  'last_nudged_at',
  'nudge_count',
  'commercial_access_request_reminder',
  'Commercial access reminder',
  'YYYYMMDDHH24',
  'grant execute on function public.bridge_nudge_commercial_access_request(uuid) to authenticated',
]) {
  includes(migration, marker, `Phase 10 migration should include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'commercial_access_reminded',
  'nudgeCommercialAccessReviewers',
  'bridge_nudge_commercial_access_request',
  'export async function remindCommercialAccessReviewersForCurrentUser',
  "eventKind: 'reminder'",
  'reminderNotificationCount',
  'reminderEmailCount',
]) {
  includes(commercialApi, marker, `Commercial API should include Phase 10 reminder marker ${marker}`)
}

const layout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'remindCommercialAccessReviewersForCurrentUser',
  'handleRemindCommercialAccessReviewers',
  'Remind principal',
  'Reminder sent.',
]) {
  includes(layout, marker, `Commercial blocked UI should include Phase 10 marker ${marker}`)
}

const usersPage = await read('../src/pages/settings/SettingsUsersPage.jsx')
for (const marker of [
  'last_nudged_at',
  'Last reminded',
  'nudge_count',
]) {
  includes(usersPage, marker, `Settings users page should include Phase 10 reminder marker ${marker}`)
}

const handler = await read('../../supabase/functions/send-email/handlers/commercialAccessNotification.ts')
for (const marker of [
  'isReminder',
  'Commercial access reminder',
  'is still waiting for Commercial workspace access approval',
]) {
  includes(handler, marker, `Commercial email handler should include Phase 10 reminder marker ${marker}`)
}

const phase9Test = await read('./commercial-signup-phase9.test.mjs')
includes(phase9Test, 'commercial_access_notification', 'Phase 10 must preserve Phase 9 email notification marker')

console.log('commercial signup phase 10 diagnostics passed')
