import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
try{
 await db.exec(`create role anon;create role authenticated;create schema journey_private;create schema handoff_private;grant usage on schema handoff_private to authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table transactions(id uuid primary key,finance_type text,bond_workspace_id uuid,bond_region_id uuid,bond_workspace_unit_id uuid,
 primary_bond_consultant_user_id uuid,assigned_bond_processor_user_id uuid,assigned_bond_manager_user_id uuid,assigned_bond_compliance_user_id uuid,bond_assignment_status text,bond_assignment_source text);
 create table organisation_users(user_id uuid,organisation_id uuid,status text);
 create table transaction_bond_applications(id uuid primary key,transaction_id uuid,application_type text,assignment_status text,
 assigned_organisation_id uuid,assigned_region_id uuid,assigned_workspace_unit_id uuid,assigned_branch_id uuid,assigned_team_id uuid,assigned_user_id uuid);
 create table transaction_comments(id uuid primary key,transaction_id uuid,author_user_id uuid,author_role text,visibility_scope text);
 alter table transaction_comments enable row level security;grant select,insert on transaction_comments to authenticated;grant usage on schema auth to authenticated;
 create function bridge_is_bond_transaction_canonical_ready(uuid) returns boolean language sql stable as $$select $1='${id(1)}'::uuid$$;
 create function bridge_can_mutate_bond_transaction_canonical(uuid,text) returns boolean language sql stable as $$select auth.uid()='${id(10)}'::uuid and $1='${id(1)}'::uuid and $2='workflow_mutation'$$;`)
 for(const file of ['20261104112241_bond_originator_assignment_projection.sql','20261104112012_bond_originator_shared_activity_scope.sql','20261104122832_bond_shared_activity_policy_evaluation.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
 await db.query('insert into transactions(id,finance_type) values($1,$2),($3,$4)',[id(1),'bond',id(2),'cash'])
 await db.query("insert into organisation_users values($1,$2,'active'),($3,$4,'active')",[id(10),id(20),id(11),id(21)])
 await db.query("insert into transaction_bond_applications(id,transaction_id,application_type,assignment_status,assigned_organisation_id,assigned_user_id) values($1,$2,'originator_intake','consultant_assigned',$3,$4)",[id(30),id(1),id(20),id(10)])
 assert.equal(await scalar('select primary_bond_consultant_user_id from transactions where id=$1',[id(1)]),id(10))
 assert.equal(await scalar('select bond_workspace_id from transactions where id=$1',[id(1)]),id(20))
 await db.query('update transactions set assigned_bond_processor_user_id=$1 where id=$2',[id(12),id(1)])
 await db.query('update transaction_bond_applications set assigned_organisation_id=$1,assigned_user_id=$2 where id=$3',[id(21),id(11),id(30)])
 assert.equal(await scalar('select primary_bond_consultant_user_id from transactions where id=$1',[id(1)]),id(11))
 assert.equal(await scalar('select assigned_bond_processor_user_id from transactions where id=$1',[id(1)]),null)
 await assert.rejects(db.query('update transaction_bond_applications set assigned_user_id=$1 where id=$2',[id(10),id(30)]),/active member/)
 assert.equal(await scalar('select primary_bond_consultant_user_id from transactions where id=$1',[id(1)]),id(11))
 await assert.rejects(db.query("insert into transaction_bond_applications(id,transaction_id,application_type,assignment_status,assigned_organisation_id,assigned_user_id) values($1,$2,'originator_intake','consultant_assigned',$3,$4)",[id(31),id(1),id(20),id(10)]),/only have one/)
 await db.query("update transaction_bond_applications set assignment_status='inactive' where id=$1",[id(30)])
 assert.equal(await scalar('select bond_workspace_id from transactions where id=$1',[id(1)]),null)
 assert.equal(await scalar('select primary_bond_consultant_user_id from transactions where id=$1',[id(1)]),null)
 await db.query("insert into transaction_bond_applications(id,transaction_id,application_type,assignment_status,assigned_organisation_id,assigned_user_id) values($1,$2,'bank_application','consultant_assigned',$3,$4)",[id(32),id(2),id(20),id(10)])
 assert.equal(await scalar('select bond_workspace_id from transactions where id=$1',[id(2)]),null)
 await db.query("insert into transaction_comments values($1,$2,$3,'agent','internal')",[id(40),id(1),id(50)])
 await db.exec(`select set_config('test.uid','${id(10)}',false);set role authenticated;`)
 await db.query("insert into transaction_comments values($1,$2,$3,'bond_originator','shared')",[id(41),id(1),id(10)])
 assert.equal(await scalar('select count(*) from transaction_comments'),1)
 for(const [matter,author,role,visibility] of [[id(2),id(10),'bond_originator','shared'],[id(1),id(11),'bond_originator','shared'],[id(1),id(10),'attorney','shared'],[id(1),id(10),'bond_originator','internal']])await assert.rejects(db.query('insert into transaction_comments values($1,$2,$3,$4,$5)',[id(42),matter,author,role,visibility]),/row-level security/)
 await db.exec(`select set_config('test.uid','${id(11)}',false)`)
 assert.equal(await scalar('select count(*) from transaction_comments'),0)
 console.log('PASS canonical assignment projection, cross-workspace reassignment, stale processor removal, membership validation, duplicate protection, revocation, bank-row isolation, shared activity, author identity and internal-note privacy.')
}finally{await db.close()}
