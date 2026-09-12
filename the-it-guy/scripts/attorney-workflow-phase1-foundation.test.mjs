import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAttorneyWorkflowStageTemplates } from '../src/constants/attorneyWorkflowStages.js'

const migrationSource = readFileSync(
  new URL('../../supabase/migrations/202607160021_attorney_workflow_phase1_foundation.sql', import.meta.url),
  'utf8',
)
const crossModuleVisibilityMigrationSource = readFileSync(
  new URL('../../supabase/migrations/202607190001_transaction_workflow_cross_module_visibility.sql', import.meta.url),
  'utf8',
)
const stepCompletionAdvanceMigrationSource = readFileSync(
  new URL('../../supabase/migrations/202607230013_attorney_workflow_step_completion_advance.sql', import.meta.url),
  'utf8',
)
const serviceSource = readFileSync(
  new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url),
  'utf8',
)
const sharedJourneyCommandSource = readFileSync(
  new URL('../src/services/attorneyWorkflow/sharedJourneyCommandService.js', import.meta.url),
  'utf8',
)
const pageSource = readFileSync(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)

function verifyCanonicalBackfill() {
  // This migration is an immutable Phase 1 historical backfill. The live
  // catalogue is now scenario-driven and has intentionally evolved, so it
  // must not be compared to this one-time migration's fixed row count.
  const legacyCounts = {
    transfer: 37,
    bond: 17,
    cancellation: 19,
  }

  for (const [laneKey, expectedCount] of Object.entries(legacyCounts)) {
    const backfillRows = migrationSource
      .split(/\r?\n/)
      .filter((line) => new RegExp(`^\\s*\\('${laneKey}',`).test(line))
    assert.equal(backfillRows.length, expectedCount, `${laneKey}: Phase 1 backfill changed unexpectedly`)

    const templates = getAttorneyWorkflowStageTemplates(laneKey)
    assert.ok(templates.length > 0, `${laneKey}: current scenario catalogue is empty`)
    assert.equal(new Set(templates.map((template) => template.key)).size, templates.length, `${laneKey}: current scenario catalogue contains duplicate task keys`)
  }

  assert.match(migrationSource, /not exists \([\s\S]*existing\.subprocess_id = lane\.id[\s\S]*existing\.step_key = canonical\.step_key/)
}

function verifyExtensibleEventContract() {
  assert.match(migrationSource, /drop constraint if exists transaction_events_event_type_check/)
  assert.match(migrationSource, /check \(event_type is not null and length\(trim\(event_type\)\) between 1 and 120\)/)
  assert.doesNotMatch(migrationSource, /event_type\s+in\s*\(/i)
}

function verifyAtomicCompletionContract() {
  assert.match(migrationSource, /create or replace function public\.bridge_update_attorney_workflow_step/)
  assert.match(migrationSource, /security definer/)
  assert.match(migrationSource, /update public\.transaction_subprocess_steps/)
  assert.match(migrationSource, /update public\.transaction_subprocesses/)
  assert.match(migrationSource, /insert into public\.transaction_attorney_lane_history/)
  assert.match(migrationSource, /insert into public\.transaction_events/)
  assert.match(migrationSource, /AttorneyWorkflowStepCompleted/)
  assert.match(migrationSource, /grant execute on function public\.bridge_update_attorney_workflow_step[\s\S]*to authenticated/)

  // Phase 3 moved the atomic command behind the shared journey service so
  // every role uses one durable mutation path. Keep testing both the caller
  // and the canonical RPC instead of depending on the old inline call.
  assert.match(serviceSource, /commitSharedJourneyTask\(client,\s*\{/)
  assert.match(sharedJourneyCommandSource, /client\.rpc\('bridge_update_attorney_workflow_step_v4', payload\)/)
  assert.match(serviceSource, /p_work_packet:\s*workPacketMetadata\.workPacket \|\| null/)
  assert.match(serviceSource, /stageDefinition\?\.defaultVisibility \|\| 'professional_shared'/)
  assert.match(pageSource, /visibility:\s*draft\.visibility \|\| null/)
  assert.match(serviceSource, /Attorney workflow updates require the shared journey Phase 3 database migration\./)

  const stepUpdateStart = serviceSource.indexOf('export async function updateAttorneyWorkflowStepStatus')
  const stepUpdateEnd = serviceSource.indexOf('export async function getAttorneyUpdateOptionsForTransaction', stepUpdateStart)
  const stepUpdateSource = serviceSource.slice(stepUpdateStart, stepUpdateEnd)
  assert.doesNotMatch(stepUpdateSource, /\.from\('transaction_subprocess_steps'\)\s*\.update\(/)
  assert.doesNotMatch(stepUpdateSource, /insertTransactionEvent\(/)
}

function verifyAtomicCompletionAdvanceContract() {
  assert.match(stepCompletionAdvanceMigrationSource, /create or replace function public\.bridge_update_attorney_workflow_step/)
  assert.match(stepCompletionAdvanceMigrationSource, /v_next_stage_key text/)
  assert.match(stepCompletionAdvanceMigrationSource, /and step\.status <> 'completed'/)
  assert.match(stepCompletionAdvanceMigrationSource, /current_stage = v_next_stage_key/)
  assert.doesNotMatch(stepCompletionAdvanceMigrationSource, /current_stage = v_step\.step_key/)
  assert.match(stepCompletionAdvanceMigrationSource, /'currentStage', v_next_stage_key/)
  assert.match(stepCompletionAdvanceMigrationSource, /status in \('not_started', 'in_progress', 'completed', 'blocked', 'waiting'\)/)
}

function verifyCrossModuleVisibilityContract() {
  assert.match(crossModuleVisibilityMigrationSource, /transaction_subprocesses_select_cross_module/)
  assert.match(crossModuleVisibilityMigrationSource, /transaction_subprocess_steps_select_cross_module/)
  assert.match(crossModuleVisibilityMigrationSource, /'professional_shared'/)
  assert.match(crossModuleVisibilityMigrationSource, /transaction_subprocess_steps_select_client_portal/)
  assert.match(crossModuleVisibilityMigrationSource, /visibility_scope = 'client_visible'/)
  assert.match(crossModuleVisibilityMigrationSource, /transaction_events_select_client_portal/)
}

verifyCanonicalBackfill()
verifyExtensibleEventContract()
verifyAtomicCompletionContract()
verifyAtomicCompletionAdvanceContract()
verifyCrossModuleVisibilityContract()

console.log('Attorney workflow Phase 1 foundation verification passed.')
