import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { isHomeSeekersPublicTraffic, homeSeekersVisitIsNew, homeSeekersBrowserIsPublic, homeSeekersPreviewUrl } from '../../src/pages/homeSeekersPublicTraffic.js'
import { websiteAnalyticsRpc } from '../../src/services/websiteAnalyticsScope.js'

const site = 'c2fcb2e4-23c1-4302-b490-7332f5075669'
const org = '2958d402-368e-43c9-b728-0098e10505f1'
const listing = 'ffec99be-27f8-4bba-ae3f-76b37b4bd9c1'

test('public tracking excludes previews, embedded pages and automation without changing other tenants', () => {
  assert.equal(isHomeSeekersPublicTraffic({ hostname: 'homeseeker.co.za', pathname: '/' }), true)
  assert.equal(isHomeSeekersPublicTraffic({ hostname: 'www.homeseeker.co.za', pathname: '/buying' }), true)
  for (const options of [
    { hostname: 'app.arch9.co.za' }, { hostname: 'home-seekers-website-alpha.vercel.app' },
    { pathname: '/demo/homeseekers' }, { embedded: true }, { automated: true }, { search: '?arch9_preview=1' },
  ]) assert.equal(isHomeSeekersPublicTraffic({ hostname: 'homeseeker.co.za', pathname: '/', ...options }), false)
  assert.equal(websiteAnalyticsRpc(site), 'home_seekers_public_dashboard_analytics')
  assert.equal(websiteAnalyticsRpc('another-site'), 'website_dashboard_analytics')
  assert.equal(homeSeekersPreviewUrl('https://homeseeker.co.za/?campaign=test#home'), 'https://homeseeker.co.za/?campaign=test&arch9_preview=1#home')
  assert.equal(homeSeekersPreviewUrl('https://another-agency.example/'), 'https://another-agency.example/')
})

test('visits expire after inactivity rather than counting every page as another visit', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key), setItem: (key,value) => data.set(key,value) }
  assert.equal(homeSeekersVisitIsNew(storage, 1000), true)
  assert.equal(homeSeekersVisitIsNew(storage, 2000), false)
  assert.equal(homeSeekersVisitIsNew(storage, 1802000), true)
})

test('a Marketing preview remains excluded after following links in that tab', () => {
  const values = new Map()
  const browser = { location: { hostname: 'homeseeker.co.za', pathname: '/', search: '?arch9_preview=1' },
    sessionStorage: { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value) } }
  browser.self = browser.top = browser
  assert.equal(homeSeekersBrowserIsPublic(browser, {}),false)
  browser.location = { hostname: 'homeseeker.co.za', pathname: '/buying', search: '' }
  assert.equal(homeSeekersBrowserIsPublic(browser, {}),false)
})

test('public-only database report excludes legacy traffic and enforces host, membership and listing scope', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create function bridge_has_organisation_membership(uuid) returns boolean language sql as $$select coalesce(current_setting('test.member',true),'')='yes'$$;
      create table website_sites(id uuid primary key,organisation_id uuid,status text);
      create table website_domains(website_site_id uuid,hostname text,status text,is_primary boolean);
      create table website_listing_publications(website_site_id uuid,listing_id uuid,status text);
      create table listing_publication_data(listing_id uuid,title text);
      create table website_analytics_daily(website_site_id uuid,event_date date,event_type text,page_path text,dimension_key text,listing_id uuid,event_count integer,created_at timestamptz default now(),primary key(website_site_id,event_date,event_type,page_path,dimension_key));
      alter table website_analytics_daily enable row level security;
      grant select,insert,update on website_analytics_daily to service_role;
      grant select on website_sites,website_domains,website_listing_publications to service_role;
      create table website_lead_submissions(id uuid default gen_random_uuid(),website_site_id uuid,created_at timestamptz default now(),attribution_json jsonb,status text,lead_id uuid,submission_type text);
      insert into website_sites values('${site}','${org}','published');
      insert into website_domains values('${site}','homeseeker.co.za','active',true),('${site}','www.homeseeker.co.za','active',false);
      insert into website_listing_publications values('${site}','${listing}','published');
      insert into listing_publication_data values('${listing}','Published home');
      insert into website_analytics_daily values('${site}',current_date,'page_view','/demo/homeseekers','path:/demo/homeseekers',null,900,now()),('${site}',current_date,'page_view','/','path:/',null,100,now());
      insert into website_lead_submissions(website_site_id,attribution_json,status,lead_id,submission_type) values
        ('${site}','{}','routed','${listing}','general_enquiry'),
        ('${site}','{"publicHostname":"homeseeker.co.za","publicTrackingVersion":1}','routed','${listing}','valuation_request');`)
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261012124805_homeseekers_public_traffic_analytics.sql', import.meta.url),'utf8'))
    await db.exec(`set role service_role`)
    const record = (host,type,path,id=null) => db.query('select home_seekers_record_public_analytics_event($1,$2,$3,$4)',[host,type,path,id])
    await record('homeseeker.co.za','site_visit','/')
    await record('homeseeker.co.za','page_view','/')
    await record('www.homeseeker.co.za','page_view','/buying')
    await record('homeseeker.co.za','listing_view',`/properties/${listing}`,listing)
    await assert.rejects(record('home-seekers-website-alpha.vercel.app','page_view','/'), /Invalid public/)
    await assert.rejects(record('homeseeker.co.za','page_view','/demo/homeseekers'), /Invalid public/)
    await assert.rejects(record('homeseeker.co.za','listing_view',`/properties/${org}`,org), /not found/)
    await db.exec(`reset role; set test.actor='${listing}'; set test.member='yes'; set role authenticated`)
    const report = (await db.query('select home_seekers_public_dashboard_analytics($1,30) as report',[site])).rows[0].report
    assert.equal(report.visits,1); assert.equal(report.pageViews,2); assert.equal(report.listingViews,1)
    assert.equal(report.submissions,1); assert.equal(report.leadsCreated,1); assert.equal(report.valuationRequests,1)
    assert.equal(report.timeZone,'Africa/Johannesburg'); assert.equal(report.historicalTrafficExcluded,true)
    assert.equal(report.dailyTraffic.length,30)
    assert.equal(report.dailyTraffic.reduce((total,day) => total+Number(day.visits),0),1)
    assert.equal(report.topListings[0].label,'Published home')
    assert.ok(report.topPages.every(p => !p.label.includes('/demo/')))
    await assert.rejects(db.query('select home_seekers_record_public_analytics_event($1,$2,$3)', ['homeseeker.co.za','page_view','/']), /permission denied/)
    await db.exec(`set test.member='no'`)
    await assert.rejects(db.query('select home_seekers_public_dashboard_analytics($1,30)',[site]), /Not authorised/)
    await db.exec(`reset role`)
    assert.equal((await db.query("select event_count from website_analytics_daily where dimension_key='path:/'")).rows[0].event_count,100)
  } finally { await db.close() }
})
