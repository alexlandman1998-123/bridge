import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create schema journey_private;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
 create function bridge_current_profile_role() returns text language sql stable as $$select case when auth.uid()='${id(10)}'::uuid then 'internal_admin' else 'agent' end$$;
 create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql stable as $$select auth.uid()='${id(9)}'::uuid and $1='${id(1)}'::uuid and $2='transfer_attorney'$$;
 create table organisation_users(organisation_id uuid,user_id uuid,status text,app_role text);
 insert into organisation_users values('${id(2)}','${id(8)}','active','developer'),('${id(3)}','${id(7)}','active','developer');
 create table transactions(id uuid primary key,unit_id uuid,development_id uuid,organisation_id uuid,listing_id uuid,buyer_id uuid,registered_at timestamptz,registration_date date,title_deed_number text,registration_confirmation_document_id uuid,registered_by_user_id uuid,stage text,current_main_stage text,lifecycle_state text,completed_at timestamptz,registration_reversal_reason text,registration_reversed_at timestamptz);
 insert into transactions(id,organisation_id,stage,current_main_stage,lifecycle_state) values('${id(1)}','${id(2)}','OTP Signed','OTP','active');`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104174321_transaction_registration_actor_boundary.sql',import.meta.url),'utf8'))
 const actor=async n=>db.query("select set_config('test.uid',$1,false)",[id(n)])
 const update=patch=>db.exec(`update transactions set ${patch} where id='${id(1)}'`)
 await actor(6);await assert.rejects(()=>update('registered_at=now()'),/role cannot change registration/)
 await actor(7);await assert.rejects(()=>update('registered_at=now()'),/role cannot change registration/)
 await actor(9);await update("registered_at=now(),stage='Registered',current_main_stage='REG',lifecycle_state='registered'")
 await actor(6);await assert.rejects(()=>update('registered_at=null'),/role cannot change registration/)
 await actor(9);await assert.rejects(()=>update('registered_at=null'),/Only an authorised developer/)
 await update("completed_at=now(),lifecycle_state='completed'")
 await assert.rejects(()=>update('completed_at=null'),/reopen closeout/)
 await actor(8);await assert.rejects(()=>update('registered_at=null'),/fresh registration reversal/)
 await assert.rejects(()=>update(`unit_id='${id(5)}'`),/Undo registration before changing/)
 await update("registered_at=null,completed_at=null,registration_reversal_reason='Reviewed fixture reversal',registration_reversed_at=now(),stage='Transfer in Progress',current_main_stage='XFER',lifecycle_state='active'")
 await update(`unit_id='${id(5)}'`)
 await actor(10);await update("registered_at=now(),stage='Registered',current_main_stage='REG',lifecycle_state='registered'")
 await actor(6);await update("stage='Registered'")
 assert.equal((await db.query("select has_function_privilege('anon','journey_private.guard_transaction_registration_actor()','execute') allowed")).rows[0].allowed,false)
 console.log('PASS ordinary-agent denial, foreign-developer denial, appointed transfer writer, admin reversal evidence, closeout reopening and registered identity preservation.')
}finally{await db.close()}
