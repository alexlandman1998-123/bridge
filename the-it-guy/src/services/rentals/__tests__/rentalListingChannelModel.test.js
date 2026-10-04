import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRentalPortalChannels, buildRentalPublicationSnapshot, buildRentalWebsitePublicationStates, RENTAL_PORTAL_STATUSES } from '../rentalListingChannelModel.js'
const listing = { id:'rental-1',title:'Rental home',askingPrice:9000,listingMedia:[] }
const event = (type, channel, metadata={}) => ({activity_type:type,created_at:'2026-10-04T10:00:00Z',metadata:{channel,...metadata}})
test('acceptance and references do not invent a live public page', () => {
 const channels = buildRentalPortalChannels(listing,{activity:[event('listing_channel_publication_accepted','property24',{reference:'12345'})]})
 assert.equal(channels[0].reference,'12345'); assert.equal(channels[0].live,false); assert.equal(channels[0].publicUrl,'')
 assert.equal(channels[0].activity[0].label,'Accepted')
})
test('shows a withdrawal contradiction when the portal still reports live', () => {
 const channel = buildRentalPortalChannels(listing,{property24:{lifecycle:{state:'withdrawn',isOnPortal:true,listingNumber:'123',property24ListingUrl:'https://www.property24.com/to-rent/demo/123'}},activity:[event('listing_channel_withdrawal_succeeded','property24')]})[0]
 assert.equal(channel.statusLabel,'Still reported live'); assert.equal(channel.live,true); assert.ok(channel.publicUrl)
})
test('uses a manually verified valid URL and tracks later saved changes', () => {
 const activity=[event('listing_channel_publication_verified','private_property',{publicUrl:'https://www.privateproperty.co.za/to-rent/demo/R123',snapshot:buildRentalPublicationSnapshot(listing)})]
 const channel=buildRentalPortalChannels({...listing,title:'Changed rental'},{activity})[1]
 assert.equal(channel.live,true); assert.match(channel.publicUrl,/R123$/); assert.match(channel.statusDetail,/saved change/)
 const inactive=buildRentalPortalChannels(listing,{activity,private_property:{monitor:{externalStatus:'inactive',generatedAt:'2026-10-04T11:00:00Z'}}})[1]
 assert.equal(inactive.live,false); assert.equal(inactive.publicUrl,'')
})
test('keeps portal and history failures visible without losing the other channel', () => {
 const channels=buildRentalPortalChannels(listing,{errors:{property24:'Access denied'},private_property:{monitor:{externalStatus:'active',statusProbe:{privatePropertyRef:'R23'}}}})
 assert.equal(channels[0].statusLabel,'Status unavailable'); assert.equal(channels[0].error,'Access denied'); assert.equal(channels[1].reference,'R23'); assert.equal(channels[1].live,true)
})
test('website histories remain separate and compare rental snapshots', () => {
 const states=buildRentalWebsitePublicationStates({...listing,title:'Updated'},[event('listing_channel_publication_accepted','kingdom_website',{snapshot:buildRentalPublicationSnapshot(listing)})])
 assert.equal(states.agency_website.stage,'not_published'); assert.equal(states.kingdom_website.stage,'accepted'); assert.ok(states.kingdom_website.changeCount)
 assert.deepEqual(RENTAL_PORTAL_STATUSES.private_property,['ToLet','Inactive'])
})
test('retains older snake-case references and public link fields', () => {
 const channel=buildRentalPortalChannels({...listing,publicationData:{private_property_status:'active',private_property_reference:'R789',private_property_listing_url:'https://www.privateproperty.co.za/to-rent/demo/R789'}})[1]
 assert.equal(channel.reference,'R789'); assert.equal(channel.live,true); assert.match(channel.publicUrl,/R789$/)
})
test('a stored negative portal response overrides a stale active status', () => {
 const channel=buildRentalPortalChannels(listing,{property24:{lifecycle:{state:'active',isOnPortal:false,listingNumber:'123'}}})[0]
 assert.equal(channel.live,false); assert.equal(channel.publicUrl,''); assert.equal(channel.statusLabel,'Not currently reported live')
})
