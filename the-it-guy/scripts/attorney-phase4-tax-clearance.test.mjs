import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { PHASE4_TAX_TASKS, PHASE4_PROPERTY_TASKS, isMunicipalClearanceValidUntil } from '../src/services/attorneyWorkflow/transferPhase4Policy.js'

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

// An imported matter may start with the tax route undecided. Earlier transfer
// work must remain editable while lodgement still waits for an attorney decision.
const importedMatter = '00000000-0000-0000-0000-000000000403'
const importedLane = '00000000-0000-0000-0000-000000000404'
const importedProfile = {
  ...updated,
  transferTaxDecision: {
    ...updated.transferTaxDecision,
    route: 'needs_tax_advice',
    status: 'needs_confirmation',
    sarsStatus: 'not_started',
  },
}
await db.query('insert into transactions values ($1,$2,$3)', [importedMatter, importedProfile, 'active'])
await db.query('insert into transaction_subprocesses values ($1,$2,$3)', [importedLane, importedMatter, 'transfer'])
for (const stepKey of ['instruction_received', 'lodgement_ready']) await db.query(
  'insert into transaction_subprocess_steps(subprocess_id,step_key,status) values ($1,$2,$3)',
  [importedLane, stepKey, 'not_started'],
)
const completeImportedStep = (stepKey) => db.query(
  "update transaction_subprocess_steps set status='completed', comment='Reviewed imported matter.' where subprocess_id=$1 and step_key=$2",
  [importedLane, stepKey],
)
await assert.rejects(completeImportedStep('instruction_received'), /case not found/)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260929081502_handle_unconfirmed_transfer_tax_route.sql', import.meta.url), 'utf8'))
for (const route of ['needs_tax_advice', 'pending_attorney_decision', null]) {
  const candidate = { ...importedProfile, transferTaxDecision: { ...importedProfile.transferTaxDecision, route } }
  const fromSql = (await db.query('select journey_private.phase4_required_transfer_steps($1::jsonb) as steps', [candidate])).rows[0].steps
  const fromPlan = buildMatterWorkflowPlan({ routingProfile: candidate }).lanes[0].stepKeys
    .filter((key) => PHASE4_TAX_TASKS.includes(key) || PHASE4_PROPERTY_TASKS.includes(key))
  assert.deepEqual(fromSql, fromPlan, `unconfirmed ${route} SQL and application applicability must agree`)
}
await completeImportedStep('instruction_received')
assert.equal((await db.query('select status from transaction_subprocess_steps where subprocess_id=$1 and step_key=$2',
  [importedLane, 'instruction_received'])).rows[0].status, 'completed')
await assert.rejects(completeImportedStep('lodgement_ready'), /Confirmed tax basis and SARS proof/)

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

const windowDb = new PGlite()
await windowDb.exec(`
create role authenticated;
create role anon;
create schema journey_private;
create table public.transactions(id text primary key, routing_profile_json jsonb);
create table public.transaction_subprocesses(id text primary key, transaction_id text, process_type text);
create table public.transaction_subprocess_steps(subprocess_id text, step_key text, status text);
`)
await windowDb.exec(readFileSync(new URL('../../supabase/migrations/20260927090000_attorney_municipal_clearance_issue_window.sql', import.meta.url), 'utf8'))
const windowDates = (await windowDb.query(`select current_date::text as today,
  (current_date - 1)::text as issued_on, (current_date - 31)::text as old_issue,
  (current_date + 30)::text as valid_until`)).rows[0]
const validMunicipal = { issuedOn: windowDates.issued_on, validUntil: windowDates.valid_until }
assert.equal(isMunicipalClearanceValidUntil(validMunicipal, `${windowDates.today}T12:00:00Z`), true)
assert.equal(isMunicipalClearanceValidUntil({ ...validMunicipal, issuedOn: windowDates.old_issue }, `${windowDates.today}T12:00:00Z`), false)
assert.equal(isMunicipalClearanceValidUntil({ validUntil: windowDates.valid_until }, `${windowDates.today}T12:00:00Z`), true,
  'existing records with only a verified expiry remain usable')
await windowDb.query('insert into public.transactions values ($1,$2)', ['matter-window', {
  mvpProfile: { propertyConditions: { clearances: {
    municipal: { ...validMunicipal, issuedOn: windowDates.old_issue },
    bodyCorporate: { issuedOn: windowDates.old_issue, validUntil: windowDates.valid_until },
  } } },
}])
await windowDb.query('insert into public.transaction_subprocesses values ($1,$2,$3)', ['lane-window', 'matter-window', 'transfer'])
await windowDb.query('insert into public.transaction_subprocess_steps values ($1,$2,$3)', ['lane-window', 'lodgement_ready', 'not_started'])
await assert.rejects(windowDb.query("update public.transaction_subprocess_steps set status='completed' where subprocess_id='lane-window'"), /within 60 days of issue/)
await windowDb.query(`update public.transactions set routing_profile_json =
  jsonb_set(routing_profile_json, '{mvpProfile,propertyConditions,clearances,municipal,issuedOn}', $1::jsonb)
  where id='matter-window'`, [JSON.stringify(windowDates.issued_on)])
await windowDb.query("update public.transaction_subprocess_steps set status='completed' where subprocess_id='lane-window'")
assert.equal((await windowDb.query("select status from public.transaction_subprocess_steps where subprocess_id='lane-window'")).rows[0].status, 'completed')
console.log('Phase 4 tax and clearance migration checks passed.')
