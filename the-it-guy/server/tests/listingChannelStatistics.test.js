import { expect, it, vi } from 'vitest'
import { createPrivatePropertyClient, PrivatePropertySoapError } from '../services/privatePropertyClient.js'
import { listingStatisticsWindow, statisticsDays } from '../services/listingStatisticsDates.js'
import { parsePrivatePropertyStatistics, privatePropertyStatisticsContext, syncPrivatePropertyStatistics, setPrivatePropertyStatisticsAccess, hasPrivatePropertyStatisticsAccess } from '../services/privatePropertyStatisticsService.js'
import { privatePropertyStatisticsSettingsResponse, privatePropertyStatisticsCronResponse } from '../private-property/statisticsApi.js'
import { resolveProperty24StatisticsCredentials, syncProperty24StatisticsBackfill, syncProperty24ListingStatistics } from '../property24/statisticsSyncService.js'
import { createProperty24StatisticsSyncResponse } from '../property24/statisticsSyncApi.js'

const org = '10000000-0000-4000-8000-000000000001', listing = '20000000-0000-4000-8000-000000000001'
const now = new Date('2026-10-08T00:30:00Z')
const config = { id: 'config', organisation_id: org, branch_guid: 'branch', environment: 'sandbox', base_url: 'https://services.sandbox.pp.co.za/AgentImport/AgentImport.asmx', enabled: true }
const row = { private_listing_id: listing, private_property_ref: 'T1', listing_type: 'Sale', private_listings: { id: listing, organisation_id: org } }
const xml = (date = '2026-10-07', ref = 'T1', fields = '<Views>0</Views><Messages>3</Messages><Alerts>2</Alerts>') => `<ListingPerformanceStatsResult><ListingPerformanceStats><ListingPerformanceStatsOnDate><Date>${date}T00:00:00</Date><PropertyRef>${ref}</PropertyRef>${fields}</ListingPerformanceStatsOnDate></ListingPerformanceStats></ListingPerformanceStatsResult>`

function memoryClient() {
  const tables = { private_property_listing_syncs: [{ ...row, environment: 'sandbox', branch_guid: 'branch' }], organisation_users: [{ organisation_id: org, user_id: 'user', email: 'user@example.test', status: 'active', role: 'admin' }], private_property_agency_configs: [config] }
  const client = { tables, auth: { getUser: async () => ({ data: { user: { id: 'user', email: 'user@example.test' } } }) },
    rpc: vi.fn(async () => ({ data: [{ username: 'test-user', password: 'test-secret' }], error: null })),
    from(table) {
      let action = 'select', payload, conflict, filters = [], offset = 0, maximum = Infinity
      const get = (row, key) => key.split('.').reduce((value, key) => value?.[key], row)
      const q = {
        select() { return this }, order() { return this }, or() { return this },
        eq(key, value) { filters.push((row) => get(row,key) === value); return this },
        in(key, values) { filters.push((row) => values.includes(get(row,key))); return this },
        gte(key, value) { filters.push((row) => row[key] >= value); return this },
        lte(key, value) { filters.push((row) => row[key] <= value); return this },
        range(start, end) { offset = start; maximum = end - start + 1; return this }, limit(n) { maximum = n; return this },
        insert(data) { action = 'insert'; payload = data; return this }, update(data) { action = 'update'; payload = data; return this },
        upsert(data, options) { action = 'upsert'; payload = data; conflict = options.onConflict.split(','); return this },
        single() { return execute(true) }, maybeSingle() { return execute(true) }, then(resolve,reject) { return execute().then(resolve,reject) },
      }
      async function execute(single = false) {
        const rows = tables[table] ||= []
        let selected = rows.map((row) => table === 'property24_listing_syncs'
          ? { ...row, private_listings: tables.private_listings?.find((listing) => listing.id === row.private_listing_id) }
          : row).filter((row) => filters.every((filter) => filter(row)))
        if (action === 'insert' || action === 'upsert') {
          const data = Array.isArray(payload) ? payload : [payload]
          selected = data.map((row) => {
            const previous = action === 'upsert' && rows.find((old) => conflict.every((key) => old[key] === row[key]))
            if (previous) return Object.assign(previous,row)
            const next = { id: `row-${rows.length}`, ...row }; rows.push(next); return next
          })
        }
        if (action === 'update') selected.forEach((row) => Object.assign(row,payload))
        selected = selected.slice(offset,offset + Math.min(maximum,1000))
        return { data: single ? selected[0] || null : selected, error: null }
      }
      return q
    },
  }
  return client
}

