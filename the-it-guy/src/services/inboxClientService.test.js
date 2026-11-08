import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addClientTag, addClientPropertyEnquiry, linkInboxLead, createInboxLead, routeInboxLead, searchClientProperties } from './inboxClientService'
const api=vi.hoisted(()=>({from:vi.fn(),request:vi.fn(),create:vi.fn(),invalidate:vi.fn(),collaborate:vi.fn(),assign:vi.fn()}))
vi.mock('../lib/supabaseClient',()=>({supabase:{from:api.from}}))
vi.mock('./leadCollaboratorService',()=>({addLeadCollaborator:api.collaborate}))
vi.mock('./leadAssignmentService',()=>({assignLeadToAgent:api.assign}))
vi.mock('./metaIntegrationService',()=>({metaIntegrationRequest:api.request}))
vi.mock('../lib/agencyCrmRepository',()=>({createAgencyCrmLeadRecord:api.create}))
vi.mock('../core/clients/agentClientDirectory',()=>({invalidateAgentClientDirectoryCache:api.invalidate}))
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',person='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222'
const client={identityId:person,organisationId:org};let insert
beforeEach(()=>{vi.resetAllMocks();insert=vi.fn().mockResolvedValue({data:null,error:null});api.from.mockReturnValue({insert})})
afterEach(()=>vi.restoreAllMocks())
it('normalises tags and stores the permanent client and organisation instead of requiring email',async()=>{await addClientTag(client,'  InVeStOr  ');expect(api.from).toHaveBeenCalledWith('agency_client_tags');expect(insert).toHaveBeenCalledWith({organisation_id:org,client_id:person,tag:'investor'})})
it('records listing and development enquiry types without overwriting the other',async()=>{await addClientPropertyEnquiry(client,'development',target);expect(insert).toHaveBeenCalledWith({organisation_id:org,client_id:person,development_id:target});await addClientPropertyEnquiry(client,'listing',target);expect(insert).toHaveBeenCalledWith({organisation_id:org,client_id:person,listing_id:target});await expect(addClientPropertyEnquiry(client,'unknown',target)).rejects.toThrow('Choose a listing or development')})
it('refreshes concurrency versions before linking rather than trusting stale panel data',async()=>{api.request.mockResolvedValueOnce({version:7,assignmentVersion:4}).mockResolvedValueOnce({});await linkInboxLead({organisationId:org,conversationId:'chat',kind:'buyer',recordId:'lead'});expect(api.request).toHaveBeenLastCalledWith(org,'link_crm',{conversationId:'chat',kind:'buyer',recordId:'lead',linkVersion:7,assignmentVersion:4})})
it('creates a phone-only lead through the canonical CRM and does not trigger notification email',async()=>{api.create.mockResolvedValue({leadId:'new-lead'});const result=await createInboxLead({organisationId:org,current:{contact_phone:'27821234567'},actor:{id:person},firstName:'Pat',lastName:'Smith',category:'buyer'});expect(result).toEqual({recordId:'new-lead',kind:'buyer'});expect(api.create).toHaveBeenCalledWith(org,expect.objectContaining({contact:expect.objectContaining({phone:'27821234567',email:''}),leadSource:'WhatsApp'}),{actor:{id:person},notifyAgent:false})})

it('links an email conversation with the authenticated association writer instead of WhatsApp APIs',async()=>{
 const upsert=vi.fn().mockResolvedValue({error:null});api.from.mockReturnValue({upsert});
 await linkInboxLead({organisationId:org,conversationId:person,recordId:target,kind:'buyer',channel:'email',actorId:person});
 expect(api.from).toHaveBeenCalledWith('revo_inbox_associations');expect(upsert).toHaveBeenCalledWith(expect.objectContaining({organisation_id:org,conversation_id:person,entity_type:'lead',entity_id:target,created_by:person}),expect.objectContaining({ignoreDuplicates:true}));expect(api.request).not.toHaveBeenCalled();
})
it('creates an email buyer with the selected property using the existing lead writer',async()=>{
 api.create.mockResolvedValue({leadId:'new-lead'});await createInboxLead({organisationId:org,current:{channel:'email'},actor:{id:person},firstName:'Pat',email:'pat@example.test',category:'buyer',property:{id:target,kind:'listing',title:'Madison Place'}});
 expect(api.create).toHaveBeenCalledWith(org,expect.objectContaining({leadSource:'Email',listingId:target,propertyInterest:'Madison Place',contact:expect.objectContaining({email:'pat@example.test'})}),expect.objectContaining({notifyAgent:false}));
})

