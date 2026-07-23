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
const serviceSource = readFileSync(
  new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url),
  'utf8',
)
const pageSource = readFileSync(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)

function verifyCanonicalBackfill() {
  const expectedCounts = {
    transfer: 37,
    bond: 17,
    cancellation: 19,
  }

  for (const [laneKey, expectedCount] of Object.entries(expectedCounts)) {
    const templates = getAttorneyWorkflowStageTemplates(laneKey)
    assert.equal(templates.length, expectedCount, `${laneKey}: unexpected canonical stage count`)
    for (const template of templates) {
      assert.match(
        migrationSource,
        new RegExp(`\\('${laneKey}', '${template.key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}',`),
        `${laneKey}: backfill is missing ${template.key}`,
      )
    }
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

  assert.match(serviceSource, /client\.rpc\('bridge_update_attorney_workflow_step'/)
  assert.match(serviceSource, /p_work_packet:\s*workPacketMetadata\.workPacket \|\| null/)
  assert.match(serviceSource, /stageDefinition\?\.defaultVisibility \|\| 'professional_shared'/)
  assert.match(pageSource, /visibility:\s*draft\.visibility \|\| null/)
  assert.match(serviceSource, /Phase 1 database foundation is deployed/)
  assert.match(pageSource, /const currentKeyStep = steps\.find/)
  assert.match(pageSource, /normalizeWorkspaceStatus\(currentKeyStep\.status\) !== 'completed' \|\| !nextOpenStep/)
  assert.match(pageSource, /const updated = await onUpdateStep/)
  assert.match(pageSource, /if \(updated === false\) return/)
  assert.doesNotMatch(pageSource, /onUpdateStep=\{\(step, status, note\) => void handleArchlineLegalWorkflowStepUpdate/)

  const stepUpdateStart = serviceSource.indexOf('export async function updateAttorneyWorkflowStepStatus')
  const stepUpdateEnd = serviceSource.indexOf('export async function getAttorneyUpdateOptionsForTransaction', stepUpdateStart)
  const stepUpdateSource = serviceSource.slice(stepUpdateStart, stepUpdateEnd)
  assert.doesNotMatch(stepUpdateSource, /\.from\('transaction_subprocess_steps'\)\s*\.update\(/)
  assert.doesNotMatch(stepUpdateSource, /insertTransactionEvent\(/)
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
verifyCrossModuleVisibilityContract()

console.log('Attorney workflow Phase 1 foundation verification passed.')
