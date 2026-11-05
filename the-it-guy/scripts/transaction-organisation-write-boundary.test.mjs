import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create schema journey_private;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
 create function bridge_current_profile_role() returns text language sql stable as $$select case when auth.uid()='${id(9)}' then 'internal_admin' else 'agent' end$$;
 create function bridge_is_active_member(uuid) returns boolean language sql stable as $$select (auth.uid()='${id(1)}' and $1='${id(11)}') or (auth.uid()='${id(2)}' and $1='${id(12)}') or auth.uid()='${id(3)}'$$;
 create table transactions(id int primary key,organisation_id uuid,created_by uuid,stage text);
 alter table transactions enable row level security;
 create policy legacy_permissive on transactions for all to authenticated using(true) with check(true);
 grant usage on schema auth to authenticated;grant all on transactions to authenticated;`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104191023_transaction_organisation_write_boundary.sql',import.meta.url),'utf8'))
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[id(n)]);await db.exec('set role authenticated')}
 await actor(1)
 await db.exec(`insert into transactions values(1,'${id(11)}','${id(1)}','OTP Signed')`)
 await assert.rejects(()=>db.exec(`insert into transactions values(2,'${id(12)}','${id(1)}','OTP Signed')`),/row-level security/)
 await assert.rejects(()=>db.exec(`insert into transactions values(2,'${id(11)}','${id(2)}','OTP Signed')`),/row-level security/)
 await assert.rejects(()=>db.exec(`insert into transactions values(2,null,'${id(1)}','OTP Signed')`),/row-level security/)
 await actor(2);await db.exec("update transactions set stage='Transfer in Progress' where id=1")
 await assert.rejects(()=>db.exec(`update transactions set organisation_id='${id(12)}' where id=1`),/both organisations/)
 await actor(1);await assert.rejects(()=>db.exec(`update transactions set organisation_id='${id(12)}' where id=1`),/both organisations/)
 await actor(3);await db.exec(`update transactions set organisation_id='${id(12)}' where id=1`)
 await actor(9);await db.exec(`insert into transactions values(2,'${id(11)}','${id(2)}','OTP Signed')`)
 await db.exec(`update transactions set organisation_id='${id(11)}' where id=1`)
 await db.exec('reset role');await db.query("select set_config('test.uid','',false)")
 await db.exec(`update transactions set organisation_id='${id(12)}' where id=1`)
 console.log('PASS real restrictive RLS: own organisation, foreign denial without RETURNING, creator identity, delegated workflow edits, two-organisation move authority, internal and trusted server compatibility.')
}finally{await db.close()}
