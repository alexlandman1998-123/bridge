import {expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({queries:[]}))
vi.mock('../../lib/supabaseClient',()=>({supabase:{
 rpc:async()=>({data:{ready:true},error:null}),
 from(table){
  const call={table,filters:[],range:null};state.queries.push(call)
  const paged=new Set(['email_campaigns','email_campaign_performance','email_usage_records','email_marketing_contacts'])
  const data=paged.has(table)?Array.from({length:501},(_,index)=>({id:`row-${index}`,campaign_id:`row-${index}`,is_valid_email:true})):[]
  const run=()=>Promise.resolve({data:call.single?null:call.range?data.slice(call.range[0],call.range[1]+1):data,error:null})
  const query={select:()=>query,eq:(key,value)=>{call.filters.push([key,value]);return query},is:()=>query,order:()=>query,gte:(key,value)=>{call.since=[key,value];return query},range:(first,last)=>{call.range=[first,last];return query},limit:()=>query,maybeSingle:()=>{call.single=true;return run()},then:(resolve,reject)=>run().then(resolve,reject)}
  return query
 }
}}))
import {getEmailCampaignWorkspace} from '../emailCampaignService'
it('pages complete workspace metrics and monthly usage, preserving organisation filters and South African month boundaries',async()=>{
 state.queries=[]
 const result=await getEmailCampaignWorkspace('own-org')
 for(const key of ['campaigns','performance','contacts','usage'])expect(result[key]).toHaveLength(501)
 expect(state.queries.every(call=>call.filters.some(([key,value])=>key==='organisation_id'&&value==='own-org'))).toBe(true)
 const usage=state.queries.filter(call=>call.table==='email_usage_records')
 expect(usage.map(call=>call.range)).toEqual([[0,499],[500,999]])
 expect(usage[0].since[0]).toBe('created_at')
 const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(0,7)
 expect(usage[0].since[1]).toBe(new Date(`${month}-01T00:00:00+02:00`).toISOString())
})
