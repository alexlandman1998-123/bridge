import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
try{
 await db.exec(`create schema auth;create role authenticated;create role anon;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
 create table auth.users(id uuid,email text); -- deliberately no caller grant
 create table transaction_participants(transaction_id uuid,user_id uuid,participant_email text,status text,removed_at timestamptz);
 create table transaction_role_players(transaction_id uuid,user_id uuid,email_address text,status text,assignment_status text,role_type text,legal_role text);
 grant usage on schema auth to authenticated,anon;grant select on transaction_participants,transaction_role_players to authenticated,anon;
 insert into transaction_participants values('${id(1)}','${id(10)}','consultant@example.test','active',null);
 insert into transaction_role_players values('${id(1)}','${id(10)}','consultant@example.test','active','active','bond_originator','none');`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104114000_bond_participant_verified_identity_lookup.sql',import.meta.url),'utf8'))
 await db.exec(`select set_config('test.uid','${id(10)}',false);select set_config('test.jwt','{"email":"consultant@example.test"}',false);set role authenticated;`)
 for(const fn of ['bridge_has_bond_transaction_participant_access','bridge_has_bond_transaction_role_player_access']){
  assert.equal(await scalar(`select ${fn}($1)`,[id(1)]),true)
  assert.equal(await scalar(`select ${fn}($1)`,[id(2)]),false,'A membership on one matter must never grant a different matter.')
 }
 await db.exec("reset role;update transaction_participants set removed_at=now();update transaction_role_players set assignment_status='revoked';set role authenticated;")
 assert.equal(await scalar('select bridge_has_bond_transaction_participant_access($1)',[id(1)]),false)
 assert.equal(await scalar('select bridge_has_bond_transaction_role_player_access($1)',[id(1)]),false)
 await db.exec("reset role;select set_config('test.uid','',false);set role anon;")
 assert.equal(await scalar('select bridge_has_bond_transaction_participant_access($1)',[id(1)]),false)
 console.log('PASS assigned identity works without auth.users privileges, remains bound to the exact transaction and denies removed, revoked and anonymous identities.')
}finally{await db.close()}
