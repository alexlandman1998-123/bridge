import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agreementConditionIssues, securityAccountIssues, withholdingRemittanceIssues, sellerWithholdingReviewIssues, validReviewDate } from '../src/services/attorneyWorkflow/conveyancingReviewPolicy.js'
import { normalizeAttorneyWorkflowWorkPacket } from '../src/constants/attorneyWorkflowUsability.js'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'

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
// Phase 4 MVP corrections exercise the deployed guard definitions in the
// same local database, including the earlier readiness and closure triggers.
await db.exec(`
alter table journey_private.task_catalog add column phase_key text, add column phase_label text, add column phase_order integer, add column task_order integer;
alter table document_requirement_instances add column satisfied_by_document_id uuid;
create table document_requirement_rules(document_definition_key text,context_type text,condition_json jsonb);
insert into document_requirement_rules values ('electrical_compliance_certificate','transaction','{}');
`)
const taxSource = readFileSync(new URL('../../supabase/migrations/20260926142602_attorney_phase4_tax_clearance_conditions.sql', import.meta.url), 'utf8')
const helperStart = taxSource.indexOf('create function journey_private.phase4_required_transfer_steps')
await db.exec(taxSource.slice(helperStart, taxSource.indexOf('$$;', helperStart) + 3))
await db.exec(readFileSync(new URL('../../supabase/migrations/20261003185915_attorney_conveyancing_review_corrections.sql', import.meta.url), 'utf8'))
await db.exec(`create trigger corrections_tax_check before update of status,comment on transaction_subprocess_steps for each row execute function journey_private.enforce_attorney_phase4_tax_clearances();
create trigger corrections_current_check before update of status,comment on transaction_subprocess_steps for each row execute function journey_private.enforce_stage_five_current_evidence();`)
const dates = (await db.query(`select (now() at time zone 'Africa/Johannesburg')::date::text as today,
  ((now() at time zone 'Africa/Johannesburg')::date + 7)::text as future,
  ((now() at time zone 'Africa/Johannesburg')::date - 1)::text as yesterday,
  ((now() at time zone 'Africa/Johannesburg')::date + 29)::text as late`)).rows[0]
