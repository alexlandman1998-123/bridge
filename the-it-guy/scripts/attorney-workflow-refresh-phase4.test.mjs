import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile('../supabase/migrations/20260907183523_attorney_workflow_refresh_signals.sql', 'utf8')
const detailPage = await readFile('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const liveRefresh = await readFile('src/hooks/useTransactionLiveRefresh.js', 'utf8')
const clientPortal = await readFile('src/pages/ClientPortal.jsx', 'utf8')
const unitDetail = await readFile('src/pages/UnitDetail.jsx', 'utf8')

assert.match(migration, /create or replace function public\.bridge_emit_attorney_workflow_refresh_signal\(\)/i)
assert.match(migration, /security definer/i)
assert.match(migration, /set search_path = ''/i)
assert.match(migration, /revoke all on function public\.bridge_emit_attorney_workflow_refresh_signal\(\) from public/i)
assert.match(migration, /insert into public\.transaction_refresh_signals/i)
assert.match(migration, /version = public\.transaction_refresh_signals\.version \+ 1/i)
assert.match(migration, /after insert or update of status, comment, completed_at, completed_by, visibility_scope/i)
assert.match(migration, /on public\.transaction_subprocess_steps/i)

assert.match(detailPage, /const refreshCanonicalTransactionSnapshot = useCallback/i)
assert.match(detailPage, /invalidateTransactionWorkspaceCoreCache\(normalizedTransactionId\)/i)
assert.match(detailPage, /fetchTransactionRouteCoreById\(normalizedTransactionId\)/i)
assert.match(detailPage, /requestTransactionRollup\(normalizedTransactionId, \{ force: true \}\)/i)
assert.match(detailPage, /const refreshAttorneyMutationWorkspace = useCallback/i)
assert.match(detailPage, /canonicalRefreshRequestRef/i)
assert.match(detailPage, /refreshRollup: String\(workspaceMenu \|\| ''\)\.toLowerCase\(\) === 'overview'/i)
assert.match(detailPage, /await refreshAttorneyMutationWorkspace\('workflow_mutation'\)/i)
assert.doesNotMatch(detailPage, /refreshTransactionDatasets\(\['workflow', 'activity'\], \{ reason: `live:\$\{reason\}` \}\)/i)
assert.match(detailPage, /new CustomEvent\('itg:transaction-updated'/i)
assert.match(detailPage, /source: 'attorney_workflow_atomic_update'/i)

assert.match(liveRefresh, /table: 'transaction_refresh_signals'/i)
assert.match(liveRefresh, /transaction_version_changed/i)
assert.match(clientPortal, /useTransactionLiveRefresh\(/i)
assert.match(unitDetail, /useTransactionLiveRefresh\(/i)

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
create role authenticated;
create role anon;
create table public.transaction_subprocesses (id uuid primary key, transaction_id uuid not null);
create table public.transaction_subprocess_steps (
  id uuid primary key, subprocess_id uuid not null, step_key text, status text,
  comment text, completed_at timestamptz, completed_by uuid, visibility_scope text
);
create table public.transaction_refresh_signals (
  transaction_id uuid primary key, version integer not null,
  command_receipt_id uuid, canonical_event_id uuid, changed_at timestamptz
);
create table public.transaction_sync_action_catalog (
  action_key text primary key, owner_role text, canonical_event_type text,
  affected_lane text, source_table text, default_visibility text,
  client_safe_projection_required boolean, updated_at timestamptz default now()
);
`)
const transactionId = '11111111-1111-4111-8111-111111111111'
const subprocessId = '22222222-2222-4222-8222-222222222222'
const stepId = '33333333-3333-4333-8333-333333333333'
await db.query('insert into public.transaction_subprocesses values ($1, $2)', [subprocessId, transactionId])
await db.query('insert into public.transaction_subprocess_steps (id, subprocess_id, step_key, status) values ($1, $2, $3, $4)',
  [stepId, subprocessId, 'instruction_received', 'not_started'])
await db.exec(await readFile('../supabase/migrations/20260908121455_transaction_attorney_refresh_contract_repair.sql', 'utf8'))
await assert.rejects(db.query('update public.transaction_subprocess_steps set comment=$1 where id=$2', ['Saved answers', stepId]),
  /record "new" has no field "transaction_id"/i)

await db.exec(await readFile('../supabase/migrations/20260927090458_repair_attorney_step_refresh_transaction_lookup.sql', 'utf8'))
await db.query('update public.transaction_subprocess_steps set comment=$1 where id=$2', ['Saved answers', stepId])
await db.query('update public.transaction_subprocess_steps set status=$1 where id=$2', ['completed', stepId])
const saved = (await db.query(`select step.comment, step.status, signal.transaction_id, signal.version
  from public.transaction_subprocess_steps step
  join public.transaction_subprocesses lane on lane.id = step.subprocess_id
  join public.transaction_refresh_signals signal on signal.transaction_id = lane.transaction_id
  where step.id = $1`, [stepId])).rows[0]
assert.equal(saved.comment, 'Saved answers')
assert.equal(saved.status, 'completed')
assert.equal(saved.transaction_id, transactionId)
assert.equal(saved.version, 2, 'saving answers and completing the task both advance the matter refresh signal')

console.log('Attorney workflow atomic refresh propagation checks passed.')
