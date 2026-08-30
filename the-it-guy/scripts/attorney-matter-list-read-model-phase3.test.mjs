import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sql = await readFile(
  new URL('../../supabase/migrations/20260830132148_attorney_matter_list_read_model_phase3.sql', import.meta.url),
  'utf8',
)
const service = await readFile(
  new URL('../src/services/attorneyMatterListSnapshotService.js', import.meta.url),
  'utf8',
)
const page = await readFile(
  new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url),
  'utf8',
)

for (const expected of [
  'bridge_attorney_matter_list_snapshot',
  'security invoker',
  'from public.transaction_attorney_assignments assignment',
  "assignment.assignment_status in ('pending', 'active', 'paused')",
  'join public.transactions transaction on transaction.id = assignment.transaction_id',
  'join scoped_matters matter on matter.id = appointment.transaction_id',
  'current_date',
  'jsonb_build_object',
  'p_filters jsonb',
  'grant execute on function public.bridge_attorney_matter_list_snapshot',
]) {
  assert.ok(sql.includes(expected), `Expected read-model contract: ${expected}`)
}

assert.doesNotMatch(sql, /security\s+definer/i, 'Read model must preserve caller RLS.')
assert.doesNotMatch(sql, /from public\.appointments appointment\s+where/i, 'Appointments must be transaction-scoped before filtering by date.')
assert.match(service, /rpc\('bridge_attorney_matter_list_snapshot'/, 'Client adapter should call the read model RPC.')
assert.match(service, /p_filters:/, 'Client adapter should send list filters to the RPC.')
assert.match(page, /getAttorneyMatterListSnapshot\([\s\S]*?view: viewKey[\s\S]*?page: snapshotPage[\s\S]*?filters,/, 'Active matter list routes should request view, page and filters from the RPC.')
assert.match(page, /buildAttorneyMatterWorkspaceFromSnapshot\(matterSnapshot/, 'Matter list UI should present the SQL snapshot without reloading the operational workspace.')

console.log('attorney matter list read-model phase 3 contract passed')
