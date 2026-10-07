import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { isRentalCrmLead } from '../../src/services/rentals/rentalCrmLeadModel.js'
import { getRentalLeadOutcome, isRentalLeadOperational } from '../../src/services/rentals/rentalLeadOutcomeModel.js'
import { filterRentalLeadList } from '../../src/services/rentals/rentalLeadListModel.js'

const org = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'
const otherOrg = '22222222-2222-4222-8222-222222222222'
const sale = '33333333-3333-4333-8333-333333333333'
const rental = '44444444-4444-4444-8444-444444444444'
const actor = '55555555-5555-4555-8555-555555555555'
const migrationUrl = new URL('../../../supabase/migrations/20261007155955_property24_unlinked_rental_lead_classification.sql', import.meta.url)
let db, migration, originalRows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create table private_listings(id uuid primary key, organisation_id uuid, listing_category text);
    create table listing_publication_data(listing_id uuid, listing_type text);
    create table leads(lead_id uuid primary key default gen_random_uuid(), organisation_id uuid,
      lead_domain text default 'agency', lead_source text, source_channel text,
      assigned_agent_id uuid, branch_id uuid, enquired_listing_id uuid, listing_id text,
      raw_enquiry_payload jsonb, seller_property_address text, status text default 'New Lead',
      stage text default 'New Lead', notes text, contact_id uuid, created_at timestamptz default now());
    insert into private_listings values ('${sale}', '${org}', 'sale'), ('${rental}', '${org}', 'rental');
    insert into listing_publication_data values ('${sale}', 'Sale'), ('${rental}', 'Rental');
  `)
  const baseline = await readFile(new URL('../../../supabase/migrations/20260926172852_rental_lead_intake_classification.sql', import.meta.url), 'utf8')
  const start = baseline.indexOf('create or replace function public.classify_new_rental_lead()')
  await db.exec(baseline.slice(start, baseline.indexOf('\ncommit;', start)))
  await db.exec(await readFile(new URL('../../../supabase/migrations/20260926212945_fix_rental_lead_classifier_listing_id_type.sql', import.meta.url), 'utf8'))
  await db.exec(`insert into leads(organisation_id, lead_source, status, stage, raw_enquiry_payload,
      notes, contact_id, assigned_agent_id, created_at)
    select '${org}', 'Property24', 'Lost', 'Lost', jsonb_build_object(
      'listingType', 'Rental', 'listingNumber', 70000 + i,
      'agencyVerification', jsonb_build_object('source', 'property24_listing_statistics', 'agencyId', 39227),
      'consents', jsonb_build_object('marketing', 'declined'),
      'outcome', jsonb_build_object('reason', 'property_unavailable', 'note', 'Original closure')),
      'Original enquiry', gen_random_uuid(), '${actor}', '2026-10-05 07:41:10+00'
    from generate_series(1,45) as i;`)
  originalRows = (await db.query('select * from leads order by lead_id')).rows
  expect(originalRows.every(row => !isRentalCrmLead(row))).toBe(true)
  migration = await readFile(migrationUrl, 'utf8')
  await db.exec(migration)
})
afterAll(async () => { await db?.close() })

async function capture({ source = 'Property24', domain = 'agency', listingId = null,
  legacyListingId = null, organisationId = org, channel = null,
  payload = { listingType: 'Rental' } } = {}) {
  return (await db.query(`insert into leads(organisation_id, lead_source, lead_domain,
    enquired_listing_id, listing_id, source_channel, raw_enquiry_payload)
    values($1,$2,$3,$4,$5,$6,$7) returning *`,
  [organisationId, source, domain, listingId, legacyListingId, channel, JSON.stringify(payload)])).rows[0]
}

it('moves the reviewed 45 leads into closed Rentals and excludes them from Sales without reopening', async () => {
  const rows = (await db.query("select * from leads where status = 'Lost' order by lead_id")).rows
  expect(rows).toHaveLength(45)
  expect(rows.filter(isRentalCrmLead)).toHaveLength(45)
  expect(rows.filter(row => !isRentalCrmLead(row))).toHaveLength(0)
  expect(rows.filter(isRentalLeadOperational)).toHaveLength(0)
  const views = rows.map(row => ({ ...row, role: row.raw_enquiry_payload.role, outcome: getRentalLeadOutcome(row), name: 'Fixture tenant' }))
  expect(filterRentalLeadList(views, { role: 'closed' })).toHaveLength(45)
  rows.forEach((row, index) => {
    const { raw_enquiry_payload: beforePayload, ...before } = originalRows[index]
    const { raw_enquiry_payload: afterPayload, ...after } = row
    expect(after).toEqual(before)
    for (const key of ['listingNumber', 'listingType', 'agencyVerification']) expect(afterPayload[key]).toEqual(beforePayload[key])
    expect(afterPayload.consents).toMatchObject({ marketing: 'declined', screening: 'not_captured' })
    expect(afterPayload.outcome).toMatchObject({ status: 'lost', reason: 'property_unavailable', note: 'Original closure' })
  })
})

it('classifies future unlinked and legacy-reference Property24 rentals as tenant leads', async () => {
  for (const options of [{}, { legacyListingId: 'external-advert-reference' }, { payload: { listingType: ' rental ' } }]) {
    const row = await capture(options)
    expect(isRentalCrmLead(row)).toBe(true)
    expect(row.raw_enquiry_payload.role).toBe('tenant')
    expect(getRentalLeadOutcome(row).status).toBe('open')
    expect(row.raw_enquiry_payload.consents.screening).toBe('not_captured')
  }
})

it('keeps sale, unknown-type, other-source and other-domain leads out of Rentals', async () => {
  for (const options of [{ payload: { listingType: 'Sale' } }, { payload: {} },
    { source: 'Manual' }, { source: 'Private Property' }, { domain: 'developer' }]) {
    expect(isRentalCrmLead(await capture(options))).toBe(false)
  }
})

it('uses the linked local listing and refuses a foreign listing instead of trusting a conflicting type', async () => {
  expect(isRentalCrmLead(await capture({ listingId: sale }))).toBe(false)
  expect(isRentalCrmLead(await capture({ listingId: rental, payload: {} }))).toBe(true)
  expect(isRentalCrmLead(await capture({ legacyListingId: rental, payload: {} }))).toBe(true)
  expect(isRentalCrmLead(await capture({ listingId: rental, organisationId: otherOrg }))).toBe(false)
})

it('preserves website tenant/landlord routing and existing rental metadata', async () => {
  for (const [intent, role] of [['rent', 'tenant'], ['let', 'landlord']]) {
    const row = await capture({ source: 'Website', channel: 'website', payload: { attribution: { leadIntent: intent } } })
    expect(isRentalCrmLead(row)).toBe(true)
    expect(row.raw_enquiry_payload.role).toBe(role)
  }
  const metadata = { arch9RentalLead: true, classification: 'rental', role: 'landlord', stage: 'mandate_signed', custom: 'preserved' }
  expect((await capture({ payload: metadata })).raw_enquiry_payload).toEqual(metadata)
})

it('is repeatable and leaves historical records outside the exact reviewed batch untouched', async () => {
  await db.exec("alter table leads disable trigger classify_new_rental_lead")
  const outside = await capture({ organisationId: otherOrg })
  await db.query("update leads set status='Lost', created_at='2026-10-05 07:41:10+00' where lead_id=$1", [outside.lead_id])
  await db.exec('alter table leads enable trigger classify_new_rental_lead')
  const before = (await db.query('select * from leads order by lead_id')).rows
  await db.exec(migration)
  expect((await db.query('select * from leads order by lead_id')).rows).toEqual(before)
  expect(isRentalCrmLead((await db.query('select * from leads where lead_id=$1', [outside.lead_id])).rows[0])).toBe(false)
})

it('aborts the whole migration if the reviewed repair count has changed', async () => {
  const oldDefinition = (await db.query("select pg_get_functiondef('classify_new_rental_lead()'::regprocedure) as definition")).rows[0].definition
  await db.exec("alter table leads disable trigger classify_new_rental_lead")
  const candidate = await capture({ payload: { listingType: 'Rental', agencyVerification: { source: 'property24_listing_statistics', agencyId: 39227 } } })
  await db.query("update leads set status='Lost', created_at='2026-10-05 07:41:10+00' where lead_id=$1", [candidate.lead_id])
  await db.exec('alter table leads enable trigger classify_new_rental_lead')
  await expect(db.exec(migration)).rejects.toThrow('expected 45 or 0 candidates, found 1')
  await db.exec('rollback')
  expect((await db.query("select pg_get_functiondef('classify_new_rental_lead()'::regprocedure) as definition")).rows[0].definition).toBe(oldDefinition)
  expect(isRentalCrmLead((await db.query('select * from leads where lead_id=$1', [candidate.lead_id])).rows[0])).toBe(false)
})

it('keeps the trigger function unavailable as a directly callable browser command', async () => {
  for (const role of ['anon', 'authenticated']) {
    expect((await db.query("select has_function_privilege($1, 'public.classify_new_rental_lead()', 'EXECUTE') as allowed", [role])).rows[0].allowed).toBe(false)
  }
})

it('refuses to overwrite an unrelated change to the deployed classifier', async () => {
  const definition = (await db.query("select pg_get_functiondef('classify_new_rental_lead()'::regprocedure) as definition")).rows[0].definition
  const changed = definition.replace('  v_role text;', '  v_role text; -- unrelated change')
  expect(changed).not.toBe(definition)
  await db.exec(changed)
  await expect(db.exec(migration)).rejects.toThrow('Rental classifier changed; review before applying')
  await db.exec('rollback')
  expect((await db.query("select pg_get_functiondef('classify_new_rental_lead()'::regprocedure) as definition")).rows[0].definition).toBe(changed)
  await db.exec(definition)
})
