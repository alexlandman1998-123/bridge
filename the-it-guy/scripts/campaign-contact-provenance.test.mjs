import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const org = id(1), owner = id(2), listingId = id(3)
const contacts = (source, fields = ['agentName', 'agentEmail', 'agentPhone', 'destination']) => ({ version: 1, source: Object.fromEntries(fields.map((key) => [key, source[key] || ''])), overrides: {}, confirmed: true })
const propertySource = { title: 'A public home', price: 'R 1500000', location: 'Gardens', agencyName: 'Oak Agency', agentName: 'Sarah', agentEmail: 'sarah@example.test', agentPhone: '', destination: 'sarah@example.test', language: 'en-ZA' }
const listing = { version: 1, template: 'new-listing', listingId, agentId: owner, source: propertySource }
const general = { version: 1, template: 'buyers', agentId: owner, source: { agencyName: 'Oak Agency', agentName: 'Sarah', destination: 'sarah@example.test', language: 'en-ZA' }, details: { area: 'Gardens' }, reviewed: true, permission: false }

test('versioned contact provenance extends actual campaign validators without rewriting legacy drafts or weakening JSON bounds', async (t) => {
  const db = new PGlite()
  let serial = 100
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);create table public.organisations(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select '${owner}'::uuid$$;
      create function public.bridge_is_active_member(o uuid) returns boolean language sql stable as $$select o='${org}'::uuid$$;
      create function public.bridge_has_organisation_membership(o uuid) returns boolean language sql stable as $$select public.bridge_is_active_member(o)$$;
      create function public.email_campaign_can_send(o uuid) returns boolean language sql stable as $$select false$$;
      create table public.email_campaigns(id uuid primary key,organisation_id uuid);
      create table public.whatsapp_campaigns(id uuid primary key,organisation_id uuid);
      create table public.transactions(id uuid primary key,organisation_id uuid);
      create table public.private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,listing_visibility text,listing_category text,listing_status text);
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant select on public.private_listings to authenticated;
      insert into public.organisations values('${org}');insert into auth.users values('${owner}');
      insert into public.private_listings values('${listingId}','${org}','${owner}','agency','residential','active');
    `)
    await db.exec(migration('20260901165146_marketing_event_foundation_phase1.sql'))
    await db.exec(migration('20261022132550_marketing_campaign_initiatives.sql'))
    // The general relationship constraint consumes this later, independent
    // campaign-copy column. It is not part of the provenance change.
    await db.exec("alter table public.marketing_campaigns add column channel_content jsonb not null default '{}';")
    await db.exec(migration('20261023124339_marketing_campaign_listing_builder.sql'))
    await db.exec(migration('20261023132334_marketing_property_campaign_builders.sql'))
    await db.exec(migration('20261025210244_marketing_show_day_status_alignment.sql'))
    await db.exec(migration('20261023140030_marketing_general_campaign_builders.sql'))
    await db.exec(migration('20261023144949_marketing_relationship_campaign_builders.sql'))
    // Execute the actual latest general-family validator/constraint section;
    // unrelated provider ledger changes need no test stubs in this SQL check.
    const business = migration('20261025204945_business_campaign_ai.sql')
    await db.exec('begin;\n' + business.slice(business.indexOf('-- A genuine client nurture recipe')))
    const save = async (builder, kind = 'listing', goal = kind === 'listing' ? 'promote_listing' : 'buyer_leads') => {
      const campaignId = id(serial++)
      await db.exec('set role authenticated')
      return (await db.query(`insert into public.marketing_campaigns(id,organisation_id,name,goal,objective,${kind === 'listing' ? 'listing_builder' : 'campaign_builder'}) values($1,$2,'Public campaign',$3,'Start a useful conversation',$4) returning id`, [campaignId, org, goal, builder])).rows[0].id
    }
    const valid = async (builder, kind = 'listing') => (await db.query(`select public.marketing_${kind === 'listing' ? 'listing' : 'general'}_builder_valid($1) valid`, [builder])).rows[0].valid
    const legacyId = await save(listing)
    await db.exec('reset role')
    await db.exec(migration('20261025210814_campaign_contact_source_provenance.sql'))

    await t.test('legacy records remain readable and valid without being silently assigned provenance', async () => {
      const persisted = (await db.query('select listing_builder from public.marketing_campaigns where id=$1', [legacyId])).rows[0].listing_builder
      assert.deepEqual(persisted, listing)
      assert.equal(await valid(listing), true)
      assert.equal(await valid(general, 'general'), true)
      assert.equal(persisted.contactProvenance, undefined)
    })

    await t.test('fresh confirmed property/general snapshots and explicit overrides save through real checks', async () => {
      const current = { ...listing, contactProvenance: contacts(propertySource) }
      assert.equal(await valid(current), true)
      await save(current)
      const absent = { ...propertySource, destination: '' }
      const explicit = { ...listing, source: { ...absent, destination: 'campaign@example.test' }, contactProvenance: { ...contacts(absent), overrides: { destination: 'campaign@example.test' } } }
      assert.equal(await valid(explicit), true)
      await save(explicit)
      const modernGeneral = { ...general, contactProvenance: contacts(general.source, ['agentName', 'destination']) }
      assert.equal(await valid(modernGeneral, 'general'), true)
      await save(modernGeneral, 'general')
      await save({ ...modernGeneral, template: 'client-check-in' }, 'general', 'reengage')
    })

    await t.test('unsupported versions, unconfirmed records, private keys and effective/source tampering are rejected', async () => {
      const provenance = contacts(propertySource)
      for (const record of [null, { ...provenance, version: 2 }, { ...provenance, confirmed: false }, { ...provenance, confirmed: 'true' }, { ...provenance, privateClientId: 'secret' }, { ...provenance, source: { ...provenance.source, sellerEmail: 'secret@example.test' } }, { ...provenance, overrides: { privatePhone: '+27820000000' } }, { ...provenance, source: { ...provenance.source, agentName: 'x'.repeat(6001) } }, { ...provenance, source: { ...provenance.source, agentName: ' Sarah ' } }, { ...provenance, overrides: { destination: 'unmatched@example.test' } }]) {
        const invalid = { ...listing, contactProvenance: record }
        assert.equal(await valid(invalid), false)
        await assert.rejects(save(invalid), /Invalid listing draft|check constraint/)
      }
    })

    await t.test('general snapshots accept only general contact fields and retain strict original source/details checks', async () => {
      const builder = { ...general, contactProvenance: contacts(general.source, ['agentName', 'destination']) }
      for (const record of [{ ...builder.contactProvenance, source: { ...builder.contactProvenance.source, agentEmail: '' } }, { ...builder.contactProvenance, overrides: { destination: 'unmatched@example.test' } }, { ...builder.contactProvenance, confirmed: false }]) assert.equal(await valid({ ...builder, contactProvenance: record }, 'general'), false)
      assert.equal(await valid({ ...builder, source: { ...builder.source, privateClient: 'secret' } }, 'general'), false)
      assert.equal(await valid({ ...builder, details: { ...builder.details, recipientIds: 'secret' } }, 'general'), false)
    })

    await t.test('property collections validate independent provenance for every selected member', async () => {
      const member = { listingId: id(4), agentId: owner, source: propertySource, contactProvenance: contacts(propertySource) }
      const collection = { ...listing, version: 2, template: 'property-collection', contactProvenance: contacts(propertySource), settings: {}, additionalListings: [member, { ...member, listingId: id(5) }] }
      assert.equal(await valid(collection), true)
      const wrong = { ...member, contactProvenance: { ...member.contactProvenance, confirmed: false } }
      assert.equal(await valid({ ...collection, additionalListings: [wrong, { ...member, listingId: id(5) }] }), false)
      const privateMember = { ...member, hiddenClientId: 'private' }
      assert.equal(await valid({ ...collection, additionalListings: [privateMember, { ...member, listingId: id(5) }] }), false)
    })

    await t.test('new validation functions remain invoker-only with no anonymous execution grant', async () => {
      await db.exec('reset role')
      for (const signature of ['marketing_campaign_contact_provenance_valid(jsonb,jsonb,text[])', 'marketing_listing_builder_valid(jsonb)', 'marketing_general_builder_valid(jsonb)']) {
        const row = (await db.query('select prosecdef,has_function_privilege($1,oid,$2) anonymous from pg_proc where oid=$3::regprocedure', ['anon', 'execute', `public.${signature}`])).rows[0]
        assert.equal(row.prosecdef, false)
        assert.equal(row.anonymous, false)
      }
    })
  } finally { await db.close() }
})
