import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
let db
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table agency_public_intake_links(enabled_intents text[] not null default array['buy','sell'], metadata_json jsonb not null default '{}', constraint agency_public_intake_links_enabled_intents_check check(cardinality(enabled_intents) between 1 and 2 and enabled_intents <@ array['buy','sell']));
    create table agency_public_intake_submissions(intent text, constraint agency_public_intake_submissions_intent_check check(intent in ('buy','sell')));
    create table agency_agent_card_events(event_type text, constraint agency_agent_card_events_type_check check(event_type in ('card_view','buyer_cta_click','seller_cta_click')));
    insert into agency_public_intake_links default values;
  `)
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261008140000_agent_card_rental_enquiries.sql', import.meta.url), 'utf8'))
})
afterAll(async () => { await db?.close() })
it('preserves existing cards and permits rental-only and three-action agent cards', async () => {
  expect((await db.query('select enabled_intents from agency_public_intake_links')).rows[0].enabled_intents).toEqual(['buy', 'sell'])
  for (const intents of [['rent'], ['buy', 'sell', 'rent']]) {
    await db.query('insert into agency_public_intake_links values($1,$2)', [intents, { surface: 'agent_digital_card' }])
  }
  await db.exec("insert into agency_public_intake_submissions values('rent'); insert into agency_agent_card_events values('rental_cta_click')")
})
it('rejects unsupported intents, empty actions and rental actions on agency intake links', async () => {
  for (const [intents, metadata] of [[[], {}], [['rent'], {}], [['let'], { surface: 'agent_digital_card' }]]) await expect(db.query('insert into agency_public_intake_links values($1,$2)', [intents, metadata])).rejects.toThrow(/check constraint/)
  await expect(db.exec("insert into agency_public_intake_submissions values('let')")).rejects.toThrow(/check constraint/)
})
