import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { rentalLandlordProfileDatabase, seedRentalLandlordProfile, actor, org, owner } from './fixtures/rentalLandlordProfileDatabase.js'
import { handleRentalLandlordOnboarding } from '../services/rentalLandlordOnboardingApi.js'
import { rentalOnboardingClient } from './fixtures/rentalOnboardingClient.js'
let db
beforeAll(async()=>{db=await rentalLandlordProfileDatabase()},20000)
afterAll(async()=>{await db?.close()})
const seed=options=>seedRentalLandlordProfile(db,options)

const save=async(item,profile,options={})=>(await db.query("select rental_landlord_onboarding_command($1,$2,'save',$3,$4,$5,$6) result",[item.id,options.version??item.snapshot.version,JSON.stringify({profile,expectedDiscovery:{profile:item.profile,portfolio:item.listings.map((listingId,i)=>({id:`home-${i}`,address:'Saved road',listingId}))}}),JSON.stringify({organisation_id:options.org||org}),options.source||'agent',options.source==='landlord'?null:actor])).rows[0].result
const savedProfile=async item=>{const raw=(await db.query('select raw_enquiry_payload from leads where lead_id=$1',[item.id])).rows[0].raw_enquiry_payload;return (raw.rentalCrm||raw).landlordProfile}
const asOwner=async(work,id=owner)=>db.transaction(async tx=>{await tx.query("select set_config('test.actor',$1,true)",[id]);await tx.exec('set local role authenticated');return work(tx)})
async function linkedJourney(item,type=item.profile.type) {
  const id=randomUUID(),profile={...item.profile,type,notes:'Other journey private details'}
  await db.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,raw_enquiry_payload) values($1,$2,$3,$4,$5)',[id,org,item.contact,actor,JSON.stringify({role:'landlord',classification:'rental',landlordProfile:profile,landlordPortfolio:[]})])
  await db.query('insert into rental_landlord_onboarding(lead_id,organisation_id) values($1,$2)',[id,org])
  return {id,profile}
}

