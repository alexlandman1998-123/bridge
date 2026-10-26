import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), actor = id(2), email = id(3), marketing = id(4), lead = id(5), other = id(6), fingerprint = 'a'.repeat(64)
const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
test('CRM, email and business AI use one exactly-scoped ledger, cap and replay boundary in isolated Postgres', async () => {
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
      create table public.leads(lead_id uuid primary key,organisation_id uuid,lead_domain text,status text);
      insert into public.organisations values('${org}'),('${other}'); insert into auth.users values('${actor}');
      insert into public.email_campaigns values('${email}','${org}','draft'); insert into public.marketing_campaigns(id,organisation_id,status,goal,planned_channels,channel_content) values('${marketing}','${org}','draft','custom',array['email'],'{}');
      insert into public.leads values('${lead}','${org}','agency','Active');
    `)
    await db.exec(migration('20261025190213_ai_campaign_assistant.sql').split('-- Invoker joins')[0] + '\ncommit;')
    await db.exec(migration('20261023140030_marketing_general_campaign_builders.sql'))
    await db.exec(migration('20261023144949_marketing_relationship_campaign_builders.sql'))
    await db.exec(migration('20261025204945_business_campaign_ai.sql'))
    await db.exec(migration('20261025210653_crm_lead_follow_up_ai.sql'))
    await db.exec(`update ai_campaign_models set enabled=true; insert into ai_campaign_budgets values('${org}',0.008,'claude-haiku-5-5','Campaign-only public tone');`)
    const reserve = (kind, request, agency = org, person = actor) => db.query(`select public.${kind === 'email' ? 'ai_campaign_reserve' : kind === 'business' ? 'ai_business_campaign_reserve' : 'ai_crm_follow_up_reserve'}($1,$2,$3,$4,$5) r`, [request, agency, person, kind === 'email' ? email : kind === 'business' ? marketing : lead, fingerprint])
    await db.exec('set role authenticated')
    await assert.rejects(reserve('crm', id(10)), /permission denied/)
    await db.exec('reset role; set role service_role')
    const first = (await reserve('email', id(10))).rows[0].r
    assert.equal(first.writing_preferences, 'Campaign-only public tone')
    await assert.rejects(reserve('crm', id(11)), /spending limit/)
    await db.query('select public.ai_campaign_settle($1,100,20,0.0001,true,$2)', [id(10), { copy: 'safe' }])
    const crm = (await reserve('crm', id(11))).rows[0].r
    assert.equal(crm.crm_lead_id, lead); assert.equal(crm.feature, 'crm_follow_up'); assert.equal(crm.campaign_id, null); assert.equal(crm.marketing_campaign_id, null)
    assert.equal(Object.hasOwn(crm, 'writing_preferences'), false)
    assert.equal((await reserve('crm', id(11))).rows[0].r.claimed, false)
    await assert.rejects(reserve('email', id(11)), /conflict/)
    await assert.rejects(reserve('business', id(11)), /conflict/)
    await assert.rejects(reserve('crm', id(11), org, other), /conflict/)
    await assert.rejects(reserve('crm', id(12), other), /Active agency CRM lead/)
    await assert.rejects(db.query('update public.ai_campaign_usage set campaign_id=$1 where id=$2', [email, id(11)]), /ai_campaign_usage_one_source/)
    await assert.rejects(db.query("update public.ai_campaign_usage set feature='email_campaign' where id=$1", [id(11)]), /ai_campaign_usage_source_feature/)
    await db.exec('reset role')
    await db.query("update leads set status='Archived' where lead_id=$1", [lead])
    await assert.rejects(reserve('crm', id(13)), /Active agency CRM lead/)
    await db.query("update leads set status='Active',lead_domain='attorney' where lead_id=$1", [lead])
    await assert.rejects(reserve('crm', id(13)), /Active agency CRM lead/)
    await db.query('update ai_campaign_budgets set monthly_limit_usd=1 where organisation_id=$1', [org])
    assert.equal((await reserve('business', id(14))).rows[0].r.writing_preferences, 'Campaign-only public tone')
  } finally { await db.close() }
})
