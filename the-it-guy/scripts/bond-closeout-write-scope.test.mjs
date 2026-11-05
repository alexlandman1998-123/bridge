import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create schema handoff_private;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
 create table transactions(id uuid primary key,finance_type text,lifecycle_state text,consultant uuid);
 create function bridge_is_bond_transaction_canonical_ready(uuid) returns boolean language sql stable as $$select true$$;
 create function bridge_can_mutate_bond_transaction_assigned(uuid,text) returns boolean language sql stable as $$select exists(select 1 from transactions where id=$1 and consultant=auth.uid())$$;
 create function bridge_can_mutate_bond_transaction_scoped(uuid,text) returns boolean language sql stable as $$select false$$;
 create table transaction_bond_closeouts(id uuid primary key,transaction_id uuid,notes text);
 create table transaction_bond_closeout_documents(id uuid primary key,transaction_bond_closeout_id uuid,status text);
 alter table transaction_bond_closeouts enable row level security;alter table transaction_bond_closeout_documents enable row level security;
 create policy read_c on transaction_bond_closeouts for select to authenticated using (true);
 create policy read_d on transaction_bond_closeout_documents for select to authenticated using (true);
 grant usage on schema public,auth to authenticated;grant select,insert,update on transaction_bond_closeouts,transaction_bond_closeout_documents to authenticated;
 insert into transactions values('${id(1)}','bond','registered','${id(10)}'),('${id(2)}','cash','active','${id(10)}'),('${id(3)}','bond','archived','${id(10)}');`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104122432_bond_closeout_assigned_originator_writes.sql',import.meta.url),'utf8'))
 await db.exec(`set role authenticated;select set_config('request.uid','${id(10)}',false);insert into transaction_bond_closeouts values('${id(20)}','${id(1)}','owned');insert into transaction_bond_closeout_documents values('${id(30)}','${id(20)}','uploaded');update transaction_bond_closeouts set notes='reviewed' where id='${id(20)}';`)
 for(const matter of [2,3])await assert.rejects(()=>db.exec(`insert into transaction_bond_closeouts values('${id(20+matter)}','${id(matter)}','forbidden')`),/row-level security/)
 await db.exec(`select set_config('request.uid','${id(11)}',false);`)
 await assert.rejects(()=>db.exec(`insert into transaction_bond_closeouts values('${id(24)}','${id(1)}','foreign')`),/row-level security/)
 await assert.rejects(()=>db.exec(`insert into transaction_bond_closeout_documents values('${id(31)}','${id(20)}','uploaded')`),/row-level security/)
 const updated=await db.query(`update transaction_bond_closeouts set notes='spoofed' where id='${id(20)}' returning id`)
 assert.equal(updated.rows.length,0)
 await db.exec('reset role')
 assert.equal((await db.query('select notes from transaction_bond_closeouts')).rows[0].notes,'reviewed')
 console.log('PASS assigned-originator closeout and document saves; unrelated user, cash, archived and foreign-parent writes denied.')
}finally{await db.close()}
