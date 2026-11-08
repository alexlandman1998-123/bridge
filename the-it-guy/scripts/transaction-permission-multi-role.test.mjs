import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
 create function public.bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql stable as $$select auth.uid()='${id(9)}'::uuid and $1='${id(5)}'::uuid and $2='transfer_attorney'$$;
 create function public.bridge_normalize_transaction_role(text,text,text) returns text language sql immutable as $$select coalesce($3,$1)$$;
 create table transaction_participants(id uuid primary key,transaction_id uuid,user_id uuid,role_type text,legal_role text,transaction_role text,participant_email text,status text,removed_at timestamptz,accepted_at timestamptz,updated_at timestamptz,created_at timestamptz default now());
 insert into transaction_participants(id,transaction_id,user_id,role_type,status,accepted_at) values
 ('${id(10)}','${id(1)}','${id(9)}','transfer_attorney','active',now()-interval '1 day'),
 ('${id(11)}','${id(1)}','${id(9)}','bond_attorney','accepted',now()),
 ('${id(12)}','${id(1)}','${id(9)}','cancellation_attorney','active',now()+interval '1 hour'),
 ('${id(13)}','${id(2)}','${id(9)}','buyer','active',now()+interval '2 hours'),
 ('${id(14)}','${id(3)}','${id(8)}','listing_agent','active',now());
 select set_config('test.uid','${id(9)}',false);`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104135729_transaction_permission_canonical_assignments.sql',import.meta.url),'utf8'))
 const permission=async(matter,key)=>(await db.query('select bridge_has_transaction_permission($1,$2) as allowed',[id(matter),key])).rows[0].allowed
 const role=async matter=>(await db.query('select bridge_current_transaction_role($1) as role',[id(matter)])).rows[0].role
 assert.equal(await role(1),'cancellation_attorney');assert.equal(await role(2),'buyer');assert.equal(await role(3),null)
 for(const key of ['view_transaction','view_documents','comment','manage_transfer_workflow','upload_transfer_docs','manage_bond_workflow','upload_bond_docs'])assert.equal(await permission(1,key),true,key)
 for(const key of ['edit_core_transaction','invite_participants','unknown'])assert.equal(await permission(1,key),false,key)
 assert.equal(await permission(2,'view_transaction'),true)
 for(const key of ['manage_transfer_workflow','manage_bond_workflow','edit_core_transaction'])assert.equal(await permission(2,key),false)
 assert.equal(await permission(3,'view_transaction'),false)
 await db.query('update transaction_participants set removed_at=now() where id=$1',[id(10)])
 assert.equal(await permission(1,'manage_transfer_workflow'),false);assert.equal(await permission(1,'manage_bond_workflow'),true)
 await db.query("update transaction_participants set status='pending' where id=$1",[id(11)])
 assert.equal(await permission(1,'manage_bond_workflow'),false)
 assert.equal(await permission(5,'manage_transfer_workflow'),true)
 assert.equal(await permission(5,'view_transaction'),true)
 assert.equal(await permission(5,'manage_bond_workflow'),false)
 assert.equal(await permission(5,'edit_core_transaction'),false)
 await db.query('insert into transaction_participants(id,transaction_id,role_type,participant_email,status) values($1,$2,$3,$4,$5)',[id(15),id(6),'listing_agent','controlled@example.test','active'])
 await db.exec(`select set_config('test.email','controlled@example.test',false)`)
 assert.equal(await permission(6,'edit_core_transaction'),true)
 await db.query('update transaction_participants set user_id=$1 where id=$2',[id(8),id(15)])
 assert.equal(await permission(6,'edit_core_transaction'),false,'A verified email must not override an existing different user binding')
 await db.exec(`select set_config('test.uid','',false)`)
 assert.equal(await role(1),null);assert.equal(await permission(1,'view_transaction'),false)
 console.log('PASS multi-role permissions, exact matter scope, buyer isolation, unrelated user, removed/pending roles and anonymous denial.')
}finally{await db.close()}
