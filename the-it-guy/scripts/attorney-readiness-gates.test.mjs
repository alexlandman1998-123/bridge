import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000002'
const transferLane = '00000000-0000-0000-0000-000000000003'
const bondLane = '00000000-0000-0000-0000-000000000004'
const profile = {
  financeType: 'bond', propertyTenure: 'freehold',
  mvpProfile: { sellerExistingBond: false, propertyConditions: { clearances: {
    municipal: { issuer: 'City of Cape Town', validUntil: '2030-01-01' },
  } } },
  matterProfile: { status: 'confirmed', revision: 1, factFingerprint: 'facts-a' },
  transferTaxDecision: { status: 'confirmed', route: 'transfer_duty', sarsStatus: 'receipted', sarsProofReference: 'SARS-1' },
  workflowPlan: {
    status: 'active', provisional: false, matterProfileRevision: 1, matterProfileFingerprint: 'facts-a',
    lanes: [
      { laneKey: 'transfer', stepKeys: [
        'transfer_tax_route_confirmed', 'sars_transfer_tax_receipt_verified',
        'municipal_rates_clearance_review', 'lodgement_ready', 'lodged_at_deeds_office', 'registered',
        'post_registration_closeout_review', 'matter_closed',
      ] },
      { laneKey: 'bond', stepKeys: ['bank_approval_to_lodge_received', 'bond_lodgement_ready', 'bond_lodged', 'bond_close_out_complete'] },
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
create table journey_private.task_catalog(lane_key text, step_key text, definition jsonb);
create table attorney_task_confirmations(step_id uuid primary key, task_confirmations jsonb);
create table transaction_attorney_lane_updates(transaction_id uuid, lane_key text, update_type text, visibility text, client_recipients jsonb, metadata jsonb, created_at timestamptz);
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
await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,comment,sort_order) values ($1,$2,$3,$4,$5,$6)',
  ['00000000-0000-0000-0000-000000000098', bondLane, 'bank_approval_to_lodge_received', 'completed',
    'Bank approval received and reviewed.', 0])
await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,sort_order) values ($1,$2,$3,$4,$5)',
  ['00000000-0000-0000-0000-000000000097', bondLane, 'bond_lodged', 'not_started', 2])
await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,sort_order) values ($1,$2,$3,$4,$5)',
  ['00000000-0000-0000-0000-000000000096', bondLane, 'bond_close_out_complete', 'not_started', 3])
await db.query('insert into journey_private.task_catalog values ($1,$2,$3),($1,$4,$3)',
  ['transfer', 'post_registration_closeout_review', { clientVisibleAllowed: true, defaultVisibility: 'client_visible', professional: { title: 'Combined close-out' } }, 'matter_closed'])
await db.exec(readFileSync(new URL('../../supabase/migrations/20260908071547_attorney_mvp_atomic_task_progress.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260908073924_attorney_mvp_task_discretion.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926132034_attorney_phase1_readiness_gates.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926180930_attorney_known_facts_lodgement_gate.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926190557_attorney_stage5_current_lodgement_evidence.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926191847_attorney_stage6_closure_audience_gates.sql', import.meta.url), 'utf8'))
assert.deepEqual((await db.query("select definition ->> 'clientVisibleAllowed' as allowed from journey_private.task_catalog where lane_key='transfer' order by step_key")).rows.map(row => row.allowed),
  ['false', 'false'], 'financial and closure task notes cannot be published through the atomic command catalogue')

const taskId = async key => (await db.query('select id from transaction_subprocess_steps where step_key=$1 and subprocess_id=$2', [key, transferLane])).rows[0].id
const status = async key => (await db.query('select status from transaction_subprocess_steps where step_key=$1 and subprocess_id=$2', [key, transferLane])).rows[0].status
const update = async (key, outcome, note = '') => db.query(
  'select public.bridge_update_attorney_workflow_step_v3($1,$2,$3,$4,$5) as result',
  [matter, 'transfer', await taskId(key), outcome, note],
)

await db.query('update transactions set routing_profile_json=$1 where id=$2',
  [{ ...profile, mvpProfile: { sellerExistingBond: 'unknown' } }, matter])
