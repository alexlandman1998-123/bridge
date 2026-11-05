import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
try{
 await db.exec(`create role authenticated;create function bridge_current_profile_role() returns text language sql stable as $$select current_setting('test.profile_role',true)$$;
 create table transactions(id int primary key,stage text,current_main_stage text,lifecycle_state text,registered_at timestamptz,completed_at timestamptz,archived_at timestamptz,registered_by_user_id uuid);
 alter table transactions enable row level security;create policy legacy_permissive on transactions for all to authenticated using(true) with check(true);grant all on transactions to authenticated;`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104203825_transaction_insert_lifecycle_boundary.sql',import.meta.url),'utf8'))
 await db.exec('set role authenticated')
 let id=0
 for(const role of ['agent','attorney','developer']){
  await db.query("select set_config('test.profile_role',$1,false)",[role])
  await db.exec(`insert into transactions(id,stage,current_main_stage,lifecycle_state) values(${++id},'OTP Signed','OTP','active')`)
  for(const [column,value] of [['registered_at','now()'],['completed_at','now()'],['archived_at','now()'],['registered_by_user_id',"'00000000-0000-4000-8000-000000000001'"],['lifecycle_state',"'completed'"],['lifecycle_state',"'cancelled'"],['stage',"'Registered'"],['current_main_stage',"'REG'"]]){
   await assert.rejects(()=>db.exec(`insert into transactions(id,${column}) values(${++id},${value})`),/row-level security/)
  }
 }
 await db.query("select set_config('test.profile_role','attorney',false)")
 await db.exec("update transactions set stage='Registered',registered_at=now() where id=1")
 await db.query("select set_config('test.profile_role','internal_admin',false)")
 await db.exec(`insert into transactions(id,lifecycle_state,registered_at,completed_at) values(${++id},'completed',now(),now())`)
 await db.exec('reset role')
 await db.exec(`insert into transactions(id,lifecycle_state,registered_at,completed_at) values(${++id},'completed',now(),now())`)
 console.log('PASS actual restrictive INSERT RLS blocks closed/date/stage/actor spoofing for ordinary agents, attorneys and developers; normal creation, separately gated updates and trusted historical imports remain available.')
}finally{await db.close()}
