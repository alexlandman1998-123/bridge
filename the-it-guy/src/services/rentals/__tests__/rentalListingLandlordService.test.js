import { expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
vi.mock('../../../lib/supabaseClient',()=>({supabase:null,isSupabaseConfigured:false}))
import { createListingLandlordLead, loadListingLandlordSetup, saveListingLandlord, startListingLandlordOnboarding } from '../rentalListingLandlordService'
const capable={capabilities:{profileConsistency:true},consistency:{synced:true}}
const values={landlordName:'Landlord',landlordEmail:'owner@example.test',landlordPhone:'0123456789',landlordType:'company'}
const listing={id:'listing-1',organisationId:'org-1',listingCategory:'rental',sellerCanonicalFactReadiness:{monthlyRent:true,propertyAddress:false,landlordName:false},sellerCanonicalFacts:{propertyProfile:{bedrooms:3},mandateStatus:'signed'}}
function api() {
 return {getListing:vi.fn().mockResolvedValue(listing),listContacts:vi.fn().mockResolvedValue([]),saveContact:vi.fn().mockResolvedValue({}),updateListing:vi.fn(async(id,patch)=>({...listing,sellerCanonicalFacts:patch.sellerCanonicalFacts}))}
}
it('creates a reusable client and persists its connection without changing property facts or media',async()=>{
 const dependencies=api()
 const saved=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'new',contactId:'contact-1'},dependencies)
 expect(dependencies.saveContact).toHaveBeenCalledWith('org-1',expect.objectContaining({contactId:'contact-1',contactType:'landlord',name:'Landlord'}),expect.anything())
 expect(saved.sellerCanonicalFacts.landlordContactId).toBe('contact-1')
 expect(saved.sellerCanonicalFacts.propertyProfile).toEqual({bedrooms:3})
 expect(dependencies.updateListing.mock.calls[0][1]).not.toHaveProperty('listingPublicationData')
 expect(saved.sellerCanonicalFacts.mandateStatus).toBe('signed')
 expect(dependencies.updateListing.mock.calls[0][1].sellerCanonicalFactReadiness).toEqual({monthlyRent:true,propertyAddress:false,landlordName:true,landlordContact:true})
})
it('uses the selected workspace contact as the source of name, email and phone',async()=>{
 const dependencies=api();dependencies.listContacts.mockResolvedValue([{id:'contact-2',name:'Existing landlord',email:'saved@example.test',phone:'0999999999'}])
 const saved=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'existing',contactId:'contact-2'},dependencies)
 expect(dependencies.saveContact).not.toHaveBeenCalled()
 expect(saved.sellerCanonicalFacts.landlordName).toBe('Existing landlord')
 expect(saved.sellerCanonicalFacts.landlordEmail).toBe('saved@example.test')
 expect(saved.sellerCanonicalFacts.landlordContactId).toBe('contact-2')
})
it('rejects another workspace, invalid contacts and duplicates before writing',async()=>{
 const dependencies=api()
 await expect(saveListingLandlord('listing-1',values,{organisationId:'other',mode:'new',contactId:'contact-1'},dependencies)).rejects.toThrow('selected workspace')
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'existing',contactId:'missing'},dependencies)).rejects.toThrow('available')
 dependencies.listContacts.mockResolvedValue([{id:'duplicate',email:'owner@example.test'}])
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'new',contactId:'contact-1'},dependencies)).rejects.toThrow('already in Clients')
 expect(dependencies.updateListing).not.toHaveBeenCalled();expect(dependencies.saveContact).not.toHaveBeenCalled()
})
it('keeps one contact identity when the listing save fails and is retried',async()=>{
 const dependencies=api();dependencies.updateListing.mockRejectedValueOnce(new Error('Listing save failed'))
 const context={organisationId:'org-1',mode:'new',contactId:'retry-contact'}
 await expect(saveListingLandlord('listing-1',values,context,dependencies)).rejects.toThrow('Listing save failed')
 await saveListingLandlord('listing-1',values,context,dependencies)
 expect(dependencies.saveContact.mock.calls.map((call)=>call[1].contactId)).toEqual(['retry-contact','retry-contact'])
})
it('preserves a landlord lead connection, including a portfolio listing',async()=>{
 const linkedLead={id:'lead-1',role:'landlord',relationships:{listingId:'listing-1'}}
 const result=await loadListingLandlordSetup(listing,{organisationId:'org-1',scopeLevel:'assigned'},{listContacts:async()=>[],listLeads:async()=>[linkedLead]})
 expect(result.linkedLead).toBe(linkedLead)
 const dependencies=api()
 dependencies.requestOnboarding=vi.fn(async(id,method,body)=>{if(method==='PATCH') dependencies.getListing.mockResolvedValue({...listing,sellerCanonicalFacts:{...listing.sellerCanonicalFacts,...values}}); return {onboarding:{...capable,version:method==='PATCH' ? 2 : 1,status:'draft',data:{profile:body?.patch.profile || {},portfolio:[]}}}})
 const saved=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile',linkedLead},dependencies)
 expect(saved.sellerCanonicalFacts.landlordName).toBe('Landlord')
 expect(dependencies.saveContact).not.toHaveBeenCalled()
})

