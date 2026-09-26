import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { PHASE4_TAX_TASKS, PHASE4_PROPERTY_TASKS } from '../src/services/attorneyWorkflow/transferPhase4Policy.js'

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
create function journey_private.withdraw_unlodged_attorney_readiness(uuid,text,text)
returns void language plpgsql as $$ begin null; end; $$;
create function journey_private.enforce_attorney_funding_handoffs()
returns trigger language plpgsql as $$
declare v_plan jsonb;
begin
  if v_plan ->> 'version' is distinct from 'attorney_matter_workflow_plan_v12' then
    raise exception 'Old plan';
  end if;
  return new;
end; $$;
`)

const matter = '00000000-0000-0000-0000-000000000401'
const lane = '00000000-0000-0000-0000-000000000402'
const plan = {
  version: 'attorney_matter_workflow_plan_v12', status: 'active',
  lanes: [{ laneKey: 'transfer', stepKeys: [
    'title_deed_checked', 'transfer_tax_route_confirmed', 'vat_exemption_evidence_verified',
    'sars_transfer_tax_receipt_verified', 'municipal_rates_clearance_review',
    'levy_hoa_clearance_review', 'property_compliance_review',
    'transfer_document_pack_review', 'lodgement_ready', 'lodged_at_deeds_office',
  ], taskCount: 10 }],
}
const profile = {
  workflowPlan: plan, propertyTenure: 'sectional_title', hoaApplicable: 'no',
  transferTaxDecision: { route: 'vat', status: 'confirmed', sarsStatus: 'receipted', sellerVatRegistered: 'yes',
    supplyInCourseOfEnterprise: 'yes', sellerVatNumberReference: 'VAT file',
    basisNote: 'Taxable enterprise supply', sarsProofReference: 'SARS VAT exemption receipt' },
  scenarioProfile: { parties: [{ id: 'seller:1', role: 'seller', taxResidence: 'south_africa', representatives: [] }] },
  mvpProfile: { propertyConditions: { titleRestrictions: 'no', complianceCertificates: 'no',
    clearances: { municipal: { issuer: 'Municipality', validUntil: '2030-01-01' },
      bodyCorporate: { issuer: 'Body corporate', validUntil: '2030-01-01' } } } },
}
await db.query('insert into transactions values ($1,$2,$3)', [matter, profile, 'active'])
await db.query('insert into transaction_subprocesses values ($1,$2,$3)', [lane, matter, 'transfer'])
for (const [index, step] of plan.lanes[0].stepKeys.entries()) await db.query(
  'insert into transaction_subprocess_steps(subprocess_id,step_key,status,sort_order) values ($1,$2,$3,$4)',
  [lane, step, 'not_started', index + 1],
)

await db.exec(readFileSync(new URL('../../supabase/migrations/20260926142602_attorney_phase4_tax_clearance_conditions.sql', import.meta.url), 'utf8'))
const updated = (await db.query('select routing_profile_json from transactions where id=$1', [matter])).rows[0].routing_profile_json
assert.equal(updated.workflowPlan.version, 'attorney_matter_workflow_plan_v13')
const steps = updated.workflowPlan.lanes[0].stepKeys
assert.ok(steps.includes('ordinary_vat_basis_verified'))
assert.ok(steps.includes('body_corporate_levy_clearance_review'))
assert.ok(!steps.includes('vat_exemption_evidence_verified'))
assert.ok(!steps.includes('levy_hoa_clearance_review'))
assert.equal((await db.query('select status from transaction_subprocess_steps where subprocess_id=$1 and step_key=$2', [lane, 'ordinary_vat_basis_verified'])).rows[0].status, 'not_started')
assert.equal((await db.query('select status from transaction_subprocess_steps where subprocess_id=$1 and step_key=$2', [lane, 'vat_exemption_evidence_verified'])).rows[0].status, 'not_started', 'historical row retained')

for (const [route, tenure, hoa, mixedSellers] of [
  ['transfer_duty','freehold','no',false], ['vat','sectional_title','yes',false],
  ['zero_rated_going_concern','estate_hoa','yes',false], ['exempt','freehold','no',false],
  ['transfer_duty','sectional_title','yes',true],
]) {
  const candidate = { ...profile, propertyTenure: tenure, hoaApplicable: hoa,
    transferTaxDecision: { ...profile.transferTaxDecision, route,
      nonResidentSellers: mixedSellers ? { 'seller:2': { applicable: 'yes', directiveStatus: 'issued',
        withholdingRequired: 'yes' } } : {} },
    scenarioProfile: mixedSellers ? { parties: [...profile.scenarioProfile.parties,
      { id: 'seller:2', role: 'seller', entityType: 'company', taxResidence: 'outside_south_africa', representatives: [] }] } : profile.scenarioProfile,
    mvpProfile: { propertyConditions: { titleRestrictions: 'yes', complianceCertificates: 'yes' } } }
  const fromSql = (await db.query('select journey_private.phase4_required_transfer_steps($1::jsonb) as steps', [candidate])).rows[0].steps
  const fromPlan = buildMatterWorkflowPlan({ routingProfile: candidate }).lanes[0].stepKeys
    .filter((key) => PHASE4_TAX_TASKS.includes(key) || PHASE4_PROPERTY_TASKS.includes(key))
  assert.deepEqual(fromSql, fromPlan, `${route}/${tenure} SQL and application applicability must agree`)
}

const complete = (step, comment = 'Reviewed supporting evidence.') => db.query(
  "update transaction_subprocess_steps set status='completed', comment=$3 where subprocess_id=$1 and step_key=$2",
  [lane, step, comment],
)
await assert.rejects(complete('ordinary_vat_basis_verified', ''), /Attorney-reviewed evidence/)
for (const step of steps.filter((item) => !['lodgement_ready','lodged_at_deeds_office'].includes(item))) await complete(step)
await assert.rejects(complete('lodgement_ready'), /clearance certificate/)
for (const key of ['rates_clearance_certificate','levy_clearance_certificate']) await db.query(
  'insert into document_requirement_instances values ($1,$2,$3,$4)',
  [matter, key, 'approved', key === 'levy_clearance_certificate' ? null : '2030-01-01'],
)
await complete('lodgement_ready')
assert.equal((await db.query('select status from transaction_subprocess_steps where subprocess_id=$1 and step_key=$2', [lane, 'lodgement_ready'])).rows[0].status, 'completed')
await db.query("update document_requirement_instances set expiry_date='2020-01-01' where transaction_id=$1 and document_definition_key='rates_clearance_certificate'", [matter])
await assert.rejects(complete('lodged_at_deeds_office'), /current approved municipal clearance certificate/)
await db.query("update transactions set routing_profile_json=jsonb_set(routing_profile_json,'{transferTaxDecision,route}','\"exempt\"'::jsonb) where id=$1", [matter])
assert.equal((await db.query('select status from transaction_subprocess_steps where subprocess_id=$1 and step_key=$2',
  [lane, 'sars_transfer_tax_receipt_verified'])).rows[0].status, 'not_started', 'changed tax basis reopens old SARS review')
await assert.rejects(complete('lodged_at_deeds_office'), /applicable statutory exemption/)
console.log('Phase 4 tax and clearance migration checks passed.')
