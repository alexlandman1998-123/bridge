import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('firm reporting matches authorized register, hides restricted matters, rechecks roles and performs no writes',async()=>{
 const db=new PGlite(),firm=randomUUID(),user=randomUUID(),director=randomUUID(),foreign=randomUUID();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,anon;
 create table attorney_firms(id uuid primary key,is_active boolean,organisation_id uuid);create table attorney_firm_members(firm_id uuid,user_id uuid,status text,role text,professional_role text);create table profiles(id uuid primary key,full_name text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;
 create table transactions(status text);insert into transactions values('unchanged');`);
 for(const id of [firm,foreign])await db.query('insert into attorney_firms values($1,true,$2)',[id,randomUUID()]);
 for(const id of [user,director]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into profiles values($1,$2)',[id,id===user?'Attorney':'Partner']);await db.query("insert into attorney_firm_members values($1,$2,'active',$3,$3)",[firm,id,id===director?'director_partner':'attorney_conveyancer']);}
 for(const file of ['20261011145029_arch9_legal_matter_foundation.sql','20261011145949_arch9_legal_workspace_commands.sql','20261011155632_arch9_legal_work_and_documents.sql','20261011162425_arch9_legal_firm_overview.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 async function rpc(actor,name,args){return db.transaction(async tx=>{await tx.exec('set local role '+(actor?'authenticated':'anon'));await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);return (await tx.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;});}
 const grant=id=>({user_id:id,disciplines:['wills_estates','trusts'],can_create:true,can_edit:true,can_review:true,can_manage:id===director});
 await rpc(director,'arch9_legal_command',[firm,randomUUID(),'configure',{enabled:true,disciplines:['wills_estates','trusts'],grants:[user,director].map(grant),expected_revision:0}]);
 const create=async(title,discipline='wills_estates',restricted=false)=>(await rpc(user,'arch9_legal_create',[firm,randomUUID(),{discipline,title,client:{kind:'individual',name:'Client'},responsible_user_id:user,user_ids:[user],restricted}])).matter;
 const visible=await create('Visible will'),secret=await create('Secret will','wills_estates',true);await create('Trust','trusts');
 const today=(await db.query("select (now() at time zone 'Africa/Johannesburg')::date::text today")).rows[0].today;
 await db.query("insert into legal_private.tasks(firm_id,matter_id,title,owner_id,due_on) values($1,$2,'Review',$3,$4::date-1),($1,$5,'Hidden',$3,$4::date-1)",[firm,visible.id,user,today,secret.id]);
 await db.query('insert into legal_private.work_state(firm_id,matter_id,dates) values($1,$2,$3)',[firm,visible.id,{review_on:today}]);
 const counts=async()=>(await db.query('select (select count(*) from legal_private.events) events,(select count(*) from legal_private.receipts) receipts')).rows;
 const before=await counts();let result=await rpc(director,'arch9_legal_firm_overview',[firm,null]);
 assert.equal(result.total,2);assert.equal(result.active,2);assert.equal(result.intake,2);assert.equal(result.overdue,1);assert.equal(result.upcoming.length,1);assert.equal(result.today,today);assert.equal(result.upcoming[0].due_on,today);assert.equal(result.upcoming[0].label,'review');assert.equal(result.workload[0].matters,2);assert.ok(!JSON.stringify(result).includes('Secret'));
 const register=await rpc(director,'arch9_legal_read',[firm,'matters',{scope:'all'}]);assert.equal(result.total,register.total);assert.deepEqual(await counts(),before);
 result=await rpc(director,'arch9_legal_firm_overview',[firm,'trusts']);assert.equal(result.total,1);assert.equal(result.overdue,0);assert.equal(result.practices[0].discipline,'trusts');
 await assert.rejects(()=>rpc(user,'arch9_legal_firm_overview',[firm,null]),e=>e.code==='42501');await assert.rejects(()=>rpc(null,'arch9_legal_firm_overview',[firm,null]),e=>e.code==='42501');await assert.rejects(()=>rpc(director,'arch9_legal_firm_overview',[foreign,null]),e=>e.code==='42501');await assert.rejects(()=>rpc(director,'arch9_legal_firm_overview',[firm,'family_law']),e=>e.code==='42501');
 await rpc(director,'arch9_legal_work_command',[firm,randomUUID(),'configure_work',{tasks_enabled:false,documents_enabled:false,expected_revision:0}]);result=await rpc(director,'arch9_legal_firm_overview',[firm,null]);assert.equal(result.overdue,0);assert.equal(result.upcoming.length,0);
 await db.query("update attorney_firm_members set professional_role='attorney_conveyancer' where user_id=$1",[director]);await assert.rejects(()=>rpc(director,'arch9_legal_firm_overview',[firm,null]),e=>e.code==='42501');
 assert.equal((await db.query('select status from transactions')).rows[0].status,'unchanged');
 assert.ok((await db.query("select p.prosecdef,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='arch9_legal_firm_overview'")).rows.every(p=>!p.prosecdef&&!p.anonymous));
 await db.close();
});
