import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const migrationsDir = new URL('../../supabase/migrations/', import.meta.url)

const expectedMigrations = [
  '202607280003_guided_bond_application_phase5_submissions.sql',
  '202607280004_guided_bond_application_phase6_participants.sql',
  '202607280005_guided_bond_application_phase7_sureties_revisions.sql',
  '202607280006_guided_bond_application_phase8_external_exports.sql',
  '202607280007_guided_bond_application_phase8a_originator_intake.sql',
  '202607280008_guided_bond_application_phase8b_originator_document_requests.sql',
  '202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql',
  '202607280010_guided_bond_application_phase8d_originator_offers_grants.sql',
  '202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql',
  '202607280012_guided_bond_application_phase8f_agent_progress_view.sql',
  '202607280013_guided_bond_application_phase8g_attorney_handoff.sql',
  '202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql',
  '202607280015_guided_bond_application_phase8i_governance_reporting.sql',
  '202607280016_originator_rollout_phase_r1_internal_readiness.sql',
  '202607280017_originator_rollout_phase_r2_workspace_mvp.sql',
  '202607280018_originator_rollout_phase_r3_document_requests.sql',
  '202607280019_originator_rollout_phase_r4_progress_tracking.sql',
  '202607280020_originator_rollout_phase_r5_offers_grants_capture.sql',
  '202607280021_originator_rollout_phase_r6_one_originator_pilot.sql',
  '202607280022_originator_rollout_phase_r7_operational_hardening.sql',
  '202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql',
  '202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql',
  '202608050011_agent_bond_originator_progress_detail_view.sql',
]

const readMigration = (fileName) => readFile(new URL(fileName, migrationsDir), 'utf8')
const assertIncludes = (source, expected, label) => {
  assert.ok(source.includes(expected), label || `Expected migration source to include ${expected}`)
}

const migrationFiles = await readdir(migrationsDir)
const phaseMigrationFiles = migrationFiles
  .filter((fileName) => /^2026072800(0[3-9]|1[0-9]|2[0-4])_/.test(fileName) || fileName === '202608050011_agent_bond_originator_progress_detail_view.sql')
  .sort()

assert.deepEqual(phaseMigrationFiles, expectedMigrations, 'Phase 7 migration queue should be complete and timestamp ordered')

const sources = Object.fromEntries(await Promise.all(
  expectedMigrations.map(async (fileName) => [fileName, await readMigration(fileName)]),
))

assertIncludes(
  sources['202607280003_guided_bond_application_phase5_submissions.sql'],
  'create table if not exists public.transaction_bond_application_submissions',
  'guided Phase 5 submissions history should be present',
)
assertIncludes(
  sources['202607280004_guided_bond_application_phase6_participants.sql'],
  'create table if not exists public.bond_application_participant_invites',
  'guided Phase 6 participant invite history should be present',
)

const suretiesMigration = sources['202607280005_guided_bond_application_phase7_sureties_revisions.sql']
assertIncludes(suretiesMigration, 'create table if not exists public.bond_application_change_requests')
assertIncludes(suretiesMigration, 'create table if not exists public.bond_application_change_request_items')
assertIncludes(suretiesMigration, 'create table if not exists public.transaction_bond_application_submission_documents')
assertIncludes(suretiesMigration, 'add column if not exists supersedes_submission_id')
assertIncludes(suretiesMigration, 'add column if not exists superseded_by_submission_id')
assertIncludes(suretiesMigration, 'add column if not exists revision_change_request_id')

assertIncludes(
  sources['202607280006_guided_bond_application_phase8_external_exports.sql'],
  'create table if not exists public.transaction_bond_application_export_packages',
)
assertIncludes(
  sources['202607280007_guided_bond_application_phase8a_originator_intake.sql'],
  'bridge_record_bond_originator_intake_download',
)
assertIncludes(
  sources['202607280008_guided_bond_application_phase8b_originator_document_requests.sql'],
  'create table if not exists public.transaction_bond_originator_document_requests',
)
assertIncludes(
  sources['202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql'],
  'create table if not exists public.transaction_bond_originator_progress_events',
)
assertIncludes(
  sources['202607280010_guided_bond_application_phase8d_originator_offers_grants.sql'],
  'create table if not exists public.transaction_bond_originator_bank_offer_captures',
)
assertIncludes(
  sources['202607280010_guided_bond_application_phase8d_originator_offers_grants.sql'],
  'create table if not exists public.transaction_bond_originator_grant_captures',
)
assertIncludes(
  sources['202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql'],
  'create table if not exists public.transaction_bond_originator_buyer_offer_decisions',
)
assertIncludes(
  sources['202607280012_guided_bond_application_phase8f_agent_progress_view.sql'],
  'create or replace function public.bridge_agent_bond_originator_progress_view',
)
assertIncludes(
  sources['202607280013_guided_bond_application_phase8g_attorney_handoff.sql'],
  'create or replace function public.bridge_attorney_bond_originator_handoff_view',
)
assertIncludes(
  sources['202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql'],
  'create table if not exists public.transaction_bond_application_recipient_format_packages',
)
assertIncludes(
  sources['202607280015_guided_bond_application_phase8i_governance_reporting.sql'],
  'create table if not exists public.transaction_bond_application_governance_reports',
)

const rolloutMarkers = [
  ['202607280016_originator_rollout_phase_r1_internal_readiness.sql', 'transaction_bond_originator_internal_readiness_reports'],
  ['202607280017_originator_rollout_phase_r2_workspace_mvp.sql', 'transaction_bond_originator_workspace_assignments'],
  ['202607280018_originator_rollout_phase_r3_document_requests.sql', 'bridge_create_bond_originator_workspace_document_request'],
  ['202607280019_originator_rollout_phase_r4_progress_tracking.sql', 'bridge_record_bond_originator_workspace_progress_update'],
  ['202607280020_originator_rollout_phase_r5_offers_grants_capture.sql', 'bridge_capture_bond_originator_workspace_bank_offer'],
  ['202607280021_originator_rollout_phase_r6_one_originator_pilot.sql', 'transaction_bond_originator_one_originator_pilots'],
  ['202607280022_originator_rollout_phase_r7_operational_hardening.sql', 'transaction_bond_originator_operational_hardening_reports'],
  ['202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql', 'transaction_bond_originator_multi_originator_rollouts'],
  ['202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql', 'transaction_bond_originator_formal_integrations'],
]

for (const [fileName, marker] of rolloutMarkers) {
  assertIncludes(sources[fileName], marker, `${fileName} should keep ${marker}`)
}

const safetyMigrations = expectedMigrations.slice(5)
for (const fileName of safetyMigrations) {
  const source = sources[fileName]
  assert.match(source, /no_automatic_bank_submission|bank_workflow_unchanged|bankWorkflowUnchanged/, `${fileName} should keep bank workflow safety flags`)
  assert.doesNotMatch(source, /production_live_delivery_enabled boolean not null default true/i, `${fileName} should not default production live delivery on`)
  assert.doesNotMatch(source, /live_delivery_enabled boolean not null default true/i, `${fileName} should not default live delivery on`)
}

const detailedProgressView = sources['202608050011_agent_bond_originator_progress_detail_view.sql']
assertIncludes(detailedProgressView, 'documentRequests')
assertIncludes(detailedProgressView, 'offerCaptures')
assertIncludes(detailedProgressView, 'grantCaptures')
assertIncludes(detailedProgressView, 'grant execute on function public.bridge_agent_bond_originator_progress_view(uuid) to authenticated')

console.log('forward-port Supabase migration Phase 7 checks passed')
