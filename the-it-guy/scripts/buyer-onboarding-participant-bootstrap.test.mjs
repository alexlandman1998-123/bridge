import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
const tx='00000000-0000-4000-8000-000000000001', buyer='00000000-0000-4000-8000-000000000002'
try {
 await db.exec(`
 create table transactions(id uuid primary key,buyer_id uuid,primary_buyer_participant_id uuid);
 create table transaction_participants(id uuid primary key default gen_random_uuid(),transaction_id uuid,user_id uuid,role_type text,legal_role text,transaction_role text,status text,visibility_scope text,is_internal boolean,participant_name text,participant_email text,participant_phone text,buyer_party_id uuid,buyer_party_role text,buyer_party_position integer,is_primary_buyer boolean default false,can_view boolean,can_comment boolean,can_upload_documents boolean,can_edit_finance_workflow boolean,can_edit_attorney_workflow boolean,can_edit_core_transaction boolean,updated_at timestamptz);
 create unique index non_buyer_role on transaction_participants(transaction_id,role_type,legal_role) where coalesce(transaction_role,'')<>'buyer';
 create unique index one_primary on transaction_participants(transaction_id) where transaction_role='buyer' and is_primary_buyer=true and coalesce(status,'active') not in ('inactive','removed','archived','deleted');
 create unique index buyer_party on transaction_participants(transaction_id,buyer_party_id) where transaction_role='buyer' and buyer_party_id is not null and coalesce(status,'active') not in ('inactive','removed','archived','deleted');
 create table transaction_participant_requirements(transaction_id uuid,role_key text,role_type text,legal_role text,transaction_role text,required_by text,required_at_creation boolean,label text,reason text,participant_id uuid,status text,updated_at timestamptz,unique(transaction_id,role_key));
 create table buyers(id uuid primary key,phone text);
 insert into buyers values('${buyer}','0000000000');
 insert into transactions values('${tx}','${buyer}',null);
 create role authenticated; create role anon; create role service_role;
 `)
 const bootstrap={requirements:[{roleKey:'buyer',roleType:'buyer',transactionRole:'buyer',label:'Buyer',requiredBy:'creation'},{roleKey:'seller',roleType:'seller',transactionRole:'seller',label:'Seller',requiredBy:'creation'}],participants:[{roleKey:'buyer',roleType:'buyer',transactionRole:'buyer',name:'QA Buyer',email:'qa@example.invalid'},{roleKey:'seller',roleType:'seller',transactionRole:'seller',name:'QA Seller',email:'seller@example.invalid'}]}
 await db.exec(readFileSync('../supabase/migrations/20260719193500_mvp_atomic_transaction_creation_reconciliation.sql','utf8').match(/create or replace function public\.bridge_seed_mvp_transaction_participants\([\s\S]*?\$\$;/i)[0])
 await assert.rejects(db.query('select bridge_seed_mvp_transaction_participants($1,$2)',[tx,bootstrap]),/no unique or exclusion constraint/)
 const migration=readFileSync('../supabase/migrations/20261019203059_buyer_onboarding_participant_bootstrap.sql','utf8')
 const phoneMigration=readFileSync('../supabase/migrations/20261019203344_buyer_onboarding_participant_phone_source.sql','utf8')
 await db.exec(migration)
 await db.exec(phoneMigration)
 await db.exec(`revoke all on function bridge_seed_mvp_transaction_participants(uuid,jsonb) from public,anon,authenticated,service_role`)
 for(let i=0;i<2;i++)await db.query('select bridge_seed_mvp_transaction_participants($1,$2)',[tx,bootstrap])
 let rows=(await db.query('select * from transaction_participants order by transaction_role')).rows
 assert.equal(rows.length,2);assert.equal(rows[0].buyer_party_id,buyer);assert.equal(rows[0].is_primary_buyer,true);assert.equal(rows[0].participant_phone,'0000000000')
 assert.equal((await db.query('select primary_buyer_participant_id from transactions')).rows[0].primary_buyer_participant_id,rows[0].id)
 const primaryId=rows[0].id
 await db.exec(`insert into transaction_participants(transaction_id,role_type,legal_role,transaction_role,status,participant_name,buyer_party_id,is_primary_buyer) values('${tx}','buyer','none','buyer','active','Additional QA','00000000-0000-4000-8000-000000000003',false)`)
 bootstrap.participants[0].name='QA Updated'
 await db.query('select bridge_seed_mvp_transaction_participants($1,$2)',[tx,bootstrap])
 rows=(await db.query('select * from transaction_participants')).rows
 assert.equal(rows.length,3);assert.equal(rows.find(r=>r.id===primaryId).participant_name,'QA Updated');assert.equal(rows.find(r=>r.participant_name==='Additional QA').is_primary_buyer,false)
 assert.equal((await db.query("select count(*)::int n from transaction_participant_requirements where status='captured' and participant_id is not null")).rows[0].n,2)
 await db.exec(migration)
 await db.exec(phoneMigration)
 assert.equal((await db.query("select has_function_privilege('authenticated','bridge_seed_mvp_transaction_participants(uuid,jsonb)','execute') allowed")).rows[0].allowed,false)
 await db.query('select bridge_seed_mvp_transaction_participants($1,$2)',[tx,bootstrap]);assert.equal((await db.query('select count(*)::int n from transaction_participants')).rows[0].n,3)
 console.log('buyer onboarding participants: current partial indexes, primary identity, non-buyer retry, additional buyer preservation, requirements and ACL passed')
}finally{await db.close()}
