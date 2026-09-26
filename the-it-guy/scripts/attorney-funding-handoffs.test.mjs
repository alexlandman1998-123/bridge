import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
create role authenticated;
create role anon;
create schema journey_private;
create table journey_private.task_catalog (
  lane_key text, step_key text, definition jsonb, phase_key text,
  phase_label text, phase_order integer, task_order integer,
  primary key(lane_key,step_key));
create table transactions(id uuid primary key, routing_profile_json jsonb, lifecycle_state text);
create table transaction_subprocesses(id uuid primary key, transaction_id uuid, process_type text);
create table transaction_subprocess_steps(
  id uuid default gen_random_uuid(), subprocess_id uuid, step_key text, step_label text,
  status text, comment text, owner_type text, sort_order integer, visibility_scope text,
  completed_at timestamptz, completed_by uuid, updated_at timestamptz,
  primary key(id), unique(subprocess_id,step_key));
create table document_requirement_instances(
  transaction_id uuid, document_definition_key text, status text, expiry_date timestamptz);
create function journey_private.withdraw_unlodged_attorney_readiness(
  p_matter uuid, p_reason text, p_lane text)
returns void language plpgsql as $$
begin
  update public.transaction_subprocess_steps step set status='not_started'
  from public.transaction_subprocesses lane
  where step.subprocess_id=lane.id and lane.transaction_id=p_matter
    and (p_lane is null or lane.process_type=p_lane
      or (p_lane in ('bond','cancellation') and lane.process_type='transfer'))
    and step.step_key=case lane.process_type
      when 'transfer' then 'lodgement_ready'
      when 'bond' then 'bond_lodgement_ready'
      else 'cancellation_lodgement_ready' end
    and step.status='completed';
