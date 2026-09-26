import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { resolveMatterScenarioProfile, applyPartyCapacityDecisions } from '../src/services/matterScenarioProfile.js'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { SPECIALIST_ROUTE_TASKS, specialistRouteFacts, requiredSpecialistRouteKeys } from '../src/services/attorneyWorkflow/specialistRoutePolicy.js'

const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000501'
const lane = '00000000-0000-0000-0000-000000000502'
const oldMatter = '00000000-0000-0000-0000-000000000503'
const oldLane = '00000000-0000-0000-0000-000000000504'
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create schema auth; create schema journey_private;
create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
create function public.bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select true$$;
create table public.withdraw_calls(matter uuid,reason text);
create function journey_private.withdraw_unlodged_attorney_readiness(uuid,text,text) returns void language plpgsql as $$
begin insert into public.withdraw_calls(matter,reason) values ($1,$2); end$$;
create table journey_private.task_catalog(lane_key text,step_key text,definition jsonb,phase_key text,phase_label text,phase_order int,task_order int,primary key(lane_key,step_key));
create table public.transactions(id uuid primary key,routing_profile_json jsonb,lifecycle_state text);
create table public.transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
create table public.transaction_subprocess_steps(id uuid primary key default gen_random_uuid(),subprocess_id uuid,step_key text,status text,comment text,step_label text,owner_type text,sort_order int,visibility_scope text,unique(subprocess_id,step_key));
create function journey_private.enforce_attorney_funding_handoffs() returns trigger language plpgsql as $$
declare v_plan jsonb; begin
 if v_plan ->> 'version' not in ('attorney_matter_workflow_plan_v12', 'attorney_matter_workflow_plan_v13') then return new; end if;
 return new; end; $$;
create function journey_private.enforce_attorney_phase4_tax_clearances() returns trigger language plpgsql as $$
declare v_profile jsonb; begin
 if v_profile #>> '{workflowPlan,version}' <> 'attorney_matter_workflow_plan_v13' then return new; end if;
 return new; end; $$;
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926135022_attorney_phase2_party_capacity.sql', import.meta.url), 'utf8'))
const base = resolveMatterScenarioProfile({ parties: [
  { id: 'buyer', role: 'buyer', name: 'Buyer', entityType: 'individual', maritalRegime: 'single', identityRoute: 'sa_id', taxResidence: 'south_africa', ownershipShare: 100 },
  { id: 'estate', role: 'seller', name: 'Estate', entityType: 'estate', taxResidence: 'south_africa', ownershipShare: 100,
    representatives: [{ id: 'executor', name: 'Executor', capacity: 'Executor' }] },
] })
assert.equal(buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: base } }).lanes[0].stepKeys.includes('specialist_classification_review'), true)
assert.equal(buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: base } }).lanes[0].stepKeys.includes(SPECIALIST_ROUTE_TASKS.deceased_estate), false)
const proposed = structuredClone(base)
proposed.specialistRoutes = { deceased_estate: { active: true, status: 'confirmed', owner: 'Estate specialist', reason: 'Executor authority and conveyance reviewed', instrument: 'deeds_transfer', evidenceReference: 'Letters and specialist opinion' } }
const scenario = applyPartyCapacityDecisions(base, proposed, { canReview: true, userId: actor, now: '2026-09-26T12:00:00Z' })
assert.deepEqual(scenario.specialistRoutes.deceased_estate.reviewedFacts, specialistRouteFacts(scenario))
const plan = buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: scenario } })
assert.equal(plan.version, 'attorney_matter_workflow_plan_v14')
assert.ok(plan.lanes[0].stepKeys.includes(SPECIALIST_ROUTE_TASKS.deceased_estate))
assert.ok(!buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: scenario, propertyTenure: 'sectional_title' } }).lanes[0].stepKeys.includes(SPECIALIST_ROUTE_TASKS.deceased_estate))
assert.ok(!buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: scenario,
  mvpProfile: { propertyConditions: { titleRestrictions: 'yes' } } } }).lanes[0].stepKeys.includes(SPECIALIST_ROUTE_TASKS.deceased_estate))
