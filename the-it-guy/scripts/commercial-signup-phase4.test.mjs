import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const migration = await read('../../supabase/migrations/202606100003_commercial_access_requests_phase4.sql')
for (const marker of [
  'create table if not exists public.commercial_access_requests',
  'requester_membership_id uuid references public.organisation_users',
  "status text not null default 'pending'",
  "status in ('pending', 'approved', 'rejected', 'cancelled')",
  'commercial_access_requests_one_pending_idx',
  'commercial_access_requests_select_requester_or_admin',
  'commercial_access_requests_insert_self_member',
  'public.bridge_is_active_member(organisation_id)',
  'public.bridge_is_org_admin(organisation_id)',
  'grant select, insert, update on public.commercial_access_requests to authenticated',
]) {
  includes(migration, marker, `Commercial access request migration should include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'COMMERCIAL_ACCESS_REVIEWER_ROLES',
  'export async function requestCommercialAccessForCurrentUser',
  'commercial_access_requests',
  'reusedExistingRequest',
  'export async function listCommercialAccessRequests',
  'export async function reviewCommercialAccessRequest',
  "source: 'principal_request'",
  'buildCommercialAccessApprovalMetadata',
  "source: 'commercial_access_request'",
  'Only a principal or workspace administrator can review Commercial access requests.',
]) {
  includes(commercialApi, marker, `Commercial access request service should include ${marker}`)
}

const layout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'requestCommercialAccessForCurrentUser',
  'Request Commercial access',
  'Commercial access request sent to your principal.',
  'already waiting for principal approval',
  'canRequestCommercial',
]) {
  includes(layout, marker, `Commercial blocked state should include request action ${marker}`)
}

const usersPage = await read('../src/pages/settings/SettingsUsersPage.jsx')
for (const marker of [
  'listCommercialAccessRequests',
  'reviewCommercialAccessRequest',
  'commercialAccessRequests',
  'Commercial access requests',
  'Approve agents who asked to use the Commercial workspace',
  'Pending Commercial access',
  "'approved'",
  "'rejected'",
]) {
  includes(usersPage, marker, `Settings users approval UI should include ${marker}`)
}

console.log('commercial signup phase 4 diagnostics passed')
