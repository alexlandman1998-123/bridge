import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createHomeSeekersRecruitmentResponse } from '../services/homeSeekersRecruitmentApi.js'
import { recruitmentExample, submitRecruitmentApplication, trackRecruitmentConversion } from '../../src/pages/homeSeekersRecruitment.js'
const siteId = 'c2fcb2e4-23c1-4302-b490-7332f5075669'
const orgId = '2958d402-368e-43c9-b728-0098e10505f1'
const userId = '11111111-1111-4111-8111-111111111111'
const body = { name: 'Preview Agent', email: 'preview@example.test', phone: '0820000000', area: 'Pretoria', sales: 4, message: 'Predictable fees.', privacyAccepted: true, idempotencyKey: 'valid-key-1234567890', pageUrl: 'https://app.arch9.co.za/demo/homeseekers/join' }
const headers = { host: 'app.arch9.co.za', 'x-forwarded-for': '198.51.100.1' }
const env = { WEBSITES_LEAD_FINGERPRINT_SECRET: 'a'.repeat(64) }
test('invalid applications fail before database access', async () => {
  for (const change of [{ sales: -1 }, { sales: 2.5 }, { sales: '4' }, { privacyAccepted: false }, { phone: 'abc' }, { area: '' }, { email: 'bad' }, { pageUrl: 'https://other.example/demo/homeseekers/join' }]) assert.equal((await createHomeSeekersRecruitmentResponse({ headers, env, body: { ...body, ...change }, getConnection: () => assert.fail('Unexpected database access') })).status, 400)
})
test('local SQL captures separately, deduplicates, counts conversions and enforces recipient access and rate limits', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create table public.organisations(id uuid primary key); create table public.profiles(id uuid primary key);
      create table public.website_sites(id uuid primary key, organisation_id uuid, status text);
      create table public.website_domains(website_site_id uuid, hostname text, status text, is_primary boolean, created_at timestamptz default now());
      create table public.organisation_users(organisation_id uuid,user_id uuid,status text,role text,is_primary_owner boolean,updated_at timestamptz default now());
      create table public.website_listing_publications(website_site_id uuid,listing_id uuid,status text);
      create table public.transaction_notifications(id uuid default gen_random_uuid(),transaction_id uuid,user_id uuid,role_type text,notification_type text,title text,message text,is_read boolean,dedupe_key text,event_type text,event_data jsonb);
      alter table public.transaction_notifications enable row level security;
      create table public.website_analytics_daily(website_site_id uuid,event_date date,event_type text constraint website_analytics_daily_event_type_check check(event_type in ('site_visit','page_view','listing_view')),page_path text,dimension_key text,listing_id uuid,event_count integer,primary key(website_site_id,event_date,event_type,page_path,dimension_key));
      grant usage on schema public, auth to authenticated, service_role; grant select on public.organisation_users to authenticated;
      grant select, update on public.transaction_notifications to authenticated; grant all on all tables in schema public to service_role;
      insert into public.organisations values ('${orgId}'); insert into public.profiles values ('${userId}');
      insert into public.website_sites values ('${siteId}','${orgId}','published');
      insert into public.website_domains(website_site_id,hostname,status,is_primary) values ('${siteId}','home-seekers-website-alpha.vercel.app','active',true);
      insert into public.organisation_users(organisation_id,user_id,status,role,is_primary_owner) values ('${orgId}','${userId}','active','principal',true);
    `)
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261003132222_home_seekers_recruitment_intake.sql', import.meta.url), 'utf8'))
    await db.exec('set role service_role')
    const connection = async () => ({ site: { id: siteId }, hostname: 'home-seekers-website-alpha.vercel.app', client: { rpc: async (name, p) => {
      assert.equal(name, 'home_seekers_capture_application')
      const result = await db.query('select public.home_seekers_capture_application($1,$2,$3,$4,$5) as result', [p.p_site_id,p.p_hostname,JSON.stringify(p.p_payload),p.p_idempotency_key,p.p_fingerprint])
      return { data: result.rows[0].result }
    } } })
    const capture = (changes = {}, requestHeaders = headers) => createHomeSeekersRecruitmentResponse({ headers: requestHeaders, env, body: { ...body, ...changes }, getConnection: connection })
    assert.equal((await capture()).status, 201); assert.equal((await capture()).body.duplicate, true)
    const cleanRetry = await capture({ pageUrl: 'https://homeseeker.co.za/join' }, { ...headers, host: 'homeseeker.co.za' })
    assert.equal(cleanRetry.status, 202)
    assert.equal(cleanRetry.body.duplicate, true)
    assert.deepEqual((await db.query('select (select count(*) from public.home_seekers_applications)::int as applications, (select count(*) from public.transaction_notifications)::int as alerts, (select sum(event_count) from public.website_analytics_daily)::int as conversions')).rows[0], { applications: 1, alerts: 1, conversions: 1 })
    const payload = (await db.query('select payload_json from public.home_seekers_applications')).rows[0].payload_json
    assert.equal(payload.area, 'Pretoria'); assert.equal(payload.sales, 4)
    const args = [siteId,'other.example',JSON.stringify(payload),'another-key-1234567890','b'.repeat(64)]
    await assert.rejects(db.query('select public.home_seekers_capture_application($1,$2,$3,$4,$5)', args), /Home Seekers site/)
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${userId}',false)`)
    assert.equal((await db.query('select * from public.home_seekers_applications')).rows.length, 1)
    assert.equal((await db.query('select * from public.transaction_notifications')).rows.length, 1)
    args[1] = 'home-seekers-website-alpha.vercel.app'
    await assert.rejects(db.query('select public.home_seekers_capture_application($1,$2,$3,$4,$5)', args), /permission denied/)
    await db.exec("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)")
    assert.equal((await db.query('select * from public.home_seekers_applications')).rows.length, 0)
    assert.equal((await db.query('select * from public.transaction_notifications')).rows.length, 0)
    await db.exec('reset role; set role service_role')
    for (let n=1;n<=4;n++) assert.equal((await capture({ idempotencyKey: `new-application-key-${n}` })).status, 201)
    assert.equal((await capture({ idempotencyKey: 'rate-limit-key-1234567890' })).status, 429)
    await db.exec('reset role; delete from public.organisation_users; set role service_role')
    assert.equal((await capture({ idempotencyKey: 'no-recipient-key-123456' }, { ...headers, 'x-forwarded-for': '198.51.100.2' })).status, 503)
    assert.equal((await db.query('select count(*)::int as count from public.home_seekers_applications')).rows[0].count, 5)
    await db.query("select public.website_record_analytics_event($1,'guarantee_opened','/demo/homeseekers/join',null)", ['home-seekers-website-alpha.vercel.app'])
    await assert.rejects(db.query("select public.website_record_analytics_event($1,'application_submitted','/demo/homeseekers/join',null)", ['home-seekers-website-alpha.vercel.app']), /Invalid website analytics event/)
  } finally { await db.close() }
})
test('client requires acceptance and skips duplicate/unconsented conversions', async () => {
  await assert.rejects(submitRecruitmentApplication(body, { pageUrl: body.pageUrl, fetcher: async () => ({ ok: true, json: async () => ({}) }) }))
  const events = []; const previous = globalThis.window; globalThis.window = { gtag: (...args) => events.push(args), fbq: (...args) => events.push(args) }
  try {
    trackRecruitmentConversion('application_submitted'); trackRecruitmentConversion('application_submitted', { measurementAllowed: true, duplicate: true }); assert.equal(events.length, 0)
    trackRecruitmentConversion('application_submitted', { measurementAllowed: true }); assert.equal(events.length, 0)
    trackRecruitmentConversion('application_submitted', { measurementAllowed: true, gaId: 'G-TEST123', pixelId: '123456' }); assert.equal(events.length, 2); assert.ok(!JSON.stringify(events).includes(body.email))
  } finally { globalThis.window = previous }
})
test('maths includes fees in savings and break-even', () => {
  // Ten R1.5m sales at 5%: the published agent overview's annual example.
  const p = recruitmentExample()
  assert.equal(p.commission, 750000); assert.equal(p.cost, 123000); assert.equal(p.youKeep, 627000)
  assert.equal(p.traditionalCost, 225000); assert.equal(p.balloonCost, 192000); assert.equal(p.capCost, 191400)
  assert.equal(p.traditionalCost-p.cost, 102000); assert.equal((p.traditionalCost-p.cost)*5, 510000)
  assert.equal(p.balloonCost-p.cost, 69000); assert.equal(p.breakEvenSales.toFixed(1), '5.1')
  // The balloon is worked on 6%, and the royalty continues after the cap.
  assert.equal(recruitmentExample(1).capCost, 36150)
  assert.equal(recruitmentExample(20).capCost, 221400)
  assert.equal(recruitmentExample(0).cost, 108000)
  assert.equal(recruitmentExample(0).effectivePercent, null)
  assert.deepEqual([5,8,10,15,20].map(n=>Math.round(recruitmentExample(n).effectivePercent)), [31,20,16,12,9])
})

test('all three options include the same registered-sale fee and upfront saves R8000', () => {
  const deals = recruitmentExample(10, 'deals')
  const monthly = recruitmentExample(10, 'monthly')
  const upfront = recruitmentExample(10, 'upfront')
  assert.equal(deals.cost, 135000); assert.equal(deals.youKeep, 615000)
  assert.equal(monthly.cost, 123000); assert.equal(upfront.cost, 115000)
  assert.equal(monthly.cost-upfront.cost, 8000)
  assert.throws(() => recruitmentExample(10, 'unknown'), /Unknown recruitment payment option/)
})

test('a stalled connection times out and does not report acceptance', async () => {
  await assert.rejects(submitRecruitmentApplication(body, {
    pageUrl: body.pageUrl, timeoutMs: 5,
    fetcher: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })),
  }), /connection took too long/)
})
