import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000002'
const transferLane = '00000000-0000-0000-0000-000000000003'
const bondLane = '00000000-0000-0000-0000-000000000004'
const profile = {
  matterProfile: { status: 'confirmed', revision: 1, factFingerprint: 'facts-a' },
  transferTaxDecision: { status: 'confirmed', route: 'transfer_duty' },
  workflowPlan: {
    status: 'active', provisional: false, matterProfileRevision: 1, matterProfileFingerprint: 'facts-a',
    lanes: [
      { laneKey: 'transfer', stepKeys: [
        'transfer_tax_route_confirmed', 'sars_transfer_tax_receipt_verified',
        'municipal_rates_clearance_review', 'lodgement_ready', 'lodged_at_deeds_office', 'registered',
      ] },
      { laneKey: 'bond', stepKeys: ['bond_lodgement_ready'] },
    ],
  },
}
await db.exec(`
create role authenticated;
create role anon;
create schema auth;
create schema journey_private;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
create table profiles(id uuid, role text);
create table attorney_firm_members(user_id uuid, status text, firm_id uuid);
create table transaction_attorney_assignments(transaction_id uuid, assignment_status text, status text, assigned_user_id uuid, attorney_user_id uuid, primary_attorney_id uuid, secretary_id uuid, admin_handler_id uuid, attorney_firm_id uuid, firm_id uuid);
create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select $2 = 'transfer_attorney' and exists(select 1 from public.transaction_attorney_assignments where transaction_id = $1 and assigned_user_id = auth.uid())$$;
create table transactions(id uuid primary key, routing_profile_json jsonb, lifecycle_state text, current_main_stage text, current_sub_stage_summary text, updated_at timestamptz);
create table transaction_subprocesses(id uuid primary key, transaction_id uuid, process_type text, current_stage text, lane_status text, status text, completed_at timestamptz, updated_by uuid, updated_at timestamptz);
create table transaction_subprocess_steps(id uuid primary key, subprocess_id uuid, step_key text, step_label text, status text, comment text, completed_at timestamptz, completed_by uuid, visibility_scope text, updated_at timestamptz, sort_order integer, created_at timestamptz);
create table transaction_lifecycle_workflows(transaction_id uuid primary key, current_stage text, status text, last_updated_by uuid, last_updated_at timestamptz, updated_at timestamptz);
create table transaction_attorney_lane_history(transaction_id uuid, subprocess_id uuid, lane_key text, attorney_role text, previous_stage text, new_stage text, previous_status text, new_status text, changed_by uuid, note text, visibility text, source text, metadata jsonb);
create table transaction_events(transaction_id uuid, event_type text, event_data jsonb, created_by uuid, created_by_role text, visibility_scope text);
create table document_requirement_instances(id uuid primary key, document_definition_key text, transaction_id uuid, stage_gates text[], requirement_level text, status text, expiry_date timestamptz, waiver_reason text);
create function bridge_attorney_step_to_matter_stage(text,text) returns text language sql as $$select case when $2 = 'lodgement_ready' then 'lodgement' else 'documents' end$$;
create function bridge_matter_lifecycle_stage_rank(text) returns integer language sql as $$select case when $1 = 'documents' then 1 else 2 end$$;
create function bridge_matter_lifecycle_stage_label(text) returns text language sql as $$select $1$$;
`)
await db.query('insert into profiles values ($1,$2)', [actor, 'attorney'])
await db.query('insert into transaction_attorney_assignments(transaction_id,assigned_user_id,status) values ($1,$2,$3)', [matter, actor, 'active'])
await db.query('insert into transactions(id,routing_profile_json,lifecycle_state,current_main_stage) values ($1,$2,$3,$4)',
  [matter, profile, 'active', 'documents'])
await db.query('insert into transaction_subprocesses(id,transaction_id,process_type,status) values ($1,$2,$3,$4),($5,$2,$6,$4)',
  [transferLane, matter, 'transfer', 'in_progress', bondLane, 'bond'])
const transferKeys = profile.workflowPlan.lanes[0].stepKeys
for (const [index, key] of transferKeys.entries()) {
  await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,sort_order) values ($1,$2,$3,$4,$5)',
    ['00000000-0000-0000-0000-' + String(index + 10).padStart(12, '0'), transferLane, key,
      index < 3 ? 'completed' : 'not_started', index + 1])
}
await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,sort_order) values ($1,$2,$3,$4,$5)',
  ['00000000-0000-0000-0000-000000000099', bondLane, 'bond_lodgement_ready', 'not_started', 1])
await db.exec(readFileSync(new URL('../../supabase/migrations/20260908071547_attorney_mvp_atomic_task_progress.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260908073924_attorney_mvp_task_discretion.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926132034_attorney_phase1_readiness_gates.sql', import.meta.url), 'utf8'))

