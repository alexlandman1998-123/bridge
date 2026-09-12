import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { buildPlannedSharedMatterJourney } from '../src/services/attorneyWorkflow/sharedMatterJourneyPlanAdapter.js'
import { projectSharedMatterJourneyRead, fetchSharedMatterJourney, alignWorkStepsWithSharedJourney, sharedJourneyHeaderPhases } from '../src/services/sharedMatterJourneyReader.js'
import { presentSharedMatterJourney } from '../src/core/transactions/sharedMatterJourneyContract.js'
import { selectStableTransactionRollup } from '../src/core/transactions/stableTransactionRollup.js'
import { getLegalWorkspacePhases } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000002'
const lane = '00000000-0000-0000-0000-000000000003'
const step = '00000000-0000-0000-0000-000000000004'
const migration = name => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url),'utf8')
const fixture = readFileSync(new URL('./attorney-mvp-task-discretion-sql.test.mjs',import.meta.url),'utf8')
  .match(/await db.exec\(`([\s\S]*?)`\)/)[1]
  .replaceAll('${actor}',actor).replaceAll('${matter}',matter).replaceAll('${lane}',lane).replaceAll('${step}',step)
await db.exec(fixture)
await db.exec(`
create table transaction_refresh_signals(transaction_id uuid primary key,version bigint,changed_at timestamptz);
insert into transaction_refresh_signals values ('${matter}',7,now());
create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select auth.uid() = '${actor}'::uuid and $1 = '${matter}'::uuid$$;
create function bridge_has_client_portal_token_transaction_access(uuid) returns boolean language sql as $$select current_setting('test.token',true) = 'valid' and $1 = '${matter}'::uuid$$;
create function bridge_has_onboarding_token_transaction_access(uuid) returns boolean language sql as $$select null::boolean$$;
`)
await db.exec(migration('20260908073924_attorney_mvp_task_discretion.sql'))
await db.exec(migration('20260908144636_shared_matter_journey_atomic_commands.sql'))
await db.exec(migration('20260908150256_shared_matter_journey_reader.sql'))
await db.exec(`
create function bridge_private_listing_seller_portal_payload(text,text,boolean) returns jsonb language sql as $$
 select case when $1='seller-valid' and $2='valid-session' and $3=true
 then jsonb_build_object('listing',jsonb_build_object('id','${lane}'))
 else jsonb_build_object('authRequired',true) end $$;
create function bridge_resolve_private_listing_transaction_id(uuid) returns uuid language sql as $$
 select case when $1='${lane}'::uuid then '${matter}'::uuid else null end $$;
`)
await db.exec(migration('20260908152512_shared_matter_journey_seller_session_reader.sql'))
await db.exec(`
alter table transactions add column finance_type text;
create table transaction_workflow_instances(id uuid primary key,transaction_id uuid,workflow_key text);
create table transaction_workflow_steps(workflow_instance_id uuid,transaction_id uuid,workflow_key text,step_key text,status text);
`)
await db.exec(migration('20260908181335_shared_journey_active_plan_manifest.sql'))
await db.exec(migration('20260908183116_shared_journey_commercial_facts.sql'))
await db.exec(migration('20260910080705_transfer_tax_conditional_workflow_phase3.sql'))
await db.exec(migration('20260910092527_shared_journey_safe_tax_milestones.sql'))
await db.exec(migration('20260910094209_transfer_tax_cross_role_safe_reader_phase7.sql'))
await db.exec(migration('20260910153146_reconcile_attorney_journey_catalogue.sql'))
await db.exec(migration('20260910153517_reconcile_shared_journey_reader_contract.sql'))
// Exercise the real SQL migrations in isolated PostgreSQL with scoped permission fixtures.
for (const [route, financeKeys] of Object.entries({ cash: ['proof_of_funds_reviewed','cash_confirmation_approved'],
  bond: ['quote_approved','instruction_sent'], hybrid: ['cash_portion_confirmed','quote_approved','instruction_sent'] })) {
  await db.exec('begin')
  await db.query('update transactions set finance_type=$1 where id=$2',[route,matter])
  const otp = randomUUID(), finance = randomUUID()
  await db.query("insert into transaction_workflow_instances values ($1,$3,'sales_otp'),($2,$3,$4)",[otp,finance,matter,`finance_${route}`])
  await db.query("insert into transaction_workflow_steps values ($1,$2,'sales_otp','signed_otp_received','completed')",[otp,matter])
  for (const key of financeKeys) await db.query('insert into transaction_workflow_steps values ($1,$2,$3,$4,$5)',[finance,matter,`finance_${route}`,key,'completed'])
  await db.query("insert into transaction_workflow_steps values ($1,$2,'sales_otp','private_secret','completed')",[otp,matter])
  const initial = (await db.query('select journey_private.read_matter_journey($1) result',[matter])).rows[0].result
  assert.equal(initial.commercialFacts.steps.length,financeKeys.length+1)
  assert.ok(initial.commercialFacts.steps.every(s=>s.status==='completed'))
  assert.doesNotMatch(JSON.stringify(initial.commercialFacts),/private_secret/)
  await db.query("update transaction_workflow_steps set status='not_started' where step_key=$1",[financeKeys[0]])
  const reopened = (await db.query('select journey_private.read_matter_journey($1) result',[matter])).rows[0].result
  assert.equal(reopened.commercialFacts.steps.find(s=>s.key===financeKeys[0]).status,'not_started')
  await db.query("select set_config('test.actor','',false),set_config('test.token','valid',false)")
  await db.exec('set role anon')
  assert.deepEqual((await db.query('select bridge_read_shared_matter_journey($1) result',[matter])).rows[0].result.commercialFacts,reopened.commercialFacts)
  assert.deepEqual((await db.query("select bridge_read_seller_shared_matter_journey('seller-valid','valid-session') result")).rows[0].result.commercialFacts,reopened.commercialFacts)
  await db.exec('reset role; rollback')
}

