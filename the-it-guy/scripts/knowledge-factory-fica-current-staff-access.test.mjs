import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const organisationId = randomUUID()
const staffId = randomUUID()
const partyId = randomUUID()
const caseId = randomUUID()
const eventId = randomUUID()

await db.exec(`
  create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
  create table public.organisation_users (
    organisation_id uuid, user_id uuid, status text
  );
  create table public.knowledge_factory_fica_cases (
    id uuid primary key, organisation_id uuid, subject_user_id uuid,
    shared_party_user_ids uuid[] not null default '{}',
    assigned_staff_user_ids uuid[] not null default '{}',
    created_by uuid, document_checklist jsonb not null default '{}'::jsonb
  );
  create table public.knowledge_factory_fica_audit_events (
    id uuid primary key, fica_case_id uuid, organisation_id uuid
  );
  create function public.knowledge_factory_is_active_member(uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from public.organisation_users
        where organisation_id = $1 and user_id = auth.uid() and status = 'active'
      )
    $$;
  create function public.knowledge_factory_fica_is_privileged(uuid) returns boolean
    language sql stable as $$ select false $$;
  alter table public.knowledge_factory_fica_cases enable row level security;
  alter table public.knowledge_factory_fica_audit_events enable row level security;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant select, update on public.knowledge_factory_fica_cases to authenticated;
  grant select on public.knowledge_factory_fica_audit_events to authenticated;
`)
await db.query(
  'insert into public.organisation_users values ($1, $2, $3)',
  [organisationId, staffId, 'active'],
)
await db.query(
  `insert into public.knowledge_factory_fica_cases
   (id, organisation_id, subject_user_id, assigned_staff_user_ids, created_by)
   values ($1, $2, $3, array[$4]::uuid[], $4)`,
  [caseId, organisationId, partyId, staffId],
)
await db.query(
  'insert into public.knowledge_factory_fica_audit_events values ($1, $2, $3)',
  [eventId, caseId, organisationId],
)

const migration = await readFile(
  new URL('../../supabase/migrations/20260927073411_knowledge_factory_fica_current_staff_access.sql', import.meta.url),
  'utf8',
)
await db.exec(migration)

const as = async (userId) => {
  await db.exec('reset role')
  await db.query("select set_config('test.actor', $1, false)", [userId])
  await db.exec('set role authenticated')
}
const visibleCount = async (table) => Number((await db.query(`select count(*) as count from public.${table}`)).rows[0].count)
const updateCount = async () => (await db.query(
  'update public.knowledge_factory_fica_cases set document_checklist = $1 where id = $2 returning id',
  [{ reviewed: true }, caseId],
)).rows.length

await as(staffId)
assert.equal(await visibleCount('knowledge_factory_fica_cases'), 1)
assert.equal(await visibleCount('knowledge_factory_fica_audit_events'), 1)
assert.equal(await updateCount(), 1)

await db.exec('reset role')
await db.query('update public.organisation_users set status = $1 where user_id = $2', ['inactive', staffId])
await as(staffId)
assert.equal(await visibleCount('knowledge_factory_fica_cases'), 0)
assert.equal(await visibleCount('knowledge_factory_fica_audit_events'), 0)
assert.equal(await updateCount(), 0)

await as(partyId)
assert.equal(await visibleCount('knowledge_factory_fica_cases'), 1)
assert.equal(await visibleCount('knowledge_factory_fica_audit_events'), 1)
assert.equal(await updateCount(), 0)

await db.exec('reset role')
await db.close()
console.log('FICA migration: active staff access, former staff denial, and party read access passed.')
