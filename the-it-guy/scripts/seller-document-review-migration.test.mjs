import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const migration = await fs.readFile(new URL('../../supabase/migrations/20261004121736_seller_document_review_runtime_reconciliation.sql', import.meta.url), 'utf8')
const physicalGuard = await fs.readFile(new URL('../../supabase/migrations/20260927122535_seller_physical_signing_version_review.sql', import.meta.url), 'utf8')
const db = new PGlite()
const owner = randomUUID(), outsider = randomUUID(), organisation = randomUUID(), otherOrganisation = randomUUID()
const version = randomUUID()
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const setting = async (name, value) => query('select set_config($1,$2,false)', [name, value])
const snapshot = async () => Promise.all(['private_listing_documents', 'private_listing_document_requirements', 'private_listing_seller_onboarding'].map(table => query(`select jsonb_agg(to_jsonb(row) order by id) as rows from ${table} row`)))

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  create table organisations(id uuid primary key);
  create function bridge_is_active_member(uuid) returns boolean language sql stable as $$
    select auth.uid() is not null and current_setting('app.active',true)='true' and $1::text=current_setting('app.org',true)
  $$;
  create function bridge_is_org_admin(uuid) returns boolean language sql stable as $$ select false $$;
  create function bridge_normalize_seller_document_key_p0_4(text) returns text language sql immutable as $$
    select trim(both '_' from lower(regexp_replace(coalesce($1,''),'[^a-zA-Z0-9]+','_','g')))
  $$;
  create function bridge_upload_private_listing_seller_document() returns text language sql as $$ select 'current-upload-contract' $$;
  create table private_listings(id uuid primary key, organisation_id uuid, assigned_agent_id uuid, created_by uuid);
  create table document_requirement_instances(id uuid primary key, context_type text, context_id uuid, listing_id uuid,
    document_definition_key text, status text, satisfied_by_document_id uuid);
  create table private_listing_document_requirements(id uuid primary key, private_listing_id uuid, requirement_key text,
    requirement_name text, request_stage text, status text, is_required boolean default true, request_revision integer default 1,
    last_request_reason text, request_metadata jsonb default '{}', canonical_requirement_instance_id uuid,
    satisfied_by_document_id uuid, satisfaction_verified_at timestamptz, satisfaction_method text,
    assurance_state text default 'unverified', assurance_metadata jsonb default '{}');
  create table private_listing_documents(id uuid primary key, private_listing_id uuid, requirement_id uuid, document_type text,
    document_name text, status text, uploaded_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now(),
    canonical_requirement_instance_id uuid, storage_path text, reviewed_signing_version_id uuid, reviewed_signing_version_digest text);
  create table private_listing_seller_onboarding(id uuid primary key, private_listing_id uuid, form_data jsonb, updated_at timestamptz default now());
  create table client_portal_contexts(id uuid primary key, listing_id uuid, context_type text, status text, client_email text, updated_at timestamptz);
  create table private_listing_activity(id uuid primary key default gen_random_uuid(), private_listing_id uuid, activity_type text,
    activity_title text, activity_description text, performed_by uuid, visibility text, metadata jsonb);
  create table notification_automation_definitions(automation_key text primary key, display_name text, category text, trigger_type text,
    recipient_role text, channels text[], implementation_status text, default_enabled boolean, dedupe_strategy text,
    reminder_policy jsonb, metadata_json jsonb, updated_at timestamptz);
  create table notification_events(id uuid primary key default gen_random_uuid(), automation_key text references notification_automation_definitions,
    organisation_id uuid, assigned_user_id uuid, listing_id uuid, event_key text, category text, trigger_type text, channel text,
    status text, recipient_email text, recipient_role text, subject text, message_preview text, source text, dedupe_key text unique,
    payload_json jsonb, metadata_json jsonb, prepared_at timestamptz, queued_at timestamptz);
  alter table private_listings enable row level security;
  create policy listing_members on private_listings for select to authenticated using(bridge_is_active_member(organisation_id));
  alter table private_listing_documents enable row level security;
  create policy document_members on private_listing_documents for select to authenticated using(exists(
    select 1 from private_listings l where l.id=private_listing_id and bridge_is_active_member(l.organisation_id)));
  alter table private_listing_document_requirements enable row level security;
  create policy requirement_members on private_listing_document_requirements for select to authenticated using(exists(
    select 1 from private_listings l where l.id=private_listing_id and bridge_is_active_member(l.organisation_id)));
  grant select on private_listings, private_listing_documents, private_listing_document_requirements to authenticated;
  -- Reproduce Supabase's broad defaults so the new migration must revoke them.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`)