it.each([true,false])('atomically saves/reopens profile, exact Client/contact, both listings and capture drafts (nested=%s)',async nested=>{
  const item=await seed({nested}),profile={...item.profile,name:'Updated Company',email:`updated-${item.id}@example.test`,phone:'0839876543'}
  expect((await save(item,profile)).consistency).toEqual({synced:true})
  expect(await savedProfile(item)).toEqual(profile)
  const contact=(await db.query('select * from contacts where contact_id=$1',[item.contact])).rows[0]
  expect(contact).toMatchObject({first_name:'Updated',last_name:'Company',email:profile.email,phone:profile.phone})
  const client=(await db.query('select * from agency_client_profiles where id=$1',[item.client.id])).rows[0]
  expect(client).toMatchObject({id:item.client.id,name:profile.name,primary_email:profile.email,primary_phone:'27839876543'})
  expect((await db.query("select value from agency_client_identifiers where client_id=$1 and kind='email'",[client.id])).rows.map(r=>r.value)).toContain(item.profile.email)
  for(const id of item.listings){const listing=(await db.query('select * from private_listings where id=$1',[id])).rows[0];expect(listing.seller_canonical_facts_json).toMatchObject({landlordName:profile.name,landlordEmail:profile.email,landlordPhone:profile.phone,landlordType:'company',mandateStatus:'signed',privateNotes:'KEEP',rentalCaptureDraft:{version:1,form:{landlordName:profile.name,landlordEmail:profile.email,monthlyRent:'12000'}}})}
})
it('preserves explicit cleared contact details across every projection',async()=>{
  const item=await seed(),profile={...item.profile,email:'',phone:'0820000000'}
  await save(item,profile)
  expect((await db.query('select primary_email from agency_client_profiles where id=$1',[item.client.id])).rows[0].primary_email).toBeNull()
  expect((await db.query('select email from contacts where contact_id=$1',[item.contact])).rows[0].email).toBe('')
  expect((await db.query('select seller_canonical_facts_json from private_listings where id=$1',[item.listings[0]])).rows[0].seller_canonical_facts_json.landlordEmail).toBe('')
})
it('preserves repeated spaces in a captured entity name across contact and Client readbacks',async()=>{
  const item=await seed(),profile={...item.profile,name:'Updated  Company'}
  await save(item,profile)
  const row=(await db.query('select first_name,last_name from contacts where contact_id=$1',[item.contact])).rows[0]
  expect([row.first_name,row.last_name].filter(Boolean).join(' ')).toBe(profile.name)
  expect((await db.query('select name from agency_client_profiles where id=$1',[item.client.id])).rows[0].name).toBe(profile.name)
})
it('updates an exact legacy lead listing reference when the portfolio has not yet been captured',async()=>{
  const item=await seed(),listingId=item.listings[0]
  await db.exec("alter table leads add column if not exists listing_id uuid; select set_config('app.rental_landlord_onboarding','on',false)")
  await db.query("update leads set listing_id=$2,raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{rentalCrm,landlordPortfolio}','[]') where lead_id=$1",[item.id,listingId])
  await db.exec("select set_config('app.rental_landlord_onboarding','off',false)")
  item.listings=[]
  await save(item,{...item.profile,name:'Legacy reference updated'})
  expect((await db.query('select seller_canonical_facts_json from private_listings where id=$1',[listingId])).rows[0].seller_canonical_facts_json.landlordName).toBe('Legacy reference updated')
})
it('rolls back profile, Client, contact, version and first listing when the second listing update fails',async()=>{
  const item=await seed()
  await db.exec(`alter table private_listings add constraint reject_audit_name check (id<>'${[...item.listings].sort()[1]}' or seller_canonical_facts_json->>'landlordName' is distinct from 'Rejected change')`)
  try {await expect(save(item,{...item.profile,name:'Rejected change'})).rejects.toThrow('reject_audit_name')} finally {await db.exec('alter table private_listings drop constraint reject_audit_name')}
  expect(await savedProfile(item)).toEqual(item.profile)
  expect((await db.query('select name from agency_client_profiles where id=$1',[item.client.id])).rows[0].name).toBe(item.profile.name)
  expect((await db.query('select version from rental_landlord_onboarding where lead_id=$1',[item.id])).rows[0].version).toBe(item.snapshot.version)
  for(const id of item.listings) expect((await db.query('select seller_canonical_facts_json from private_listings where id=$1',[id])).rows[0].seller_canonical_facts_json.landlordName).toBe(item.profile.name)
})
it('rejects email collisions without merging clients or changing the draft',async()=>{
  const item=await seed(),other=await seed()
  await expect(save(item,{...item.profile,email:other.profile.email})).rejects.toThrow('another Client')
  expect(await savedProfile(item)).toEqual(item.profile)
  expect((await db.query('select count(*)::int count from agency_client_profiles where id in ($1,$2)',[item.client.id,other.client.id])).rows[0].count).toBe(2)
})
it('protects the server consistency receipt against ordinary metadata writes',async()=>{
  const item=await seed()
  await save(item,{...item.profile,name:'Verified Owner'})
  await expect(db.query("update leads set raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{rentalCrm,landlordProfileConsistency}','{\"version\":1}') where lead_id=$1",[item.id])).rejects.toThrow('versioned profile workflow')
  const raw=(await db.query('select raw_enquiry_payload from leads where lead_id=$1',[item.id])).rows[0].raw_enquiry_payload
  expect(raw.rentalCrm.landlordProfileConsistency.capturedCore.name).toBe('Verified Owner')
})
it('rejects a mismatched organisation or a linked listing bound to another landlord',async()=>{
  const item=await seed()
  await expect(save(item,{...item.profile,name:'Wrong'}, {org:randomUUID()})).rejects.toThrow('scope')
  await db.query("update private_listings set seller_canonical_facts_json=jsonb_set(seller_canonical_facts_json,'{landlordLeadId}',$2) where id=$1",[item.listings[0],JSON.stringify(randomUUID())])
  await expect(save(item,{...item.profile,name:'Wrong'})).rejects.toThrow('another landlord')
  expect(await savedProfile(item)).toEqual(item.profile)
})
it('updates draft landlord profiles and their listings through the existing authorised Client edit',async()=>{
  const item=await seed()
  await asOwner(tx=>tx.query('select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[item.client.id,item.client.version,'Client Edited Owner',[`client-${item.id}@example.test`],['0834567890']]))
  expect(await savedProfile(item)).toMatchObject({name:'Client Edited Owner',email:`client-${item.id}@example.test`,phone:'27834567890',registrationNumber:'KEEP',people:item.profile.people})
  expect((await db.query('select seller_canonical_facts_json from private_listings where id=$1',[item.listings[0]])).rows[0].seller_canonical_facts_json.landlordName).toBe('Client Edited Owner')
})
it('aligns another draft journey linked to the same permanent Client without losing its private facts',async()=>{
  const item=await seed(),second=await linkedJourney(item)
  await save(item,{...item.profile,name:'Shared Client Updated'})
  expect(await savedProfile(second)).toMatchObject({name:'Shared Client Updated',notes:'Other journey private details',registrationNumber:'KEEP',people:item.profile.people})
})
it('rolls back a lead save when another linked journey is submitted or uses a different legal structure',async()=>{
  const item=await seed(),second=await linkedJourney(item)
  await db.query("update rental_landlord_onboarding set status='submitted' where lead_id=$1",[second.id])
  await expect(save(item,{...item.profile,name:'Blocked rename'})).rejects.toThrow('locked')
  expect(await savedProfile(item)).toEqual(item.profile)
  await db.query("update rental_landlord_onboarding set status='draft' where lead_id=$1",[second.id])
  await db.exec("select set_config('app.rental_landlord_onboarding','on',false)")
  await db.query("update leads set raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{landlordProfile,type}','\"individual\"') where lead_id=$1",[second.id])
  await db.exec("select set_config('app.rental_landlord_onboarding','off',false)")
  await expect(save(item,{...item.profile,name:'Blocked rename'})).rejects.toThrow('different ownership types')
  expect(await savedProfile(item)).toEqual(item.profile)
})
it('allows alternative Client aliases without rewriting or unlocking an unchanged submitted profile',async()=>{
  const item=await seed()
  await db.query("update rental_landlord_onboarding set status='submitted' where lead_id=$1",[item.id])
  await asOwner(tx=>tx.query('select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[item.client.id,item.client.version,item.profile.name,[item.profile.email,`alias-${item.id}@example.test`],[item.profile.phone]]))
  expect(await savedProfile(item)).toEqual(item.profile)
  expect((await db.query('select status from rental_landlord_onboarding where lead_id=$1',[item.id])).rows[0].status).toBe('submitted')
})
it('keeps Client permissions and rolls back a Client edit when a linked onboarding is submitted',async()=>{
  const item=await seed()
  await expect(asOwner(tx=>tx.query('select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[item.client.id,item.client.version,'Denied',[item.profile.email],[item.profile.phone]]),actor)).rejects.toThrow('owner or principal')
  await db.query("update rental_landlord_onboarding set status='submitted' where lead_id=$1",[item.id])
  await expect(asOwner(tx=>tx.query('select agency_client_update($1,$2,$3,$4::text[],$5::text[])',[item.client.id,item.client.version,'Denied',[item.profile.email],[item.profile.phone]]))).rejects.toThrow('locked')
  expect((await db.query('select name from agency_client_profiles where id=$1',[item.client.id])).rows[0].name).toBe(item.profile.name)
  await expect(asOwner(tx=>tx.query("select rental_private.project_landlord_profile($1,'agent',$2)",[item.id,owner]))).rejects.toThrow('permission denied')
  await expect(asOwner(tx=>tx.query("select rental_landlord_onboarding_command($1,0,'save','{}','{}','agent',$2)",[item.id,actor]))).rejects.toThrow('permission denied')
})
it('returns confirmed consistency through the real API and rejects stale discovery without a second write',async()=>{
  const item=await seed()
  const scoped=rentalOnboardingClient(db,{},actor,true),admin=rentalOnboardingClient(db,{},actor)
  const clientFactory=(_url,key)=>key==='anon'?scoped:admin
  const request=body=>handleRentalLandlordOnboarding({method:'PATCH',headers:{Authorization:'Bearer fixture-agent'},body:{leadId:item.id,version:item.snapshot.version,expectedDiscovery:{profile:item.profile,portfolio:item.listings.map((listingId,i)=>({id:`home-${i}`,address:'Saved road',listingId}))},patch:{profile:{...item.profile,name:'API saved'}},...body},env:{SUPABASE_URL:'https://local.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'local-only'},clientFactory})
  const result=await request()
  expect(result.status,JSON.stringify(result.body)).toBe(200)
  expect(result.body.onboarding.consistency).toEqual({synced:true})
  expect(result.body.onboarding.data.profile.name).toBe('API saved')
  expect((await request()).status).toBe(409)
  expect(await savedProfile(item)).toMatchObject({name:'API saved'})
})
