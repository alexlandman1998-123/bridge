import assert from 'node:assert/strict'
import { after,test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite();after(()=>db.close())
const org=randomUUID(),otherOrg=randomUUID(),owner=randomUUID(),manager=randomUUID(),staff=randomUUID(),foreign=randomUUID()
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;
create table auth.users(id uuid primary key);
create table organisations(id uuid primary key);
create table memberships(organisation_id uuid,user_id uuid,role text,status text);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function bridge_is_active_member(uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.memberships where organisation_id=$1 and user_id=auth.uid() and status='active')$$;
create function bridge_is_org_admin(uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.memberships where organisation_id=$1 and user_id=auth.uid() and status='active' and role in ('admin','manager'))$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,user_metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema auth,storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
-- Simulate an overly broad legacy policy: new restrictive boundaries must win.
create policy broad_legacy on storage.objects for all to anon,authenticated using(true) with check(true);`)
for(const id of [org,otherOrg])await db.query('insert into organisations values ($1)',[id])
for(const [id,role,organisation] of [[owner,'staff',org],[manager,'manager',org],[staff,'staff',org],[foreign,'manager',otherOrg]]){
 await db.query('insert into auth.users values ($1)',[id]);await db.query("insert into memberships values ($1,$2,$3,'active')",[organisation,id,role])
}
await db.exec(await readFile(new URL('../../../../../supabase/migrations/20261109103955_durable_company_documents.sql',import.meta.url),'utf8'))
async function as(actor,run){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);await db.exec(`set role ${actor?'authenticated':'anon'}`);try{return await run()}finally{await db.exec('reset role')}}
async function staged(actor=owner,organisation=org){
 const id=randomUUID(),path=`${organisation}/${actor}/${id}/file.pdf`,payload={title:'Company certificate',category:'CIPC Documents',fileName:'file.pdf',storagePath:path,mimeType:'application/pdf',sizeBytes:5,sha256:'a'.repeat(64),visibility:'management',status:'uploaded'}
 await as(actor,()=>db.query("insert into storage.objects(bucket_id,name,owner_id,metadata,user_metadata) values('company-documents',$1,$2,$3,$4)",[path,actor,{size:5,mimetype:'application/pdf'},{sha256:payload.sha256}]))
 return {id,path,payload,actor,organisation}
}
async function upload(value,patch={}){return as(value.actor,async()=> (await db.query('select bridge_company_document_upload($1,$2,$3) result',[value.organisation,value.id,{...value.payload,...patch}])).rows[0].result)}
async function workspace(actor=owner,includeHistory=false,organisation=org){return as(actor,async()=> (await db.query('select bridge_company_document_workspace($1,$2) result',[organisation,includeHistory])).rows[0].result)}
async function change(actor,row,action,visibility=null,status=null){return as(actor,async()=>(await db.query('select bridge_company_document_change($1,$2,$3,$4,$5,$6) result',[org,row.id,row.revision,action,visibility,status])).rows[0].result)}

test('saved documents persist for the uploader and another manager, with private bytes and default staff isolation',async()=>{
 const s=await staged(),saved=await upload(s)
 assert.equal(saved.saved,true)
 assert((await workspace()).documents.some(d=>d.id===s.id))
 assert((await workspace(manager)).documents.some(d=>d.id===s.id))
 assert(!(await workspace(staff)).documents.some(d=>d.id===s.id))
 assert.equal((await workspace(foreign,false,org)),null)
 assert.equal((await db.query("select public from storage.buckets where id='company-documents'")).rows[0].public,false)
 assert.equal((await as(staff,()=>db.query("select * from storage.objects where name=$1",[s.path]))).rows.length,0)
 assert.equal((await as(manager,()=>db.query("select * from storage.objects where name=$1",[s.path]))).rows.length,1)
 assert.equal((await as(foreign,()=>db.query("select * from storage.objects where name=$1",[s.path]))).rows.length,0)
 assert.equal((await as(null,()=>db.query("select * from storage.objects where name=$1",[s.path]))).rows.length,0)
})
test('only managers share individual files, and restricting the file revokes staff access',async()=>{
 const s=await staged(),row=(await upload(s)).document
 await assert.rejects(change(owner,row,'visibility','organisation'),/administrator or manager/)
 const shared=(await change(manager,row,'visibility','organisation')).document
 assert((await workspace(staff)).documents.some(d=>d.id===s.id))
 assert.equal((await as(staff,()=>db.query('select * from storage.objects where name=$1',[s.path]))).rows.length,1)
 await change(manager,shared,'visibility','management')
 assert(!(await workspace(staff)).documents.some(d=>d.id===s.id))
})
test('replacement is atomic, uses a new file/version and retains old bytes and approval only in protected history',async()=>{
 const original=await staged(),first=(await upload(original)).document
 const approved=(await change(manager,first,'status',null,'approved')).document
 const replacement=await staged()
 const next=(await upload(replacement,{previousId:first.id,expectedRevision:approved.revision,status:'approved'})).document
 assert.equal(next.version,2);assert.equal(next.status,'pending_review');assert.equal(next.root_id,first.id)
 assert(!(await workspace()).documents.some(d=>d.id===first.id))
 const old=(await workspace(owner,true)).documents.find(d=>d.id===first.id)
 assert(old.archived_at);assert.equal(old.status,'approved');assert.equal(old.storage_path,original.path)
 assert.equal((await db.query('select count(*) from storage.objects where name=any($1)',[[original.path,replacement.path]])).rows[0].count,2)
 await assert.rejects(upload(await staged(),{previousId:first.id,expectedRevision:approved.revision}),/changed/)
})
test('failed replacement rolls back the archive and upload receipts replay without duplicate rows',async()=>{
 const s=await staged(),row=(await upload(s)).document
 const next=await staged()
 await assert.rejects(upload(next,{previousId:row.id,expectedRevision:row.revision,title:''}),/check constraint/)
 assert((await workspace()).documents.some(d=>d.id===row.id))
 const saved=await upload(next,{previousId:row.id,expectedRevision:row.revision})
 assert.deepEqual(await upload(next,{previousId:row.id,expectedRevision:row.revision}),saved)
 assert.equal((await db.query('select count(*) from company_documents where id=$1',[next.id])).rows[0].count,1)
})
test('remove persists across reads, is replayable and leaves a protected recoverable file',async()=>{
 const s=await staged(),row=(await upload(s)).document
 const removed=await change(owner,row,'archive')
 assert.equal(removed.saved,true)
 assert.deepEqual(await change(owner,row,'archive'),removed)
 assert(!(await workspace(manager)).documents.some(d=>d.id===s.id))
 assert((await workspace(manager,true)).documents.some(d=>d.id===s.id))
 assert.equal((await as(owner,()=>db.query('delete from storage.objects where name=$1 returning id',[s.path]))).rows.length,0)
 assert.equal((await db.query('select count(*) from storage.objects where name=$1',[s.path])).rows[0].count,1)
})
test('RLS and RPCs reject cross-organisation, wrong-owner, stale, unverified and direct mutations',async()=>{
 const s=await staged(),row=(await upload(s)).document
 await assert.rejects(change(staff,row,'archive'),/permission/)
 await assert.rejects(change(foreign,row,'archive'),/access/)
 await assert.rejects(change(owner,{...row,revision:0},'archive'),/changed/)
 const missing=await staged();await db.query('delete from storage.objects where name=$1',[missing.path])
 await assert.rejects(upload(missing),/could not be verified/)
 await assert.rejects(upload(await staged(),{storagePath:`${otherOrg}/${owner}/${randomUUID()}/file.pdf`}),/could not be verified/)
 await assert.rejects(as(owner,()=>db.query("update company_documents set visibility='organisation' where id=$1",[row.id])),/permission denied/)
 await assert.rejects(as(null,()=>db.query('select bridge_company_document_workspace($1,false)',[org])),/permission denied/)
 await db.query("update memberships set status='inactive' where user_id=$1",[owner])
 try{assert.equal(await workspace(owner),null);await assert.rejects(change(owner,row,'archive'),/access/)}finally{await db.query("update memberships set status='active' where user_id=$1",[owner])}
})
test('immutable Storage guards beat broad legacy policies; only unsaved own objects permit cleanup',async()=>{
 const pending=await staged()
 assert.equal((await as(owner,()=>db.query('delete from storage.objects where name=$1 returning id',[pending.path]))).rows.length,1)
 const saved=await staged();await upload(saved)
 assert.equal((await as(owner,()=>db.query('delete from storage.objects where name=$1 returning id',[saved.path]))).rows.length,0)
 assert.equal((await as(owner,()=>db.query("update storage.objects set metadata='{}' where name=$1 returning id",[saved.path]))).rows.length,0)
 await assert.rejects(as(foreign,()=>db.query("insert into storage.objects(bucket_id,name,owner_id) values('company-documents',$1,$2)",[`${org}/${foreign}/${randomUUID()}/file.pdf`,foreign])),/row-level security/)
})

test('staff cannot self-approve or publish a company file to the organisation',async()=>{
 const s=await staged()
 await assert.rejects(upload(s,{status:'approved'}),/manager can record/)
 await assert.rejects(upload(s,{visibility:'organisation'}),/manager can share/)
 const saved=await upload(s)
 await assert.rejects(change(owner,saved.document,'status',null,'approved'),/administrator or manager/)
})
test('a shared previous version is retained for managers but hidden from ordinary staff history',async()=>{
 const first=await staged(manager),original=(await upload(first,{visibility:'organisation',status:'approved'})).document
 const next=await staged(manager)
 await upload(next,{previousId:original.id,expectedRevision:original.revision,visibility:'organisation'})
 assert(!(await workspace(staff,true)).documents.some(d=>d.id===original.id))
 assert((await workspace(manager,true)).documents.some(d=>d.id===original.id))
 assert.equal((await as(staff,()=>db.query('select * from storage.objects where name=$1',[first.path]))).rows.length,0)
})
test('tampered size, hash, owner and reused upload identities are rejected without altering saved files',async()=>{
 const s=await staged(),saved=await upload(s)
 await assert.rejects(upload(s,{title:'Different document'}),/already used/)
 const badHash=await staged()
 await assert.rejects(upload(badHash,{sha256:'b'.repeat(64)}),/could not be verified/)
 const badSize=await staged()
 await assert.rejects(upload(badSize,{sizeBytes:6}),/could not be verified/)
 const wrongOwner=await staged()
 await db.query('update storage.objects set owner_id=$1 where name=$2',[foreign,wrongOwner.path])
 await assert.rejects(upload(wrongOwner),/could not be verified/)
 assert.equal((await db.query('select title from company_documents where id=$1',[saved.document.id])).rows[0].title,'Company certificate')
})

test('browser recovery references are bound to the uploaded bytes and cannot create duplicate records',async()=>{
 const original=await staged(),key=`company_doc_old:${original.payload.sha256}`
 const saved=await upload(original,{legacyImportKey:key})
 assert.equal(saved.document.legacy_import_key,key)
 assert.deepEqual(await upload(original,{legacyImportKey:key}),saved)
 await assert.rejects(upload(await staged(),{legacyImportKey:key}),/unique constraint/)
 await assert.rejects(upload(await staged(),{legacyImportKey:'company_doc_old:wrong-hash'}),/does not match this file/)
 assert.equal((await db.query('select count(*) from company_documents where legacy_import_key=$1',[key])).rows[0].count,1)
})

test('the new restrictive company policies leave existing policies for other buckets unchanged',async()=>{
 const key=`legacy/${randomUUID()}.pdf`
 await as(null,()=>db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[key]))
 assert.equal((await as(null,()=>db.query("select * from storage.objects where name=$1",[key]))).rows.length,1)
 assert.equal((await as(null,()=>db.query("update storage.objects set metadata='{}' where name=$1 returning id",[key]))).rows.length,1)
 assert.equal((await as(null,()=>db.query('delete from storage.objects where name=$1 returning id',[key]))).rows.length,1)
})

test('removing a stale version after replacement cannot report that the new current file was removed',async()=>{
 const first=await staged(),old=(await upload(first)).document
 const second=await staged(),current=(await upload(second,{previousId:old.id,expectedRevision:old.revision})).document
 await assert.rejects(change(owner,old,'archive'),/changed/)
 assert((await workspace()).documents.some(row=>row.id===current.id))
})
