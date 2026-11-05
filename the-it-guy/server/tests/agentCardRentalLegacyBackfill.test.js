import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

let db, correction, defaults
const retiredAgent = '22222222-2222-4222-8222-222222222222'
beforeAll(async () => {
  db = new PGlite()
  correction = await readFile(new URL('../../../supabase/migrations/20261027145332_agent_card_rental_legacy_backfill.sql', import.meta.url), 'utf8')
  defaults = await readFile(new URL('../../../supabase/migrations/20261027075525_agent_card_rental_defaults.sql', import.meta.url), 'utf8')
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema arch9_private;
    create table agency_public_intake_links(
      id text primary key, slug text, status text, default_assigned_agent_id uuid,
      enabled_intents text[] not null default array['buy','sell'], metadata_json jsonb not null default '{}',
      check(cardinality(enabled_intents) between 1 and 3 and enabled_intents <@ array['buy','sell','rent']
        and (not ('rent' = any(enabled_intents)) or metadata_json->>'surface'='agent_digital_card'))
    );
    insert into agency_public_intake_links values
      ('current','current-card','active','11111111-1111-4111-8111-111111111111',array['buy','sell'],'{"surface":"agent_digital_card","agentDigitalCard":{"agent":{"name":"Current Agent"}}}'),
      ('retired','retained-card','disabled','${retiredAgent}',array['buy','sell'],'{"surface":"agent_digital_card","agentDigitalCard":{"rentalCtaLabel":"Find a rental"}}'),
      ('agency','agency-intake','active',null,array['buy','sell'],'{}');
    create function bridge_validate_agency_public_intake_link() returns trigger language plpgsql as $$
    begin
      if new.default_assigned_agent_id = '${retiredAgent}'::uuid then
        raise exception 'Default assigned agent must be an active member of the agency public intake organisation';
      end if;
      return new;
    end; $$;
    create trigger trg_bridge_validate_agency_public_intake_link before insert or update on agency_public_intake_links
      for each row execute function bridge_validate_agency_public_intake_link();
  `)
})
afterAll(async () => { await db?.close() })

it('reproduces the stale-assignment failure found in the real restored production database', async () => {
  await expect(db.exec(defaults)).rejects.toThrow(/active member/)
  await db.exec('rollback')
  expect((await db.query("select enabled_intents from agency_public_intake_links where id='retired'")).rows[0].enabled_intents).toEqual(['buy','sell'])
})

it('applies the narrow atomic backfill before the original defaults migration without changing card details', async () => {
  const before=(await db.query('select * from agency_public_intake_links order by id')).rows
  await db.exec(correction)
  await db.exec(defaults)
  const after=(await db.query('select * from agency_public_intake_links order by id')).rows
  for (let i=0;i<before.length;i++) {
    expect({ ...after[i], enabled_intents: before[i].enabled_intents }).toEqual(before[i])
    expect(after[i].enabled_intents).toEqual(before[i].id==='agency'?['buy','sell']:['buy','sell','rent'])
  }
})

it('keeps the original relationship validator and CHECK constraints enforced after the backfill', async () => {
  expect((await db.query("select tgenabled from pg_trigger where tgname='trg_bridge_validate_agency_public_intake_link'")).rows[0].tgenabled).toBe('O')
  await expect(db.exec("update agency_public_intake_links set slug='changed' where id='retired'")).rejects.toThrow(/active member/)
  await expect(db.exec("update agency_public_intake_links set enabled_intents=array['other'] where id='current'")).rejects.toThrow(/check constraint/)
  await db.exec(correction)
  expect((await db.query("select enabled_intents from agency_public_intake_links where id='retired'")).rows[0].enabled_intents).toEqual(['buy','sell','rent'])
})

it('refuses an unexpected validator state and rolls back without changing it', async () => {
  await db.exec('alter table agency_public_intake_links disable trigger trg_bridge_validate_agency_public_intake_link')
  await expect(db.exec(correction)).rejects.toThrow(/Expected active agency intake relationship validator/)
  await db.exec('rollback')
  expect((await db.query("select tgenabled from pg_trigger where tgname='trg_bridge_validate_agency_public_intake_link'")).rows[0].tgenabled).toBe('D')
  await db.exec('alter table agency_public_intake_links enable trigger trg_bridge_validate_agency_public_intake_link')
})