const correctionMatter = '00000000-0000-0000-0000-000000000701'
const correctionTransfer = '00000000-0000-0000-0000-000000000702'
const correctionCancellation = '00000000-0000-0000-0000-000000000703'
const correctionBond = '00000000-0000-0000-0000-000000000704'
const correctionProfile = {
  financeType: 'bond', propertyTenure: 'freehold', hoaApplicable: 'no', sellerHasExistingBond: true,
  matterProfile: { status: 'confirmed', revision: 1, factFingerprint: 'corrections' },
  scenarioProfile: { parties: [{ id: 'buyer:1', role: 'buyer', taxResidence: 'south_africa' },
    { id: 'seller:1', role: 'seller', taxResidence: 'outside_south_africa' }] },
  transferTaxDecision: { route: 'transfer_duty', status: 'confirmed', dutyPaymentRequired: 'no', tdc01Reference: 'TDC-1',
    sarsStatus: 'receipted', sarsProofReference: 'SARS-1', basisNote: 'Duty reviewed',
    nonResidentSellers: { 'seller:1': { applicable: 'yes', directiveStatus: 'not_required', withholdingRequired: 'yes',
      proofReference: 'NR02', basisNote: 'Seller-specific review', remittanceStatus: 'planned',
      reservedFundsReference: 'Trust reserve', remittanceOwner: 'Conveyancer', paymentEvent: 'Proceeds payment subject to directive', dueOn: dates.future } } },
  mvpProfile: { sellerExistingBond: true, propertyConditions: { titleRestrictions: 'no', complianceCertificates: 'no',
    certificates: { electrical: 'no' }, electricalBasisNote: 'Vacant land inspected; no electrical installation',
    clearances: { municipal: { issuer: 'Municipality', reference: 'Rates-1', validUntil: dates.future } } } },
  workflowPlan: { version: 'attorney_matter_workflow_plan_v14', status: 'active', provisional: false,
    matterProfileRevision: 1, matterProfileFingerprint: 'corrections', lanes: [
      { laneKey: 'transfer', stepKeys: ['otp_source_docs_checked','buyer_fica_review','seller_fica_review','transfer_tax_route_confirmed',
        'transfer_duty_tdc01_submission','non_resident_seller_applicability_review','non_resident_seller_withholding_payment_review',
        'sars_transfer_tax_receipt_verified','municipal_rates_clearance_review','property_conditions_applicability_review',
        'lodgement_ready','lodged_at_deeds_office','registered','post_registration_closeout_review','matter_closed'] },
      { laneKey: 'cancellation', stepKeys: ['cancellation_figures_received','figures_expiry_captured','cancellation_guarantees_accepted',
        'cancellation_guarantee_allocation_review','seller_cancellation_documents_signed','cancellation_consent_confirmed',
        'cancellation_lodgement_ready','cancellation_lodged','cancellation_registered','settlement_proof_captured','cancellation_close_out_complete'] },
      { laneKey:'bond',stepKeys:['bond_approval_letter_received','buyer_signed_bond_documents','bank_approval_to_lodge_received','guarantee_wording_accepted',
        'bond_lodgement_ready','bond_lodged','bond_registered','bond_close_out_complete'] },
    ] },
}
await db.query('insert into transactions(id,routing_profile_json,lifecycle_state) values ($1,$2,$3)',[correctionMatter,correctionProfile,'active'])
await db.query('insert into transaction_attorney_assignments(transaction_id,assigned_user_id,status) values ($1,$2,$3)',[correctionMatter,actor,'active'])
for (const [id,lane] of [[correctionTransfer,'transfer'],[correctionCancellation,'cancellation'],[correctionBond,'bond']]) {
  await db.query('insert into transaction_subprocesses(id,transaction_id,process_type,status) values ($1,$2,$3,$4)',[id,correctionMatter,lane,'in_progress'])
  for (const [i,key] of correctionProfile.workflowPlan.lanes.find(l=>l.laneKey===lane).stepKeys.entries()) {
    await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,comment,visibility_scope,sort_order) values (gen_random_uuid(),$1,$2,$3,$4,$5,$6)',
      [id,key,'not_started','Initial record',['post_registration_closeout_review','buyer_fica_review','seller_fica_review'].includes(key)?'internal':'professional_shared',i])
  }
}
const correctionUpdate = (lane,key,status='completed') => db.query("update transaction_subprocess_steps set status=$3,comment='Current evidence reviewed',completed_at=now() where subprocess_id=$1 and step_key=$2",[lane,key,status])
const correctionAnswer = async (lane,key,answers) => {
  const id = (await db.query('select id from transaction_subprocess_steps where subprocess_id=$1 and step_key=$2',[lane,key])).rows[0].id
  return db.query('insert into attorney_task_confirmations(step_id,task_confirmations) values ($1,$2) on conflict(step_id) do update set task_confirmations=excluded.task_confirmations',[id,answers])
}
const signature = { seller_signature_applicability: { answer: 'no', note: 'Bank instrument requires bondholder consent only' } }
const securityRow = { id:'security-1',bondReference:'B123',property:'Erf 1',lender:'Bank A',account:'Account 1',owner:'Cancellation attorney',
  disposition:'cancellation',instrumentReference:'Instruction-1',figuresReference:'Figures-1',validUntil:dates.future,consentReference:'Consent-1',
  settlementAmount:'100.00',allocatedAmount:'100.00',allocationReference:'Guarantee-1' }
const securityRows = [securityRow,{...securityRow,id:'security-2',account:'Account 2',settlementAmount:'0.00',allocatedAmount:'0.00',allocationReference:'Paid up; registered security remains'},
  {...securityRow,id:'security-3',bondReference:'B456',lender:'Bank B',account:'Account 3'}]
