import { expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient',()=>({supabase:null,isSupabaseConfigured:false}))
import { buildListingLandlordDiscovery, listingLandlordOnboardingProgress, listingLandlordValues } from '../rentalListingLandlordModel'
it('prefers persisted landlord fields over an older capture draft and seeds this exact existing property',()=>{
 const listing={id:'listing-1',addressLine1:'12 Sample Road',listingCategory:'rental',sellerCanonicalFacts:{landlordName:'Current owner',landlordEmail:'current@example.test',landlordType:'trust',rentalCaptureDraft:{version:1,form:{landlordName:'Old owner',propertyAddress:'12 Sample Road',monthlyRent:15000}}}}
 expect(listingLandlordValues(listing)).toMatchObject({landlordName:'Current owner',landlordEmail:'current@example.test',landlordType:'trust'})
 const discovery=buildListingLandlordDiscovery(listing)
 expect(discovery.profile.name).toBe('Current owner')
 expect(discovery.portfolio[0]).toMatchObject({id:'listing-listing-1',listingId:'listing-1',address:'12 Sample Road',expectedMonthlyRent:15000})
 expect(discovery.profile).not.toHaveProperty('declarationAccepted')
})
it('uses saved onboarding as the profile source, including intentionally empty fields',()=>{
 const listing={sellerCanonicalFacts:{landlordName:'Legacy name',landlordEmail:'legacy@example.test'}}
 expect(listingLandlordValues(listing,{data:{profile:{name:'Onboarding owner',email:''}}})).toMatchObject({landlordName:'Onboarding owner',landlordEmail:''})
})
it('shows details captured separately from approved current evidence and limits property documents to this listing',()=>{
 const data={profile:{name:'Owner',type:'individual',email:'owner@example.test'},portfolio:[{id:'property-1',listingId:'listing-1',address:'12 Road'}]}
 const rows=[
   {id:'disclosure',purpose:'property_disclosure',scopeKey:'property:property-1',active:true,mode:'preview',state:'accepted',documentId:'file-1',generation:2},
   {id:'supporting',purpose:'right_to_let',scopeKey:'property:property-1',active:true,required:true,mode:'preview',state:'accepted',generation:1},
   {id:'other-disclosure',purpose:'property_disclosure',scopeKey:'property:other',active:true,required:true,state:'missing',generation:1},
 ]
 const file={id:'file-1',requirement_id:'disclosure',generation:2,status:'accepted',completed_signed:true}
 const current=listingLandlordOnboardingProgress({data,requirements:rows,documents:[file]},'listing-1')
 expect(current).toMatchObject({captured:3,total:3,percent:100,documents:{approved:1,total:1}})
 expect(listingLandlordOnboardingProgress({data,requirements:rows,documents:[{...file,generation:1}]},'listing-1').documents.approved).toBe(0)
 expect(listingLandlordOnboardingProgress({data,requirements:rows,documents:[{...file,completed_signed:false}]},'listing-1').documents.approved).toBe(0)
 expect(listingLandlordOnboardingProgress({data,requirements:[{...rows[0],expiresAt:'2020-01-01'}],documents:[file]},'listing-1').documents.approved).toBe(0)
})
