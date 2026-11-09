// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { fetchDevelopmentOverviewPage } from '../overviewReadApi.js'

const dev = '20000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const actor = '30000000-0000-4000-8000-000000000001'
const unitId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let db
const measurements = []
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create table developments(id uuid primary key, organisation_id uuid);
    create table units(id uuid primary key, development_id uuid, organisation_id uuid,
      unit_number text, unit_label text, phase text, block text, unit_type text,
      bedrooms numeric, bathrooms numeric, parking_count numeric, size_sqm numeric,
      list_price numeric, current_price numeric, price numeric, status text, vat_applicable boolean,
      floorplan_id uuid, catalogue_floorplan_id uuid, unit_type_id uuid, structure_node_id uuid);
    create table transactions(id uuid primary key, unit_id uuid, development_id uuid,
      organisation_id uuid, buyer_id uuid, is_active boolean, lifecycle_state text,
      archived_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
      created_at timestamptz, updated_at timestamptz, stage text, current_main_stage text,
      sales_price numeric, purchase_price numeric, finance_type text, onboarding_status text,
      attorney text, bond_originator text, next_action text);
    create table buyers(id uuid primary key, organisation_id uuid, name text);
    grant usage on schema auth to authenticated;
    grant select on developments, units, transactions, buyers to authenticated;
    alter table developments enable row level security;
    alter table units enable row level security;
    alter table transactions enable row level security;
    alter table buyers enable row level security;
    create policy visible_developments on developments to authenticated using (organisation_id = auth.uid());
    create policy visible_units on units to authenticated using (organisation_id = auth.uid());
    create policy visible_transactions on transactions to authenticated using (organisation_id = auth.uid());
    create policy visible_buyers on buyers to authenticated using (organisation_id = auth.uid());
    create index on units(development_id);
    create index on transactions(unit_id, updated_at desc);
  `)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261109113248_development_overview_summary_read.sql', import.meta.url), 'utf8'))
}, 30_000)
afterAll(async () => {
  if (process.env.DEVELOPMENT_OVERVIEW_MEASUREMENT_OUTPUT) writeFileSync(process.env.DEVELOPMENT_OVERVIEW_MEASUREMENT_OUTPUT, JSON.stringify({ qualification: 'Local PGlite fixtures and in-process SDK transport only; no hosted database or browser paint measurement.', measurements }, null, 2) + '\n')
  await db?.close()
})

async function seed(size) {
  await db.exec('reset role; truncate developments, units, transactions, buyers;')
  await db.query('insert into developments values ($1,$2),($3,$3)', [dev, actor, other])
  await db.exec(`
    insert into units(id,development_id,organisation_id,unit_number,price,list_price,status)
    select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
      '${dev}', '${actor}', lpad(n::text,5,'0'), 1000, 1000,
      (array['Available','Reserved','OTP Signed','Finance Pending','Proceed to Attorneys','Transfer in Progress','Registered','Not Released','Sold','Complete'])[1 + ((n - 1) % 10)]
    from generate_series(1,${size}) n;
    insert into transactions(id,unit_id,development_id,organisation_id,is_active,created_at,updated_at,stage,current_main_stage,sales_price,onboarding_status,attorney,bond_originator,next_action)
    select id,id,development_id,organisation_id,true,now()-interval '40 days',now()-interval '40 days',status,
      'AVAIL',1000,'awaiting_client_onboarding','Firm','Originator','Review saved transaction'
    from units where status not in ('Available','Not Released');
    insert into units(id,development_id,organisation_id,unit_number,status,price)
    values ('${unitId(size + 1)}','${other}','${other}','Other private stock','Registered',99999999);
    select set_config('test.actor','${actor}',false);
    set role authenticated;
  `)
}
async function read(after = null, id = dev) {
  return (await db.query('select public.bridge_development_overview_summary($1,$2) payload', [id, after])).rows[0].payload
}

it.each([50, 500, 5000])('bounds the real SQL and SDK response at %i units while keeping all-unit totals', async size => {
  await seed(size)
  let requests = 0, responseBytes = 0, databaseMs = 0
  const client = createClient('https://fixture.invalid', 'local-fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_url, init) => {
      requests++
      const args = JSON.parse(init.body)
      const start = performance.now()
      const payload = await read(args.p_after_unit_id, args.p_development_id)
      databaseMs += performance.now() - start
      const body = JSON.stringify(payload)
      responseBytes += Buffer.byteLength(body)
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    } },
  })
  const page = await fetchDevelopmentOverviewPage(dev, { client })
  expect(requests).toBe(1)
  expect(page.rows).toHaveLength(25)
  expect(page.unitPage).toEqual({ pageSize: 25, nextCursor: unitId(25), total: size })
  expect(page.overviewSummary).toMatchObject({ totalUnits: size, available: size / 10,
    registered: size / 5, inProgress: size * 0.6, registeredValue: size * 200,
    pipelineValue: size * 600, onboardingAttentionCount: size * 0.8 })
  expect(page.overviewSummary.stageCounts).toEqual({ AVAIL: size / 10, DEP: size / 10,
    OTP: size / 5, FIN: size / 10, ATTY: size / 10, XFER: size / 10, REG: size / 5, BLOCKED: size / 10 })
  expect(page.overviewAttentionRows).toHaveLength(3)
  expect(page.overviewRecentRows).toHaveLength(4)
  expect(responseBytes).toBeLessThan(50_000)
  measurements.push({ units: size, requests, rows: page.rows.length, responseBytes, localDatabaseMs: Math.round(databaseMs * 100) / 100 })
}, 30_000)

it('uses stable cursor pages with no duplicates, including the final short page', async () => {
  await seed(51)
  const pages = [await read()]
  pages.push(await read(pages[0].nextCursor))
  pages.push(await read(pages[1].nextCursor))
  expect(pages.map(p => p.rows.length)).toEqual([25, 25, 1])
  expect(new Set(pages.flatMap(p => p.rows.map(r => r.unit.id))).size).toBe(51)
  expect(pages[2].nextCursor).toBeNull()
  expect(pages.every(p => p.summary.totalUnits === 51)).toBe(true)
})

it('applies invoker RLS to the development, units, transactions and buyers', async () => {
  await seed(50)
  expect(await read(null, other)).toBeNull()
  await db.exec('reset role')
  await db.query('update units set organisation_id=$1 where id=$2', [other, unitId(2)])
  await db.query('update transactions set organisation_id=$1 where unit_id=$2', [other, unitId(3)])
  await db.query('insert into buyers values ($1,$2,$3)', [unitId(100), other, 'Hidden buyer'])
  await db.query('update transactions set buyer_id=$1 where unit_id=$2', [unitId(100), unitId(4)])
  await db.exec('set role authenticated')
  const page = await read()
  expect(page.summary.totalUnits).toBe(49)
  expect(page.rows.some(r => r.unit.id === unitId(2))).toBe(false)
  expect(page.rows.find(r => r.unit.id === unitId(3)).transaction).toBeNull()
  expect(page.rows.find(r => r.unit.id === unitId(4)).buyer).toBeNull()
  expect(JSON.stringify(page)).not.toContain('Hidden buyer')
  await db.query("select set_config('test.actor',$1,false)", [other])
  expect(await read()).toBeNull()
})

it('excludes terminal and inactive transactions and never writes on an overview read', async () => {
  await seed(50)
  await db.exec('reset role')
  for (const [n, state] of [[2, 'archived'], [3, 'cancelled'], [4, 'deleted']]) {
    await db.query('update transactions set lifecycle_state=$1 where unit_id=$2', [state, unitId(n)])
  }
  await db.query('update transactions set is_active=false where unit_id=$1', [unitId(5)])
  await db.exec('set role authenticated')
  const before = (await db.query('select count(*) n from transactions')).rows[0].n
  const page = await read()
  expect(page.rows.filter(r => [2,3,4,5].map(unitId).includes(r.unit.id)).every(r => r.transaction === null)).toBe(true)
  expect((await db.query('select count(*) n from transactions')).rows[0].n).toBe(before)
  expect((await db.query("select has_function_privilege('anon','public.bridge_development_overview_summary(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false)
})

it('preserves manual stock status precedence and chooses the newest accessible current transaction', async () => {
  await seed(50)
  await db.exec('reset role')
  await db.query("update units set status='Blocked' where id=$1", [unitId(2)])
  await db.query("update units set status='Available' where id=$1", [unitId(3)])
  await db.query("update transactions set current_main_stage='FIN' where unit_id=$1", [unitId(3)])
  await db.query(`insert into transactions(id,unit_id,development_id,organisation_id,is_active,created_at,stage,current_main_stage)
    values ($1,$2,$3,$4,true,now(),'Registered','REG')`, [unitId(999), unitId(3), dev, actor])
  await db.exec('set role authenticated')
  expect((await read()).rows.find(r => r.unit.id === unitId(2)).mainStage).toBe('BLOCKED')
  expect((await read()).rows.find(r => r.unit.id === unitId(3)).mainStage).toBe('REG')
  await db.exec('reset role')
  await db.query("update transactions set archived_at=now() where id=$1", [unitId(999)])
  await db.exec('set role authenticated')
  expect((await read()).rows.find(r => r.unit.id === unitId(3)).mainStage).toBe('FIN')
})
