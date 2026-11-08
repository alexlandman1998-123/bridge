import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10)
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
const answer=days=>({'evidence:figures_expiry_captured:0':{answer:'yes',items:[{validUntil:date(days),reference:'CONTROLLED-BANK-FIGURES'}]}})
try{
 await db.exec(`create schema auth;create schema journey_private;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql stable as $$select auth.uid()='${id(9)}'::uuid and $1='${id(1)}'::uuid and $2='cancellation_attorney'$$;
 create table transactions(id uuid primary key,lifecycle_state text,registered_at timestamptz,routing_profile_json jsonb);
 create table transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
 create table transaction_subprocess_steps(id uuid primary key,subprocess_id uuid,step_key text,status text,comment text,completed_at timestamptz,completed_by uuid,updated_at timestamptz,step_metadata jsonb default '{}');
 create table document_requirement_instances(id uuid primary key,transaction_id uuid,context_type text,document_definition_key text,status text,satisfied_by_document_id uuid,expiry_date timestamptz,updated_at timestamptz default now());
 create table attorney_task_confirmations(step_id uuid primary key,task_confirmations jsonb);
 create function journey_private.withdraw_unlodged_attorney_readiness(uuid,text,text) returns void language plpgsql as $$begin update public.transaction_subprocess_steps s set status='not_started' from public.transaction_subprocesses l where l.id=s.subprocess_id and l.transaction_id=$1 and s.step_key in ('lodgement_ready','cancellation_lodgement_ready') and s.status='completed';end;$$;
 insert into transactions values('${id(1)}','active',null,'{"financeType":"cash","workflowPlan":{"version":"attorney_matter_workflow_plan_v14","lanes":[{"laneKey":"cancellation"}]}}');
 insert into transaction_subprocesses values('${id(2)}','${id(1)}','cancellation');
 insert into document_requirement_instances(id,transaction_id,context_type,document_definition_key,status,satisfied_by_document_id) values('${id(3)}','${id(1)}','transaction','settlement_figure','approved','${id(4)}'),('${id(5)}','${id(1)}','transaction','guarantees','approved','${id(6)}');
 select set_config('test.uid','${id(9)}',false);`)
 const keys=['cancellation_existing_bond_confirmed','cancellation_bank_captured','cancellation_bond_account_captured','cancellation_instruction_received','notice_period_captured','cancellation_figures_received','figures_expiry_captured','cancellation_guarantees_accepted','cancellation_guarantee_allocation_review','cancellation_consent_confirmed','cancellation_simultaneous_lodgement_confirmed','cancellation_lodgement_ready']
 for(const [i,key] of keys.entries())await db.query('insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,comment) values($1,$2,$3,$4,$5)',[id(20+i),id(2),key,['figures_expiry_captured','cancellation_lodgement_ready'].includes(key)?'not_started':'completed','Synthetic reviewed evidence'])
 const step=id(26),ready=id(31)
 await db.query('insert into attorney_task_confirmations values($1,$2)',[step,answer(30)])
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104133836_cancellation_figures_evidence_alignment.sql',import.meta.url),'utf8'))
 await db.exec(`create trigger enforce_funding before update of status,comment on transaction_subprocess_steps for each row execute function journey_private.enforce_attorney_funding_handoffs();create trigger withdraw_evidence after update on document_requirement_instances for each row execute function journey_private.withdraw_readiness_on_funding_evidence_change();`)
 await db.query("update transaction_subprocess_steps set status='completed' where id=$1",[step])
 assert.equal(await scalar("select (expiry_date at time zone 'Africa/Johannesburg')::date::text from document_requirement_instances where id=$1",[id(3)]),date(30))
 await db.query("update transaction_subprocess_steps set status='completed' where id=$1",[ready])
 assert.equal(await scalar('select status from transaction_subprocess_steps where id=$1',[ready]),'completed')
 await db.query("update document_requirement_instances set satisfied_by_document_id=$1,status='pending' where id=$2",[id(7),id(3)])
 assert.equal(await scalar('select expiry_date from document_requirement_instances where id=$1',[id(3)]),null)
 for(const key of [step,ready])assert.equal(await scalar('select status from transaction_subprocess_steps where id=$1',[key]),'not_started')
 await assert.rejects(()=>db.query("update transaction_subprocess_steps set status='completed' where id=$1",[step]),/Review the current cancellation figures/)
 await db.query("update document_requirement_instances set status='approved' where id=$1",[id(3)])
 await db.query('update attorney_task_confirmations set task_confirmations=$1 where step_id=$2',[answer(31),step])
 await db.query("update transaction_subprocess_steps set status='completed' where id=$1",[step])
 assert.equal(await scalar("select step_metadata#>>'{cancellationFiguresEvidence,documentId}' from transaction_subprocess_steps where id=$1",[step]),id(7))
 await db.query('update attorney_task_confirmations set task_confirmations=$1 where step_id=$2',[answer(32),step])
 await assert.rejects(()=>db.query("update transaction_subprocess_steps set status='completed',comment='Synthetic expiry extension' where id=$1",[step]),/replacement bank figures/)
 assert.equal(await scalar("select (expiry_date at time zone 'Africa/Johannesburg')::date::text from document_requirement_instances where id=$1",[id(3)]),date(31))
 await db.query('update attorney_task_confirmations set task_confirmations=$1 where step_id=$2',[answer(-1),step])
 await db.query("update transaction_subprocess_steps set status='completed',comment='Actual expired date recorded' where id=$1",[step])
 await assert.rejects(()=>db.query("update transaction_subprocess_steps set status='completed' where id=$1",[ready]),/future expiry/)
 await db.exec(`select set_config('test.uid','${id(8)}',false)`)
 await assert.rejects(()=>db.query("update transaction_subprocess_steps set status='completed',comment='Foreign actor' where id=$1",[step]),/appointed cancellation team/)
 await db.exec(`select set_config('test.uid','${id(9)}',false);update transactions set lifecycle_state='registered',registered_at=now();`)
 await db.query("update document_requirement_instances set satisfied_by_document_id=$1,status='pending' where id=$2",[id(8),id(3)])
 assert.equal(await scalar('select status from transaction_subprocess_steps where id=$1',[step]),'completed')
 console.log('PASS canonical figures alias, checked expiry binding, real lodgement gate, replacement/review invalidation, unauthorized writes, expired figures, no unsupported extensions and registered-history preservation.')
}finally{await db.close()}