for (const key of Object.keys(SPECIALIST_ROUTE_TASKS)) {
  const candidate = resolveMatterScenarioProfile({ ...base, specialistRoutes: { [key]: { active: true, status: 'pending' } } })
  assert.ok(requiredSpecialistRouteKeys(candidate).includes(key), key)
  assert.ok(buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: candidate } }).lanes[0].stepKeys.includes('specialist_classification_review'), key)
}
await assert.rejects(Promise.resolve().then(() => applyPartyCapacityDecisions(base, proposed, { canReview: false })), /Only an attorney/)
await db.query('insert into public.transactions values ($1,$2,$3)', [matter, { workflowPlan: buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: base } }), scenarioProfile: base }, 'active'])
await db.query('insert into public.transaction_subprocesses values ($1,$2,$3)', [lane, matter, 'transfer'])
await db.query('insert into public.transactions values ($1,$2,$3)', [oldMatter, { workflowPlan: {
  version: 'attorney_matter_workflow_plan_v13', status: 'active', lanes: [{ laneKey: 'transfer',
    stepKeys: ['seller_party_capacity_review','party_capacity_specialist_review','lodgement_ready'], taskCount: 3 }],
}, scenarioProfile: base }, 'active'])
await db.query('insert into public.transaction_subprocesses values ($1,$2,$3)', [oldLane, oldMatter, 'transfer'])
for (const [index, step] of plan.lanes[0].stepKeys.entries()) await db.query(
  'insert into public.transaction_subprocess_steps(subprocess_id,step_key,status,sort_order) values ($1,$2,$3,$4)', [lane, step, 'not_started', index + 1])
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926145234_attorney_phase5_specialist_routes.sql', import.meta.url), 'utf8'))
const upgraded = (await db.query('select routing_profile_json from transactions where id=$1', [oldMatter])).rows[0].routing_profile_json
assert.equal(upgraded.workflowPlan.version, 'attorney_matter_workflow_plan_v14')
assert.ok(upgraded.workflowPlan.lanes[0].stepKeys.includes('specialist_classification_review'))
assert.ok(!upgraded.workflowPlan.lanes[0].stepKeys.includes('party_capacity_specialist_review'))
assert.equal((await db.query("select status from transaction_subprocess_steps where subprocess_id=$1 and step_key='specialist_classification_review'", [oldLane])).rows[0].status, 'not_started')
for (const functionName of ['enforce_attorney_funding_handoffs','enforce_attorney_phase4_tax_clearances']) {
  const definition = (await db.query('select pg_get_functiondef($1::regprocedure) as definition', [`journey_private.${functionName}()`])).rows[0].definition
  assert.match(definition, /attorney_matter_workflow_plan_v14/)
}
const complete = key => db.query("update public.transaction_subprocess_steps set status='completed',comment='Reviewed specialist evidence.' where subprocess_id=$1 and step_key=$2", [lane, key])
await assert.rejects(complete('specialist_classification_review'), /unresolved/)
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [{ workflowPlan: plan, scenarioProfile: scenario }, matter])
assert.ok((await db.query("select count(*)::int as count from withdraw_calls where matter=$1 and reason='specialist_route_changed'", [matter])).rows[0].count > 0)
await complete('specialist_classification_review')
await assert.rejects(db.query("update public.transaction_subprocess_steps set status='not_applicable' where subprocess_id=$1 and step_key=$2", [lane, SPECIALIST_ROUTE_TASKS.deceased_estate]), /specialist classification/)
await assert.rejects(db.query('select journey_private.assert_attorney_party_capacity_ready($1,$2)', [matter, 'seller']), /Complete specialist task/)
await complete(SPECIALIST_ROUTE_TASKS.deceased_estate)
await db.query('select journey_private.assert_attorney_party_capacity_ready($1,$2)', [matter, 'seller'])
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [
  { workflowPlan: plan, scenarioProfile: scenario, mvpProfile: { propertyConditions: { titleRestrictions: 'yes' } } }, matter])
await assert.rejects(db.query('select journey_private.assert_attorney_party_capacity_ready($1,$2)', [matter, 'seller']), /unresolved/)
const stale = structuredClone(scenario)
stale.parties[1].representatives[0].name = 'New executor'
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [{ workflowPlan: plan, scenarioProfile: stale }, matter])
await assert.rejects(db.query('select journey_private.assert_attorney_party_capacity_ready($1,$2)', [matter, 'seller']), /unresolved/)
const alternative = structuredClone(base)
alternative.specialistRoutes = { deceased_estate: { active: true, status: 'confirmed', owner: 'Estate specialist',
  reason: 'A different instrument is required', instrument: 'other_instrument', evidenceReference: 'Specialist opinion' } }
const alternativeScenario = applyPartyCapacityDecisions(base, alternative, { canReview: true, userId: actor, now: '2026-09-26T13:00:00Z' })
const alternativePlan = buildMatterWorkflowPlan({ routingProfile: { scenarioProfile: alternativeScenario } })
assert.ok(alternativePlan.lanes[0].stepKeys.includes('specialist_classification_review'))
assert.ok(!alternativePlan.lanes[0].stepKeys.includes(SPECIALIST_ROUTE_TASKS.deceased_estate))
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [
  { workflowPlan: alternativePlan, scenarioProfile: alternativeScenario }, matter])
await assert.rejects(db.query('select journey_private.phase5_assert_routes($1,$2)', [matter, lane]), /another instrument/)
await db.close()
console.log('Phase 5 specialist routes passed: hold, classification, specialist task, estate authority, and stale-fact gate.')
