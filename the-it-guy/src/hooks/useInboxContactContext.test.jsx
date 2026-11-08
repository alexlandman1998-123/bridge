// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import useInboxContactContext from './useInboxContactContext'
const api=vi.hoisted(()=>({request:vi.fn(),db:null}))
vi.mock('../services/metaIntegrationService',()=>({metaIntegrationRequest:api.request}))
vi.mock('../lib/supabaseClient',()=>({get supabase(){return api.db}}))
afterEach(()=>{cleanup();api.db=null;vi.resetAllMocks()})
it('removes old contact context immediately and ignores late responses after an organisation switch',async()=>{
 let resolveOld
 api.request.mockImplementation(org=>org==='one'?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve({linked:{kind:'buyer',name:'New contact'},candidates:[]}))
 const view=renderHook(props=>useInboxContactContext(props),{initialProps:{organisationId:'one',accessScope:'one:admin',conversationId:'thread'}})
 view.rerender({organisationId:'two',accessScope:'two:admin',conversationId:'thread'})
 expect(view.result.current.context).toBeUndefined()
 await waitFor(()=>expect(view.result.current.context?.linked?.name).toBe('New contact'))
 await act(async()=>resolveOld({linked:{kind:'buyer',name:'Private previous contact'},candidates:[]}))
 expect(view.result.current.context?.linked?.name).toBe('New contact')
})

it('loads only organisation-scoped records for the linked person and keeps partial activity failures visible',async()=>{
 const calls=[]
 const lead={lead_id:'lead',contact_id:'contact',lead_category:'buyer',enquired_listing_id:'listing'}
 const rows={contacts:{first_name:'Pat',email:'pat@example.test'},lead_requirements:[{requirement_id:'req',title:'Family home'}],lead_listing_interests:[{interest_id:'interest',listing_id:'listing',created_at:'2026-10-01'}],private_listings:[{id:'listing',title:'Junoah Estate'}],revo_inbox_associations:[]}
 api.db={from(table){const call={table,filters:[]};calls.push(call);let single=false;const query={select(){return query},eq(key,value){call.filters.push([key,value]);return query},in(key,value){call.filters.push([key,value]);return query},order(){return query},limit(){return query},maybeSingle(){single=true;return query},then(resolve){return Promise.resolve(table==='lead_activities'?{data:null,error:{message:'Activity unavailable'}}:{data:table==='leads'?(single?lead:[lead]):rows[table]||[],error:null}).then(resolve)}};return query}}
 api.request.mockResolvedValue({linked:{kind:'buyer',recordId:'lead',name:'Pat'},candidates:[]})
 const view=renderHook(()=>useInboxContactContext({organisationId:'org',accessScope:'org:admin',conversationId:'thread'}))
 await waitFor(()=>expect(view.result.current.loading).toBe(false))
 expect(view.result.current.contact.email).toBe('pat@example.test');expect(view.result.current.listings[0].title).toBe('Junoah Estate')
 expect(view.result.current.requirements[0].title).toBe('Family home')
 expect(view.result.current.issues).toContainEqual({section:'Activity',message:'Activity unavailable'})
 expect(calls.every(call=>call.filters.some(([key,value])=>key==='organisation_id'&&value==='org'))).toBe(true)
 expect(calls.filter(call=>['lead_activities','lead_requirements','lead_listing_interests'].includes(call.table)).every(call=>call.filters.some(([key,value])=>key==='lead_id'&&value.includes('lead')))).toBe(true)
})