await assert.rejects(
  db.query("update transaction_subprocess_steps set status='completed', comment='I reviewed the bond pack.' where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane]),
  /Confirm whether the seller has an existing bond/,
  'a legacy plan cannot treat unknown seller-bond status as no cancellation')
await db.query('update transactions set routing_profile_json=$1 where id=$2',
  [{ ...profile, financeType: 'unknown' }, matter])
await assert.rejects(
  db.query("update transaction_subprocess_steps set status='completed', comment='I reviewed the bond pack.' where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane]),
  /Confirm buyer finance/,
  'unknown finance cannot reach readiness even with a saved active plan')
await db.query('update transactions set routing_profile_json=$1 where id=$2', [profile, matter])

await assert.rejects(update('lodgement_ready', 'completed_externally', 'Outside office'), /milestone needs/)
await assert.rejects(update('lodgement_ready', 'not_applicable', 'Not needed'), /milestone needs/)
await assert.rejects(update('lodgement_ready', 'completed'), /attestation/)
await assert.rejects(update('lodgement_ready', 'completed', 'Reviewed transfer pack'), /bond attorney/)
await assert.rejects(
  db.query("update transaction_subprocess_steps set status='completed' where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane]),
  /attestation/,
  'direct table writes must not bypass the milestone gate',
)
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond attorney reviewed the lodgement pack.' where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane])
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
const withdrawalReasons = (await db.query("select event_data ->> 'reason' as reason from transaction_events where event_type='AttorneyReadinessWithdrawn'")).rows.map(row => row.reason)
assert.equal(events, 4, `document, task, and profile changes withdraw the affected readiness: ${withdrawalReasons.join(', ')}`)
assert.deepEqual(withdrawalReasons, [
  'lodgement_document_changed:rates_clearance_certificate',
  'prerequisite_reopened:municipal_rates_clearance_review',
  'matter_profile_changed',
  'matter_profile_changed',
])
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond attorney reviewed the corrected pack.' where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane])
await update('lodgement_ready', 'completed', 'I reviewed the corrected profile and linked bond evidence.')
await db.query("update transaction_subprocess_steps set status='blocked', comment='Bank withdrew approval to lodge.' where subprocess_id=$1 and step_key='bank_approval_to_lodge_received'", [bondLane])
assert.equal(await status('lodgement_ready'), 'not_started', 'withdrawn bank approval invalidates transfer readiness')
assert.equal((await db.query("select status from transaction_subprocess_steps where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane])).rows[0].status,
  'not_started', 'withdrawn bank approval invalidates bond readiness')
await db.query("update transaction_subprocess_steps set status='completed', comment='Renewed bank approval to lodge reviewed.' where subprocess_id=$1 and step_key='bank_approval_to_lodge_received'", [bondLane])
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond attorney reviewed the renewed bank approval and pack.' where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane])
await update('lodgement_ready', 'completed', 'I rechecked the renewed bond approval and transfer pack.')
await update('lodged_at_deeds_office', 'completed', 'Deeds Office accepted the lodgement.')
await update('lodged_at_deeds_office', 'blocked', 'Deeds Office rejected the lodged set; correct and relodge.')
await assert.rejects(update('registered', 'completed', 'Registration confirmed.'), /preceding lodgement/,
  'a Deeds Office rejection must prevent registration')
await update('lodged_at_deeds_office', 'completed', 'Corrected set relodged and accepted by the Deeds Office.')
const staleTax = structuredClone(revised)
staleTax.transferTaxDecision.sarsStatus = 'pending'
await db.query('update transactions set routing_profile_json=$1 where id=$2', [staleTax, matter])
await assert.rejects(update('registered', 'completed', 'Registration confirmed.'), /tax route and SARS proof/,
  'a stale SARS status cannot be recorded as registration')
await db.query('update transactions set routing_profile_json=$1 where id=$2', [revised, matter])
await db.query("update document_requirement_instances set expiry_date=now()-interval '1 day' where transaction_id=$1", [matter])
await assert.rejects(update('registered', 'completed', 'Registration confirmed.'), /rates_clearance_certificate/,
  'an expired lodgement document must be rechecked at registration')
await db.query("update document_requirement_instances set expiry_date=now()+interval '10 days' where transaction_id=$1", [matter])
await assert.rejects(update('registered', 'completed', 'Registration confirmed.'), /bond attorney must confirm lodged/,
  'transfer registration cannot precede the coordinated bond lodgement')
assert.equal((await db.query("select status from transaction_subprocess_steps where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane])).rows[0].status,
  'not_started', 'a changed tax profile withdraws unlodged bond readiness')
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond attorney rechecked the corrected matter profile.' where subprocess_id=$1 and step_key='bond_lodgement_ready'", [bondLane])
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond lodgement accepted by the Deeds Office.' where subprocess_id=$1 and step_key='bond_lodged'", [bondLane])
const expiredClearance = structuredClone(revised)
expiredClearance.mvpProfile.propertyConditions.clearances.municipal.validUntil = '2020-01-01'
await db.query('update transactions set routing_profile_json=$1 where id=$2', [expiredClearance, matter])
await assert.rejects(update('registered', 'completed', 'Registration confirmed.'), /current municipal clearance/,
  'a clearance fact that expires after lodgement must block registration')
await db.query('update transactions set routing_profile_json=$1 where id=$2', [revised, matter])
await update('registered', 'completed', 'Transfer registration confirmed after coordinated lodgement.')
assert.equal(await status('registered'), 'completed')
const afterLodgement = structuredClone(revised)
afterLodgement.matterProfile.factFingerprint = 'facts-c'
afterLodgement.workflowPlan.matterProfileFingerprint = 'facts-c'
await db.query('update transactions set routing_profile_json=$1 where id=$2', [afterLodgement, matter])
assert.equal(await status('lodgement_ready'), 'completed', 'a later correction cannot erase actual lodgement history')
assert.equal(await status('lodged_at_deeds_office'), 'completed')
await assert.rejects(update('post_registration_closeout_review', 'completed', 'Final account reviewed.'), /Review the final account/)
await db.query('insert into attorney_task_confirmations(step_id,task_confirmations) values ($1,$2)',
  [await taskId('post_registration_closeout_review'), { final_account_position_reviewed: { answer: 'yes', note: 'Proceeds and fees reconciled.' } }])
await update('post_registration_closeout_review', 'completed', 'Final account reconciled internally.')
await assert.rejects(db.query("update transaction_subprocess_steps set visibility_scope='client_visible' where subprocess_id=$1 and step_key='post_registration_closeout_review'", [transferLane]),
  /must remain internal/, 'financial close-out notes cannot leak to the client portal')
await assert.rejects(db.query("update transaction_subprocess_steps set visibility_scope='professional_shared' where subprocess_id=$1 and step_key='post_registration_closeout_review'", [transferLane]),
  /must remain internal/, 'financial close-out notes are firm-internal rather than cross-firm updates')
await assert.rejects(update('matter_closed', 'completed', 'File archived.'), /administrative file-closure checklist/)
await db.query('insert into attorney_task_confirmations(step_id,task_confirmations) values ($1,$2)',
  [await taskId('matter_closed'), { matter_closure_confirmed: { answer: 'yes', note: 'Archive checklist reviewed.' } }])
await db.query('update attorney_task_confirmations set task_confirmations=$1 where step_id=$2',
  [{}, await taskId('post_registration_closeout_review')])
await assert.rejects(update('matter_closed', 'completed', 'File archived.'), /final-account decision/,
  'a legacy completed financial task without a saved decision cannot authorize closure')
await db.query('update attorney_task_confirmations set task_confirmations=$1 where step_id=$2',
  [{ final_account_position_reviewed: { answer: 'yes', note: 'Proceeds and fees reconciled.' } }, await taskId('post_registration_closeout_review')])
await assert.rejects(update('matter_closed', 'completed', 'File archived.'), /registration-stage update/)
await db.query('insert into transaction_attorney_lane_updates values ($1,$2,$3,$4,$5,$6,now()-interval \'1 day\')',
  [matter, 'transfer', 'transfer_journey_progress', 'client_visible', ['buyer'], { journeyBrief: { stageKey: 'registration' } }])
await assert.rejects(update('matter_closed', 'completed', 'File archived.'), /registration-stage update/,
  'a pre-registration message is not proof of final communication')
await db.query('insert into transaction_attorney_lane_updates values ($1,$2,$3,$4,$5,$6,now())',
  [matter, 'transfer', 'transfer_journey_progress', 'client_visible', ['buyer'], { journeyBrief: { stageKey: 'registration' } }])
await assert.rejects(update('matter_closed', 'completed', 'File archived.'), /bond attorney close-out/)
await db.query("update transaction_subprocess_steps set status='completed', comment='Bond accounts and bank closure confirmed.' where subprocess_id=$1 and step_key='bond_close_out_complete'", [bondLane])
await update('matter_closed', 'completed', 'File archived after client registration update and linked close-out.')
assert.equal(await status('matter_closed'), 'completed')
await assert.rejects(update('post_registration_closeout_review', 'not_started', 'Final account needs correction.'), /Reopen matter closure first/,
  'a completed matter cannot silently retain closure while financial work is reopened')
await assert.rejects(update('registered', 'blocked', 'Registration disputed.'), /Reopen matter closure first/,
  'a completed matter cannot silently retain closure while registration is reopened')
await update('matter_closed', 'not_started', 'Reopened to correct an archive reference.')
assert.equal(await status('matter_closed'), 'not_started')
assert.equal(await status('registered'), 'completed', 'reopening preserves registered history')
await update('post_registration_closeout_review', 'not_started', 'Final account needs correction after closure was reopened.')
assert.equal(await status('post_registration_closeout_review'), 'not_started')
assert.ok((await db.query("select count(*)::int as count from transaction_attorney_lane_history where note like 'File archived after client registration%' ")).rows[0].count > 0,
  'reopening preserves the earlier completion audit row')
await db.close()
console.log('Attorney readiness gates passed: milestone outcomes, cross-lane handoff, reopening, and plan correction.')