const securityResponse = rows => ({ registered_securities_review:{answer:'yes',items:rows} })
assert.deepEqual(securityAccountIssues(securityResponse(securityRows).registered_securities_review),[])
assert.deepEqual(withholdingRemittanceIssues(correctionProfile.transferTaxDecision.nonResidentSellers['seller:1']),[])
assert.ok(sellerWithholdingReviewIssues({}, { closing:true }).length)
assert.equal(validReviewDate('2026-02-30'),false)
assert.deepEqual(agreementConditionIssues({answer:'yes',items:[{description:'Consent obtained',kind:'other',owner:'Attorney',status:'fulfilled',evidenceReference:'Consent file',basisNote:'No fixed deadline in agreement'}]}),[])
assert.ok(agreementConditionIssues({answer:'yes',items:[{description:'Suspensive condition',kind:'suspensive',owner:'Buyer',status:'secured',deadline:dates.future,evidenceReference:'Letter',basisNote:'Funding reserved'}]}).length,'security alone cannot fulfil a suspensive condition')
assert.deepEqual(normalizeAttorneyWorkflowWorkPacket({taskConfirmations:securityResponse(securityRows)}).taskConfirmations.registered_securities_review.items,securityRows,'rows survive the real workflow command normalizer')
for (const [key,registerId] of [['otp_source_docs_checked','agreement_conditions_review'],['cancellation_guarantee_allocation_review','registered_securities_review'],['settlement_proof_captured','security_settlement_review'],['matter_closed','registration_communication_review']]) {
  const model=buildLegalTaskWorkbenchModel({task:{key,label:key,operationalContract:{lane:key.startsWith('cancellation')||key.startsWith('settlement')?'cancellation':'transfer'}}})
  assert.ok(model.confirmationRows.find(row=>row.id===registerId)?.register,'the actual workbench exposes the persisted record')
}
const rmcpModel=buildLegalTaskWorkbenchModel({task:{key:'buyer_fica_review',label:'Buyer FICA',operationalContract:{lane:'transfer'},stageTwoParties:[{partyId:'buyer:1',partyName:'Buyer'}]}})
assert.deepEqual(rmcpModel.confirmationRows.find(row=>row.id==='rmcp_review:buyer:1').answers,['yes','no'])
assert.equal(Boolean(rmcpModel.confirmationRows.find(row=>row.id==='rmcp_review:buyer:1').authoritative),false,'the attorney can record the risk review; a party-fact row cannot silently replace it')
for(const key of correctionProfile.workflowPlan.lanes[1].stepKeys.slice(0,6)) await correctionUpdate(correctionCancellation,key,
  key==='seller_cancellation_documents_signed'?'not_applicable':'completed')
await correctionAnswer(correctionCancellation,'seller_cancellation_documents_signed',signature)
await assert.rejects(correctionUpdate(correctionCancellation,'cancellation_lodgement_ready'),/every registered security/)
await correctionAnswer(correctionCancellation,'cancellation_guarantee_allocation_review',securityResponse(securityRows))
await correctionUpdate(correctionCancellation,'cancellation_lodgement_ready')
await correctionAnswer(correctionCancellation,'seller_cancellation_documents_signed',{seller_signature_applicability:{answer:'yes',note:'Bank now requires seller signature'}})
assert.equal((await db.query("select status from transaction_subprocess_steps where subprocess_id=$1 and step_key='cancellation_lodgement_ready'",[correctionCancellation])).rows[0].status,'not_started','changed applicability withdraws readiness')
await assert.rejects(correctionUpdate(correctionCancellation,'cancellation_lodgement_ready'),/seller signature applicability/)
await correctionAnswer(correctionCancellation,'seller_cancellation_documents_signed',signature)
await correctionUpdate(correctionCancellation,'cancellation_consent_confirmed','not_applicable')
await assert.rejects(correctionUpdate(correctionCancellation,'cancellation_lodgement_ready'),/cancellation_consent_confirmed/)
await correctionUpdate(correctionCancellation,'cancellation_consent_confirmed')
for(const [rows,message] of [[[{...securityRow,validUntil:dates.today}],/expired/],[[{...securityRow,allocatedAmount:'99.00'}],/shortfall/],[[{...securityRow,disposition:'specialist_hold'}],/specialist/],[[securityRow,securityRow],/Duplicate/],[[{...securityRow,settlementAmount:'-1'}],/non-negative/]]) {
  assert.ok(securityAccountIssues(securityResponse(rows).registered_securities_review).length,'the screen and SQL reject the same incomplete security record')
  await correctionAnswer(correctionCancellation,'cancellation_guarantee_allocation_review',securityResponse(rows))
  await assert.rejects(correctionUpdate(correctionCancellation,'cancellation_lodgement_ready'),message)
}
await correctionAnswer(correctionCancellation,'cancellation_guarantee_allocation_review',securityResponse(securityRows))
await correctionUpdate(correctionCancellation,'cancellation_lodgement_ready')