it('constructs the typed SOAP call and rejects invalid dates before touching the supplier', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => xml() }))
  const portal = createPrivatePropertyClient({ username: 'test', password: 'secret', fetchImpl })
  await portal.getListingPerformanceStats({ propertyRefs: ['T1'], date: '2026-10-07' })
  expect(fetchImpl.mock.calls[0][1].body).toContain('<PropertyRefs><string>T1</string></PropertyRefs><Date>2026-10-07T00:00:00</Date>')
  expect(() => portal.getListingPerformanceStats({ propertyRefs: ['T1'], date: '2026-02-30' })).toThrow(/valid calendar/)
  expect(() => portal.getListingPerformanceStats({ propertyRefs: ['T1', 'T1'], date: '2026-10-07' })).toThrow(/unique/)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it('preserves explicit zero and missing fields, rejecting foreign references and invalid metrics', () => {
  expect(parsePrivatePropertyStatistics(xml(), { propertyRefs: ['T1'], date: '2026-10-07' })).toEqual([{ private_property_ref: 'T1', statistic_date: '2026-10-07', view_count: 0, message_count: 3, alert_count: 2, tel_leads: null }])
  for (const wire of [xml('2026-10-06'), xml('2026-10-07','T2'), xml('2026-10-07','T1','<Views>-1</Views>'), xml('2026-10-07','T1','<Views>2147483648</Views>'), '<Result/>']) expect(() => parsePrivatePropertyStatistics(wire,{propertyRefs:['T1'],date:'2026-10-07'})).toThrow()
})
it('builds completed South African calendar windows even around UTC midnight', () => {
  expect(listingStatisticsWindow({days:7, now:new Date('2026-10-07T22:30:00Z')})).toEqual({startDate:'2026-10-01',endDate:'2026-10-07',days:7})
  expect(statisticsDays(listingStatisticsWindow({days:90,now}))).toHaveLength(90)
  expect(() => listingStatisticsWindow({days:91,now})).toThrow()
  expect(() => listingStatisticsWindow({startDate:'2026-02-30',now})).toThrow()
})
it('verifies mapping ownership and uses Vault credentials without sending them to arbitrary hosts', async () => {
  const client = memoryClient(), createPortal = vi.fn(() => ({}))
  const context = await privatePropertyStatisticsContext({client,config,createPortal})
  expect([...context.refs.keys()]).toEqual(['T1'])
  expect(client.rpc).toHaveBeenCalledWith('get_private_property_agency_credentials',{p_config_id:'config'})
  await privatePropertyStatisticsContext({client,config:{...config,base_url:null},createPortal})
  expect(createPortal.mock.calls.at(-1)[0].baseUrl).toBe(config.base_url)
  await expect(privatePropertyStatisticsContext({client,config:{...config,base_url:'https://other.example/AgentImport/AgentImport.asmx'},createPortal})).rejects.toThrow(/host invalid/)
  client.tables.private_property_listing_syncs.push({ ...client.tables.private_property_listing_syncs[0], private_listing_id:'other',private_listings:{id:'other',organisation_id:org} })
  await expect(privatePropertyStatisticsContext({client,config,createPortal})).rejects.toThrow(/conflict/)
})
it('upserts repeated pulls and keeps prior data on PP50 instead of replacing it with zero', async () => {
  const client = memoryClient()
  const portal = { getListingPerformanceStats: vi.fn(async ({date}) => ({ data: xml(date) })) }
  const context = await privatePropertyStatisticsContext({client,config,createPortal:()=>portal})
  let pullNow = now
  const pull = () => syncPrivatePropertyStatistics({client,config,context,now:pullNow,days:1})
  expect((await pull()).storedCount).toBe(1)
  pullNow = new Date(now.getTime()+61*60*1000)
  await pull()
  expect(client.tables.private_property_listing_statistics_daily).toHaveLength(1)
  pullNow = new Date(now.getTime()+122*60*1000)
  portal.getListingPerformanceStats.mockRejectedValueOnce(new PrivatePropertySoapError('unavailable',{status:500,faultString:'PP50 - The listing performance stats are not yet available for the Date supplied.'}))
  expect(await pull()).toMatchObject({status:'partial',pendingCount:1,storedCount:0})
  expect(client.tables.private_property_listing_statistics_daily[0].message_count).toBe(3)
})
it('bounds historical requests and reports deferred work, treating other faults as failures', async () => {
  const client = memoryClient(), portal = {getListingPerformanceStats:vi.fn(async ({date})=>({data:xml(date)}))}
  const context = await privatePropertyStatisticsContext({client,config,createPortal:()=>portal})
  expect(await syncPrivatePropertyStatistics({client,config,context,now,maxRequests:2})).toMatchObject({requestCount:2,storedCount:2,deferredCount:88,status:'partial'})
  portal.getListingPerformanceStats.mockRejectedValueOnce(new PrivatePropertySoapError('token included here',{status:500,faultString:'Authentication failed'}))
  await expect(syncPrivatePropertyStatistics({client,config,context,now})).rejects.toThrow()
  expect(client.tables.private_property_statistics_sync_runs.at(-1)).toMatchObject({status:'failed',error_code:'private_property_statistics_pull_failed'})
})
it('invalidates access evidence when credentials change', async () => {
  const client = memoryClient(), createPortal = () => ({getListingPerformanceStats:async ({date})=>({data:xml(date)})})
  const context = await privatePropertyStatisticsContext({client,config,createPortal})
  await setPrivatePropertyStatisticsAccess({client,config,context,enabled:true,now})
  expect(await hasPrivatePropertyStatisticsAccess({client,config,context,requireEnabled:true})).toBe(true)
  client.rpc.mockResolvedValueOnce({data:[{username:'test-user',password:'changed-secret'}]})
  const changed = await privatePropertyStatisticsContext({client,config,createPortal})
  expect(await hasPrivatePropertyStatisticsAccess({client,config,context:changed})).toBe(false)
})
it('keeps disabled or unauthorised scheduled calls from creating a database client', async () => {
  const createClient = vi.fn()
  expect((await privatePropertyStatisticsCronResponse({method:'GET',headers:{},env:{},dependencies:{createClient}})).status).toBe(401)
  expect((await privatePropertyStatisticsCronResponse({method:'GET',headers:{authorization:'Bearer cron'},env:{CRON_SECRET:'cron'},dependencies:{createClient}})).body.status).toBe('disabled')
  expect(createClient).not.toHaveBeenCalled()
})
it('authorises settings scope and returns safe errors without echoing supplier tokens', async () => {
  const client = memoryClient()
  const args = {method:'POST',headers:{authorization:'Bearer session'},body:{action:'probe',organisationId:org,configId:'config'},env:{SUPABASE_URL:'https://test.example',SUPABASE_SERVICE_ROLE_KEY:'test'},dependencies:{createClient:()=>client,createPortal:()=>({getListingPerformanceStats:async()=>{throw new PrivatePropertySoapError('secret-token',{status:500,faultString:'secret-token'})}})},now}
  const failed = await privatePropertyStatisticsSettingsResponse(args)
  expect(failed.status).toBe(500)
  expect(JSON.stringify(failed)).not.toContain('secret-token')
  expect((await privatePropertyStatisticsSettingsResponse({...args,body:{...args.body,organisationId:'other'}})).status).toBe(403)
  expect(client.tables.private_property_statistics_access).toBeUndefined()
})

