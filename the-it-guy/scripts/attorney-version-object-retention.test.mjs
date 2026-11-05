import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
try{
 await db.exec(`create schema document_security;create schema storage;create role anon;create role authenticated;
 create table documents(file_bucket text,file_path text,attorney_version_root_id int);
 create table storage.objects(bucket_id text,name text);
 alter table storage.objects enable row level security;
 create policy old_permissive on storage.objects for all to authenticated using(true) with check(true);
 grant usage on schema storage,document_security to authenticated;grant all on storage.objects to authenticated;
 insert into documents values('documents','earlier-version.pdf',1),('documents','current-version.pdf',1),('documents','ordinary.pdf',null);
 insert into storage.objects values('documents','earlier-version.pdf'),('documents','current-version.pdf'),('documents','ordinary.pdf');`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104193709_attorney_version_object_retention.sql',import.meta.url),'utf8'))
 await db.exec('set role authenticated')
 for(const path of ['earlier-version.pdf','current-version.pdf']){
  assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[path])).rows.length,0)
  assert.equal((await db.query("update storage.objects set name='overwritten.pdf' where name=$1 returning name",[path])).rows.length,0)
 }
 await assert.rejects(()=>db.exec("update storage.objects set name='earlier-version.pdf' where name='ordinary.pdf'"),/row-level security/)
 await db.exec("insert into storage.objects values('documents','new-version.pdf')")
 assert.equal((await db.query("delete from storage.objects where name='ordinary.pdf' returning name")).rows.length,1)
 await db.exec('reset role')
 assert.equal((await db.query("delete from storage.objects where name='current-version.pdf' returning name")).rows.length,1)
 console.log('PASS actual Storage RLS retains previous/current attorney versions against delete and overwrite; new version uploads, ordinary files and trusted maintenance remain available.')
}finally{await db.close()}
