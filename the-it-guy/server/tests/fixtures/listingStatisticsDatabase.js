import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { URL as NodeURL } from 'node:url'
import { createPrivatePropertyClient } from '../../services/privatePropertyClient.js'
import { privatePropertyStatisticsContext, syncPrivatePropertyStatistics } from '../../services/privatePropertyStatisticsService.js'
import { syncProperty24StatisticsBackfill } from '../../property24/statisticsSyncService.js'
import { listingStatisticsWindow, statisticsDays } from '../../services/listingStatisticsDates.js'

const org = '10000000-0000-4000-8000-000000000001', otherOrg = '10000000-0000-4000-8000-000000000002'
const listing = '20000000-0000-4000-8000-000000000001', otherListing = '20000000-0000-4000-8000-000000000002'
const user = '30000000-0000-4000-8000-000000000001', branch = '40000000-0000-4000-8000-000000000001'
const config = '50000000-0000-4000-8000-000000000001', site = '60000000-0000-4000-8000-000000000001'
export const statisticsFixtureIds = { org, otherOrg, listing, otherListing, user, branch, config, site }

// Isolated database: baseline mapping/site tables plus the actual statistics migrations.
export async function createListingStatisticsDatabase() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table organisations(id uuid primary key);
    create table profiles(id uuid primary key);
    create table organisation_users(organisation_id uuid, user_id uuid);
    create function bridge_is_active_member(org uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.organisation_users where organisation_id=org and user_id=auth.uid()) $$;
    create table private_listings(id uuid primary key,organisation_id uuid,property24_reference text,private_property_reference text);
    create table private_property_agency_configs(id uuid primary key,organisation_id uuid);
    create table private_property_listing_syncs(private_listing_id uuid,environment text,branch_guid uuid,private_property_ref text,listing_type text,is_on_portal boolean default false);
    create table property24_listing_syncs(private_listing_id uuid,environment text,agency_id int,is_on_portal boolean,listing_number bigint default 100);
    create table website_sites(id uuid primary key,organisation_id uuid,status text);
    create table website_listing_publications(website_site_id uuid,listing_id uuid,status text);
    create table website_analytics_daily(website_site_id uuid,listing_id uuid,event_type text,event_date date,event_count int,updated_at timestamptz default now());
    create table website_lead_submissions(id uuid primary key default gen_random_uuid(),website_site_id uuid,organisation_id uuid,listing_id uuid,submission_type text,status text,created_at timestamptz default now());
    insert into organisations values('${org}'),('${otherOrg}');
    insert into organisation_users values('${org}','${user}');
    insert into private_listings values('${listing}','${org}','100','T1'),('${otherListing}','${otherOrg}','200','T2');
    insert into private_property_agency_configs values('${config}','${org}');
    insert into private_property_listing_syncs values('${listing}','production','${branch}','T1','Sale',true);
    insert into property24_listing_syncs(private_listing_id,environment,agency_id,is_on_portal) values('${listing}','production',100,true);
    insert into website_sites values('${site}','${org}','published');
    insert into website_listing_publications values('${site}','${listing}','published');
  `)
  await db.exec(await readFile(new NodeURL('../../../../supabase/migrations/20260913164108_property24_statistics_analytics_foundation.sql', import.meta.url), 'utf8'))
  // Defaults simplify old aggregate-only fixtures; retrieval writes every field.
  await db.exec("alter table property24_listing_statistics_daily alter agency_id set default 100, alter listing_number set default 100, alter source_api_version set default 'v55'")
  await db.exec(await readFile(new NodeURL('../../../../supabase/migrations/20261008113615_listing_overview_channel_statistics.sql', import.meta.url), 'utf8'))
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
  return db
}

// Test-only REST adapter. Reads and writes execute SQL, including constraints,
// upsert identities, ownership triggers and the authenticated aggregate reader.
export function createStatisticsFixtureClient(db) {
  const identifier = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Invalid fixture identifier')
    return `"${value}"`
  }
  return {
    async rpc(name, args) {
      if (name === 'get_private_property_agency_credentials') return {data:[{username:'fixture',password:'fixture-only'}],error:null}
      if (name !== 'listing_overview_performance') throw new Error('Unexpected fixture RPC')
      try {
        await db.exec('set role authenticated')
        const result = await db.query('select public.listing_overview_performance($1,$2,$3) as data', [args.p_organisation_id,args.p_listing_id,args.p_days])
        return {data:result.rows[0].data,error:null}
      } catch (error) { return {data:null,error} }
      finally { await db.exec('reset role') }
    },
    from(table) {
      const target = identifier(table)
      let action = 'select', payload, conflict, offset = 0, limit = 1000, join = false
      const filters = [], orders = []
      const query = {
        select(columns = '') { join = columns.includes('private_listings!inner'); return this },
        eq(key,value) { filters.push([key,'=',value]); return this },
        gte(key,value) { filters.push([key,'>=',value]); return this },
        lte(key,value) { filters.push([key,'<=',value]); return this },
        order(key) { orders.push(identifier(key)); return this },
        range(start,end) { offset=start; limit=end-start+1; return this },
        insert(value) { action='insert'; payload=value; return this },
        update(value) { action='update'; payload=value; return this },
        upsert(value,options) { action='upsert'; payload=value; conflict=options.onConflict.split(',').map(identifier).join(','); return this },
        single() { return execute(true) },
        then(resolve,reject) { return execute(false).then(resolve,reject) },
      }
      async function execute(single) {
        try {
          let rows
          const params = []
          const where = filters.map(([key,op,value]) => {
            params.push(value)
            const field = key.startsWith('private_listings.') ? `owner.${identifier(key.split('.')[1])}` : `t.${identifier(key)}`
            return `${field} ${op} $${params.length}`
          }).join(' and ')
          if (action === 'select') {
            const sql = `select t.*${join ? ',jsonb_build_object(\'id\',owner.id,\'organisation_id\',owner.organisation_id) as private_listings' : ''} from ${target} t${join ? ' join private_listings owner on owner.id=t.private_listing_id' : ''}${where ? ` where ${where}` : ''}${orders.length ? ` order by ${orders.map(key=>`t.${key}`).join(',')}` : ''} limit ${limit} offset ${offset}`
            rows = (await db.query(sql,params)).rows
          } else if (action === 'update') {
            const sets = Object.entries(payload).map(([key,value]) => {params.push(value); return `${identifier(key)}=$${params.length}`})
            rows = (await db.query(`update ${target} t set ${sets.join(',')}${where ? ` where ${where}` : ''} returning *`,params)).rows
          } else {
            rows=[]
            for (const record of Array.isArray(payload) ? payload : [payload]) {
              const keys=Object.keys(record).map(identifier), values=Object.values(record)
              const resolution = action==='upsert' ? ` on conflict (${conflict}) do update set ${keys.map(key=>`${key}=excluded.${key}`).join(',')}` : ''
              rows.push(...(await db.query(`insert into ${target} (${keys.join(',')}) values (${values.map((_,index)=>`$${index+1}`).join(',')})${resolution} returning *`,values)).rows)
            }
          }
          // PostgREST emits date columns as YYYY-MM-DD; PGlite returns Date.
          rows=JSON.parse(JSON.stringify(rows,(key,value)=>key==='statistic_date' && typeof value==='string' ? value.slice(0,10) : value))
          return {data:single ? rows[0] || null : rows,error:null}
        } catch (error) { return {data:null,error} }
      }
      return query
    },
  }
}

export async function seedStatisticsThroughRetrieval(db, {days = 90} = {}) {
  const client = createStatisticsFixtureClient(db)
  const now = new Date(), window = listingStatisticsWindow({days,now})
  const property24 = {
    apiVersion:'v55', fetchStatisticsLastUpdateDate:async()=>({data:window.endDate}),
    fetchAgencyListingStatistics:async({startDate,endDate})=>({data:statisticsDays({startDate,days:1+(Date.parse(endDate)-Date.parse(startDate))/86_400_000}).map(date=>({
      listingNumber:100,agencyId:100,date,viewCount:2,alertCount:0,totalContactLeads:1,requestDetailsLeads:1,smsLeads:0,
    }))}),
  }
  await syncProperty24StatisticsBackfill({supabase:client,property24,now,config:{organisationId:org,agencyId:100,environment:'production',days,listingTypes:['Sale']}})
  const supplier = {pending:false,failed:false,calls:0}
  const createPortal = (options) => createPrivatePropertyClient({...options,fetchImpl:async(_url,request)=>{
    supplier.calls += 1
    const date = request.body.match(/<Date>([^T]+)T/)[1]
    const fault = supplier.failed ? 'Authentication failed' : supplier.pending ? 'PP50 - not ready' : ''
    return {ok:!fault,status:fault ? 500 : 200,statusText:fault ? 'Fault' : 'OK',text:async()=>fault
      ? `<soap:Fault><faultcode>soap:Server</faultcode><faultstring>${fault}</faultstring></soap:Fault>`
      : `<ListingPerformanceStatsResult><ListingPerformanceStats><ListingPerformanceStatsOnDate><Date>${date}T00:00:00</Date><PropertyRef>T1</PropertyRef><Views>3</Views><Alerts>0</Alerts><Messages>1</Messages></ListingPerformanceStatsOnDate></ListingPerformanceStats></ListingPerformanceStatsResult>`}
  }})
  const agencyConfig = {id:config,organisation_id:org,environment:'production',branch_guid:branch,base_url:'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx'}
  const context = await privatePropertyStatisticsContext({client,config:agencyConfig,createPortal})
  for (let batch=0;batch<Math.ceil(days/8);batch+=1) await syncPrivatePropertyStatistics({client,config:agencyConfig,context,now,days,maxRequests:8})
  await db.query(`insert into website_analytics_daily(website_site_id,listing_id,event_type,event_date,event_count) values($1,$2,'listing_view',$3,9)`,[site,listing,window.endDate])
  await db.query(`insert into website_lead_submissions(website_site_id,organisation_id,listing_id,submission_type,status,created_at) values($1,$2,$3,'property_enquiry','routed',$4::date::timestamp at time zone 'Africa/Johannesburg')`,[site,org,listing,window.endDate])
  return {client,supplier,context,config:agencyConfig,now,window}
}
