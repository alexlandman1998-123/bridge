import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const agent = randomUUID(), colleague = randomUUID(), admin = randomUUID(), outsider = randomUUID()
const org = randomUUID(), otherOrg = randomUUID(), lead = randomUUID(), seller = randomUUID()
const path = `buyer-otp-documents/${org}/${lead}/uploaded_otp/purchase-agreement.pdf`
const migration = name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage; create schema document_security;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.memberships(org uuid, user_id uuid, role text);
    create table public.leads(lead_id uuid primary key, organisation_id uuid, assigned_agent_id uuid, lead_category text);
    create table public.documents(file_path text,file_bucket text,transaction_id uuid);
    create table public.document_requirement_instances(id uuid);
    create schema document_requirement_private;
    create function document_security.can_read(public.documents) returns boolean language sql as $$select false$$;
    create function public.bridge_is_org_admin(target_org uuid) returns boolean language sql security definer as $$select exists(select 1 from public.memberships where org=target_org and user_id=auth.uid() and role='admin')$$;
    create function public.bridge_is_active_member(target_org uuid) returns boolean language sql security definer as $$select exists(select 1 from public.memberships where org=target_org and user_id=auth.uid())$$;
    create table storage.objects(bucket_id text, name text, metadata jsonb, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage to authenticated;
    grant select,insert,update on storage.objects to authenticated;
  `)
  const assignmentSql = await migration('202607160002_attorney_public_intake_leads_security_phase3')
  await db.exec(assignmentSql.match(/create or replace function public\.bridge_can_access_assignment\([\s\S]*?\$\$;/i)[0])
  // Exercise the existing restrictive boundaries alongside the additive policies.
  const audienceSql = await migration('20261004102741_attorney_internal_workspace_boundaries')
  const requirementSql = await migration('20261011121850_flexible_seller_requirement_portal')
  await db.exec(audienceSql.match(/create or replace function document_security\.object_allowed\([\s\S]*?\$\$;/i)[0])
  await db.exec(requirementSql.match(/create function document_requirement_private\.object_access\([\s\S]*?\$\$;/i)[0])
  await db.exec(`
    grant usage on schema document_security,document_requirement_private to authenticated;
    create policy audience_read on storage.objects as restrictive for select to authenticated using(document_security.object_allowed(bucket_id,name,false));
    create policy audience_insert on storage.objects as restrictive for insert to authenticated with check(document_security.object_allowed(bucket_id,name,true));
    create policy audience_update on storage.objects as restrictive for update to authenticated using(document_security.object_allowed(bucket_id,name,true)) with check(document_security.object_allowed(bucket_id,name,true));
  `)
  for (const name of ['read','insert','update']) await db.exec(requirementSql.match(new RegExp(`create policy requirement_upload_${name}_boundary[^;]+;`))[0])
  await db.query('insert into memberships values ($1,$2,$3),($1,$4,$3),($1,$5,$6),($7,$8,$3)', [org,agent,'agent',colleague,admin,'admin',otherOrg,outsider])
  await db.query('insert into leads values ($1,$2,$3,$4),($5,$2,$3,$6)', [lead,org,agent,'buyer',seller,'seller'])
  async function as(user, action) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || ''])
    await db.exec('set role authenticated')
    try { return await action() } finally { await db.exec('reset role') }
  }
  const insert = (name = path, bucket = 'documents') => db.query('insert into storage.objects values ($1,$2,$3)', [bucket,name,{}])
  // Reproduce the missing policy: the normal authenticated actor cannot upload.
  await assert.rejects(as(agent, () => insert()), /row-level security/)
  await db.exec(await migration('20261031085413_buyer_otp_lead_storage_access'))
  await as(agent, () => insert())
  await as(agent, () => db.query("insert into storage.objects values ('documents',$1,'{\"size\":1570925}') on conflict(bucket_id,name) do update set metadata=excluded.metadata returning name", [path]))
  assert.equal((await as(agent, () => db.query('select * from storage.objects'))).rows.length, 1)
  assert.equal((await as(admin, () => db.query('select * from storage.objects'))).rows.length, 1)
  for (const user of [colleague,outsider,null]) {
    await assert.rejects(as(user, () => insert(path.replace('.pdf',`-${user || 'anon'}.pdf`))), /row-level security/)
    assert.equal((await as(user, () => db.query('select * from storage.objects'))).rows.length, 0)
    assert.equal((await as(user, () => db.query("update storage.objects set metadata='{}' returning name"))).rows.length, 0)
  }
  const denied = [
    [path.replace(org,otherOrg),'documents'],
    [path.replace(lead,randomUUID()),'documents'],
    [path.replace(lead,seller),'documents'],
    [path.replace(org,'invalid'),'documents'],
    [path.replace('uploaded_otp','buyer_id_document'),'documents'],
    [path.replace('buyer-otp-documents','another-folder'),'documents'],
    [path.replace('purchase-agreement.pdf',''),'documents'],
    [path.replace('purchase-agreement.pdf','../file.pdf'),'documents'],
    [path,'another-bucket'],
  ]
  for (const [name,bucket] of denied) await assert.rejects(as(agent, () => insert(name,bucket)), /row-level security/)
  await assert.rejects(as(agent, () => db.query('update storage.objects set name=$1', [path.replace(org,otherOrg)])), /row-level security/)
  assert.equal((await db.query("select has_function_privilege('anon','document_security.buyer_otp_object_access(text,text)','EXECUTE') allowed")).rows[0].allowed, false)
  await db.query('insert into documents values ($1,$2,$3)', [path,'documents',randomUUID()])
  assert.equal((await as(agent, () => db.query('select * from storage.objects'))).rows.length, 0, 'existing linked-document audience boundary still takes precedence')
  await db.exec('truncate documents')
  await db.exec(`
    drop policy buyer_otp_lead_storage_insert on storage.objects;
    drop policy buyer_otp_lead_storage_select on storage.objects;
    drop policy buyer_otp_lead_storage_update on storage.objects;
    drop function document_security.buyer_otp_object_access(text,text);
  `)
  await assert.rejects(as(agent, () => insert(path.replace('.pdf','-after-rollback.pdf'))), /row-level security/)
  assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 1, 'rollback retains the uploaded object')
  console.log('Buyer OTP Storage checks passed: reproduced denied upload; assigned-agent upload/read/upsert; admin read; unrelated agents/agencies, unauthenticated actors and forged paths denied; existing restrictive document boundaries retained; rollback removes the added permission without deleting files.')
} finally { await db.close() }