it('fills exactly 90 Property24 days across either inclusive or exclusive supplier boundaries', async () => {
  for (const exclusiveStart of [false,true]) for (const exclusiveEnd of [false,true]) {
    const client = memoryClient()
    client.tables.private_listings = [{id:listing,organisation_id:org}]
    client.tables.property24_listing_syncs = [{private_listing_id:listing,environment:'production',agency_id:100,listing_number:100}]
    const portal = {apiVersion:'v55',fetchStatisticsLastUpdateDate:async()=>({data:'2026-10-07'}),fetchAgencyListingStatistics:vi.fn(async ({startDate,endDate})=>{
      const rows = []
      for (let date = new Date(`${startDate}T00:00:00Z`); date.toISOString().slice(0,10)<=endDate; date.setUTCDate(date.getUTCDate()+1)) {
        const day = date.toISOString().slice(0,10)
        if ((exclusiveStart && day===startDate) || (exclusiveEnd && day===endDate)) continue
        rows.push({listingNumber:100,agencyId:100,date:day,viewCount:1})
      }
      return {data:rows}
    })}
    const args = {supabase:client,property24:portal,now,config:{organisationId:org,agencyId:100,environment:'production',days:90,listingTypes:['Sale']}}
    const result = await syncProperty24StatisticsBackfill(args)
    expect(result).toMatchObject({status:'completed',storedCount:90,window:{startDate:'2026-07-10',endDate:'2026-10-07'}})
    expect(portal.fetchAgencyListingStatistics).toHaveBeenCalledTimes(3)
    await syncProperty24StatisticsBackfill(args)
    expect(client.tables.property24_listing_statistics_daily).toHaveLength(90)
    expect(client.tables.property24_listing_statistics_daily.every((row)=>row.private_listing_id===listing)).toBe(true)
  }
})
it('rejects a Property24 response for another agency without storing it under the current organisation', async () => {
  const client = memoryClient()
  client.tables.private_listings = [{id:listing,organisation_id:org}]
  const property24 = {apiVersion:'v55',fetchStatisticsLastUpdateDate:async()=>({data:'2026-10-07'}),fetchAgencyListingStatistics:async()=>({data:[{listingNumber:100,agencyId:999,date:'2026-10-07',viewCount:40}]})}
  const result = await syncProperty24ListingStatistics({supabase:client,property24,now,config:{organisationId:org,agencyId:100,environment:'production',listingTypes:['Sale']}})
  expect(result).toMatchObject({status:'partial',storedCount:0})
  expect(client.tables.property24_listing_statistics_daily).toBeUndefined()
})
it('links Property24 statistics beyond the REST row cap without including another organisation', async () => {
  const client = memoryClient()
  client.tables.private_listings = Array.from({length:1201}, (_, index) => ({
    id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`, organisation_id:org,
  }))
  client.tables.property24_listing_syncs = client.tables.private_listings.map((item,index) => ({
    private_listing_id:item.id, environment:'production', agency_id:100, listing_number:index+1,
  }))
  const foreign = {id:'20000000-0000-4000-8000-000000002000',organisation_id:'another-org'}
  client.tables.private_listings.push(foreign)
  client.tables.property24_listing_syncs.push({private_listing_id:foreign.id,environment:'production',agency_id:100,listing_number:2000})
  const property24 = {apiVersion:'v55',fetchStatisticsLastUpdateDate:async()=>({data:'2026-10-07'}),fetchAgencyListingStatistics:async()=>({data:[1201,2000].map(listingNumber=>({listingNumber,agencyId:100,date:'2026-10-07',viewCount:5}))})}
  await syncProperty24ListingStatistics({supabase:client,property24,now,config:{organisationId:org,agencyId:100,environment:'production',listingTypes:['Sale']}})
  const saved = client.tables.property24_listing_statistics_daily
  expect(saved.find(item=>item.listing_number===1201).private_listing_id).toBe(client.tables.private_listings[1200].id)
  expect(saved.find(item=>item.listing_number===2000).private_listing_id).toBeNull()
})
it('uses each organisation’s Property24 Vault credentials ahead of shared environment credentials', async () => {
  const rpc = vi.fn(async (_name,params)=>({data:[{username:`agency-${params.p_organisation_id}`,password:'vault-secret',user_group_id:'vault-group'}]}))
  const env = {PROPERTY24_PRODUCTION_BASE_URL:'https://api.property24.com',PROPERTY24_PRODUCTION_BASIC_AUTH_USERNAME:'shared',PROPERTY24_PRODUCTION_BASIC_AUTH_PASSWORD:'shared-secret'}
  for (const organisationId of [org,'another-org']) {
    const credentials = await resolveProperty24StatisticsCredentials({supabase:{rpc},organisationId,environment:'production',env})
    expect(credentials).toMatchObject({username:`agency-${organisationId}`,password:'vault-secret',configured:true,credentialSource:'organisation_vault',apiVersion:'v55'})
  }
})

it('keeps a partial Property24 pull visible in the scheduled result', async () => {
  const client = memoryClient()
  client.tables.property24_accounts = [{organisation_id:org,environment:'production',agency_id:100,enabled:true}]
  const result = await createProperty24StatisticsSyncResponse({method:'GET',headers:{authorization:'Bearer cron'},env:{SUPABASE_URL:'https://test.example',SUPABASE_SERVICE_ROLE_KEY:'test',CRON_SECRET:'cron',PROPERTY24_PRODUCTION_BASE_URL:'https://api.property24.com'},dependencies:{createSupabase:()=>client,createProperty24:()=>({}),syncStatistics:async()=>({status:'partial',storedCount:1})}})
  expect(result.body).toMatchObject({status:'partial',reports:[{status:'partial',storedCount:1}]})
})

it('backs off a pending supplier day while continuing to fill older missing dates', async () => {
  const client = memoryClient()
  const portal = {getListingPerformanceStats:vi.fn(async ({date})=>{
    if (date==='2026-10-07') throw new PrivatePropertySoapError('pending',{status:500,faultString:'PP50 - not ready'})
    return {data:xml(date)}
  })}
  const context = await privatePropertyStatisticsContext({client,config,createPortal:()=>portal})
  await syncPrivatePropertyStatistics({client,config,context,now,maxRequests:2})
  await syncPrivatePropertyStatistics({client,config,context,now:new Date(now.getTime()+10*60*1000),maxRequests:2})
  expect(portal.getListingPerformanceStats.mock.calls.map(([request])=>request.date)).toEqual(['2026-10-07','2026-10-06','2026-10-05','2026-10-04'])
  expect(client.tables.private_property_listing_statistics_daily).toHaveLength(3)
  expect(client.tables.private_property_statistics_attempts.some((row)=>row.private_property_ref==='*')).toBe(true)
})

it('requires a successful production probe before a manual sync or scheduled pull', async () => {
  const client = memoryClient(), production = {...config,environment:'production',base_url:'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx'}
  client.tables.private_property_agency_configs = [production]
  client.tables.private_property_listing_syncs[0].environment = 'production'
  const createPortal = () => ({getListingPerformanceStats:vi.fn(async ({date})=>({data:xml(date)}))})
  const args = {method:'POST',headers:{authorization:'Bearer session'},body:{action:'sync',organisationId:org,configId:'config',days:7},env:{SUPABASE_URL:'https://test.example',SUPABASE_SERVICE_ROLE_KEY:'test'},dependencies:{createClient:()=>client,createPortal},now}
  expect((await privatePropertyStatisticsSettingsResponse(args)).status).toBe(409)
  expect(client.tables.private_property_statistics_sync_runs).toBeUndefined()
  const enabled = await privatePropertyStatisticsSettingsResponse({...args,body:{...args.body,action:'enable'}})
  expect(enabled.body).toMatchObject({verified:true,enabled:true})
  client.tables.private_property_statistics_access[0].private_property_agency_configs = production
  const scheduled = await privatePropertyStatisticsCronResponse({method:'GET',headers:{authorization:'Bearer cron'},env:{...args.env,CRON_SECRET:'cron',PRIVATE_PROPERTY_STATISTICS_SYNC_ENABLED:'true'},dependencies:args.dependencies,now})
  expect(scheduled.body.reports[0]).toMatchObject({configId:'config',requestCount:2,storedCount:2})
})
