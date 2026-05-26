import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appRoot, '..');
const migrationsDir = path.join(workspaceRoot, 'supabase', 'migrations');

const phase5aMigration = readFileSync(
  path.join(migrationsDir, '202605250019_bond_rls_shadow_helpers_phase5a.sql'),
  'utf8',
);
const phase5bMigration = readFileSync(
  path.join(migrationsDir, '202605250020_bond_rls_scoped_policy_rollout_phase5b.sql'),
  'utf8',
);
const phase5dMigration = readFileSync(
  path.join(migrationsDir, '202605250022_bond_finance_write_policy_rollout_phase5d.sql'),
  'utf8',
);

const phase5dTargetPolicies = [
  'transaction_subprocess_steps_update_phase5d_bond_finance',
  'transaction_finance_details_update_phase5d_bond_finance',
  'document_requests_insert_phase5d_bond_finance',
  'document_requests_update_phase5d_bond_finance',
  'documents_insert_phase5d_bond_finance',
  'documents_update_phase5d_bond_finance',
  'transaction_events_insert_phase5d_bond_finance',
  'transaction_notifications_insert_phase5d_bond_finance',
  'transaction_notifications_update_phase5d_bond_finance',
];

test('Phase 5E keeps legacy fallback helpers and read exclusions intact', () => {
  assert.match(phase5aMigration, /assigned_bond_originator_email/iu);
  assert.match(phase5aMigration, /bond_originator/iu);
  assert.match(phase5aMigration, /transaction_participants/iu);
  assert.match(phase5bMigration, /accepted_unresolved_legacy/iu);
  assert.match(phase5bMigration, /manual_review/iu);
  assert.match(phase5bMigration, /legacy_compatibility_required/iu);
});

test('Phase 5E write rollout does not add delete or broad transaction-level mutation policies', () => {
  assert.doesNotMatch(phase5dMigration, /create policy[\s\S]+for delete/iu);
  assert.doesNotMatch(phase5dMigration, /create policy[\s\S]+on public\.transactions[\s\S]+for update/iu);
  assert.doesNotMatch(phase5dMigration, /create policy[\s\S]+on public\.transaction_subprocesses[\s\S]+for update/iu);
  assert.doesNotMatch(phase5dMigration, /create policy[\s\S]+using\s*\(\s*true\s*\)/iu);
  assert.doesNotMatch(phase5dMigration, /create policy[\s\S]+with check\s*\(\s*true\s*\)/iu);
});

test('Phase 5E still does not enforce submit-to-bank or assignment mutation via Phase 5D policies', () => {
  assert.match(phase5dMigration, /bridge_can_submit_bond_to_banks_phase5d/iu);
  assert.match(phase5dMigration, /bridge_can_manage_bond_assignment_phase5d/iu);
  assert.doesNotMatch(phase5dMigration, /create policy\s+[^\n;]*submit[\w_]*banks/iu);
  assert.doesNotMatch(phase5dMigration, /create policy\s+[^\n;]*assignment/iu);
});

test('Phase 5E preserves personal_originator branchless mode and only adds the expected scoped policies', () => {
  assert.doesNotMatch(phase5dMigration, /alter table[\s\S]+region_id[\s\S]+set not null/iu);
  assert.doesNotMatch(phase5dMigration, /alter table[\s\S]+workspace_unit_id[\s\S]+set not null/iu);

  for (const policyName of phase5dTargetPolicies) {
    assert.match(phase5dMigration, new RegExp(policyName, 'iu'));
  }
});