await query('insert into auth.users values($1),($2)', [owner, outsider])
await query('insert into organisations values($1),($2)', [organisation, otherOrganisation])
await setting('app.uid', owner); await setting('app.org', organisation); await setting('app.active', 'true')

async function seed({ key = 'identity_document', signed = false, approved = false, draft = false, org = organisation } = {}) {
  const listing = randomUUID(), requirement = randomUUID(), document = randomUUID()
  await query('insert into private_listings values($1,$2,$3,$3)', [listing, org, owner])
  await query('insert into private_listing_document_requirements(id,private_listing_id,requirement_key,requirement_name,status) values($1,$2,$3,$3,$4)', [requirement, listing, key, 'required'])
  const pack = signed ? { sellerOnboardingManualSigningPack: { documents: [{ key, versionId: version, versionDigest: 'current-digest', generatedHtml: 'FROZEN COPY' }] } } : {}
  await query('insert into private_listing_seller_onboarding(id,private_listing_id,form_data) values($1,$2,$3)', [randomUUID(), listing, JSON.stringify(pack)])
  if (!draft) await query(`insert into private_listing_documents(id,private_listing_id,requirement_id,document_type,document_name,status,storage_path,reviewed_signing_version_id,reviewed_signing_version_digest)
    values($1,$2,$3,$4,$4,$5,'synthetic/signed.pdf',$6,$7)`, [document, listing, requirement, key, approved ? 'approved' : 'uploaded', signed ? version : null, signed ? 'current-digest' : null])
  return { listing, requirement, document }
}
const historical = await seed({ key: 'signed_mandate', signed: true, approved: true })
await seed({ key: 'signed_fica_declaration', signed: true, approved: true })
await seed({ key: 'signed_disclosure_form', signed: true, approved: true })
await seed({ key: 'signed_mandate', draft: true })
const before = await snapshot()
const currentUpload = await query("select md5(prosrc) as hash from pg_proc where proname='bridge_upload_private_listing_seller_document'")
await query("insert into notification_automation_definitions(automation_key,default_enabled,metadata_json) values('seller_document_review_outcome',false,'{\"preserve\":true}')")
await db.exec(migration)
await db.exec(physicalGuard)
const guardHash = await query("select md5(prosrc) as hash from pg_proc where proname='bridge_check_seller_physical_signing_review_version'")
await db.exec(migration)
const afterMigration = await snapshot()

test.after(async () => db.close())

test('forward migration is repeatable and preserves current upload, signing guard, all three frozen documents and unfinished drafts', async () => {
  assert.deepEqual(afterMigration.map((result, index) => result[0].rows.map(row => Object.fromEntries(Object.keys(before[index][0].rows[0]).map(key => [key, row[key]])))), before.map(result => result[0].rows))
  assert.deepEqual(await query("select md5(prosrc) as hash from pg_proc where proname='bridge_upload_private_listing_seller_document'"), currentUpload)
  assert.deepEqual(await query("select md5(prosrc) as hash from pg_proc where proname='bridge_check_seller_physical_signing_review_version'"), guardHash)
  assert.equal((await query('select count(*)::int as count from notification_events'))[0].count, 0)
  assert.deepEqual(await query("select default_enabled, metadata_json from notification_automation_definitions where automation_key='seller_document_review_outcome'"), [{ default_enabled: false, metadata_json: { preserve: true } }])
})

