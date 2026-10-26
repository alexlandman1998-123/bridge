import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({queries:[],rows:[]}))
vi.mock('../../../../lib/supabaseClient.js',()=>({isSupabaseConfigured:true,supabase:{from(table){
  if(table==='revo_inbox_messages')throw Error('List must not load full message bodies')
  const entry={table};state.queries.push(entry)
  const query={select(){return query},eq(){return query},order(){return query},in(field,ids){entry.ids=ids;return query},range(start,end){entry.range=[start,end];return Promise.resolve({data:table==='revo_inbox_conversations'?state.rows.slice(start,end+1):[],error:null})}}
  return query
}}}))
import { loadRevoInbox } from '../revoSharedInboxService.js'
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
beforeEach(()=>{state.queries=[];state.rows=Array.from({length:120},(_,i)=>({id:`conversation-${i}`,organisation_id:org,contact_address:`client-${i}@example.test`,revo_inbox_channels:{channel:'email',provider_key:'google_workspace',address:'mail@example.test'}}))})
it('bounds list queries and leaves bodies to the selected-thread reader',async()=>{
 const result=await loadRevoInbox(org)
 expect(result.conversations).toHaveLength(100);expect(result.hasMore).toBe(true);expect(result.messages).toEqual([])
 expect(state.queries.filter(q=>q.table==='revo_inbox_conversations').map(q=>q.range)).toEqual([[0,99],[100,100]])
 expect(state.queries.find(q=>q.table==='revo_inbox_associations').ids).toHaveLength(100)
})
it('can explicitly load older conversations beyond the first page',async()=>{
 const result=await loadRevoInbox(org,{conversationLimit:200})
 expect(result.conversations).toHaveLength(120);expect(result.hasMore).toBe(false)
 expect(state.queries.filter(q=>q.table==='revo_inbox_associations').map(q=>q.ids.length)).toEqual([100,20])
})
