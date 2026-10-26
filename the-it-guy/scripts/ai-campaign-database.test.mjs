import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), other = id(2), agent = id(3), manager = id(4), outsider = id(5), campaign = id(6), listing = id(7), contact = id(8), emailContact = id(9), lead = id(10)
test('AI accounting, matching and review execute in isolated Postgres with RLS', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon,service_role;
      create table organisations(id uuid primary key);
      insert into organisations values('${org}'),('${other}');
      insert into auth.users values('${agent}'),('${manager}'),('${outsider}');
      create function bridge_has_organisation_membership(p_organisation_id uuid) returns boolean language sql stable as $$select p_organisation_id='${org}' and auth.uid() in ('${agent}','${manager}')$$;
      create function email_campaign_can_send(p_organisation_id uuid) returns boolean language sql stable as $$select p_organisation_id='${org}' and auth.uid()='${manager}'$$;
      create table email_campaigns(id uuid primary key,organisation_id uuid,sender_identity_id uuid,subscription_type_id uuid,status text,subject text,content_json jsonb,audience_filter jsonb);
      create table email_sender_identities(id uuid primary key,organisation_id uuid,from_email text);
      create table delivery_claims(campaign_id uuid primary key);
      create table preview_count(n integer); insert into preview_count values(1);
      create function email_campaign_preview_audience(p_organisation_id uuid,p_subscription_type_id uuid,p_filter jsonb) returns integer language sql as $$select n from public.preview_count$$;
      create function email_campaign_resolve_audience_rules(p_organisation_id uuid,p_filter jsonb) returns jsonb language sql as $$select p_filter$$;
      create function email_campaign_quote_usage(p_campaign_id uuid,p_recipient_count integer) returns jsonb language sql as $$select jsonb_build_object('currency','ZAR','estimated_charge',0,'recipient_count',p_recipient_count)$$;
      create function email_campaign_prepare_dispatch(p_campaign_id uuid,p_send_at timestamptz) returns jsonb language plpgsql as $$begin
        insert into public.delivery_claims values(p_campaign_id); update public.email_campaigns set status='scheduled' where id=p_campaign_id; return '{}'::jsonb; end$$;
      create table private_listings(id uuid primary key,organisation_id uuid,is_active boolean,listing_status text,asking_price numeric,bedrooms numeric,bathrooms numeric,property_type text,property_category text,suburb text,city text,province text);
      create table lead_requirements(organisation_id uuid,lead_id uuid,status text,intent_type text,consent_to_receive_matches boolean,budget_min numeric,budget_max numeric,bedrooms_min numeric,bathrooms_min numeric,property_types text[],property_category text,suburbs text[],areas text[],city text,province text,garages_min numeric,parking_min numeric,erf_size_min numeric,floor_size_min numeric,must_haves text[],deal_breakers text[]);
      create table leads(lead_id uuid primary key,organisation_id uuid,contact_id uuid,assigned_user_id uuid);
      create table contacts(contact_id uuid primary key,organisation_id uuid,email text);
      create table email_marketing_contacts(id uuid primary key,organisation_id uuid,email text);
      insert into email_campaigns values('${campaign}','${org}','${id(11)}','${id(12)}','draft','Original','{"ai_campaign":{}}','{}');
      insert into email_sender_identities values('${id(11)}','${org}','sender@example.test');
      insert into private_listings values('${listing}','${org}',true,'active',2000000,3,2,'house','residential','Sea Point','Cape Town','Western Cape');
      insert into contacts values('${contact}','${org}','buyer@example.test');
      insert into email_marketing_contacts values('${emailContact}','${org}','buyer@example.test');
      insert into leads values('${lead}','${org}','${contact}','${agent}');
      insert into lead_requirements(organisation_id,lead_id,status,intent_type,consent_to_receive_matches,budget_max,bedrooms_min,suburbs) values('${org}','${lead}','active','buy',true,2500000,3,array['Sea Point']);
      grant select,update on email_campaigns to authenticated;
      grant select on email_sender_identities,preview_count,private_listings,lead_requirements,leads,contacts,email_marketing_contacts to authenticated;
      grant select,insert on delivery_claims to authenticated;
      alter table email_campaigns enable row level security;
      create policy campaign_scope on email_campaigns to authenticated using(bridge_has_organisation_membership(organisation_id)) with check(bridge_has_organisation_membership(organisation_id));
      alter table private_listings enable row level security;
      create policy listing_scope on private_listings to authenticated using(bridge_has_organisation_membership(organisation_id));
      alter table leads enable row level security;
      create policy lead_scope on leads to authenticated using(bridge_has_organisation_membership(organisation_id) and (assigned_user_id=auth.uid() or email_campaign_can_send(organisation_id)));
    `)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261025190213_ai_campaign_assistant.sql', import.meta.url), 'utf8'))
    await db.exec(`update ai_campaign_models set enabled=true; insert into ai_campaign_budgets values('${org}',0.008,'claude-haiku-5-5','Warm and concise');`)
    const login = async (actor, role = 'authenticated') => { await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)", [actor]); await db.exec(`set role ${role}`) }
    const reserve = (request) => db.query('select ai_campaign_reserve($1,$2,$3,$4,$5) r', [request, org, agent, campaign, 'fingerprint'])
    await t.test('reserves atomically, rejects overspend/replay changes, and settles actual tokens', async () => {
      await login(agent)
      await assert.rejects(reserve(id(20)), /permission denied/)
      await login(agent, 'service_role')
      const results = await Promise.allSettled([reserve(id(20)), reserve(id(21))])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
      const first = results.find((r) => r.status === 'fulfilled').value.rows[0].r
      assert.equal(first.claimed, true)
      assert.equal((await reserve(first.id)).rows[0].r.claimed, false)
      await assert.rejects(db.query('select ai_campaign_reserve($1,$2,$3,$4,$5)', [first.id, org, outsider, campaign, 'fingerprint']), /conflict/)
      await db.query('select ai_campaign_settle($1,100,50,0.0001,true,$2)', [first.id, { copy: 'safe' }])
      assert.equal((await reserve(first.id)).rows[0].r.status, 'succeeded')
      const second = (await reserve(id(22))).rows[0].r
      await db.query('select ai_campaign_settle($1,0,0,null,false,null)', [second.id])
      const usage = await db.query('select cost_usd=reserved_usd retained from ai_campaign_usage where id=$1', [second.id]); assert.equal(usage.rows[0].retained, true)
    })
    await t.test('usage is limited to the authenticated agency and permitted user', async () => {
      await login(agent); assert.equal((await db.query('select * from ai_campaign_usage')).rows.length, 2)
      await assert.rejects(db.exec(`update ai_campaign_usage set cost_usd=0`), /permission denied/)
      await login(outsider); assert.equal((await db.query('select * from ai_campaign_usage')).rows.length, 0)
      await login(agent, 'anon'); assert.equal((await db.query("select has_table_privilege('anon','ai_campaign_usage','select') ok")).rows[0].ok, false)
    })
    await t.test('buyer matching applies requirements and record permissions', async () => {
      await login(agent)
      const match = async () => (await db.query('select ai_campaign_match_buyers($1) r', [listing])).rows[0].r.contact_ids
      assert.deepEqual(await match(), [emailContact])
      await login(outsider); assert.deepEqual(await match(), [])
      await db.exec('reset role'); await db.exec(`update lead_requirements set budget_max=1000000`)
      await login(agent); assert.deepEqual(await match(), [])
      await db.exec('reset role'); await db.exec(`update lead_requirements set budget_max=2500000,must_haves=array['pool']`)
      await login(agent); assert.deepEqual(await match(), [])
      await db.exec('reset role'); await db.exec(`update lead_requirements set must_haves=null; update leads set assigned_user_id='${outsider}'`)
      await login(agent); assert.deepEqual(await match(), [])
      await login(manager); assert.deepEqual(await match(), [emailContact])
    })
    await t.test('review requires send authority, binds content/sender/count/time, prevents duplicate sends', async () => {
      const sendAt = new Date(Date.now() + 3600000).toISOString()
      const review = async () => (await db.query('select ai_campaign_review($1,$2) r', [campaign, sendAt])).rows[0].r
      await login(agent); await assert.rejects(review(), /principal or administrator/)
      await login(manager)
      const first = await review()
      await db.query("update email_campaigns set subject='Changed' where id=$1", [campaign])
      await assert.rejects(db.query('select ai_campaign_approve_send($1,$2,$3)', [campaign, sendAt, first.token]), /changed/)
      const second = await review()
      await db.exec('reset role'); await db.exec("update preview_count set n=0"); await login(manager)
      await assert.rejects(db.query('select ai_campaign_approve_send($1,$2,$3)', [campaign, sendAt, second.token]), /changed/)
      await db.exec('reset role'); await db.exec('update preview_count set n=1'); await login(manager)
      const third = await review()
      await assert.rejects(db.query('select ai_campaign_approve_send($1,$2,$3)', [campaign, new Date(Date.now() + 7200000).toISOString(), third.token]), /changed/)
      await assert.rejects(db.query('select email_campaign_prepare_dispatch($1,$2)', [campaign, sendAt]), /Review this AI campaign/)
      assert.equal((await db.query('select count(*)::int n from delivery_claims')).rows[0].n, 0)
      await db.query('select ai_campaign_approve_send($1,$2,$3)', [campaign, sendAt, third.token])
      await assert.rejects(db.query('select ai_campaign_approve_send($1,$2,$3)', [campaign, sendAt, third.token]), /principal or administrator/)
      assert.equal((await db.query('select count(*)::int n from delivery_claims')).rows[0].n, 1)
    })
  } finally { await db.close() }
})
