import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createProperty24ListingPlan,resolveProperty24Status } from '../services/property24ListingMapper.js'
import { createPrivatePropertyListingPlan } from '../services/privatePropertyListingMapper.js'
import { createProperty24RentalListingPlan } from '../services/property24RentalListingAdapter.js'
import { RENTAL_LISTING_RELEASE_GATE_FIXTURE } from '../../src/services/rentals/rentalListingReleaseGateModel.js'
import { priceUpdateProperty24Status,publishListingPriceUpdate } from '../../src/services/listings/listingPriceUpdate.js'
import { buildRentalListingEditForm } from '../../src/services/rentals/rentalListingEditModel.js'
import { buildRentalPublicationSnapshot } from '../../src/services/rentals/rentalListingChannelModel.js'
const listing={id:'fixture',listing_status:'under_offer',listing_type:'Sale',title:'Family home with a spacious garden',asking_price:1000000,property_type:'House',street_name:'Test Street',street_number:'1',bedrooms:3,bathrooms:2}
const publication={title:listing.title,listing_type:'Sale',asking_price:900000,description:'A family home with generous rooms, a garden and plenty of secure parking. Contact the agent to arrange a viewing.',features:['reduced_banner']}
const media=[1,2,3].map(id=>({media_type:'image',file_url:`https://images.test/${id}.jpg`,sort_order:id}))
test('Property24 uses its documented price and update status values, preserving under-offer state',()=>{
 const doc=JSON.parse(readFileSync(new URL('../../../docs/property24-integration-brief-2026-10-26/public-documentation/listing-service-v56.json',import.meta.url),'utf8'))
 const statuses=(doc.components?.schemas||doc.definitions).ListingStatus.enum
 for(const [status,expected] of [['active','ReducedPrice'],['under_offer','Pending']]){
  const desired=priceUpdateProperty24Status({listingStatus:status,previousPrice:1000000,price:900000,showReducedBanner:true})
  assert(statuses.includes(desired))
  const plan=createProperty24ListingPlan({listing:{...listing,listing_status:status},publication,media,agentMapping:{property24AgentId:77959},catalogMapping:{suburbId:5864,propertyTypeId:4},options:{agencyId:31382,listingNumber:123456,expiryDate:'2026-12-31',status:desired,photosChanged:false}})
  assert.equal(plan.summary.price,900000);assert.equal(plan.summary.status,expected)
 }
 assert.equal(resolveProperty24Status('RaisedPrice',{isNew:false}),'RaisedPrice')
})
test('Private Property receives its schema Price field without an unsupported reduced flag or altered PendingOffer status',()=>{
 const plan=createPrivatePropertyListingPlan({listing,publication,media,agentMapping:{privatePropertyAgentId:'API-AGENT-1'},options:{branchGuid:'11111111-1111-4111-8111-111111111111',propertyId:'CURRENT-ADVERT',suburbId:'140'}})
 assert.equal(plan.payload.price,900000);assert.equal(plan.payload.propertyStatus,'PendingOffer')
 assert.match(plan.listingXml,/<Price>900000<\/Price>/)
 assert.doesNotMatch(plan.listingXml,/<(?:Reduced|PriceReduced|ReducedPrice)>/)
 const schema=readFileSync(new URL('../../../docs/private-property-integration-brief-2026-10-26/public-documentation/listing-service.xsd',import.meta.url),'utf8')
 assert.match(schema,/name="Price" type="s:double"/)
})
test('rental publication maps the new monthly price and explicit ReducedPrice status without changing photos',()=>{
 const rental={...RENTAL_LISTING_RELEASE_GATE_FIXTURE,askingPrice:18000,asking_price:18000,sellerCanonicalFacts:{...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts,rentalInfo:{...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts.rentalInfo,monthlyRent:18000}}}
 const plan=createProperty24RentalListingPlan({listing:rental,agentMapping:{property24AgentId:77959},catalogMapping:{suburbId:5864,propertyTypeId:4},options:{agencyId:31382,listingNumber:123456,expiryDate:'2026-12-31',status:'ReducedPrice',photosChanged:false}})
 assert.equal(plan.summary.price,18000);assert.equal(plan.summary.status,'ReducedPrice')
})

test('the rental price controller saves before sending all published channels and refreshes without unmounting the receipt',async()=>{
 const calls=[]
 const rental={id:'rental-price',listingType:'Rental',listingStatus:'active',askingPrice:20000,listingPublicationData:{features:['Private garden']},listingMedia:[]}
 const context={listing:rental,listingId:rental.id,organisationId:'org',assignedAgentId:'agent',rentalScope:{organisationId:'org'},editOpen:false,
  listingMutationRef:{current:false},portalActionRef:{current:false},portalSubmissionRef:{current:false},mountedRef:{current:true},
  portalChannels:[{key:'property24',reference:'123456',status:'active'},{key:'private_property',reference:'pp-123',status:'active'}],
  publishListingPriceUpdate,priceUpdateProperty24Status,buildRentalListingEditForm,buildRentalPublicationSnapshot,
  setSavingEdit(){},setListing(){},setEditForm(){},
  getWebsiteListingPublicationStatus:async()=>({status:'published'}),getKingdomWebsitePublicationStatus:async()=>({status:'published'}),requireSettledListingPublication:async()=>{},
  updateRentalListingDraft:async(_id,form)=>{calls.push(['save',form]);return {listing:{...rental,askingPrice:Number(form.monthlyRent)},publicationResult:{skipped:false}}},
  createPrivateListingActivity:async()=>({id:'event'}),recordRentalPublicationEvent:async()=>({id:'event'}),
  publishRentalProperty24Listing:async(_id,options)=>{calls.push(['Property24',options]);return {status:'SUBMITTED'}},
  publishPrivatePropertyRentalListing:async()=>{calls.push(['Private Property']);return {status:'SUBMITTED'}},
  setWebsiteListingPublication:async()=>{calls.push(['Agency Website']);return {status:'published'}},setKingdomWebsitePublication:async()=>{calls.push(['Kingdom Website']);return {status:'published'}},
  loadListing:async(options)=>{calls.push(['refresh',options])},
 }
 vm.createContext(context)
 const source=readFileSync(new URL('../../src/pages/rentals/RentalListingDetailPage.jsx',import.meta.url),'utf8')
 const controller=source.slice(source.indexOf('  async function saveAndPublishRentalPrice('),source.indexOf('  async function recordWebsiteEvent('))
 vm.runInContext(`${controller}; this.savePrice=saveAndPublishRentalPrice`,context)
 const outcome=await context.savePrice({previousPrice:20000,price:18000,showReducedBanner:true,retryResults:[]})
 assert.equal(outcome.ok,true)
 assert.equal(calls[0][0],'save');assert.equal(calls[0][1].monthlyRent,'18000');assert.equal(calls[0][1].showReducedBanner,true)
 assert.equal(calls.find(row=>row[0]==='Property24')[1].status,'ReducedPrice')
 assert.equal(calls.find(row=>row[0]==='Property24')[1].photosChanged,false)
 assert.deepEqual(calls.filter(row=>row[0]!=='save'&&row[0]!=='refresh').map(row=>row[0]),['Property24','Private Property','Agency Website','Kingdom Website'])
 assert.equal(calls.at(-1)[1].background,true)
 assert.equal(context.listingMutationRef.current,false)
})
