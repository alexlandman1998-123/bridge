import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create schema journey_private;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
 create function bridge_current_profile_role() returns text language sql stable as $$select case when auth.uid()='${id(9)}' then 'internal_admin' else 'agent' end$$;
 create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql stable as $$select auth.uid()='${id(2)}' and $1='${id(20)}'$$;
 create table organisation_users(organisation_id uuid,user_id uuid,status text,app_role text);
 insert into organisation_users values('${id(10)}','${id(1)}','active','developer'),('${id(11)}','${id(4)}','active','developer');
 create table transactions(id uuid primary key,organisation_id uuid,lifecycle_state text,cancelled_at timestamptz,cancelled_reason text,cancelled_by_user_id uuid);
 insert into transactions values('${id(20)}','${id(10)}','active',null,null,null);`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104205757_transaction_cancellation_actor_boundary.sql',import.meta.url),'utf8'))
 const actor=n=>db.query("select set_config('test.uid',$1,false)",[n?id(n):''])
 const update=patch=>db.exec(`update transactions set ${patch} where id='${id(20)}'`)
 await actor(3);await assert.rejects(()=>update("lifecycle_state='cancelled',cancelled_at=now(),cancelled_reason='Withdrawn'"),/role cannot cancel/)
 await actor(4);await assert.rejects(()=>update("lifecycle_state='cancelled'"),/role cannot cancel/)
 await actor(2);await update("lifecycle_state='cancelled',cancelled_at=now(),cancelled_reason='Withdrawn'")
 await actor(3);await assert.rejects(()=>update("cancelled_reason='Spoofed'"),/role cannot cancel/)
 await assert.rejects(()=>update("lifecycle_state='active'"),/role cannot cancel/)
 await actor(1);await update("cancelled_reason='Reviewed correction'")
 await actor(9);await update("lifecycle_state='active'")
 await actor(0);await update("lifecycle_state='cancelled'")
 console.log('PASS direct cancellation, cancellation-history and reversal authority: ordinary/foreign agents denied; assigned transfer writer, owning developer, internal admin and trusted maintenance preserved.')
}finally{await db.close()}