test('actual SQL reviews the current wet-ink copy and completes only its exact requirement', async () => {
  const row = await seed({ key: 'signed_fica_declaration', signed: true })
  await db.exec('set role authenticated')
  const start = (await query("select bridge_review_private_listing_seller_document_p1_8($1,'start_review',null,0) as result", [row.document]))[0].result
  assert.equal(start.document.status, 'under_review'); assert.equal(start.requirement.status, 'under_review')
  const approval = (await query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',1) as result", [row.document]))[0].result
  assert.equal(approval.document.status, 'approved'); assert.equal(approval.requirement.status, 'approved')
  assert.equal(approval.requirement.satisfied_by_document_id, row.document)
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',1)", [row.document]), error => error.code === '40001')
  const retry = (await query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',2) as result", [row.document]))[0].result
  assert.equal(retry.idempotent, true)
  assert.equal((await query('select count(*)::int as count from seller_document_review_events where document_id=$1', [row.document]))[0].count, 2)
  assert.equal((await query('select status from private_listing_documents where id=$1', [historical.document]))[0].status, 'approved')
  await db.exec('reset role')
})

test('stale physical versions and absent signature-review reasons roll back without completing evidence', async () => {
  const row = await seed({ key: 'signed_disclosure_form', signed: true })
  await query("update private_listing_documents set reviewed_signing_version_digest='old-digest' where id=$1", [row.document])
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',0)", [row.document]), error => error.code === '23514')
  await query("update private_listing_documents set reviewed_signing_version_digest='current-digest' where id=$1", [row.document])
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve',null,0)", [row.document]), error => error.code === '23514')
  assert.equal((await query('select status from private_listing_documents where id=$1', [row.document]))[0].status, 'uploaded')
  assert.equal((await query('select count(*)::int as count from seller_document_review_events where document_id=$1', [row.document]))[0].count, 0)
})

test('rejection retains its audit reason and manual reminder retries do not queue duplicates', async () => {
  const rejected = await seed()
  const result = (await query("select bridge_review_private_listing_seller_document_p1_8($1,'reject','Identity page is cropped',0) as result", [rejected.document]))[0].result
  assert.equal(result.document.rejection_reason, 'Identity page is cropped')
  assert.equal(result.requirement.status, 'rejected')
  const replacementReminder = (await query('select bridge_send_seller_document_manual_reminder_p1_8($1,null) as result', [rejected.requirement]))[0].result
  assert.equal(replacementReminder.ok, true)
  const received = await seed()
  await assert.rejects(query('select bridge_send_seller_document_manual_reminder_p1_8($1,null)', [received.requirement]), /outstanding required seller document|review it instead/)
  const outstanding = await seed({ draft: true })
  const first = (await query('select bridge_send_seller_document_manual_reminder_p1_8($1,null) as result', [outstanding.requirement]))[0].result
  const second = (await query('select bridge_send_seller_document_manual_reminder_p1_8($1,null) as result', [outstanding.requirement]))[0].result
  assert.equal(second.idempotent, true); assert.equal(first.notificationEventId, second.notificationEventId)
  assert.equal((await query('select reminder_count from private_listing_document_requirements where id=$1', [outstanding.requirement]))[0].reminder_count, 1)
})

test('cross-listing document links and false completion are rejected by the installed triggers', async () => {
  const one = await seed(), two = await seed({ draft: true })
  await assert.rejects(query('update private_listing_documents set requirement_id=$1 where id=$2', [two.requirement, one.document]), /same listing/)
  await assert.rejects(query("update private_listing_document_requirements set status='approved' where id=$1", [two.requirement]), /without approved, listing-scoped evidence/)
})

test('permissions, active membership and listing assignment protect review commands and queue', async () => {
  const row = await seed()
  await setting('app.active', 'false')
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'start_review',null,0)", [row.document]), error => error.code === '42501')
  await setting('app.active', 'true'); await setting('app.uid', outsider)
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'start_review',null,0)", [row.document]), error => error.code === '42501')
  await setting('app.uid', owner); await setting('app.org', otherOrganisation)
  await db.exec('set role authenticated')
  assert.equal((await query('select count(*)::int as count from seller_document_review_queue_v1'))[0].count, 0)
  await db.exec('reset role; set role anon')
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'start_review',null,0)", [row.document]), /permission denied/)
  await assert.rejects(query('select * from seller_document_review_events'), /permission denied/)
  await assert.rejects(query('select * from seller_document_review_queue_v1'), /permission denied/)
  await db.exec('reset role'); await setting('app.org', organisation)
  const permissions = (await query("select has_table_privilege('authenticated','seller_document_review_events','INSERT') as can_insert, has_function_privilege('anon','bridge_send_seller_document_manual_reminder_p1_8(uuid,text)','EXECUTE') as can_remind"))[0]
  assert.deepEqual(permissions, { can_insert: false, can_remind: false })
})

