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
// Apply the current reader/catalogue contract, not just September 8's baseline.
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
await db.query("select set_config('test.actor',$1,false)",[actor])
for (const key of ['transfer','bond','cancellation']) {
  const expected = getLegalWorkspacePhases(key).flatMap((phase,i)=>phase.stageKeys.map((task,j)=>({
    step_key:task,phase_key:phase.key,phase_label:phase.label,phase_order:i,task_order:j,
  }))).sort((a,b)=>a.step_key.localeCompare(b.step_key))
  const actual = (await db.query('select step_key,phase_key,phase_label,phase_order,task_order from journey_private.task_catalog where lane_key=$1 order by step_key',[key])).rows
  // Legacy definitions are intentionally retained for saved historical plans.
  // Every CURRENT task must nevertheless exist with exactly the current order.
  const currentKeys = new Set(expected.map(task => task.step_key))
  assert.deepEqual(actual.filter(task => currentKeys.has(task.step_key)),expected)
}
let scenarios = 0
for (const finance of ['cash','bond','hybrid']) for (const buyer of ['individual','company']) {
  const profile = resolveTransactionRoutingProfile({transaction:{finance_type:finance,purchaser_type:buyer,
    seller_type:'individual',seller_has_existing_bond:true,property_tenure:buyer === 'company' ? 'sectional_title' : 'freehold'}})
  const plan = buildMatterWorkflowPlan({routingProfile:profile})
  await db.exec('delete from transaction_subprocess_steps; delete from transaction_subprocesses')
  await db.query('update transactions set routing_profile_json=$1 where id=$2',[{...profile,workflowPlan:plan},matter])
  const snapshots = {}
  const raw = [], laneRows = []
  for (const l of plan.lanes) {
    const lid=randomUUID()
    laneRows.push({id:lid,process_type:l.laneKey})
    await db.query('insert into transaction_subprocesses(id,transaction_id,process_type) values($1,$2,$3)',[lid,matter,l.laneKey])
    snapshots[l.laneKey]={steps:[]}
    for (const [i,key] of l.stepKeys.entries()) {
      // Missing rows are deliberately left in the planned denominator.
      if (i === 2) continue
      const status=['not_started','completed','waiting','blocked','completed_externally','not_applicable','in_progress'][i%7]
      const row={id:randomUUID(),subprocess_id:lid,step_key:key,status,comment:'PRIVATE EVIDENCE'}
      raw.push(row); snapshots[l.laneKey].steps.push(row)
      await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,comment,sort_order) values($1,$2,$3,$4,$5,$6)',
        [row.id,lid,key,status,row.comment,i])
    }
  }
  const read = async(id=matter)=>(await db.query('select bridge_read_shared_matter_journey($1) result',[id])).rows[0].result
  const professionalRead = async() => (await db.query('select bridge_read_professional_matter_journey($1) result',[matter])).rows[0].result
  const professionalSource=await professionalRead()
  const projected=projectSharedMatterJourneyRead(professionalSource)
  const expected=buildPlannedSharedMatterJourney({transactionId:matter,revision:7,planRevision:7,routingProfile:{...profile,workflowPlan:plan},laneSnapshots:snapshots}).journey
  const { commercialFacts, requiredLaneKeys, ...legalProjection } = projected
  assert.deepEqual(legalProjection,presentSharedMatterJourney(expected,'buyer'))
  assert.deepEqual(requiredLaneKeys,plan.lanes.map(l=>l.laneKey))
  assert.equal(commercialFacts.revision,7)
  assert.doesNotMatch(JSON.stringify(professionalSource),/PRIVATE EVIDENCE|routing_profile|comment|note|email/)
  const result={status:'ready',snapshot:projectSharedMatterJourneyRead(professionalSource,{audience:'attorney'})}
  const work=alignWorkStepsWithSharedJourney(raw,laneRows,result,plan)
  assert.deepEqual(work.map(r=>r.status),raw.map(r=>r.status))
  assert.throws(()=>alignWorkStepsWithSharedJourney(raw,laneRows,{status:'unavailable'},plan),/unavailable/)
  assert.throws(()=>alignWorkStepsWithSharedJourney(raw,laneRows,result,{...plan,lanes:[]}),/plan changed/)
  for(const l of projected.lanes) assert.deepEqual(sharedJourneyHeaderPhases(result,l.key).map(p=>p.total),l.phases.map(p=>p.progress.applicableCount))
  for (const role of ['attorney','agent','developer','buyer','seller']) {
    await db.query("select set_config('test.actor',$1,false),set_config('test.token',$2,false)",
      [['buyer','seller'].includes(role)?'':actor,['buyer','seller'].includes(role)?'valid':''])
    await db.exec(['buyer','seller'].includes(role) ? 'set role anon' : 'set role authenticated')
    const source = ['buyer','seller'].includes(role) ? await read() : await professionalRead()
    assert.deepEqual(projectSharedMatterJourneyRead(source),projected,role)
    await db.exec('reset role')
  }
  await db.query("select set_config('test.actor','',false),set_config('test.token','revoked',false)")
  await db.exec('set role anon')
  const sellerRead = async(token,session) => (await db.query('select bridge_read_seller_shared_matter_journey($1,$2) result',[token,session])).rows[0].result
  assert.deepEqual(projectSharedMatterJourneyRead(await sellerRead('seller-valid','valid-session')),projected)
  await assert.rejects(sellerRead('seller-valid','expired'),/access/)
  await assert.rejects(sellerRead('seller-wrong','valid-session'),/access/)
  await assert.rejects(sellerRead('seller-valid',null),/access/)
  await assert.rejects(db.query('select journey_private.read_matter_journey($1)',[matter]),/permission denied/)
  await assert.rejects(read(),/access/)
  await db.exec('reset role')
  await db.query("select set_config('test.token','valid',false)")
  await assert.rejects(read(randomUUID()),/access/)
  await db.query("select set_config('test.actor',$1,false),set_config('test.token','',false)",[actor])
  const newer={transactionId:matter,transactionJourneySnapshot:{legalJourney:result}}
  const older={transactionId:matter,transactionJourneySnapshot:{legalJourney:{status:'ready',snapshot:{...projected,revision:6}}}}
  assert.equal(selectStableTransactionRollup(newer,older,{transactionId:matter}).transactionJourneySnapshot.legalJourney.snapshot.revision,7)
  const oldOverall = {...newer,derivedAt:'2026-09-08T12:00:00Z'}
  const newLegalOldOverall = {...older,derivedAt:'2026-09-08T11:00:00Z',transactionJourneySnapshot:{
    legalJourney:{status:'ready',snapshot:{...projected,revision:8}},
  }}
  assert.equal(selectStableTransactionRollup(oldOverall,newLegalOldOverall,{transactionId:matter}).transactionJourneySnapshot.legalJourney.snapshot.revision,8)
  scenarios++
}
// Each committed outcome yields the same changed task for every recipient.
const changedTask = (await db.query("select id,step_key from transaction_subprocess_steps where status='not_started' limit 1")).rows[0]
for (const [offset, status] of ['completed','not_applicable','not_started'].entries()) {
  await db.query("select set_config('test.actor',$1,false),set_config('test.token','',false)",[actor])
  await db.exec('begin')
  await db.query('update transaction_subprocess_steps set status=$2 where id=$1',[changedTask.id,status])
  await db.query('update transaction_refresh_signals set version=$2 where transaction_id=$1',[matter,8+offset])
  await db.exec('commit')
  const updated = (await db.query('select bridge_read_professional_matter_journey($1) result',[matter])).rows[0].result
  const updatedClient = (await db.query('select bridge_read_shared_matter_journey($1) result',[matter])).rows[0].result
  assert.equal(updated.revision,8+offset)
  assert.ok(updated.lanes.flatMap(l=>l.phases.flatMap(p=>p.tasks)).some(t=>t.key===changedTask.step_key && t.status===status))
  for (const role of ['attorney','agent','developer','buyer','seller']) {
    const portal = ['buyer','seller'].includes(role)
    await db.query("select set_config('test.actor',$1,false),set_config('test.token',$2,false)",[portal?'':actor,portal?'valid':''])
    await db.exec(portal ? 'set role anon' : 'set role authenticated')
    const read = role === 'seller'
      ? await db.query("select bridge_read_seller_shared_matter_journey('seller-valid','valid-session') result")
      : await db.query(portal ? 'select bridge_read_shared_matter_journey($1) result' : 'select bridge_read_professional_matter_journey($1) result',[matter])
    assert.deepEqual(read.rows[0].result,portal ? updatedClient : updated,`${role} must observe ${status} at the committed revision`)
    await db.exec('reset role')
  }
}
await db.query("select set_config('test.actor',$1,false)",[actor])
await db.query("update transactions set routing_profile_json=jsonb_set(routing_profile_json,'{workflowPlan,lanes,0,stepKeys}','[\"unknown_task\"]') where id=$1",[matter])
await assert.rejects(db.query('select bridge_read_shared_matter_journey($1)',[matter]),/reconciliation/)
await db.close()
assert.equal((await fetchSharedMatterJourney({rpc:async()=>({error:{code:'42501'}})},matter)).status,'unavailable')
console.log(`Current journey reader: ${scenarios} scenarios, 5 recipient projections, Work/header parity, missing rows, token denial, current catalog and revision checks PASS (isolated permission fixtures)`)
