import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const organisationId = '11111111-1111-4111-8111-111111111111'
const agentId = '22222222-2222-4222-8222-222222222222'
let db
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create table organisations(id uuid, type text);
    create table organisation_users(organisation_id uuid, user_id uuid, status text, role text, workspace_role text, organisation_role text, email text);
    create table profiles(id uuid, full_name text);
    create table agency_public_intake_links(
      organisation_id uuid, slug text, status text, is_primary boolean, default_assigned_agent_id uuid,
      lead_source_label text, source_channel text,
      enabled_intents text[] not null default array['buy','sell'],
      metadata_json jsonb not null default '{}',
      constraint agency_public_intake_links_enabled_intents_check check(cardinality(enabled_intents) between 1 and 2 and enabled_intents <@ array['buy','sell'])
    );
    create table agency_public_intake_submissions(intent text, constraint agency_public_intake_submissions_intent_check check(intent in ('buy','sell')));
    create table agency_agent_card_events(event_type text, constraint agency_agent_card_events_type_check check(event_type in ('card_view','buyer_cta_click','seller_cta_click')));
    insert into organisations values('${organisationId}', 'agency');
    insert into profiles values('${agentId}', 'New Agent');
  `)
  for (const status of ['active', 'draft', 'disabled', 'archived']) {
    await db.query(`insert into agency_public_intake_links(slug, status, metadata_json) values($1,$2,$3)`, [status, status, { surface: 'agent_digital_card', agentDigitalCard: { rentalCtaLabel: 'Find a rental', agent: { name: 'Existing Agent' } } }])
  }
  await db.exec("insert into agency_public_intake_links(slug, status) values('agency', 'active')")
  for (const name of ['20261002075626_automatic_agent_digital_cards.sql', '20261008140000_agent_card_rental_enquiries.sql', '20261027075525_agent_card_rental_defaults.sql']) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
})
afterAll(async () => { await db?.close() })

it('adds rentals to existing cards while preserving status, custom labels and profiles', async () => {
  const { rows } = await db.query("select * from agency_public_intake_links where metadata_json->>'surface' = 'agent_digital_card'")
  expect(rows).toHaveLength(4)
  for (const row of rows) {
    expect(row.enabled_intents).toEqual(['buy', 'sell', 'rent'])
    expect(row.status).toBe(row.slug)
    expect(row.metadata_json.agentDigitalCard).toEqual({ rentalCtaLabel: 'Find a rental', agent: { name: 'Existing Agent' } })
  }
  expect((await db.query("select enabled_intents from agency_public_intake_links where slug = 'agency'")).rows[0].enabled_intents).toEqual(['buy', 'sell'])
})

it('provisions new agent drafts with all three enquiry actions and the correct assignment', async () => {
  await db.query('insert into organisation_users(organisation_id,user_id,status,role) values($1,$2,$3,$4)', [organisationId, agentId, 'active', 'agent'])
  const { rows } = await db.query('select * from agency_public_intake_links where default_assigned_agent_id = $1', [agentId])
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ organisation_id: organisationId, status: 'draft', enabled_intents: ['buy', 'sell', 'rent'] })
  expect(rows[0].metadata_json.agentDigitalCard.agent.name).toBe('New Agent')
})

it('keeps a later decision to disable rentals when membership changes', async () => {
  await db.query("update agency_public_intake_links set enabled_intents = array['buy','sell'] where default_assigned_agent_id = $1", [agentId])
  await db.query('update organisation_users set role = $1 where user_id = $2', ['principal', agentId])
  const { rows } = await db.query('select enabled_intents from agency_public_intake_links where default_assigned_agent_id = $1', [agentId])
  expect(rows).toHaveLength(1)
  expect(rows[0].enabled_intents).toEqual(['buy', 'sell'])
})

it('keeps automatic provisioning private and excludes ineligible members', async () => {
  expect((await db.query("select has_function_privilege('anon', 'arch9_private.ensure_agent_digital_card(uuid,uuid)', 'EXECUTE') as allowed")).rows[0].allowed).toBe(false)
  expect((await db.query("select has_function_privilege('authenticated', 'arch9_private.ensure_agent_digital_card(uuid,uuid)', 'EXECUTE') as allowed")).rows[0].allowed).toBe(false)
  await db.query('insert into organisation_users(organisation_id,user_id,status,role) values($1,$2,$3,$4)', [organisationId, '33333333-3333-4333-8333-333333333333', 'pending', 'agent'])
  expect((await db.query("select * from agency_public_intake_links where default_assigned_agent_id = '33333333-3333-4333-8333-333333333333'")).rows).toHaveLength(0)
})
