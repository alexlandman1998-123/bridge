import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createListingStatisticsDatabase, statisticsFixtureIds } from './fixtures/listingStatisticsDatabase.js'

const { org, otherOrg, listing, otherListing, user, branch, config, site } = statisticsFixtureIds
let db
beforeAll(async () => { db = await createListingStatisticsDatabase() }, 20_000)
beforeEach(async () => {
  await db.exec('reset role; truncate private_property_listing_statistics_daily,private_property_statistics_sync_runs,private_property_statistics_access,property24_listing_statistics_daily,property24_statistics_sync_runs,website_analytics_daily,website_lead_submissions;')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
})
afterAll(async () => db?.close())

async function overview(days = 7, listingId = listing, orgId = org) {
  return (await db.query('select listing_overview_performance($1,$2,$3) as data', [orgId, listingId, days])).rows[0].data
}
async function seedP24(days, values = '0,null,0') {
  await db.exec(`insert into property24_listing_statistics_daily(organisation_id,private_listing_id,environment,statistic_date,view_count,alert_count,total_contact_leads)
    select '${org}','${listing}','production',(now() at time zone 'Africa/Johannesburg')::date-n,${values} from generate_series(1,${days}) n`)
}
it('counts complete zeros independently from missing fields and uses completed-day windows', async () => {
  await seedP24(7)
  const result = await overview()
  expect(result.property24).toMatchObject({ views: 0, complete: true, metrics: { views: { complete: true, coveredDays: 7 }, alerts: { value: null, available: false, complete: false } } })
  expect(result.period).toMatchObject({ days: 7, completedDaysOnly: true, timeZone: 'Africa/Johannesburg' })
  await db.exec(`insert into property24_listing_statistics_daily(organisation_id,private_listing_id,environment,statistic_date,view_count) values('${org}','${listing}','production',(now() at time zone 'Africa/Johannesburg')::date,999)`)
  expect((await overview()).property24.views).toBe(0)
})
it('labels sparse portal rows as partial rather than claiming a full reporting period', async () => {
  await seedP24(1, '12,2,null')
  const result = await overview(30)
  expect(result.property24).toMatchObject({ views: 12, state: 'partial', complete: false, coverage: { coveredDays: 1, expectedDays: 30 }, portalContacts: null, previousViews: null })
})
it('includes Private Property safely and retains counts when a refresh fails', async () => {
  await db.exec(`insert into private_property_listing_statistics_daily(organisation_id,private_listing_id,environment,branch_guid,private_property_ref,listing_type,statistic_date,view_count,message_count,tel_leads)
    values('${org}','${listing}','production','${branch}','T1','Sale',(now() at time zone 'Africa/Johannesburg')::date-1,0,3,null);
    insert into private_property_statistics_sync_runs(config_id,organisation_id,environment,branch_guid,requested_from_date,requested_to_date,status)
    values('${config}','${org}','production','${branch}',current_date-7,current_date-1,'failed');`)
  const result = await overview()
  expect(result.privateProperty).toMatchObject({ views: 0, portalContacts: null, lastAttempt: { failed: true }, metrics: { messages: { value: 3 }, phoneContacts: { value: null } } })
  expect(result.privateProperty.metrics.portalContacts).toBeUndefined()
})
it('rejects cross-organisation and wrong-branch statistics writes at the database boundary', async () => {
  for (const [owner, guid] of [[otherOrg, branch], [org, '40000000-0000-4000-8000-000000000002']]) {
    await expect(db.exec(`insert into private_property_listing_statistics_daily(organisation_id,private_listing_id,environment,branch_guid,private_property_ref,listing_type,statistic_date)
      values('${owner}','${listing}','production','${guid}','T1','Sale',current_date-1)`)).rejects.toThrow(/mapping/)
  }
})
it('filters website views and accepted enquiries without counting independent or foreign sites', async () => {
  await db.exec(`
    insert into website_analytics_daily values('${site}','${listing}','listing_view',current_date-1,10,now()),('${site}','${listing}','page_view',current_date-1,999,now());
    insert into website_lead_submissions(website_site_id,organisation_id,listing_id,submission_type,status,created_at)
      select '${site}','${org}','${listing}','property_enquiry',status,((now() at time zone 'Africa/Johannesburg')::date-1)::timestamp at time zone 'Africa/Johannesburg'
      from unnest(array['received','routed','duplicate','failed','blocked']) status;
    insert into website_lead_submissions(website_site_id,organisation_id,listing_id,submission_type,status,created_at)
      values(null,'${org}','${listing}','property_enquiry','routed',now()-interval '1 day'),('${site}','${otherOrg}','${listing}','property_enquiry','routed',now()-interval '1 day'),('${site}','${org}','${listing}','general_enquiry','routed',now()-interval '1 day');
  `)
  const result = await overview()
  expect(result.website).toMatchObject({ views: 10, complete: false, lastSyncedAt: null, metrics: { enquiries: { value: 3 } }, coverage: { kind: 'activity_only' } })
  expect(result.website.lastTrackedAt).toBeTruthy()
})
it('does not claim zero website views just because publication is connected', async () => {
  const result = await overview()
  expect(result.website).toMatchObject({ connected: true, views: null, available: false, metrics: { enquiries: { value: 0 } } })
})
it('preserves historical metrics after withdrawal and excludes sandbox rows', async () => {
  await seedP24(1,'5,0,0')
  await db.exec(`insert into property24_listing_statistics_daily(organisation_id,private_listing_id,environment,statistic_date,view_count) values('${org}','${listing}','exdev',current_date-1,999)`)
  await db.exec(`update private_listings set property24_reference=null where id='${listing}'`)
  expect((await overview()).property24).toMatchObject({ connected: false, views: 5, state: 'partial' })
  await db.exec(`update private_listings set property24_reference='100' where id='${listing}'`)
})
it('restricts the reader to authenticated members and keeps access fingerprints private', async () => {
  const privileges = (await db.query(`select
    has_function_privilege('anon','public.listing_overview_performance(uuid,uuid,integer)','execute') as anonymous_reader,
    has_table_privilege('authenticated','public.private_property_listing_statistics_daily','insert') as client_write,
    has_schema_privilege('authenticated','listing_statistics_private','usage') as private_helpers,
    (select bool_and(relrowsecurity) from pg_class where relname in ('private_property_listing_statistics_daily','private_property_statistics_access','private_property_statistics_sync_runs','private_property_statistics_attempts')) as all_rls`)).rows[0]
  expect(privileges).toEqual({anonymous_reader:false,client_write:false,private_helpers:false,all_rls:true})
  await db.exec('set role authenticated')
  await expect(overview()).resolves.toMatchObject({period:{days:7}})
  await expect(overview(7,otherListing,otherOrg)).rejects.toThrow(/access/)
  await expect(overview(7,otherListing,org)).rejects.toThrow(/Listing not found/)
  await expect(db.exec('select * from private_property_statistics_access')).rejects.toThrow(/permission denied/)
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await expect(overview()).rejects.toThrow(/access/)
})
