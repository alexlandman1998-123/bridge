import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const org = id(1), otherOrg = id(2), owner = id(3), manager = id(4), colleague = id(5), listing = id(10), otherListing = id(11), event = id(20)
const correction = '20261025210244_marketing_show_day_status_alignment.sql'

test('actual property campaign trigger accepts active show-day statuses without weakening its source and tenant checks', async (t) => {
  const db = new PGlite()
  let serial = 100
  try {
    // Shared tables outside this narrow contract use minimal columns. The
    // marketing campaign/event tables, RLS, validators and triggers below are
    // loaded unchanged from their actual historical migrations.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create table public.organisations(id uuid primary key);
      create function public.bridge_is_active_member(o uuid) returns boolean language sql stable as $$select o='${org}' and auth.uid() in ('${owner}','${manager}','${colleague}')$$;
      create function public.bridge_has_organisation_membership(o uuid) returns boolean language sql stable as $$select public.bridge_is_active_member(o)$$;
      create function public.email_campaign_can_send(o uuid) returns boolean language sql stable as $$select o='${org}' and auth.uid()='${manager}'$$;
      create table public.email_campaigns(id uuid primary key,organisation_id uuid);
      create table public.whatsapp_campaigns(id uuid primary key,organisation_id uuid);
      create table public.private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,listing_visibility text,listing_category text,listing_status text);
      alter table public.private_listings enable row level security;
      create policy listing_read on public.private_listings for select to authenticated using(public.bridge_is_active_member(organisation_id));
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant select on public.private_listings to authenticated;
      insert into public.organisations values('${org}'),('${otherOrg}');
      insert into auth.users values('${owner}'),('${manager}'),('${colleague}');
      insert into public.private_listings values('${listing}','${org}','${owner}','agency','residential','active'),('${otherListing}','${org}','${owner}','agency','residential','active');
    `)
    await db.exec(migration('20260901165146_marketing_event_foundation_phase1.sql'))
    await db.exec(migration('20261022132550_marketing_campaign_initiatives.sql'))
    await db.exec(migration('20261023124339_marketing_campaign_listing_builder.sql'))
    await db.exec(migration('20261023132334_marketing_property_campaign_builders.sql'))

    const as = async (user = owner) => {
      await db.exec('reset role')
      await db.query("select set_config('test.uid',$1,false)", [user])
      await db.exec('set role authenticated')
    }
    const resetEvent = async (patch = {}) => {
      await db.exec('reset role')
      const current = { organisation_id: org, event_type: 'show_day', status: 'planning', subject_type: 'listing', subject_id: listing, starts_at: '2099-11-01T12:00:00Z', ends_at: '2099-11-01T15:00:00Z', metadata: { visibility: 'public' }, ...patch }
      await db.query(`insert into public.marketing_events(id,organisation_id,event_type,status,title,subject_type,subject_id,starts_at,ends_at,metadata,created_by)
        values($1,$2,$3,$4,'A public show day',$5,$6,$7,$8,$9,$10)
        on conflict(id) do update set organisation_id=excluded.organisation_id,event_type=excluded.event_type,status=excluded.status,subject_type=excluded.subject_type,subject_id=excluded.subject_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,metadata=excluded.metadata`,
      [event, current.organisation_id, current.event_type, current.status, current.subject_type, current.subject_id, current.starts_at, current.ends_at, current.metadata, owner])
      await as()
    }
    const draft = (patch = {}) => ({
      version: 2, template: 'show-day', listingId: listing, agentId: owner,
      source: { title: 'A saved home', agencyName: 'Oak Agency', agentName: 'Agent', destination: 'agent@example.test', language: 'en-ZA' },
      settings: { eventId: event, date: '2099-11-01', startTime: '14:00', endTime: '17:00' }, additionalListings: [], ...patch,
    })
    const insert = async (builder = draft(), campaignOrg = org) => {
      const campaignId = id(serial++)
      return (await db.query(`insert into public.marketing_campaigns(id,organisation_id,name,goal,objective,listing_builder)
        values($1,$2,'Show day','promote_listing','Invite buyers to a confirmed public event',$3) returning id,revision`, [campaignId, campaignOrg, builder])).rows[0]
    }
    const update = (campaign) => db.query('update public.marketing_campaigns set revision=revision+1,name=name||$1 where id=$2 returning revision', [' updated', campaign.id])
    const functionSecurity = async () => {
      await db.exec('reset role')
      return (await db.query("select prosecdef,proconfig,proacl::text acl from pg_proc where oid='public.marketing_campaign_listing_scope()'::regprocedure")).rows[0]
    }
    const securityBefore = await functionSecurity()

    await t.test('reproduces the planning blocker while upcoming already works in the old trigger', async () => {
      await resetEvent()
      await assert.rejects(insert(), /public show day changed/)
      await resetEvent({ status: 'upcoming' })
      assert.equal((await insert()).revision, 1)
    })

    await db.exec('reset role')
    await db.exec(migration(correction))

    await t.test('replacement preserves invoker execution, empty search path and existing trigger privileges', async () => {
      assert.deepEqual(await functionSecurity(), securityBefore)
      assert.equal(securityBefore.prosecdef, false)
      const permissions = (await db.query("select has_function_privilege('anon','public.marketing_campaign_listing_scope()','execute') anonymous,has_function_privilege('authenticated','public.marketing_campaign_listing_scope()','execute') direct_authenticated")).rows[0]
      assert.deepEqual(permissions, { anonymous: false, direct_authenticated: false })
    })

    await t.test('planning and upcoming events save through the actual version-2 validator and trigger', async () => {
      for (const status of ['planning', 'upcoming']) {
        await resetEvent({ status })
        assert.equal((await insert()).revision, 1)
      }
    })

    await t.test('draft, completed and cancelled events remain blocked and open is not a schema status', async () => {
      for (const status of ['draft', 'completed', 'cancelled']) {
        await resetEvent({ status })
        await assert.rejects(insert(), /public show day changed/)
      }
      await db.exec('reset role')
      await assert.rejects(db.query("update public.marketing_events set status='open' where id=$1", [event]), /check constraint/)
    })

    await t.test('private visibility, wrong listing/type/agency and missing events cannot be saved', async () => {
      for (const patch of [{ metadata: { visibility: 'private' } }, { metadata: {} }, { subject_id: otherListing }, { subject_type: 'development' }, { event_type: 'launch' }, { organisation_id: otherOrg }]) {
        await resetEvent(patch)
        await assert.rejects(insert(), /public show day changed/)
      }
      await resetEvent()
      await assert.rejects(insert(draft({ settings: { ...draft().settings, eventId: id(99) } })), /public show day changed/)
    })

    await t.test('rescheduling or cancellation after draft creation blocks updates and preserves the saved revision', async () => {
      await resetEvent()
      const saved = await insert()
      for (const patch of [{ starts_at: '2099-11-01T12:30:00Z' }, { ends_at: '2099-11-01T15:30:00Z' }, { starts_at: '2099-11-02T12:00:00Z', ends_at: '2099-11-02T15:00:00Z' }, { status: 'cancelled' }]) {
        await resetEvent(patch)
        await assert.rejects(update(saved), /public show day changed/)
        assert.equal((await db.query('select revision from public.marketing_campaigns where id=$1', [saved.id])).rows[0].revision, 1)
      }
      await resetEvent()
      assert.equal((await update(saved)).rows[0].revision, 2)
    })

    await t.test('manual confirmed future times still work, while expired and malformed show days fail', async () => {
      await resetEvent()
      const settings = { ...draft().settings, eventId: '' }
      assert.equal((await insert(draft({ settings }))).revision, 1)
      await assert.rejects(insert(draft({ settings: { ...settings, date: '2000-01-01' } })), /future show day/)
      await assert.rejects(insert(draft({ settings: { ...settings, endTime: '13:00' } })), /Invalid listing draft/)
      await assert.rejects(insert(draft({ settings: { ...settings, eventId: 'not-a-uuid' } })), /Invalid listing draft/)
    })

    await t.test('listing ownership, listing state and tenant policies remain enforced', async () => {
      await resetEvent()
      await as(colleague)
      await assert.rejects(insert(), /listing or assigned agent changed/)
      await as(manager)
      assert.equal((await insert()).revision, 1)
      await as(owner)
      await assert.rejects(insert(draft(), otherOrg), /listing or assigned agent changed|row-level security/)
      for (const patch of ["listing_status='withdrawn'", "listing_category='rental'", `assigned_agent_id='${colleague}'`, "listing_visibility='deleted'"]) {
        await db.exec('reset role')
        await db.query(`update public.private_listings set listing_status='active',listing_category='residential',assigned_agent_id=$1,listing_visibility='agency' where id=$2`, [owner, listing])
        await db.query(`update public.private_listings set ${patch} where id=$1`, [listing])
        await as(owner)
        await assert.rejects(insert(), /listing or assigned agent changed/)
      }
      await db.exec('reset role')
      await db.query("update public.private_listings set listing_status='active',listing_category='residential',assigned_agent_id=$1,listing_visibility='agency' where id=$2", [owner, listing])
    })

    await t.test('saved version-1 listing drafts and non-listing campaigns retain their previous behavior', async () => {
      await as()
      const v2 = draft()
      const v1 = { version: 1, template: 'new-listing', listingId: listing, agentId: owner, source: v2.source }
      assert.equal((await insert(v1)).revision, 1)
      assert.equal((await insert(null)).revision, 1)
    })
  } finally { await db.close() }
})
