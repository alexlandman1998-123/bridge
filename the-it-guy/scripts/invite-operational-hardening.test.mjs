import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const migration = fs.readFileSync(path.join(root, '../supabase/migrations/202607120001_invite_operational_hardening.sql'), 'utf8')
const platformDiagnosticsPage = fs.readFileSync(path.join(root, 'src/pages/PlatformDiagnosticsPage.jsx'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

for (const marker of [
  'create or replace function public.bridge_canonical_invite_health()',
  'create or replace function public.bridge_reconcile_canonical_invites(p_dry_run boolean default true)',
  'expiredPendingInvites',
  'expiredPendingPartnerInvitations',
  'expiredPendingTransactionPartnerInvitations',
  'completedProfilesWithoutWorkspace',
  "'expired_pending_invites'",
  "'completed_profiles_without_workspace'",
  "'expired_pending_invite_status_sync'",
  "'expired_pending_partner_invitation_status_sync'",
  "'expired_pending_transaction_partner_invitation_status_sync'",
  "'invite_expired_by_reconciliation'",
  "metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(",
  "and expires_at is not null",
  "and expires_at < v_now",
  "lower(trim(coalesce(ou.membership_status, ''))) = 'active'",
  "lower(trim(coalesce(ou.status, ''))) = 'active'",
]) {
  includes(migration, marker, `Invite operational hardening migration should preserve ${marker}`)
}

assert.match(
  migration,
  /update public\.invites[\s\S]*set status = 'expired'[\s\S]*returning id[\s\S]*bridge_record_invite_event/,
  'Expired canonical invites should be status-synced and audited.',
)
assert.match(
  migration,
  /from public\.profiles p[\s\S]*p\.onboarding_completed is true[\s\S]*not exists \([\s\S]*from public\.organisation_users ou/,
  'Health should detect completed professional profiles without active workspace membership.',
)
assert.match(
  migration,
  /v_expired_pending_invite_count > 0[\s\S]*v_status := 'warning'/,
  'Expired pending invite rows should make invite health warn until reconciled.',
)
assert.match(
  migration,
  /v_completed_profile_without_workspace_count > 0[\s\S]*v_status := 'warning'/,
  'Completed profiles without workspaces should keep invite health in warning state.',
)

for (const marker of [
  'Pending workspaces',
  'Expired pending',
  'Completed no workspace',
  'Expired partner rows',
  'pendingWorkspaceInvites',
  'expiredPendingInvites',
  'completedProfilesWithoutWorkspace',
]) {
  includes(platformDiagnosticsPage, marker, `Platform diagnostics should surface ${marker}`)
}

assert.equal(
  packageJson.scripts?.['test:invite-operational-hardening'],
  'node scripts/invite-operational-hardening.test.mjs',
  'Package script should expose the invite operational hardening regression.',
)

console.log('invite operational hardening tests passed')
