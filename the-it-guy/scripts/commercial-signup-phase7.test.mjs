import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const migration = await read('../../supabase/migrations/202606100004_commercial_access_notifications_phase7.sql')
for (const marker of [
  'bridge_notify_commercial_access_request',
  'transaction_notifications',
  'commercial_access_request',
  'CommercialAccessRequested',
  'commercial_access_request:',
  "'/settings/users'",
  'owner',
  'principal',
  'super_admin',
  'grant execute on function public.bridge_notify_commercial_access_request(uuid) to authenticated',
]) {
  includes(migration, marker, `Phase 7 migration should include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'notifyCommercialAccessReviewers',
  'bridge_notify_commercial_access_request',
  'reviewerNotificationCount',
  'reviewerNotificationSkippedReason',
  'notificationResult',
  'reviewerCount',
]) {
  includes(commercialApi, marker, `Commercial API should include Phase 7 notification marker ${marker}`)
}

const layout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'reviewerCount',
  'principals notified',
  'Commercial access request sent to your principal.',
]) {
  includes(layout, marker, `Commercial access blocked UI should include ${marker}`)
}

const api = await read('../src/lib/api.js')
for (const marker of [
  'commercial_access_request',
  'CommercialAccessRequested',
]) {
  includes(api, marker, `Notification runtime constants should include ${marker}`)
}

console.log('commercial signup phase 7 diagnostics passed')