function routingQueries(assignee=target){
 const query={select:vi.fn(),eq:vi.fn(),single:vi.fn()};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
 query.single.mockResolvedValueOnce({data:{assigned_agent_id:assignee},error:null}).mockResolvedValueOnce({data:{assigned_agent_id:person,assigned_user_id:person},error:null});api.from.mockReturnValue(query);return query
}
it('shares the same saved lead with the listing agent, without reassigning it',async()=>{
 routingQueries();await routeInboxLead({organisationId:org,recordId:person,listingId:target,expectedAgentId:target,mode:'share',actor:{id:person}});
 expect(api.collaborate).toHaveBeenCalledWith({organisationId:org,leadId:person,userId:target});expect(api.assign).not.toHaveBeenCalled();expect(api.create).not.toHaveBeenCalled();
})
it('refers the saved lead to the listing agent without sending email',async()=>{
 routingQueries();await routeInboxLead({organisationId:org,recordId:person,listingId:target,expectedAgentId:target,mode:'refer',actor:{id:person}});
 expect(api.assign).toHaveBeenCalledWith(expect.objectContaining({organisationId:org,leadId:person,agentId:target}),{actor:{id:person},notifyAgentEmail:false});expect(api.collaborate).not.toHaveBeenCalled();
})
it('blocks a handover if the listing agent changed after selection',async()=>{
 routingQueries(person);await expect(routeInboxLead({organisationId:org,recordId:person,listingId:target,expectedAgentId:target,mode:'refer',actor:{id:person}})).rejects.toThrow('assigned agent changed');expect(api.assign).not.toHaveBeenCalled();expect(api.collaborate).not.toHaveBeenCalled();
})

it('restricts development choices to the current organisation even when partner records are readable',async()=>{
 const unrelated='33333333-3333-4333-8333-333333333333';const queries=[];
 const tables={developments:[{id:person,name:'Samlin development',organisation_id:org,status:'active'},{id:target,name:'Linked development',organisation_id:'partner',status:'active'},{id:unrelated,name:'Other demo',organisation_id:'demo',status:'active'}],development_organisation_relationships:[{development_id:target,organisation_id:org,status:'active',can_view:true},{development_id:unrelated,organisation_id:org,status:'inactive',can_view:true}],development_profiles:[{development_id:person,image_links:['https://images.example.test/cover.jpg'],marketing_content:{mediaLibrary:{galleryImageUrls:[]}}}]};
 api.from.mockImplementation(table=>{let rows=tables[table]||[];const q={select:vi.fn(()=>q),order:vi.fn(()=>q),eq:vi.fn((key,value)=>{queries.push([table,key,value]);rows=rows.filter(row=>row[key]===value);return q}),in:vi.fn((key,ids)=>{rows=rows.filter(row=>ids.includes(row[key]));return q}),then:(resolve)=>Promise.resolve({data:rows,error:null}).then(resolve)};return q});
 const options=await searchClientProperties(org,'development');expect(options.map(row=>row.id)).toEqual([person]);expect(options.some(row=>row.title==='Other demo')).toBe(false);expect(queries).toContainEqual(['developments','organisation_id',org]);expect(queries.some(row=>row[0]==='development_organisation_relationships')).toBe(false);expect(options.find(row=>row.id===person).imageUrl).toBe('https://images.example.test/cover.jpg');
})
