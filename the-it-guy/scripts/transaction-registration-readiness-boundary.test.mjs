import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema auth;create schema journey_private;create schema storage;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select '${id(9)}'::uuid$$;
 create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
 create table transactions(id uuid primary key,routing_profile_json jsonb,registered_at timestamptz,completed_at timestamptz,lifecycle_state text,registration_date date,title_deed_number text,registration_confirmation_document_id uuid,finance_type text);
 create table transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
 create table transaction_subprocess_steps(subprocess_id uuid,step_key text,status text);
 create table transaction_workflow_instances(id uuid primary key,transaction_id uuid,workflow_key text);
 create table transaction_workflow_steps(workflow_instance_id uuid,step_key text,status text);
 create table documents(id uuid primary key,transaction_id uuid,document_type text,category text,name text,file_bucket text,file_path text,status text);
 create table storage.objects(bucket_id text,name text);
 create table transaction_attorney_closeouts(transaction_id uuid,close_out_status text);
 create table transaction_bond_closeouts(transaction_id uuid,close_out_status text);
 insert into transactions(id,routing_profile_json,lifecycle_state,finance_type) values('${id(1)}','{"workflowPlan":{"status":"active"}}','active','hybrid');
 insert into transaction_subprocesses values('${id(2)}','${id(1)}','transfer');
 insert into transaction_subprocess_steps values('${id(2)}','registered','not_started'),('${id(2)}','matter_closed','not_started');
 insert into documents values('${id(3)}','${id(1)}','company_registration','Buyer Documents','Company registration certificate','documents','company.pdf','uploaded'),
 ('${id(4)}','${id(1)}','registration_confirmation','Attorney Documents','Registration confirmation','documents','confirmation.pdf','uploaded'),
 ('${id(5)}','${id(8)}','registration_confirmation','Attorney Documents','Registration confirmation','documents','other-confirmation.pdf','uploaded');
 insert into storage.objects values('documents','company.pdf'),('documents','other-confirmation.pdf');`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104175807_transaction_registration_readiness_boundary.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104204953_preserve_completed_archive_receipt.sql',import.meta.url),'utf8'))
 const update=patch=>db.exec(`update transactions set ${patch} where id='${id(1)}'`)
 await assert.rejects(()=>update('registered_at=now()'),/legal registration milestone/)
 await db.exec("update transaction_subprocess_steps set status='completed' where step_key='registered'")
 await assert.rejects(()=>update('registered_at=now()'),/date and title deed/)
 await update(`registration_date=current_date,title_deed_number='STAGING-DEED',registration_confirmation_document_id='${id(3)}'`)
 await assert.rejects(()=>update('registered_at=now()'),/stored document from this transaction/)
 await update(`registration_confirmation_document_id='${id(5)}'`)
 await assert.rejects(()=>update('registered_at=now()'),/stored document from this transaction/)
 await update(`registration_confirmation_document_id='${id(4)}'`)
 await assert.rejects(()=>update('registered_at=now()'),/stored document from this transaction/)
 await db.exec("insert into storage.objects values('documents','confirmation.pdf')")
 await update("registered_at=now(),lifecycle_state='registered'")
 await assert.rejects(()=>update("completed_at=now(),lifecycle_state='completed'"),/legal closeout milestone/)
 await db.exec("update transaction_subprocess_steps set status='completed' where step_key='matter_closed'")
 await assert.rejects(()=>update("completed_at=now(),lifecycle_state='completed'"),/Attorney financial closeout/)
 await db.exec(`insert into transaction_attorney_closeouts values('${id(1)}','closed')`)
 await assert.rejects(()=>update("completed_at=now(),lifecycle_state='completed'"),/Bond-originator financial closeout/)
 await db.exec(`insert into transaction_bond_closeouts values('${id(1)}','closed')`)
 await update("completed_at=now(),lifecycle_state='completed'")
  await update("finance_type='cash',completed_at=null,lifecycle_state='registered'")
  await db.exec('delete from transaction_bond_closeouts')
  await update("completed_at=now(),lifecycle_state='completed'")
  await db.exec(await readFile(new URL('../../supabase/migrations/20261104180554_registered_confirmation_integrity.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261104195411_registration_proof_explicit_type_exclusion.sql',import.meta.url),'utf8'))
  await assert.rejects(()=>update('registration_confirmation_document_id=null'),/must retain stored registration/)
  await assert.rejects(()=>update(`registration_confirmation_document_id='${id(3)}'`),/must retain stored registration/)
  await assert.rejects(()=>update('registration_date=null'),/retain its registration date/)
  await assert.rejects(()=>update("title_deed_number=''"),/retain its registration date/)
  await update("title_deed_number='STAGING-CORRECTED-DEED'")
  await db.exec(`insert into transactions(id,lifecycle_state,finance_type,registration_date,title_deed_number,registration_confirmation_document_id)
    values('${id(8)}','active','cash',current_date,'STAGING-LEGACY','${id(5)}');`)
  await assert.rejects(()=>db.exec(`update transactions set registered_at=now() where id='${id(8)}'`),/registration workflow/)
  await db.exec(`insert into transaction_workflow_instances values('${id(7)}','${id(8)}','registration');
    insert into transaction_workflow_steps values('${id(7)}','registration_confirmed','complete');
    update transactions set registered_at=now() where id='${id(8)}';`)
 const oldGuardSource=await readFile(new URL('../../supabase/migrations/20261104175807_transaction_registration_readiness_boundary.sql',import.meta.url),'utf8')
 await db.exec(oldGuardSource.slice(oldGuardSource.indexOf('create or replace function journey_private.guard_transaction_registration_readiness()'),oldGuardSource.indexOf('create trigger guard_transaction_registration_readiness')))
 await db.exec(`alter table transactions disable trigger guard_transaction_registration_readiness;update transactions set completed_at=now(),lifecycle_state='archived' where id='${id(8)}';alter table transactions enable trigger guard_transaction_registration_readiness;`)
 const historicalCompletedAt=(await db.query(`select completed_at::text ts from transactions where id='${id(8)}'`)).rows[0].ts
 await assert.rejects(()=>db.exec(`update transactions set lifecycle_state='completed' where id='${id(8)}'`),/Attorney financial closeout/)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104204953_preserve_completed_archive_receipt.sql',import.meta.url),'utf8'))
 await db.exec(`update transactions set lifecycle_state='completed' where id='${id(8)}'`)
 assert.equal((await db.query(`select completed_at::text ts from transactions where id='${id(8)}'`)).rows[0].ts,historicalCompletedAt)
 await db.exec(`update transactions set lifecycle_state='active' where id='${id(8)}'`)
 await assert.rejects(()=>db.exec(`update transactions set lifecycle_state='completed' where id='${id(8)}'`),/Attorney financial closeout/)
 const api=await readFile(new URL('../src/lib/api.js',import.meta.url),'utf8')
 const start=api.indexOf('function isRegistrationConfirmationDocument('),end=api.indexOf('\nfunction buildRegistrationBlockers',start)
 // The next function is lifecycle-context loading in some versions; isolate by its closing brace.
 const fn=api.slice(start,api.indexOf('\n}',start)+2)
 const isConfirmation=new Function(fn+';return isRegistrationConfirmationDocument')()
 for(const document of [{document_type:'company_registration',name:'Company registration certificate'},{document_type:'buyer_company_registration_certificate',name:'CIPC registration certificate'},{name:'Trust registration'},{document_type:'registration_confirmation'},{document_type:'company_registration',name:'Registration confirmation.pdf',category:'registration_confirmation'},{document_type:'buyer_trust_letters_authority',name:'Confirmation of registration.pdf'},{name:'Confirmation of registration - Erf 17.pdf'}]){
  const expected=isConfirmation(document)
  const sql=await db.query('select journey_private.is_registration_confirmation_document(jsonb_populate_record(null::documents,$1::jsonb)) allowed',[document])
  assert.equal(sql.rows[0].allowed,expected,'Browser and database evidence predicates must agree')
  assert.equal(expected,!/(company|companies|cipc|trust)/.test(document.document_type||'')&&(document.document_type==='registration_confirmation'||Boolean(document.name?.startsWith('Confirmation of registration'))))
 }
 assert.ok(end>start)
 console.log('PASS canonical registration readiness, required date/deed, exact stored evidence, CIPC exclusion, document/matter scope and legal/attorney/originator closeout gates.')
}finally{await db.close()}
