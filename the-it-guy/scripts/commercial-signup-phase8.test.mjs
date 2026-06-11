import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const migration = await read('../../supabase/migrations/202606100005_commercial_access_decision_notifications_phase8.sql')
for (const marker of [
  'bridge_notify_commercial_access_decision',
  'commercial_access_decision',
  'CommercialAccessReviewed',
  'commercial_access_decision:',
  'Commercial access approved',
  "'/commercial'",
  "'/dashboard'",
  'bridge_is_org_admin',
  'grant execute on function public.bridge_notify_commercial_access_decision(uuid) to authenticated',
]) {
  includes(migration, marker, `Phase 8 migration should include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'notifyCommercialAccessRequesterDecision',
  'bridge_notify_commercial_access_decision',
  'requesterNotificationCount',
  'requesterNotificationSkippedReason',
  'requester decision notification failed',
]) {
  includes(commercialApi, marker, `Commercial API should include Phase 8 decision notification marker ${marker}`)
}

const usersPage = await read('../src/pages/settings/SettingsUsersPage.jsx')
for (const marker of [
  'requesterNotified',
  'Commercial access approved and requester notified.',
  'Commercial access request rejected and requester notified.',
]) {
  includes(usersPage, marker, `Settings users page should include Phase 8 feedback marker ${marker}`)
}

const api = await read('../src/lib/api.js')
for (const marker of [
  'commercial_access_decision',
  'CommercialAccessReviewed',
]) {
  includes(api, marker, `Notification runtime constants should include ${marker}`)
}

const phase7Test = await read('./commercial-signup-phase7.test.mjs')
for (const marker of [
  'bridge_notify_commercial_access_request',
  'CommercialAccessRequested',
]) {
  includes(phase7Test, marker, `Phase 8 must preserve Phase 7 reviewer notification marker ${marker}`)
}

console.log('commercial signup phase 8 diagnostics passed')
