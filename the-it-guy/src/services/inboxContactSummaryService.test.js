import {beforeEach,it,expect,vi} from 'vitest'
import {loadInboxContactSummary} from './inboxContactSummaryService'
const api=vi.hoisted(()=>({from:vi.fn()}))
vi.mock('../lib/supabaseClient',()=>({supabase:{from:api.from}}))
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',lead='11111111-1111-4111-8111-111111111111',contact='22222222-2222-4222-8222-222222222222'
let calls,tables
beforeEach(()=>{calls=[];tables={};api.from.mockImplementation(table=>{const filters=[];calls.push({table,filters});const q={select:()=>q,eq:(key,value)=>{filters.push(['eq',key,value]);return q},in:(key,value)=>{filters.push(['in',key,value]);return q},or:value=>{filters.push(['or',value]);return q},order:()=>q,limit:()=>q,then:resolve=>Promise.resolve({data:tables[table]||[],error:null}).then(resolve)};return q})})
it('does not query unrelated leads or transactions when no contact or link exists',async()=>{
 const data=await loadInboxContactSummary({organisationId:org,conversationId:'thread',email:'PAT@example.test'});
 expect(data.leads).toEqual([]);expect(calls.some(row=>row.table==='leads'||row.table==='transactions')).toBe(false);
 for(const call of calls)expect(call.filters).toContainEqual(['eq','organisation_id',org]);expect(calls.find(row=>row.table==='contacts').filters).toContainEqual(['eq','email','pat@example.test']);
})
it('restricts related records to the current workspace and the linked person’s ids',async()=>{
 tables.revo_inbox_associations=[{entity_type:'lead',entity_id:lead}];tables.contacts=[{contact_id:contact,first_name:'Pat'}];tables.leads=[{lead_id:lead,contact_id:contact}];
 await loadInboxContactSummary({organisationId:org,conversationId:'thread',email:'pat@example.test'});
 for(const call of calls.filter(row=>row.table!=='profiles'))expect(call.filters).toContainEqual(['eq','organisation_id',org]);
 expect(calls.find(row=>row.table==='leads').filters.find(row=>row[0]==='or')[1]).toContain(lead);
 const scope=calls.find(row=>row.table==='transactions').filters.find(row=>row[0]==='or')[1];expect(scope).toContain(`originating_buyer_lead_id.in.(${lead})`);expect(scope).toContain(`buyer_contact_id.in.(${contact})`);
})
