import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appRoot, '..');
const migrationPath = path.join(
  workspaceRoot,
  'supabase',
  'migrations',
  '202605250023_bond_sensitive_mutation_shadow_helpers_phase5f.sql',
);

const migration = readFileSync(migrationPath, 'utf8');

test('Phase 5F adds sensitive mutation helper functions without adding enforcement policies', () => {
  assert.match(migration, /bridge_can_submit_bond_to_banks_phase5f/iu);
  assert.match(migration, /bridge_can_assign_bond_workspace_phase5f/iu);
  assert.match(migration, /bridge_can_assign_bond_region_phase5f/iu);
  assert.match(migration, /bridge_can_assign_bond_unit_phase5f/iu);
  assert.match(migration, /bridge_can_assign_bond_consultant_phase5f/iu);
  assert.match(migration, /bridge_can_assign_bond_processor_phase5f/iu);
  assert.match(migration, /bridge_can_assign_bond_manager_phase5f/iu);
  assert.match(migration, /bridge_can_assign_bond_compliance_phase5f/iu);
  assert.match(migration, /bridge_can_clear_bond_assignment_phase5f/iu);
  assert.match(migration, /bridge_can_transfer_bond_application_workspace_phase5f/iu);
  assert.doesNotMatch(migration, /create policy/iu);
  assert.doesNotMatch(migration, /alter policy/iu);
});

test('Phase 5F helper migration keeps exclusions and legacy compatibility guardrails intact', () => {
  assert.match(migration, /bridge_is_bond_transaction_canonical_ready/iu);
  assert.match(migration, /bridge_can_manage_bond_assignment_phase5d/iu);
  assert.match(migration, /bridge_can_submit_bond_to_banks_phase5d/iu);
  assert.doesNotMatch(migration, /drop column/iu);
  assert.doesNotMatch(migration, /drop policy/iu);
  assert.doesNotMatch(migration, /set not null/iu);
  assert.doesNotMatch(migration, /assigned_bond_originator_email/iu);
  assert.doesNotMatch(migration, /bond_originator\s+drop/iu);
});