it('updates the connected client, preserves hidden profile facts, and keeps the capture draft current on readback',async()=>{
 const dependencies=api()
 const connected={...listing,updatedAt:'2026-10-14T08:00:00Z',sellerCanonicalFacts:{...listing.sellerCanonicalFacts,landlordContactId:'contact-1',rentalCaptureDraft:{version:1,form:{landlordName:'Old name',monthlyRent:12000,landlordEmail:'old@example.test'}}}}
 dependencies.getListing.mockResolvedValue(connected)
 dependencies.updateContact=vi.fn().mockResolvedValue({})
 dependencies.readContact=vi.fn().mockResolvedValue({name:values.landlordName,email:values.landlordEmail,phone:values.landlordPhone})
 const onboarding={...capable,version:7,status:'draft',data:{profile:{type:'company',name:'Old name',registrationNumber:'KEEP-ME',people:[{id:'person-1',name:'Co-owner',role:'owner'}]},portfolio:[{id:'property-1',listingId:'listing-1',address:'12 Sample Road'}]}}
 dependencies.requestOnboarding=vi.fn(async(id,method,body)=>{dependencies.getListing.mockResolvedValue({...connected,sellerCanonicalFacts:{...connected.sellerCanonicalFacts,...values,rentalCaptureDraft:{version:1,form:{...connected.sellerCanonicalFacts.rentalCaptureDraft.form,...values}}}});return {onboarding:{...onboarding,...capable,version:8,data:{...onboarding.data,profile:{...body.patch.profile,people:body.patch.profile.people.map(p=>({role:p.role,name:p.name,id:p.id}))}}}}})
 const linkedLead={id:'lead-1',role:'landlord',relationships:{listingId:'listing-1'},raw:{contactId:'contact-1'}}
 const saved=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile',linkedLead,onboarding},dependencies)
 expect(dependencies.requestOnboarding.mock.calls[0][2]).toMatchObject({version:7,expectedDiscovery:onboarding.data,patch:{profile:{registrationNumber:'KEEP-ME',people:onboarding.data.profile.people}}})
 expect(dependencies.updateContact).not.toHaveBeenCalled()
 expect(saved.sellerCanonicalFacts.rentalCaptureDraft.form).toMatchObject({landlordName:'Landlord',landlordEmail:'owner@example.test',monthlyRent:12000})
 expect(dependencies.updateListing).not.toHaveBeenCalled()
})
it('blocks submitted onboarding, unrelated leads and stale listing edits before any writes',async()=>{
 const dependencies=api();const linkedLead={id:'lead-1',role:'landlord',relationships:{listingId:'listing-1'}}
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile',linkedLead,onboarding:{status:'submitted'}},dependencies)).rejects.toThrow('locked')
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile',linkedLead:{...linkedLead,relationships:{listingId:'other'}}},dependencies)).rejects.toThrow('connected to this rental')
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile',linkedLead,expectedValues:{landlordName:'Stale name'}},dependencies)).rejects.toThrow('changed')
 expect(dependencies.updateListing).not.toHaveBeenCalled()
 expect(dependencies.saveContact).not.toHaveBeenCalled()
})
it('retains confirmed onboarding when the atomic save succeeds but the listing readback fails',async()=>{
 const dependencies=api();const onboarding={...capable,version:1,status:'draft',data:{profile:{},portfolio:[]}}
 dependencies.requestOnboarding=vi.fn(async(id,method,body)=>({onboarding:{...onboarding,...capable,version:2,data:{profile:body.patch.profile,portfolio:[]}}}))
 dependencies.getListing.mockResolvedValueOnce(listing).mockRejectedValueOnce(new Error('Readback unavailable'))
 const linkedLead={id:'lead-1',role:'landlord',relationships:{listingId:'listing-1'}}
 const error=await saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile',linkedLead,onboarding},dependencies).catch(cause=>cause)
 expect(error.message).toContain('readback needs a retry')
 expect(error.onboarding.version).toBe(2)
 expect(error.onboarding.data.profile.name).toBe('Landlord')
})
it('does not show success if the client readback differs from the saved landlord',async()=>{
 const dependencies=api();dependencies.getListing.mockResolvedValue({...listing,sellerCanonicalFacts:{landlordContactId:'contact-1'}})
 dependencies.updateContact=vi.fn().mockResolvedValue({})
 dependencies.readContact=vi.fn().mockResolvedValue({name:'Old name',email:'old@example.test',phone:''})
 await expect(saveListingLandlord('listing-1',values,{organisationId:'org-1',mode:'profile'},dependencies)).rejects.toThrow('client contact could not be verified')
 expect(dependencies.updateListing).not.toHaveBeenCalled()
})
it('reuses one landlord contact and a committed rental lead when onboarding setup is retried',async()=>{
 const connected={...listing,id:'listing-1',addressLine1:'12 Sample Road',sellerCanonicalFacts:{...values,landlordContactId:'contact-1'}}
 const lead={id:'lead-1',role:'landlord',relationships:{listingId:'listing-1'}}
 const setup={contacts:[{id:'contact-1',name:'Landlord'}],linkedLead:null}
 const dependencies=api();dependencies.getListing.mockResolvedValue(connected)
 dependencies.loadSetup=vi.fn().mockResolvedValueOnce(setup).mockResolvedValueOnce({...setup,linkedLead:lead})
 dependencies.createLead=vi.fn().mockResolvedValue(lead)
 dependencies.requestOnboarding=vi.fn().mockResolvedValue({onboarding:{...capable,version:1,status:'draft',data:{profile:{},portfolio:[]}}})
 dependencies.updateListing.mockRejectedValueOnce(new Error('Listing save failed')).mockImplementationOnce(async(id,patch)=>({...connected,sellerCanonicalFacts:patch.sellerCanonicalFacts}))
 await expect(startListingLandlordOnboarding('listing-1',{organisationId:'org-1',leadId:'stable-lead'},dependencies)).rejects.toThrow('Listing save failed')
 const result=await startListingLandlordOnboarding('listing-1',{organisationId:'org-1',leadId:'stable-lead'},dependencies)
 expect(dependencies.createLead).toHaveBeenCalledTimes(1)
 expect(dependencies.createLead.mock.calls[0][1].id).toBe('contact-1')
 expect(dependencies.createLead.mock.calls[0][2].profile.name).toBe('Landlord')
 expect(dependencies.createLead.mock.calls[0][2].portfolio[0]).toMatchObject({listingId:'listing-1',address:'12 Sample Road'})
 expect(result.listing.sellerCanonicalFacts.landlordLeadId).toBe('lead-1')
 expect(dependencies.saveContact).not.toHaveBeenCalled()
})
it('uses an insert and exact scoped readback for onboarding creation, without writing the existing client',async()=>{
 const contacts=[];let insert
 const discovery={profile:{name:'Owner',type:'individual'},portfolio:[{id:'property-1',address:'12 Road',listingId:'listing-1'}]}
 const client={from:vi.fn(table=>{
   contacts.push(table)
   const query={insert:vi.fn(value=>{insert=value;return query}),select:()=>query,eq:vi.fn(()=>query),single:async()=>({error:{message:'Acknowledgement lost'}}),maybeSingle:async()=>({data:{lead_id:'stable-lead',contact_id:'contact-1',raw_enquiry_payload:insert.raw_enquiry_payload}})}
   return query
 })}
 const result=await createListingLandlordLead(listing,{id:'contact-1'},discovery,{leadId:'stable-lead',organisationId:'org-1',assignedAgentId:'agent-1'},client)
 expect(contacts).toEqual(['leads','leads'])
 expect(insert).toMatchObject({lead_id:'stable-lead',contact_id:'contact-1',lead_category:'seller',raw_enquiry_payload:{classification:'rental',role:'landlord',relationships:{listingId:'listing-1'}}})
 expect(result.id).toBe('stable-lead')
})
function landlordLeadClient({ loseAcknowledgement=false, insertError=null, readback=rows=>rows }={}) {
 const leads=new Map()
 const fetch=vi.fn(async(url,options)=>{
   const request=new URL(url)
   expect(request.pathname).toBe('/rest/v1/leads')
   if(options.method==='POST') {
     const payload=JSON.parse(options.body)
     if(insertError)return Response.json(insertError,{status:403})
     if(leads.has(payload.lead_id))return Response.json({code:'23505',message:'Lead already exists'},{status:409})
     leads.set(payload.lead_id,payload)
     if(loseAcknowledgement)throw new TypeError('Acknowledgement lost')
     return Response.json({lead_id:payload.lead_id},{status:201})
   }
   expect(options.method).toBe('GET')
   expect(request.searchParams.get('lead_id')).toBe('eq.stable-lead')
   expect(request.searchParams.get('organisation_id')).toBe('eq.org-1')
   return Response.json(readback([...leads.values()]))
 })
 const client=createClient('https://landlord-onboarding.invalid','local-test-key',{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch},
 })
 return {client,fetch,leads}
}
it('starts listing landlord onboarding using the installed Supabase query builder',async()=>{
 const connected={...listing,addressLine1:'12 Sample Road',sellerCanonicalFacts:{...values,landlordContactId:'contact-1'}}
 const database=landlordLeadClient()
 const dependencies=api();dependencies.getListing.mockResolvedValue(connected)
 dependencies.loadSetup=vi.fn().mockResolvedValue({contacts:[{id:'contact-1'}],linkedLead:null})
 dependencies.createLead=(...args)=>createListingLandlordLead(...args,database.client)
 const onboarding={...capable,version:1,status:'draft',data:{profile:{name:'Landlord'},portfolio:[]}}
 dependencies.requestOnboarding=vi.fn().mockResolvedValue({onboarding})
 const result=await startListingLandlordOnboarding('listing-1',{organisationId:'org-1',leadId:'stable-lead',assignedAgentId:'agent-1'},dependencies)
 expect(database.fetch.mock.calls.map(([,options])=>options.method)).toEqual(['POST','GET'])
 expect(result.listing.sellerCanonicalFacts.landlordLeadId).toBe('stable-lead')
 expect(result.setup.linkedLead.id).toBe('stable-lead')
 expect(result.setup.onboarding).toBe(onboarding)
 expect(dependencies.requestOnboarding).toHaveBeenCalledWith('stable-lead')
})
it('recovers a committed lead after a lost acknowledgement and a duplicate insert retry with the installed client',async()=>{
 const database=landlordLeadClient({loseAcknowledgement:true})
 const discovery={profile:{name:'Owner',type:'individual'},portfolio:[{address:'12 Road',listingId:'listing-1'}]}
 const context={leadId:'stable-lead',organisationId:'org-1',assignedAgentId:'agent-1'}
 const first=await createListingLandlordLead(listing,{id:'contact-1'},discovery,context,database.client)
 const retried=await createListingLandlordLead(listing,{id:'contact-1'},{...discovery,profile:{name:'Changed draft'}},context,database.client)
 expect(first.id).toBe('stable-lead');expect(retried.id).toBe(first.id)
 expect(retried.raw.raw_enquiry_payload).toEqual(first.raw.raw_enquiry_payload)
 expect(database.leads.size).toBe(1)
 expect(database.fetch.mock.calls.map(([,options])=>options.method)).toEqual(['POST','GET','POST','GET'])
})
it('reports the database error when an insert fails without a matching saved lead',async()=>{
 const database=landlordLeadClient({insertError:{code:'42501',message:'Permission denied for landlord lead'}})
 const discovery={profile:{name:'Owner'},portfolio:[{address:'12 Road'}]}
 await expect(createListingLandlordLead(listing,{id:'contact-1'},discovery,{leadId:'stable-lead',organisationId:'org-1'},database.client)).rejects.toThrow('Permission denied for landlord lead')
 expect(database.fetch).toHaveBeenCalledTimes(2)
})
it.each(['contact','role','listing'])('rejects a saved lead with an unrelated %s when recovering an acknowledgement',async(mismatch)=>{
 const database=landlordLeadClient({loseAcknowledgement:true,readback:rows=>rows.map(row=>({
   ...row,contact_id:mismatch==='contact' ? 'other-contact' : row.contact_id,
   raw_enquiry_payload:{...row.raw_enquiry_payload,...(mismatch==='role' ? {role:'tenant'} : {}),...(mismatch==='listing' ? {relationships:{listingId:'other-listing'}} : {})},
 }))})
 const discovery={profile:{name:'Owner'},portfolio:[{address:'12 Road'}]}
 await expect(createListingLandlordLead(listing,{id:'contact-1'},discovery,{leadId:'stable-lead',organisationId:'org-1'},database.client)).rejects.toThrow('Acknowledgement lost')
})
it('loads the explicitly saved rental landlord connection and rejects ambiguous or unavailable connections',async()=>{
 const first={id:'first',role:'landlord',relationships:{listingId:'listing-1'}}
 const second={id:'second',role:'landlord',relationships:{listingId:'listing-1'}}
 const dependencies={listContacts:async()=>[],listLeads:async()=>[first,second],requestOnboarding:async()=>({onboarding:{...capable,version:1,status:'draft'}})}
 const scope={organisationId:'org-1'}
 expect((await loadListingLandlordSetup({...listing,sellerCanonicalFacts:{landlordLeadId:'second'}},scope,dependencies)).linkedLead.id).toBe('second')
 await expect(loadListingLandlordSetup(listing,scope,dependencies)).rejects.toThrow('More than one landlord')
 await expect(loadListingLandlordSetup({...listing,sellerCanonicalFacts:{landlordLeadId:'missing'}},scope,dependencies)).rejects.toThrow('unavailable')
})