const taskId = async key => (await db.query('select id from transaction_subprocess_steps where step_key=$1 and subprocess_id=$2', [key, transferLane])).rows[0].id
const status = async key => (await db.query('select status from transaction_subprocess_steps where step_key=$1 and subprocess_id=$2', [key, transferLane])).rows[0].status
const update = async (key, outcome, note = '') => db.query(
  'select public.bridge_update_attorney_workflow_step_v3($1,$2,$3,$4,$5) as result',
  [matter, 'transfer', await taskId(key), outcome, note],
)

await assert.rejects(update('lodgement_ready', 'completed_externally', 'Outside office'), /milestone needs/)
await assert.rejects(update('lodgement_ready', 'not_applicable', 'Not needed'), /milestone needs/)
await assert.rejects(update('lodgement_ready', 'completed'), /attestation/)
await assert.rejects(update('lodgement_ready', 'completed', 'Reviewed transfer pack'), /bond attorney/)
await assert.rejects(
  db.query("update transaction_subprocess_steps set status='completed' where subprocess_id=$1", [bondLane]),
  /attestation/,
  'direct table writes must not bypass the milestone gate',
)
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond attorney reviewed the lodgement pack.' where subprocess_id=$1", [bondLane])
await db.query(
  'insert into document_requirement_instances values ($1,$2,$3,$4,$5,$6)',
  ['00000000-0000-0000-0000-000000000090', 'rates_clearance_certificate', matter,
    ['lodgement_ready'], 'blocker', 'pending'],
)
await assert.rejects(update('lodgement_ready', 'completed', 'I reviewed the transfer and bond readiness evidence.'), /rates_clearance_certificate/)
await db.query("update document_requirement_instances set status='approved' where transaction_id=$1", [matter])
await db.query("update document_requirement_instances set expiry_date=now()-interval '1 day' where transaction_id=$1", [matter])
await assert.rejects(update('lodgement_ready', 'completed', 'I reviewed the transfer and bond readiness evidence.'), /rates_clearance_certificate/)
await db.query("update document_requirement_instances set expiry_date=now()+interval '10 days' where transaction_id=$1", [matter])
await update('lodgement_ready', 'completed', 'I reviewed the transfer and bond readiness evidence.')
assert.equal(await status('lodgement_ready'), 'completed')
await assert.rejects(
  db.query("update transaction_subprocess_steps set comment=null where subprocess_id=$1 and step_key='lodgement_ready'", [transferLane]),
  /attestation/,
  'a direct write cannot erase the active attestation',
)
await db.query("update document_requirement_instances set status='expired' where transaction_id=$1", [matter])
assert.equal(await status('lodgement_ready'), 'not_started', 'lost document approval withdraws readiness')
await db.query("update document_requirement_instances set status='approved' where transaction_id=$1", [matter])
await update('lodgement_ready', 'completed', 'I rechecked the rates document after approval.')
await db.query("update transaction_subprocess_steps set status='not_started' where subprocess_id=$1 and step_key='municipal_rates_clearance_review'", [transferLane])
assert.equal(await status('lodgement_ready'), 'not_started', 'reopening a prerequisite withdraws readiness')
await assert.rejects(update('lodged_at_deeds_office', 'completed', 'Lodged at deeds office'), /preceding lodgement/)
await assert.rejects(update('municipal_rates_clearance_review', 'completed'), /evidence decision/)
await update('municipal_rates_clearance_review', 'completed', 'Municipal clearance certificate is valid.')
await update('lodgement_ready', 'completed', 'I rechecked the municipal and bond evidence.')
const revised = structuredClone(profile)
revised.matterProfile.factFingerprint = 'facts-b'
revised.workflowPlan.matterProfileFingerprint = 'facts-b'
await db.query('update transactions set routing_profile_json=$1 where id=$2', [revised, matter])
assert.equal(await status('lodgement_ready'), 'not_started', 'profile correction withdraws unlodged readiness')
assert.equal(await status('sars_transfer_tax_receipt_verified'), 'completed', 'profile correction preserves completed work')
const events = (await db.query("select count(*)::int as count from transaction_events where event_type='AttorneyReadinessWithdrawn'")).rows[0].count
assert.equal(events, 4, 'document, task, and profile changes withdraw the affected readiness')
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond attorney reviewed the corrected pack.' where subprocess_id=$1", [bondLane])
await update('lodgement_ready', 'completed', 'I reviewed the corrected profile and linked bond evidence.')
await update('lodged_at_deeds_office', 'completed', 'Deeds Office accepted the lodgement.')
const afterLodgement = structuredClone(revised)
afterLodgement.matterProfile.factFingerprint = 'facts-c'
afterLodgement.workflowPlan.matterProfileFingerprint = 'facts-c'
await db.query('update transactions set routing_profile_json=$1 where id=$2', [afterLodgement, matter])
assert.equal(await status('lodgement_ready'), 'completed', 'a later correction cannot erase actual lodgement history')
assert.equal(await status('lodged_at_deeds_office'), 'completed')
await db.close()
console.log('Attorney readiness gates passed: milestone outcomes, cross-lane handoff, reopening, and plan correction.')
