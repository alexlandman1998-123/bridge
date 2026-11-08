import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const rows=async(sql,args=[])=> (await db.query(sql,args)).rows
const scalar=async(sql,args=[])=>Object.values((await rows(sql,args))[0])[0]
const decide=(offer,decision='accepted')=>rows('select bridge_record_bond_offer_decision($1,$2,$3)',[offer,decision,'Synthetic test decision'])
try{
 await db.exec(`create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table transactions(id uuid primary key,finance_type text,lifecycle_state text,registered_at timestamptz,cancelled_at timestamptz,archived_at timestamptz,finance_status text);
 create table transaction_finance_workflows(id uuid primary key,transaction_id uuid,current_stage text,status text,last_updated_by uuid,last_updated_at timestamptz);
 create table transaction_bond_quotes(id uuid primary key,transaction_id uuid,workflow_id uuid,quote_status text,quote_expiry_at timestamptz,valid_until date,approved_at timestamptz);
 create table transaction_bond_offer_decisions(id uuid primary key default gen_random_uuid(),transaction_id uuid,bond_offer_id uuid,decision text,decided_by uuid,decided_by_role text,notes text,decision_at timestamptz default now());
 create unique index transaction_bond_offer_decisions_one_accepted_idx on transaction_bond_offer_decisions(transaction_id) where decision='accepted';
 create table profiles(id uuid,role text);
 create table transaction_participants(transaction_id uuid,user_id uuid,status text,removed_at timestamptz,can_edit_finance_workflow boolean);
 create table transaction_finance_workflow_events(workflow_id uuid,from_stage text,to_stage text,event_type text,notes text,created_by uuid);
 create table transaction_notifications(transaction_id uuid,user_id uuid,role_type text,notification_type text,title text,message text,is_read boolean,dedupe_key text unique,event_type text,event_data jsonb);
 create function bridge_portal_matter_financial_transaction_id(text) returns uuid language sql stable as $$select nullif(current_setting('test.buyer_tx',true),'')::uuid$$;
 create function bridge_can_mutate_bond_transaction_canonical(uuid,text) returns boolean language sql stable as $$select auth.uid()='${id(10)}'::uuid and $1='${id(1)}'::uuid$$;
 create function bridge_resolve_transaction_notification_targets(uuid,text[]) returns table(user_id uuid,role_type text) language sql as $$select '${id(10)}'::uuid,'bond_originator'::text$$;
 insert into transactions(id,finance_type,lifecycle_state) values('${id(1)}','bond','active'),('${id(2)}','bond','active');
 insert into transaction_finance_workflows values('${id(20)}','${id(1)}','quote_received','active',null,null),('${id(21)}','${id(2)}','quote_received','active',null,null);
 insert into transaction_bond_quotes(id,transaction_id,workflow_id,quote_status,valid_until) values
 ('${id(30)}','${id(1)}','${id(20)}','received',current_date+30),
 ('${id(31)}','${id(1)}','${id(20)}','received',current_date+30),
 ('${id(32)}','${id(1)}','${id(20)}','received',current_date-1),
 ('${id(33)}','${id(2)}','${id(21)}','received',current_date+30);
 select set_config('test.uid','',false);select set_config('test.buyer_tx','${id(1)}',false);`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104112715_atomic_buyer_bond_offer_decision.sql',import.meta.url),'utf8'))
 await decide(id(30));assert.equal(await scalar('select quote_status from transaction_bond_quotes where id=$1',[id(30)]),'approved_by_buyer')
 assert.equal(await scalar('select current_stage from transaction_finance_workflows where id=$1',[id(20)]),'quote_accepted')
 await decide(id(30));assert.equal(await scalar('select count(*) from transaction_bond_offer_decisions'),1)
 assert.equal(await scalar('select count(*) from transaction_finance_workflow_events'),1)
 assert.equal(await scalar('select count(*) from transaction_notifications'),1)
 await assert.rejects(decide(id(32)),/expired/)
 await assert.rejects(decide(id(33)),/unavailable/)
 assert.equal(await scalar('select count(*) from transaction_bond_offer_decisions'),1)
 await decide(id(31));assert.equal(await scalar('select count(*) from transaction_bond_offer_decisions'),2)
 assert.equal(await scalar("select count(*) from transaction_bond_offer_decisions where decision='accepted' and superseded_at is null"),1)
 assert.equal(await scalar('select quote_status from transaction_bond_quotes where id=$1',[id(30)]),'received')
 await decide(id(31),'declined');assert.equal(await scalar('select quote_status from transaction_bond_quotes where id=$1',[id(31)]),'declined_by_buyer')
 assert.equal(await scalar("select count(*) from transaction_bond_offer_decisions where decision='accepted' and superseded_at is null"),0)
 await db.exec("select set_config('test.buyer_tx','',false)")
 await assert.rejects(decide(id(30)),/unavailable/)
 await db.exec(`select set_config('test.uid','${id(10)}',false);insert into profiles values('${id(10)}','bond_originator');`)
 await decide(id(30));assert.equal(await scalar("select decided_by_role from transaction_bond_offer_decisions where bond_offer_id=$1 and superseded_at is null order by decision_at desc limit 1",[id(30)]),'bond_originator')
 await db.query("update transaction_finance_workflows set current_stage='grant_received' where id=$1",[id(20)])
 await assert.rejects(decide(id(31)),/no longer available/)
 await db.query("update transaction_bond_quotes set quote_status='received' where id=$1",[id(31)])
 await assert.rejects(decide(id(31)),/grant or instruction/)
 await db.query("update transactions set lifecycle_state='cancelled' where id=$1",[id(1)])
 await assert.rejects(decide(id(30)),/cancelled/)
 await db.query("update transactions set lifecycle_state='active' where id=$1",[id(1)])
 await db.query("update transaction_finance_workflows set current_stage='quote_received' where id=$1",[id(20)])
  await db.exec(`select set_config('test.uid','',false);select set_config('test.buyer_tx','${id(1)}',false)`)
 const before=await scalar('select count(*) from transaction_bond_offer_decisions')
 await db.exec("create function reject_test_notification() returns trigger language plpgsql as $$begin raise exception 'simulated downstream failure';end$$;create trigger reject_test_notification before insert on transaction_notifications for each row execute function reject_test_notification();")
 await assert.rejects(decide(id(31)),/simulated downstream failure/)
 assert.equal(await scalar('select count(*) from transaction_bond_offer_decisions'),before)
 assert.equal(await scalar('select quote_status from transaction_bond_quotes where id=$1',[id(30)]),'approved_by_buyer')
 assert.equal(await scalar('select quote_status from transaction_bond_quotes where id=$1',[id(31)]),'received')
 console.log('PASS buyer selection commits quote, stage, history and notices atomically; replay, expiry, foreign/expired access, professional authority, replacement history, decline, closed/instruction guards and failure rollback.')
}finally{await db.close()}
