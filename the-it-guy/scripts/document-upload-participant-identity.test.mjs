import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create schema document_security;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
 create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql stable as $$select false$$;
 create function bridge_can_access_transaction_org_member(uuid) returns boolean language sql stable as $$select false$$;
 create table transaction_participants(transaction_id uuid,user_id uuid,participant_email text,status text,removed_at timestamptz,can_upload_documents boolean);
 insert into transaction_participants values('${id(1)}',null,'Originator@example.test','active',null,true);
 select set_config('test.uid','${id(2)}',false);select set_config('test.email','originator@example.test',false);`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104172449_document_upload_verified_participant_identity.sql',import.meta.url),'utf8'))
 const allowed=async n=>(await db.query('select document_security.can_upload($1) allowed',[id(n)])).rows[0].allowed
 assert.equal(await allowed(1),true);assert.equal(await allowed(3),false)
 for(const mutation of ["can_upload_documents=false","status='invited'","removed_at=now()",`user_id='${id(4)}'`]){
  await db.exec('begin');await db.exec(`update transaction_participants set ${mutation}`)
  assert.equal(await allowed(1),false,mutation);await db.exec('rollback')
 }
 await db.exec("select set_config('test.email','other@example.test',false)")
 assert.equal(await allowed(1),false)
 await db.exec("select set_config('test.email','originator@example.test',false);select set_config('test.uid','',false)")
 assert.equal(await allowed(1),false)
 console.log('PASS verified unbound invitation upload, exact scope, explicit permission, pending/removal, existing binding and anonymous isolation.')
}finally{await db.close()}