await assert.rejects(correctionUpdate(correctionBond,'bond_close_out_complete'),/lane registration/)
for(const key of correctionProfile.workflowPlan.lanes[2].stepKeys.slice(0,5)) await correctionUpdate(correctionBond,key)
for(const key of correctionProfile.workflowPlan.lanes[0].stepKeys.slice(0,10)) await correctionUpdate(correctionTransfer,key)
await db.query('insert into document_requirement_instances(id,transaction_id,document_definition_key,status,requirement_level,stage_gates,expiry_date) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6)',[correctionMatter,'rates_clearance_certificate','approved','required',['lodgement_ready'],dates.future])
await db.query('insert into document_requirement_instances(id,transaction_id,document_definition_key,status,requirement_level,stage_gates) values(gen_random_uuid(),$1,$2,$3,$4,$5)',[correctionMatter,'electrical_compliance_certificate','pending','blocker',['lodgement_ready']])
await assert.rejects(correctionUpdate(correctionTransfer,'lodgement_ready'),/agreement conditions/)
await correctionAnswer(correctionTransfer,'otp_source_docs_checked',{agreement_conditions_review:{answer:'yes',items:[{description:'Finance condition',kind:'suspensive',deadline:dates.future,owner:'Buyer',status:'extended',evidenceReference:'Amendment',basisNote:'Extended'}]}})
await assert.rejects(correctionUpdate(correctionTransfer,'lodgement_ready'),/extension alone/)
await correctionAnswer(correctionTransfer,'otp_source_docs_checked',{agreement_conditions_review:{answer:'not_applicable',note:'Current unconditional sale; no outstanding conditions'}})
await assert.rejects(correctionUpdate(correctionTransfer,'lodgement_ready'),/RMCP/)
await correctionAnswer(correctionTransfer,'buyer_fica_review',{'rmcp_review:buyer:1':{answer:'yes',note:'Internal compliance reference buyer-1'}})
await correctionAnswer(correctionTransfer,'seller_fica_review',{'rmcp_review:seller:1':{answer:'yes',note:'Internal compliance reference seller-1'}})
await correctionUpdate(correctionTransfer,'lodgement_ready')
// Unpaid planned withholding is permitted, but cannot bypass its owner,
// reserve, due date or final-account remittance proof.
await assert.rejects(db.query('select journey_private.assert_attorney_withholding_remittance($1,true)',[correctionProfile.transferTaxDecision.nonResidentSellers['seller:1']]),/payment proof/)
for(const changed of [{dueOn:dates.today},{remittanceOwner:''},{reservedFundsReference:''},{remittanceStatus:'unknown'},
  {remittanceStatus:'withheld',withheldOn:dates.today,purchaserResidence:'resident',dueOn:dates.late}]) {
  await assert.rejects(db.query('select journey_private.assert_attorney_withholding_remittance($1,false)',[{...correctionProfile.transferTaxDecision.nonResidentSellers['seller:1'],...changed}]))
}
await db.query('select journey_private.assert_attorney_withholding_remittance($1,false)',[{...correctionProfile.transferTaxDecision.nonResidentSellers['seller:1'],remittanceStatus:'withheld',withheldOn:dates.today,purchaserResidence:'non_resident'}])
await db.query('select journey_private.assert_attorney_withholding_remittance($1,true)',[{applicable:'yes',withholdingRequired:'yes',paymentReference:'Paid SARS proof'}])
// Canonical no-installation review still needs the task. Unknown cannot waive it.
await correctionUpdate(correctionTransfer,'property_conditions_applicability_review','not_started')
await assert.rejects(correctionUpdate(correctionTransfer,'lodgement_ready'),/electrical|property_conditions_applicability/)
await correctionUpdate(correctionTransfer,'property_conditions_applicability_review')
const electricalChanged=structuredClone(correctionProfile);electricalChanged.mvpProfile.propertyConditions.certificates.electrical='yes'
await db.query('update transactions set routing_profile_json=$2 where id=$1',[correctionMatter,electricalChanged])
await assert.rejects(correctionUpdate(correctionTransfer,'lodgement_ready'),/electrical/)
await db.query('update transactions set routing_profile_json=$2 where id=$1',[correctionMatter,correctionProfile])
await correctionUpdate(correctionTransfer,'lodgement_ready')
// Agreement replacement withdraws readiness and reopens substantive review.
await db.query('insert into document_requirement_instances(id,transaction_id,document_definition_key,status,requirement_level,stage_gates) values(gen_random_uuid(),$1,$2,$3,$4,$5)',[correctionMatter,'signed_otp','approved','required',['attorney_instruction_ready']])
await db.query("update document_requirement_instances set satisfied_by_document_id=gen_random_uuid() where transaction_id=$1 and document_definition_key='signed_otp'",[correctionMatter])
await assert.rejects(correctionUpdate(correctionTransfer,'lodgement_ready'),/otp_source_docs_checked/)
await correctionUpdate(correctionTransfer,'otp_source_docs_checked')
await correctionUpdate(correctionTransfer,'lodgement_ready')
await correctionUpdate(correctionBond,'bond_lodged')
await correctionUpdate(correctionCancellation,'cancellation_lodged')
await correctionUpdate(correctionTransfer,'lodged_at_deeds_office')
await correctionUpdate(correctionBond,'bond_registered')
await correctionUpdate(correctionBond,'bond_close_out_complete')
await correctionUpdate(correctionCancellation,'cancellation_registered')
await correctionUpdate(correctionTransfer,'registered')
await assert.rejects(correctionUpdate(correctionCancellation,'cancellation_close_out_complete'),/settlement review/)
await correctionUpdate(correctionCancellation,'settlement_proof_captured')
await assert.rejects(correctionUpdate(correctionCancellation,'cancellation_close_out_complete'),/each security account/)
await correctionAnswer(correctionCancellation,'settlement_proof_captured',{security_settlement_review:{answer:'yes',items:securityRows.slice(0,2).map(row=>({...row,registrationReference:'Deeds-1',settlementReference:'Bank payment / zero account verified'}))}})
await assert.rejects(correctionUpdate(correctionCancellation,'cancellation_close_out_complete'),/each security account/)
await correctionAnswer(correctionCancellation,'settlement_proof_captured',{security_settlement_review:{answer:'yes',items:securityRows.map(row=>({...row,registrationReference:'Deeds-1',settlementReference:'Bank payment / zero account verified'}))}})
await correctionUpdate(correctionCancellation,'cancellation_close_out_complete')
await correctionAnswer(correctionTransfer,'post_registration_closeout_review',{final_account_position_reviewed:{answer:'yes',note:'Trust account reconciled'}})
await assert.rejects(correctionUpdate(correctionTransfer,'post_registration_closeout_review'),/remittance payment proof/)
const paid=structuredClone(correctionProfile);paid.transferTaxDecision.nonResidentSellers['seller:1'].paymentReference='SARS payment proof'
await db.query('update transactions set routing_profile_json=$2 where id=$1',[correctionMatter,paid])
await correctionUpdate(correctionTransfer,'post_registration_closeout_review')
const communication={channel:'email',sentOn:dates.today,audience:'buyer',recipients:'Buyer',reference:'Sent mail record'}
await correctionAnswer(correctionTransfer,'matter_closed',{matter_closure_confirmed:{answer:'yes'},registration_communication_review:{answer:'yes',items:[communication]}})
await assert.rejects(correctionUpdate(correctionTransfer,'matter_closed'),/all appropriate/)
await correctionAnswer(correctionTransfer,'matter_closed',{matter_closure_confirmed:{answer:'yes'},registration_communication_review:{answer:'yes',items:[{...communication,audience:'both',recipients:'Buyer and all seller representatives'}]}})
await correctionUpdate(correctionTransfer,'matter_closed')
assert.equal((await db.query("select status from transaction_subprocess_steps where subprocess_id=$1 and step_key='matter_closed'",[correctionTransfer])).rows[0].status,'completed','external communication closes the actual lane without sending messages')
const changedParty=structuredClone(paid);changedParty.scenarioProfile.parties[0].taxResidence='outside_south_africa'
await assert.rejects(db.query('update transactions set routing_profile_json=$2 where id=$1',[correctionMatter,changedParty]),/Reopen matter closure/)
await assert.rejects(db.query("update document_requirement_instances set satisfied_by_document_id=gen_random_uuid() where transaction_id=$1 and document_definition_key='signed_otp'",[correctionMatter]),/Reopen matter closure/)
await correctionUpdate(correctionTransfer,'matter_closed','not_started')
await db.query('update transactions set routing_profile_json=$2 where id=$1',[correctionMatter,changedParty])
assert.equal((await db.query("select status from transaction_subprocess_steps where subprocess_id=$1 and step_key='buyer_fica_review'",[correctionTransfer])).rows[0].status,'not_started')
assert.equal((await db.query("select task_confirmations from attorney_task_confirmations c join transaction_subprocess_steps s on s.id=c.step_id where s.subprocess_id=$1 and s.step_key='buyer_fica_review'",[correctionTransfer])).rows[0].task_confirmations['rmcp_review:buyer:1'],undefined,'old RMCP approval cannot survive material party changes')
await assert.rejects(db.query('select journey_private.assert_attorney_seller_withholding_review($1,false)',[{}]),/current seller-specific/)
await assert.rejects(db.query("update transaction_subprocess_steps set visibility_scope='client_visible' where subprocess_id=$1 and step_key='buyer_fica_review'",[correctionTransfer]),/internal to the attorney firm/)
assert.equal((await db.query("select condition_json from document_requirement_rules where document_definition_key='electrical_compliance_certificate'")).rows[0].condition_json.all[1].fact,'compliance.electrical_not_applicable')
await assert.rejects(db.exec(`set role anon; select journey_private.assert_conveyancing_review('${correctionMatter}','transfer','lodgement_ready')`),/permission denied/)
await db.exec('reset role')
await db.close()
console.log('Attorney readiness gates passed: milestone outcomes, cross-lane handoff, reopening, and plan correction.')