test('the signed-file linker and evidence guards approve all three document types only after evidence is saved', async () => {
  const oldContract = await fs.readFile(new URL('../../supabase/migrations/20260921063704_enforce_signed_seller_document_requirement_contract.sql', import.meta.url), 'utf8')
  const correction = await fs.readFile(new URL('../../supabase/migrations/20261006104746_seller_signed_document_approval_trigger_order.sql', import.meta.url), 'utf8')
  await db.exec(`
    alter table private_listing_documents add column signing_session_id uuid;
    alter table private_listing_document_requirements alter column id set default gen_random_uuid();
    alter table private_listing_document_requirements add column requirement_description text,
      add column requirement_group text, add column document_visibility text,
      add column generated_from jsonb default '{}', add column updated_at timestamptz default now(),
      add constraint fixture_listing_requirement_key unique(private_listing_id,requirement_key);
  `)
  // Install the real historical BEFORE linker alongside the already-installed
  // review, physical-version, exact-link, assurance and false-completion guards.
  await db.exec(oldContract.slice(oldContract.indexOf('create or replace function'), oldContract.indexOf('-- Repair existing rows')))
  await db.exec('revoke all on function bridge_link_signed_seller_document_requirement() from public,anon,authenticated;')
  const keys = ['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form']
  const rows = []
  for (const key of keys) {
    const row = await seed({ key, signed: true })
    rows.push(row)
    const before = await snapshot()
    await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',0)", [row.document]), /without approved, listing-scoped evidence/)
    assert.deepEqual(await snapshot(), before, 'Failed approval must roll back file, checklist and frozen-copy changes')
  }
  const contract = async () => (await query(`select oid,prosecdef,proconfig,proacl::text as acl,
    proowner::regrole::text as owner,md5(prosrc) as body_md5
    from pg_proc where oid='bridge_link_signed_seller_document_requirement()'::regprocedure`))[0]
  const originalContract = await contract()
  const guards = async () => query(`select proname,md5(prosrc) as hash from pg_proc where proname in (
    'bridge_prevent_false_requirement_completion_p0_4','bridge_validate_private_listing_document_link_p0_4',
    'bridge_check_seller_physical_signing_review_version','bridge_sync_private_listing_requirement_assurance_p0_4',
    'bridge_review_private_listing_seller_document_p1_8') order by proname`)
  const originalGuards = await guards()
  const untouched = await snapshot()
  await db.exec(correction)
  assert.deepEqual(await snapshot(), untouched, 'Deploying the correction must not backfill or alter existing evidence')
  const correctedContract = await contract()
  assert.equal(correctedContract.body_md5, '52d9933aaf7021ae0177c865ffcf1ae5')
  assert.deepEqual({ ...correctedContract, body_md5: null }, { ...originalContract, body_md5: null })
  assert.deepEqual(await guards(), originalGuards)
  await db.exec(correction)
  assert.deepEqual(await contract(), correctedContract, 'Replaying the correction must be safe')
  const correctedDefinition = (await query("select pg_get_functiondef('bridge_link_signed_seller_document_requirement()'::regprocedure) as definition"))[0].definition
  await db.exec(correctedDefinition.replace('\nbegin\n', '\nbegin\n  -- Changed after review\n'))
  await assert.rejects(db.exec(correction), /changed since review/)
  await db.exec('rollback')
  await db.exec(correctedDefinition)

  // A linker that does not complete requirements needs the existing AFTER
  // projection. Fail safely if that prerequisite is disabled, even on replay.
  await db.exec('alter table private_listing_documents disable trigger trg_sync_private_listing_requirement_assurance_p0_4')
  await assert.rejects(db.exec(correction), /requires the active AFTER assurance trigger/)
  await db.exec('rollback; alter table private_listing_documents enable trigger trg_sync_private_listing_requirement_assurance_p0_4')

  for (const row of rows) {
    const beforeCopy = (await query('select form_data from private_listing_seller_onboarding where private_listing_id=$1', [row.listing]))[0].form_data
    await db.exec('set role authenticated')
    const result = (await query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',0) as result", [row.document]))[0].result
    assert.equal(result.document.status, 'approved')
    assert.equal(result.document.requirement_id, row.requirement)
    assert.equal(result.requirement.status, 'approved')
    assert.equal(result.requirement.assurance_state, 'satisfied')
    assert.equal(result.requirement.satisfied_by_document_id, row.document)
    assert.equal(result.document.review_revision, 1)
    const retry = (await query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',1) as result", [row.document]))[0].result
    assert.equal(retry.idempotent, true)
    await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',0)", [row.document]), error => error.code === '40001')
    await db.exec('reset role')
    assert.deepEqual((await query('select form_data from private_listing_seller_onboarding where private_listing_id=$1', [row.listing]))[0].form_data, beforeCopy)
  }
  await db.exec('reset role')
  // Trusted completed-file inserts with no existing slot must also link first
  // and satisfy the exact new requirement only once the file is visible.
  for (const key of keys) {
    const row = await seed({ key, signed: true, draft: true })
    await query('delete from private_listing_document_requirements where id=$1', [row.requirement])
    await query(`insert into private_listing_documents(id,private_listing_id,document_type,document_name,status,storage_path)
      values($1,$2,$3,$3,'completed','synthetic/completed.pdf')`, [row.document,row.listing,key])
    const linked = (await query(`select r.id,r.private_listing_id,r.requirement_key,r.status,r.assurance_state,r.satisfied_by_document_id
      from private_listing_document_requirements r join private_listing_documents d on d.requirement_id=r.id where d.id=$1`, [row.document]))[0]
    assert.equal(linked.private_listing_id, row.listing)
    assert.equal(linked.requirement_key, key)
    assert.equal(linked.status, 'completed')
    assert.equal(linked.assurance_state, 'satisfied')
    assert.equal(linked.satisfied_by_document_id, row.document)
  }
  const pending = await seed({ key: 'signed_fica_declaration', signed: true })
  await query("update private_listing_documents set reviewed_signing_version_digest='old-digest' where id=$1", [pending.document])
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',0)", [pending.document]), error => error.code === '23514')
  await assert.rejects(query("update private_listing_document_requirements set status='approved' where id=$1", [pending.requirement]), /without approved, listing-scoped evidence/)
  await query("update private_listing_documents set reviewed_signing_version_digest='current-digest' where id=$1", [pending.document])
  await setting('app.uid', outsider)
  await assert.rejects(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures reviewed',0)", [pending.document]), error => error.code === '42501')
  await setting('app.uid', owner)
})
