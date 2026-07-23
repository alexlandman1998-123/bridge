import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const REPO_ROOT = path.resolve(APP_ROOT, '..')
const migrationPath = path.join(REPO_ROOT, 'supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')

for (const required of [
  'phase6_server_owned_release_epoch_integrity',
  'legal-document-successor-release-epoch-v1',
  'legal_document_successor_release_epochs_phase6',
  'legal_document_successor_release_memberships_phase6',
  'legal_document_successor_release_epoch_transitions_phase6',
  'legal_document_successor_release_packet_bindings_phase6',
  'legal_document_successor_release_lifecycle_events_phase6',
  'bridge_prepare_legal_document_successor_release_epoch_phase6',
  'bridge_register_legal_document_successor_release_membership_phase6',
  'bridge_transition_legal_document_successor_release_epoch_phase6',
  'bridge_bind_legal_document_successor_release_packet_phase6',
  'bridge_assert_legal_document_successor_release_packet_phase6',
  'bridge_record_legal_document_successor_release_lifecycle_event_phase6',
  'PHASE6_EPOCH_EXACT_TWO_MEMBERSHIPS_REQUIRED',
  'PHASE6_BINDING_ACTIVE_EPOCH_REQUIRED',
  'PHASE6_ASSERT_BINDING_REQUIRED',
  'PHASE6_LIFECYCLE_BINDING_REQUIRED',
]) {
  assert.match(migration, new RegExp(required))
}

assert.match(migration, /-- Control identifier: phase6_server_owned_release_epoch_integrity\./)
assert.match(migration, /it seeds no epoch, changes no runtime guard, and grants no browser\/client[\s\S]*mutation path/i)
assert.match(migration, /intended_organisation_count smallint not null default 2 check \(intended_organisation_count = 2\)/)
assert.match(migration, /membership_slot smallint not null check \(membership_slot in \(1, 2\)\)/)
assert.match(migration, /cohort_role text not null check \(cohort_role in \('existing_pilot', 'first_expansion'\)\)/)
assert.match(migration, /allowed_packet_types text\[\] not null check \(allowed_packet_types = array\['mandate', 'otp'\]::text\[\]\)/)
assert.match(migration, /unique \(release_epoch_id, membership_slot\)/)
assert.match(migration, /unique \(release_epoch_id, cohort_role\)/)
assert.match(migration, /state in \('prepared', 'active', 'draining', 'suspended'\)/)
assert.match(migration, /unique \(id, plan_digest\)/)
assert.match(migration, /unique \(id, release_epoch_id, organisation_id, membership_digest\)/)
assert.match(
  migration,
  /create unique index if not exists legal_document_successor_release_epochs_phase6_one_active_uq\s+on public\.legal_document_successor_release_epochs_phase6 \(state\)\s+where state = 'active'/,
  'Exactly one epoch must be globally active, while prepared and draining epochs remain possible.',
)
assert.match(
  migration,
  /constraint ld_sre_p6_binding_epoch_plan_fk\s+foreign key \(release_epoch_id, plan_digest\)\s+references public\.legal_document_successor_release_epochs_phase6 \(id, plan_digest\)/,
  'A binding must carry the exact plan digest of its release epoch.',
)
assert.match(
  migration,
  /constraint ld_sre_p6_binding_membership_scope_fk\s+foreign key \(membership_id, release_epoch_id, organisation_id, membership_digest\)\s+references public\.legal_document_successor_release_memberships_phase6 \(\s+id, release_epoch_id, organisation_id, membership_digest\s+\)/,
  'A binding must carry the exact immutable membership scope for its epoch and organisation.',
)

for (const table of [
  'legal_document_successor_release_epochs_phase6',
  'legal_document_successor_release_memberships_phase6',
  'legal_document_successor_release_epoch_transitions_phase6',
  'legal_document_successor_release_packet_bindings_phase6',
  'legal_document_successor_release_lifecycle_events_phase6',
]) {
  assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security'))
  assert.match(migration, new RegExp('revoke all on table public\\.' + table + ' from public, anon, authenticated, service_role'))
}

assert.match(migration, /grant select on table public\.legal_document_successor_release_epochs_phase6 to service_role/)
assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all) on table public\.legal_document_successor_release_[^ ]+ to authenticated/i)
assert.doesNotMatch(migration, /grant execute on function public\.bridge_(?:prepare|register|transition|bind|assert|record)_legal_document_successor_release_[^(]+\([^)]*\) to authenticated/i)

assert.match(migration, /where id = p_release_id\s+for update;[\s\S]{0,900}v_epoch\.state <> 'active'/)
assert.match(migration, /v_membership\.membership_digest <> v_membership_digest/)
assert.match(migration, /v_binding\.plan_digest <> v_epoch\.plan_digest/)
assert.match(migration, /v_binding\.membership_digest <> v_membership\.membership_digest/)
assert.match(migration, /v_binding\.generated_document_id is distinct from v_version\.rendered_document_id/)
assert.match(migration, /lower\(trim\(coalesce\(v_version\.rendered_sha256, ''\)\)\) <> v_binding\.generated_artifact_sha256/)
assert.match(migration, /v_epoch\.state not in \('active', 'draining'\)/)
assert.match(migration, /Phase 6 activation requires exactly two immutable organisation memberships\./)
assert.match(
  migration,
  /v_packet\.current_version_number is distinct from v_version\.version_number[\s\S]{0,500}PHASE6_BINDING_CURRENT_VERSION_REQUIRED/,
  'New bindings must use the packet current version rather than a stale version.',
)
assert.match(
  migration,
  /v_version\.generated_at is null[\s\S]{0,250}v_version\.generated_at <= v_epoch\.state_changed_at[\s\S]{0,250}v_version\.finalised_at is not null and v_version\.finalised_at <= v_epoch\.state_changed_at[\s\S]{0,750}PHASE6_BINDING_RELEASE_TIME_REQUIRED/,
  'New bindings must only admit generated/finalised artifacts created after active-epoch activation.',
)
assert.match(
  migration,
  /v_observed_at < v_epoch\.state_changed_at[\s\S]{0,250}v_observed_at < v_version\.generated_at[\s\S]{0,250}v_version\.finalised_at is not null and v_observed_at < v_version\.finalised_at/,
  'Bound-at evidence must not be backdated before the active epoch or artifact timestamps.',
)

const beforePrepareRpc = migration.slice(0, migration.indexOf('create or replace function public.bridge_prepare_legal_document_successor_release_epoch_phase6'))
assert.doesNotMatch(beforePrepareRpc, /insert into public\.legal_document_successor_release_epochs_phase6/i, 'The migration must not seed a release epoch.')
assert.doesNotMatch(migration, /generate-mandate|send-mandate-signing-email|dispatch-final-signed-document|Deno\.env|createClient/i, 'The schema migration must not become a runtime activation path.')

console.log('Phase 6 server-owned successor release-epoch schema contract passed.')
