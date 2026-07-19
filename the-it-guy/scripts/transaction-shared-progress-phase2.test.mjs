import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile('../supabase/migrations/202607190002_transaction_shared_progress_phase2.sql', 'utf8')
const service = await readFile('src/services/transactionSharedProgressService.js', 'utf8')
const attorneyService = await readFile('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', 'utf8')
const checklistService = await readFile('src/services/transactionOperationalChecklistService.js', 'utf8')
const api = await readFile('src/lib/api.js', 'utf8')
const readModel = await readFile('src/services/transactionWorkflowReadModelService.js', 'utf8')

assert.match(migration, /create table if not exists public\.transaction_shared_progress/i)
assert.match(migration, /unique \(transaction_id, process_key\)/i)
assert.match(migration, /enable row level security/i)
assert.match(migration, /visibility = 'client_visible'/i)
assert.match(migration, /Only an authorised transaction professional may publish progress/i)
assert.match(migration, /bridge_publish_transaction_shared_progress_phase2/i)
assert.match(migration, /on conflict \(transaction_id, process_key\) do update/i)
assert.match(migration, /TransactionProgressPublished/i)
assert.match(migration, /if v_has_changed then/i)
assert.match(migration, /set status = computed\.computed_status,[\s\S]*lane_status = computed\.computed_status/i)
assert.match(migration, /phase2_backfill/i)

assert.match(service, /buildTransactionProgressSnapshot/)
assert.match(service, /bridge_publish_transaction_shared_progress_phase2/)
assert.match(service, /presentTransactionProgress/)

assert.match(attorneyService, /publishAttorneySharedProgress/)
assert.match(attorneyService, /sourceType: 'attorney_workflow_step'/)
assert.match(attorneyService, /sourceType: 'attorney_workflow_lane'/)
assert.doesNotMatch(attorneyService, /safeExplanation:\s*normalizedNote/)

assert.match(checklistService, /reconcileLinkedSubprocessStatus/)
assert.match(checklistService, /lane_status: nextStatus/)
assert.match(checklistService, /publishOperationalSharedProgress/)
assert.match(checklistService, /operational_checklist_completed/)
assert.match(checklistService, /operational_checklist_blocked/)
assert.match(checklistService, /operational_checklist_document_linked/)

assert.match(api, /sourceType: 'transaction_subprocess_step'/)
assert.match(api, /lane_status: nextStatus/)
assert.match(readModel, /sharedProgress/)
assert.match(readModel, /getTransactionSharedProgress/)

console.log('Transaction shared progress Phase 2 persistence, propagation, security, and read-model checks passed.')