end;
$$;
`)

const ids = {
  cash: '00000000-0000-0000-0000-000000000101',
  cashTransfer: '00000000-0000-0000-0000-000000000102',
  bonded: '00000000-0000-0000-0000-000000000201',
  bondedTransfer: '00000000-0000-0000-0000-000000000202',
  bond: '00000000-0000-0000-0000-000000000203',
  cancellation: '00000000-0000-0000-0000-000000000204',
}
const oldPlan = (financeType, lanes) => ({
  version: 'attorney_matter_workflow_plan_v11', status: 'active',
  configuration: { financeType }, lanes: lanes.map(([laneKey, stepKeys]) => ({ laneKey, stepKeys, taskCount: stepKeys.length })),
})
const bondKeys = [
  'bond_instruction_received', 'bank_requirements_confirmed', 'bank_conditions_resolved',
  'buyer_signed_bond_documents', 'guarantees_issued', 'guarantee_wording_accepted',
  'bond_lodgement_ready', 'bond_lodged',
]
const cancellationKeys = [
  'cancellation_existing_bond_confirmed', 'cancellation_bank_captured',
  'cancellation_bond_account_captured', 'cancellation_instruction_received',
  'notice_period_captured', 'cancellation_figures_received', 'figures_expiry_captured',
  'cancellation_guarantees_accepted', 'cancellation_documents_prepared',
  'cancellation_lodgement_ready', 'cancellation_lodged',
]
const cashPlan = oldPlan('cash', [['transfer', ['payment_security_review', 'lodgement_ready', 'lodged_at_deeds_office']]])
const bondedPlan = oldPlan('bond', [
  ['transfer', ['payment_security_review', 'lodgement_ready', 'lodged_at_deeds_office']],
  ['bond', bondKeys], ['cancellation', cancellationKeys],
])
await db.query('insert into transactions values ($1,$2,$3),($4,$5,$3)', [
  ids.cash, { financeType: 'cash', sellerHasExistingBond: false, workflowPlan: cashPlan }, 'active',
  ids.bonded, { financeType: 'bond', sellerHasExistingBond: true, workflowPlan: bondedPlan },
])
for (const [laneId, matterId, laneKey] of [
  [ids.cashTransfer, ids.cash, 'transfer'], [ids.bondedTransfer, ids.bonded, 'transfer'],
  [ids.bond, ids.bonded, 'bond'], [ids.cancellation, ids.bonded, 'cancellation'],
]) await db.query('insert into transaction_subprocesses values ($1,$2,$3)', [laneId, matterId, laneKey])
for (const [laneId, keys] of [
  [ids.cashTransfer, cashPlan.lanes[0].stepKeys],
  [ids.bondedTransfer, bondedPlan.lanes[0].stepKeys],
  [ids.bond, bondKeys], [ids.cancellation, cancellationKeys],
]) for (const [index, key] of keys.entries()) await db.query(
  'insert into transaction_subprocess_steps(subprocess_id,step_key,status,sort_order) values ($1,$2,$3,$4)',
  [laneId, key, 'not_started', index + 1],
)

await db.exec(readFileSync(new URL('../../supabase/migrations/20260926140934_attorney_phase3_funding_handoffs.sql', import.meta.url), 'utf8'))
const planFor = async matter => (await db.query('select routing_profile_json from transactions where id=$1', [matter])).rows[0].routing_profile_json.workflowPlan
const status = async (lane, key) => (await db.query(
  'select status from transaction_subprocess_steps where subprocess_id=$1 and step_key=$2', [lane, key],
)).rows[0]?.status
const complete = async (lane, key, note = 'Attorney reviewed the linked evidence.') => db.query(
  "update transaction_subprocess_steps set status='completed', comment=$3 where subprocess_id=$1 and step_key=$2",
  [lane, key, note],
)
const cashUpdated = await planFor(ids.cash)
assert.equal(cashUpdated.version, 'attorney_matter_workflow_plan_v12')
assert.deepEqual(cashUpdated.lanes.map(lane => lane.laneKey), ['transfer'])
assert.deepEqual(cashUpdated.lanes[0].stepKeys.slice(0, 2), ['cash_funding_source_review', 'payment_security_review'])
assert.equal(await status(ids.cashTransfer, 'cash_funding_source_review'), 'not_started')
await assert.rejects(complete(ids.cashTransfer, 'cash_funding_source_review', ''), /recorded decision/)
await complete(ids.cashTransfer, 'cash_funding_source_review')
await complete(ids.cashTransfer, 'payment_security_review')
await assert.rejects(complete(ids.cashTransfer, 'lodgement_ready'), /source-of-funds evidence/)
await db.query('insert into document_requirement_instances values ($1,$2,$3,$4)',
  [ids.cash, 'proof_of_funds', 'approved', null])
await complete(ids.cashTransfer, 'lodgement_ready')
await db.query("update transactions set routing_profile_json=jsonb_set(routing_profile_json,'{financeType}', '\"bond\"'::jsonb) where id=$1", [ids.cash])
assert.equal(await status(ids.cashTransfer, 'payment_security_review'), 'not_started',
  'a finance correction reopens the old payment decision')
assert.equal(await status(ids.cashTransfer, 'cash_funding_source_review'), 'not_started',
  'a finance correction reopens the cash source decision for review')

const bondedUpdated = await planFor(ids.bonded)
assert.deepEqual(bondedUpdated.lanes.map(lane => lane.laneKey), ['transfer', 'bond', 'cancellation'])
for (const key of ['bond_lodgement_instructions_confirmed'])
  assert.equal(await status(ids.bond, key), 'not_started')
for (const key of ['cancellation_guarantee_allocation_review', 'cancellation_consent_confirmed', 'cancellation_simultaneous_lodgement_confirmed'])
  assert.equal(await status(ids.cancellation, key), 'not_started')
await complete(ids.bondedTransfer, 'payment_security_review')
await assert.rejects(complete(ids.bondedTransfer, 'lodgement_ready'), /bond attorney/)
for (const key of bondKeys.filter(key => !key.endsWith('_ready') && key !== 'bond_lodged')) await complete(ids.bond, key)
await assert.rejects(complete(ids.bond, 'bond_lodgement_ready'), /bond_lodgement_instructions_confirmed/)
await complete(ids.bond, 'bond_lodgement_instructions_confirmed')
await assert.rejects(complete(ids.bond, 'bond_lodgement_ready'), /Approved current bond guarantees/)
await db.query('insert into document_requirement_instances values ($1,$2,$3,$4)',
  [ids.bonded, 'guarantees', 'approved', null])
await complete(ids.bond, 'bond_lodgement_ready')
assert.equal(await status(ids.bond, 'bond_lodgement_ready'), 'completed')
for (const key of cancellationKeys.filter(key => !['cancellation_lodgement_ready', 'cancellation_lodged'].includes(key)))
  await complete(ids.cancellation, key)
for (const key of ['cancellation_guarantee_allocation_review', 'cancellation_consent_confirmed', 'cancellation_simultaneous_lodgement_confirmed'])
  await complete(ids.cancellation, key)
await assert.rejects(complete(ids.cancellation, 'cancellation_lodgement_ready'), /Current approved cancellation figures/)
await db.query('insert into document_requirement_instances values ($1,$2,$3,now()-interval \'1 day\')',
  [ids.bonded, 'bond_cancellation_figures', 'approved'])
await assert.rejects(complete(ids.cancellation, 'cancellation_lodgement_ready'), /Current approved cancellation figures/)
await db.query("update document_requirement_instances set expiry_date=now()+interval '10 days' where transaction_id=$1 and document_definition_key='bond_cancellation_figures'",
  [ids.bonded])
await complete(ids.cancellation, 'cancellation_lodgement_ready')
assert.equal(await status(ids.bond, 'bond_lodgement_ready'), 'completed', 'figure updates leave the buyer bond attestation intact')
await complete(ids.bondedTransfer, 'lodgement_ready')
await db.query("update document_requirement_instances set expiry_date=now()-interval '1 day' where transaction_id=$1 and document_definition_key='bond_cancellation_figures'",
  [ids.bonded])
assert.equal(await status(ids.cancellation, 'cancellation_lodgement_ready'), 'not_started',
  'changed figures withdraw cancellation readiness')
assert.equal(await status(ids.bondedTransfer, 'lodgement_ready'), 'not_started',
  'changed figures withdraw transfer readiness')
await assert.rejects(complete(ids.bondedTransfer, 'lodged_at_deeds_office'), /cancellation attorney must hand over/)

await db.close()
console.log('Attorney funding handoff gates passed: cash source, linked lanes, consent, guarantees and figures expiry.')
