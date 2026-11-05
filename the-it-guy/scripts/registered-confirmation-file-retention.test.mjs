import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
try{
 await db.exec(`create schema journey_private;create schema document_security;create schema storage;create role anon;create role authenticated;
 create table documents(id int primary key,transaction_id int,file_bucket text,file_path text,document_type text,status text);
 create table transactions(id int primary key,registered_at timestamptz,registration_confirmation_document_id int references documents(id));
 create table storage.objects(bucket_id text,name text);
 alter table storage.objects enable row level security;
 create policy old_permissive on storage.objects for all to authenticated using(true) with check(true);
 grant usage on schema storage,document_security to authenticated;grant all on storage.objects to authenticated;
 create function journey_private.is_registration_confirmation_document(doc documents) returns boolean language sql as $$select doc.document_type='registration_confirmation'$$;
 insert into documents values(1,10,'documents','proof.pdf','registration_confirmation','uploaded'),(2,10,'documents','replacement.pdf','registration_confirmation','uploaded');
 insert into transactions values(10,now(),1);
 alter table documents add constraint document_parent foreign key(transaction_id) references transactions(id) on delete cascade;
 insert into storage.objects values('documents','proof.pdf'),('documents','replacement.pdf'),('documents','ordinary.pdf');`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104192325_registered_confirmation_file_retention.sql',import.meta.url),'utf8'))
 await db.exec('set role authenticated')
 assert.equal((await db.query("delete from storage.objects where name='proof.pdf' returning name")).rows.length,0)
 assert.equal((await db.query("update storage.objects set name='overwritten.pdf' where name='proof.pdf' returning name")).rows.length,0)
 await assert.rejects(()=>db.exec("update storage.objects set name='proof.pdf' where name='ordinary.pdf'"),/row-level security/)
 assert.equal((await db.query("delete from storage.objects where name='ordinary.pdf' returning name")).rows.length,1)
 await db.exec('reset role')
 await assert.rejects(()=>db.exec("update documents set file_path='lost.pdf' where id=1"),/retain its file/)
 await assert.rejects(()=>db.exec("update documents set document_type='company_registration' where id=1"),/retain its file/)
 await assert.rejects(()=>db.exec("update documents set status='deleted' where id=1"),/retain its file/)
 await assert.rejects(()=>db.exec('delete from documents where id=1'),/Replace the transaction registration proof/)
 await db.exec("update documents set status='approved' where id=1;update transactions set registration_confirmation_document_id=2 where id=10;set role authenticated")
 assert.equal((await db.query("delete from storage.objects where name='proof.pdf' returning name")).rows.length,1)
 assert.equal((await db.query("delete from storage.objects where name='replacement.pdf' returning name")).rows.length,0)
 await db.exec('reset role;delete from transactions where id=10')
 assert.equal((await db.query('select count(*)::int n from documents')).rows[0].n,0)
 console.log('PASS actual Storage RLS delete/update/overwrite protection, metadata identity and classification retention, ordinary uploads, explicit replacement and parent cleanup compatibility.')
}finally{await db.close()}
