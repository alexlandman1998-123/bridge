import { vi } from 'vitest'
import { Buffer } from 'node:buffer'
import { eventPayload } from '../../supabase/functions/_shared/calendarProviderTransport.ts'
export const config = { googleClientId:'google-id',googleClientSecret:'google-secret',microsoftClientId:'microsoft-id',microsoftClientSecret:'microsoft-secret',microsoftTenant:'common',appUrl:'https://app.example.test',supabaseUrl:'https://project.example.test',encryptionKey:Buffer.alloc(32,7).toString('base64') }
export const copyKey='01234567-89ab-cdef-0123-456789abcdef'
export const source={appointmentId:'booking',revision:1,title:'Viewing',location:'18 Oak Avenue',meetingUrl:'https://meeting.example.test',start:'2099-07-20T08:00:00+00:00',end:'2099-07-20T09:00:00+00:00',date:'2099-07-20',endDate:'2099-07-20',timezone:'Africa/Johannesburg',allDay:false,status:'requested',busy:true}
export const job={appointment_id:'booking',copy_key:copyKey,desired_action:'upsert',desired_hash:'first-hash',desired_payload:source,create_payload:{payload:source,hash:'first-hash'}}
const response=(data,status=200)=>new Response(data===null?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
export function controlledProvider(provider='google') {
 const state={event:null,creates:0,updates:0,deletes:0,lostCreate:false,raceWrite:false,duplicate:false,afterWrite:null}
 let revision=0
 const stamp=event=>({...event,[provider==='google'?'etag':'@odata.etag']:`"v${++revision}"`})
 const fetcher=vi.fn(async (raw,init={})=>{
  const url=new URL(raw),method=init.method || 'GET'
  if(!['www.googleapis.com','graph.microsoft.com'].includes(url.hostname)) throw new Error('Unexpected provider host')
  if(method==='GET') {
   if(provider==='outlook' && url.searchParams.has('$filter')) return response({value:state.event?[state.event,...(state.duplicate?[state.event]:[])]:[]})
   return state.event?response(state.event):response({},404)
  }
  if(method==='POST') {
   const payload=JSON.parse(init.body);state.creates++
   state.event=stamp({...payload,id:provider==='google'?payload.id:'immutable-outlook-id'})
   if(state.afterWrite) state.event=stamp(state.afterWrite(state.event))
   if(state.lostCreate) {state.lostCreate=false;throw new Error('Lost create response')}
   return response(state.event,201)
  }
  if(state.raceWrite) return response({},412)
  if(init.headers['If-Match']!==state.event?.[provider==='google'?'etag':'@odata.etag']) return response({},412)
  if(method==='DELETE') {state.deletes++;state.event=null;return response(null,204)}
  state.updates++;state.event=stamp({...state.event,...JSON.parse(init.body)})
  if(state.afterWrite) state.event=stamp(state.afterWrite(state.event))
  return response(state.event)
 })
 const change=changes=>{state.event=stamp({...state.event,...changes})}
 const seed=(payload=source)=>{state.event=stamp({...eventPayload(provider,payload,copyKey,'first-hash',config.appUrl),id:provider==='google'?'arch9'+copyKey.replaceAll('-',''):'immutable-outlook-id'})}
 return {state,fetcher,change,seed}
}
