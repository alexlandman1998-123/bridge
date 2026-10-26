import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), actor = id(2), email = id(3), marketing = id(4), other = id(5), fingerprint = 'a'.repeat(64)
const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
test('business and email AI share one protected cap, ledger and replay boundary in isolated Postgres', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key); create table public.organisations(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function public.bridge_has_organisation_membership(p uuid) returns boolean language sql stable as $$select p='${org}' and auth.uid()='${actor}'$$;
      create function public.bridge_is_active_member(p uuid) returns boolean language sql stable as $$select public.bridge_has_organisation_membership(p)$$;
      create function public.email_campaign_can_send(p uuid) returns boolean language sql stable as $$select false$$;
      create table public.email_campaigns(id uuid primary key,organisation_id uuid,status text);
      create table public.marketing_campaigns(id uuid primary key,organisation_id uuid,listing_builder jsonb,status text,goal text,planned_channels text[],channel_content jsonb);
      create table public.transactions(id uuid primary key,organisation_id uuid);
      insert into public.organisations values('${org}'),('${other}'); insert into auth.users values('${actor}');
      insert into public.email_campaigns values('${email}','${org}','draft'); insert into public.marketing_campaigns(id,organisation_id,status,goal,planned_channels,channel_content) values('${marketing}','${org}','draft','custom',array['email'],'{}');
      grant usage on schema auth to authenticated,service_role; grant select on public.marketing_campaigns,public.email_campaigns to service_role;
    `)
    const originalLedger = migration('20261025190213_ai_campaign_assistant.sql').split('-- Invoker joins')[0]
    await db.exec(originalLedger + '\ncommit;')
    await db.exec(migration('20261023140030_marketing_general_campaign_builders.sql'))
    await db.exec(migration('20261023144949_marketing_relationship_campaign_builders.sql'))
    await db.exec(migration('20261025204945_business_campaign_ai.sql'))
    await db.exec(`update ai_campaign_models set enabled=true; insert into ai_campaign_budgets values('${org}',0.008,'claude-haiku-5-5','Warm');`)
    const reserve = (kind, request, source = kind === 'email' ? email : marketing, agency = org) => db.query(`select public.${kind === 'email' ? 'ai_campaign_reserve' : 'ai_business_campaign_reserve'}($1,$2,$3,$4,$5) r`, [request, agency, actor, source, fingerprint])
    await db.exec('set role authenticated')
    await assert.rejects(reserve('business', id(10)), /permission denied/)
    await db.exec('reset role; set role service_role')
    const first = (await reserve('email', id(10))).rows[0].r
    assert.equal(first.claimed, true)
    await assert.rejects(reserve('business', id(11)), /spending limit/)
    await db.query('select public.ai_campaign_settle($1,100,20,0.0001,true,$2)', [id(10), { copy: 'safe' }])
    const business = (await reserve('business', id(11))).rows[0].r
    assert.equal(business.campaign_id, null); assert.equal(business.marketing_campaign_id, marketing); assert.equal(business.feature, 'business_campaign')
    assert.equal((await reserve('business', id(11))).rows[0].r.claimed, false)
    await assert.rejects(reserve('email', id(11)), /conflict/)
    await assert.rejects(reserve('business', id(12), marketing, other), /Editable business campaign/)
    await assert.rejects(db.query('update public.ai_campaign_usage set campaign_id=$1 where id=$2', [email, id(11)]), /ai_campaign_usage_one_source/)
    await db.exec('reset role')
    await db.exec("insert into ai_campaign_models values('fixture-openai-model','openai',1,5,false)")
    assert.equal((await db.query("select enabled from ai_campaign_models where model='fixture-openai-model'")).rows[0].enabled, false)
    await assert.rejects(db.exec("insert into ai_campaign_models values('unsupported','unlisted',1,5,false)"), /provider_check/)
    const builder = { version: 1, template: 'client-check-in', agentId: actor, source: { agencyName: 'Oak', agentName: 'Agent', agentTitle: '', agentBio: '', destination: 'agent@example.com', serviceAreas: 'Brooklyn', language: 'en-ZA', setupLanguage: 'en-ZA', tone: '', primaryColor: '', logoUrl: '', photoUrl: '' }, details: { area: 'Brooklyn' }, reviewed: true, permission: false }
    assert.equal((await db.query('select public.marketing_general_builder_valid($1) ok', [builder])).rows[0].ok, true)
    assert.equal((await db.query('select public.marketing_general_builder_valid($1) ok', [{ ...builder, details: { area: 'Brooklyn', privateClientId: 'forbidden' } }])).rows[0].ok, false)
  } finally { await db.close() }
})