await db.query("select set_config('test.actor',$1,false),set_config('test.token','',false)",[actor])
await db.query("update transactions set routing_profile_json=$1 where id=$2",[
 {workflowPlan:{status:'active',lanes:[{laneKey:'transfer',stepKeys:['transfer_tax_route_confirmed','sars_transfer_tax_receipt_verified']}]}},matter])
const professional=(await db.query('select bridge_read_professional_matter_journey($1) result',[matter])).rows[0].result
assert.equal(professional.planStatus,'active')
assert.deepEqual(professional.requiredLaneKeys,['transfer'])
assert.ok(professional.commercialFacts)
assert.equal(professional.lanes[0].phases[0].tasks[0].key,'transfer_tax_route_confirmed')
const buyer=(await db.query('select bridge_read_shared_matter_journey($1) result',[matter])).rows[0].result
assert.equal(buyer.lanes[0].phases[0].tasks[0].label,'Transfer progress')
assert.doesNotMatch(JSON.stringify(buyer),/transfer_tax_route_confirmed|SARS|VAT|TDC01/)
assert.deepEqual(buyer.requiredLaneKeys,professional.requiredLaneKeys)
assert.deepEqual(buyer.commercialFacts,professional.commercialFacts)
assert.deepEqual(buyer.lanes[0].phases[0].tasks.map(t=>t.status),professional.lanes[0].phases[0].tasks.map(t=>t.status))
const grants=(await db.query(`select
 has_function_privilege('anon','public.bridge_read_professional_matter_journey(uuid)','execute') as anon,
 has_function_privilege('authenticated','journey_private.read_matter_journey(uuid)','execute') as private_read`)).rows[0]
assert.deepEqual(grants,{anon:false,private_read:false})
await db.query("select set_config('test.actor','',false),set_config('test.token','valid',false)")
await assert.rejects(db.query('select bridge_read_professional_matter_journey($1)',[matter]),/Professional matter access/)
await db.exec('set role anon')
await assert.rejects(db.query('select bridge_read_shared_matter_journey($1)',[randomUUID()]),/access/)
await db.exec('reset role')
await db.close()
console.log('Reconciled reader: cash/bond/hybrid commercial facts, reopen, active plan, client redaction and access denial PASS')
