import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create schema handoff_private;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function bridge_current_profile_role() returns text language sql stable as $$select case when auth.uid()='${id(9)}' then 'internal_admin' else 'attorney' end$$;
 create table organisation_users(organisation_id uuid,user_id uuid,status text,app_role text);
 insert into organisation_users values('${id(10)}','${id(1)}','active','developer'),('${id(11)}','${id(4)}','active','developer');
 create table transactions(id uuid primary key,organisation_id uuid,lifecycle_state text,status text default 'active',registered_at timestamptz,completed_at timestamptz,current_main_stage text,archived_at timestamptz,archived_by_user_id uuid,archive_reason text,cancelled_at timestamptz,cancelled_by_user_id uuid,cancelled_reason text,updated_at timestamptz);
 create table transaction_role_players(transaction_id uuid,role_type text,assigned_organisation_id uuid,partner_organisation_id uuid,organisation_id uuid,status text,removed_at timestamptz);
 create table transaction_partner_assignments(transaction_id uuid,partner_role text,partner_organisation_id uuid,assignment_status text);
 create table transaction_legal_role_appointments(id uuid,transaction_id uuid,role_type text,updated_at timestamptz,accepted_firm_id uuid,coordination_state text);
 create table transaction_attorney_assignments(transaction_id uuid,attorney_role text,assignment_status text,status text,attorney_firm_id uuid,firm_id uuid,attorney_user_id uuid,updated_at timestamptz);
 create table transaction_events(transaction_id uuid,event_type text,event_data jsonb,created_by uuid,created_by_role text);
 create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql stable security definer set search_path=public as $$select auth.uid()='${id(2)}' and exists(select 1 from transaction_role_players r where r.transaction_id=$1 and r.role_type=$2 and r.status='active')$$;
 create function handoff_private.retire_partner_lane(uuid,text,uuid) returns void language plpgsql security definer set search_path=public as $$declare prior text:=current_setting('arch9.handoff_retiring',true);begin
 perform set_config('arch9.handoff_retiring','true',true);
 update transaction_role_players set status='removed',removed_at=now() where transaction_id=$1 and role_type=$2;
 update transaction_attorney_assignments set assignment_status='removed',status='removed',updated_at=now(),attorney_firm_id=case when current_setting('test.change_firm',true)='true' then '${id(99)}'::uuid else attorney_firm_id end where transaction_id=$1 and attorney_role=$2;
 perform set_config('arch9.handoff_retiring',coalesce(prior,''),true);end$$;
 alter table transactions enable row level security;alter table transaction_events enable row level security;
 create policy readable on transactions for select to authenticated using(bridge_can_mutate_attorney_lane(id,'transfer_attorney','workflow') or exists(select 1 from organisation_users u where u.user_id=auth.uid() and u.organisation_id=transactions.organisation_id));
 create policy events_insert on transaction_events for insert to authenticated with check(bridge_can_mutate_attorney_lane(transaction_id,'transfer_attorney','workflow'));
 grant usage on schema auth to authenticated;grant select on transactions,organisation_users,transaction_role_players to authenticated;grant all on transaction_attorney_assignments to authenticated;grant insert on transaction_events to authenticated;
 create function fail_test_audit() returns trigger language plpgsql as $$begin if current_setting('test.fail_audit',true)='true' then raise exception 'Controlled audit persistence failure';end if;return new;end$$;
 create trigger audit_failure before insert on transaction_events for each row execute function fail_test_audit();`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104204701_transaction_archive_command_integrity.sql',import.meta.url),'utf8'))
 await db.exec(`create trigger bank_staff before update on transaction_attorney_assignments for each row execute function bridge_enforce_appointed_firm_staff_assignment();
 create trigger closed_retirement after update on transactions for each row execute function handoff_private.closed_matter_retirement();
 insert into transactions(id,organisation_id,lifecycle_state,registered_at,completed_at,current_main_stage) values('${id(20)}','${id(10)}','completed',now(),now(),'REG'),('${id(21)}','${id(10)}','active',null,null,'OTP');
 insert into transaction_role_players select t.id,role,'${id(12)}',null,null,'active',null from transactions t cross join (values('transfer_attorney'),('bond_attorney')) v(role);
 insert into transaction_legal_role_appointments select '${id(30)}',id,'bond_attorney',now(),'${id(40)}','active' from transactions;
 insert into transaction_attorney_assignments select id,'bond_attorney','active','active','${id(40)}','${id(40)}','${id(2)}',now() from transactions;`)
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[id(n)]);await db.exec('set role authenticated')}
 const action=async(n,a,reason='Controlled staging action')=>(await db.query('select bridge_apply_transaction_lifecycle_action($1,$2,$3) result',[id(n),a,reason])).rows[0].result
 await actor(3);await assert.rejects(()=>action(20,'archive'),/not available/)
 await actor(4);await assert.rejects(()=>action(20,'archive'),/not available/)
 await actor(2);await assert.rejects(()=>action(20,'cancel'),/Undo registration/)
 await assert.rejects(()=>db.exec("update transaction_attorney_assignments set assignment_status='removed'"),/cannot be removed/)
 await db.query("select set_config('arch9.handoff_retiring','true',false)")
 await assert.rejects(()=>db.exec("update transaction_attorney_assignments set assignment_status='removed'"),/cannot be removed/)
 await db.query("select set_config('arch9.handoff_retiring','',false)")
 await db.query("select set_config('test.change_firm','true',false)")
 await assert.rejects(()=>action(20,'archive'),/cannot be removed/)
 await db.query("select set_config('test.change_firm','',false)")
 await db.query("select set_config('test.fail_audit','true',false)")
 await assert.rejects(()=>action(20,'archive'),/Controlled audit persistence failure/)
 await db.query("select set_config('test.fail_audit','',false)")
 assert.equal((await db.query(`select lifecycle_state from transactions where id='${id(20)}'`)).rows[0].lifecycle_state,'completed','Audit failure must roll back archival and retirement')
 const archived=await action(20,'archive');assert.equal(archived.lifecycle_state,'archived')
 assert.equal((await db.query(`select id from transactions where id='${id(20)}'`)).rows.length,0,'Retired external access must stay revoked')
 await assert.rejects(()=>action(20,'unarchive'),/not available/)
 await actor(1);const restored=await action(20,'unarchive');assert.equal(restored.lifecycle_state,'completed');assert.equal(restored.completed_at,archived.completed_at)
 await db.exec('reset role')
 assert.equal((await db.query(`select count(*)::int n from transaction_role_players where transaction_id='${id(20)}' and status='active'`)).rows[0].n,0,'Unarchive must not reactivate external partners')
 assert.equal((await db.query(`select accepted_firm_id from transaction_legal_role_appointments where transaction_id='${id(20)}'`)).rows[0].accepted_firm_id,id(40))
 assert.equal((await db.query(`select count(*)::int n from transaction_events where transaction_id='${id(20)}'`)).rows[0].n,2)
 await actor(2);await assert.rejects(()=>action(21,'cancel',''),/reason is required/)
 assert.equal((await action(21,'cancel')).lifecycle_state,'cancelled')
 await db.exec('reset role')
 assert.equal((await db.query(`select count(*)::int n from transaction_role_players where transaction_id='${id(21)}' and status='active'`)).rows[0].n,0)
 console.log('PASS real SQL archive/cancel commands, event atomicity under revoked RLS access, narrow bank retirement, firm identity protection, owner restoration, no external access reactivation, role/tenant denials and registered cancellation denial.')
}finally{await db.close()}
