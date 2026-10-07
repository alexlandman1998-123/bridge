import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const org = '11111111-1111-4111-8111-111111111111'
const otherOrg = '22222222-2222-4222-8222-222222222222'
const actor = '33333333-3333-4333-8333-333333333333'
const otherAgent = '44444444-4444-4444-8444-444444444444'
const branch = '55555555-5555-4555-8555-555555555555'
const otherBranch = '66666666-6666-4666-8666-666666666666'
let db

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.actor', true), '')::uuid
    $$;
    create function bridge_is_org_admin(o uuid) returns boolean language sql stable as $$
      select o = '${org}' and current_setting('test.admin', true) = 'true'
    $$;
    create function rental_branch_access(o uuid, b uuid) returns boolean language sql stable as $$
      select o = '${org}' and (public.bridge_is_org_admin(o) or b is null or b = '${branch}')
    $$;
    create table private_listings (
      id uuid primary key default gen_random_uuid(), organisation_id uuid, branch_id uuid,
      assigned_agent_id uuid, listing_category text, listing_status text, listing_visibility text,
      accessible boolean default true
    );
    create function bridge_can_access_private_listing(l uuid) returns boolean language sql stable as $$
      select exists(select 1 from public.private_listings where id = l and accessible)
    $$;
    create table rental_properties (id uuid primary key, organisation_id uuid, branch_id uuid,
      assigned_manager_id uuid, status text, name text);
    create table rental_property_mandates (id uuid, property_id uuid, mandate_status text,
      authority_status text, starts_on date, ends_on date);
    create table rental_units (id uuid primary key, property_id uuid, status text,
      unit_label text, target_rent numeric);
    create table rental_tenancies (id uuid primary key, property_id uuid, unit_id uuid, status text);
    create table rental_vacancies (id uuid primary key, property_id uuid, assigned_agent_id uuid,
      status text, asking_rent numeric);
    create table rental_applications (id uuid, vacancy_id uuid, unit_id uuid, status text,
      submitted_at timestamptz, created_at timestamptz);
    create table rental_leases (id uuid primary key, tenancy_id uuid);
    create table rental_lease_versions (lease_id uuid, is_current boolean, monthly_rent numeric,
      effective_end_date date);
    create table leads (lead_id uuid, organisation_id uuid, branch_id uuid, raw_enquiry_payload jsonb,
      assigned_agent_id uuid, assigned_user_id uuid, created_by uuid, created_at timestamptz);
  `)
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261007154210_rental_dashboard_listing_mandate_count.sql', import.meta.url), 'utf8'))
})
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`reset role;
    truncate private_listings, rental_properties, rental_property_mandates, rental_units,
      rental_tenancies, rental_vacancies, rental_applications, rental_leases, rental_lease_versions, leads;
    select set_config('test.actor', '${actor}', false), set_config('test.admin', 'true', false);
  `)
})

async function listing({ organisationId = org, branchId = branch, agentId = actor,
  category = 'rental', status = 'draft', visibility = 'internal', accessible = true } = {}) {
  return (await db.query(`insert into private_listings
    (organisation_id, branch_id, assigned_agent_id, listing_category, listing_status, listing_visibility, accessible)
    values ($1, $2, $3, $4, $5, $6, $7) returning id`,
  [organisationId, branchId, agentId, category, status, visibility, accessible])).rows[0].id
}
async function dashboard({ organisationId = org, branchId = null, scope = 'company', days = 30 } = {}) {
  return (await db.query('select rental_get_management_dashboard($1, $2, $3, $4) as snapshot',
    [organisationId, branchId, scope, days])).rows[0].snapshot
}

it('automatically counts an existing draft and each new listing without separate mandate records', async () => {
  expect((await dashboard()).metrics.active_mandates).toBe(0)
  const id = await listing()
  expect((await dashboard()).metrics.active_mandates).toBe(1)
  await db.query("update private_listings set listing_status = 'published' where id = $1", [id])
  await listing({ status: 'published' })
  const result = await dashboard()
  expect(result.metrics.active_mandates).toBe(2)
  expect(result.mandate_overview.active).toBe(2)
  expect(result.metrics.monthly_rent_roll).toBe(0)
  expect(result.metrics.active_tenancies).toBe(0)
  expect((await db.query('select count(*)::integer as count from rental_property_mandates')).rows[0].count).toBe(0)
})

it('removes previous stock from the count and excludes sales', async () => {
  await listing()
  await listing({ category: 'sale' })
  for (const status of ['archived', 'withdrawn', 'deleted', 'let', 'rented', 'leased', 'sold']) await listing({ status })
  for (const visibility of ['archived', 'deleted']) await listing({ visibility })
  expect((await dashboard()).metrics.active_mandates).toBe(1)
  await db.exec("update private_listings set listing_status = 'withdrawn' where listing_status = 'draft'")
  expect((await dashboard()).metrics.active_mandates).toBe(0)
})

it('counts only accessible stock in the requested agency and branch', async () => {
  await listing()
  await listing({ branchId: otherBranch })
  await listing({ organisationId: otherOrg })
  await listing({ accessible: false })
  expect((await dashboard()).metrics.active_mandates).toBe(2)
  expect((await dashboard({ branchId: branch })).metrics.active_mandates).toBe(1)
  expect((await dashboard({ organisationId: otherOrg })).metrics.active_mandates).toBe(0)
})

it('honours agent scope and downgrades a non-admin company request', async () => {
  await listing()
  await listing({ agentId: otherAgent })
  await listing({ branchId: otherBranch })
  expect((await dashboard({ scope: 'agent' })).metrics.active_mandates).toBe(2)
  await db.exec("select set_config('test.admin', 'false', false)")
  const result = await dashboard()
  expect(result.effective_scope).toBe('agent')
  expect(result.metrics.active_mandates).toBe(1)
  await expect(dashboard({ branchId: otherBranch })).rejects.toThrow('Not authorized for the selected branch')
})

it('keeps the listing total independent of the activity date filter and pagination limits', async () => {
  await db.exec(`insert into private_listings (organisation_id, branch_id, assigned_agent_id,
    listing_category, listing_status, listing_visibility)
    select '${org}', '${branch}', '${actor}', 'rental', 'draft', 'internal' from generate_series(1, 1005)`)
  expect((await dashboard({ days: 7 })).metrics.active_mandates).toBe(1005)
  expect((await dashboard({ days: 90 })).metrics.active_mandates).toBe(1005)
})

it('does not add the separate management mandate to the listing total or change contractual rent', async () => {
  await listing()
  await db.exec(`
    insert into rental_properties values ('${org}', '${org}', '${branch}', '${actor}', 'active', 'Test house');
    insert into rental_property_mandates values ('${org}', '${org}', 'active', 'confirmed', null, null);
    insert into rental_units values ('${org}', '${org}', 'occupied', 'MAIN', 12000);
    insert into rental_tenancies values ('${org}', '${org}', '${org}', 'active');
    insert into rental_leases values ('${org}', '${org}');
    insert into rental_lease_versions values ('${org}', true, 12000, current_date + 60);
  `)
  const result = await dashboard()
  expect(result.metrics.active_mandates).toBe(1)
  expect(result.metrics.monthly_rent_roll).toBe(12000)
  expect(result.metrics.active_tenancies).toBe(1)
  expect(result.metrics.occupancy_rate).toBe(100)
})

it('retains authenticated execution and rejects anonymous or missing-identity calls', async () => {
  await listing()
  await db.exec('set role authenticated')
  expect((await dashboard()).metrics.active_mandates).toBe(1)
  await db.exec("reset role; select set_config('test.actor', '', false)")
  await expect(dashboard()).rejects.toThrow('Not authorized')
  await db.exec('set role anon')
  await expect(dashboard()).rejects.toThrow('permission denied')
})
