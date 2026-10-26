import { expect, it } from 'vitest'
import { cleanListingBuilder, justListedSource } from '../justListedCampaignModel'
import { cleanPropertyBuilder, PROPERTY_CAMPAIGNS } from '../listingCampaignContract'
import { projectPropertySource, propertyCampaignCopy, propertyCampaignGaps, propertyCampaignPayload } from '../listingCampaignModel'
import { checkedPropertyPack, propertyPackText } from '../propertyCampaignPackModel'
const id = n => `${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`
const source = { title:'Private property headline',price:'R 1 250 000',location:'99 Exact Road, Gardens',facts:'3 bedrooms',description:'Private marketing description',agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA',imageId:'cover' }
const current = { source,publicArea:'Gardens',agentId:'',listingId:id(1),images:[{id:'cover',url:'https://example.test/cover.jpg'}] }
const settings = { publicationConfirmed:true,priceConfirmed:true,date:'2099-11-20',startTime:'10:00',endTime:'12:00',feature:'3 bedrooms' }
const build = (template, additional=[]) => cleanPropertyBuilder({version:2,template,listingId:id(1),agentId:'',source:projectPropertySource(template,current,settings),settings,additionalListings:additional})
const campaign = builder => ({id:'plan',status:'draft',revision:1,name:'Property campaign',listing_builder:builder,channel_content:propertyCampaignCopy(builder)})
it('supports six new template families and preserves version-one cleaning', () => {
 expect(Object.keys(PROPERTY_CAMPAIGNS)).toHaveLength(6)
 expect(cleanListingBuilder({version:1,template:'new-listing',listingId:id(1),source}).version).toBe(1)
 expect(cleanListingBuilder(build('property-spotlight')).version).toBe(2)
})
it('keeps Coming Soon title, price, photos, facts and full address out of the saved draft by default', () => {
 const builder=build('coming-soon'), payload=propertyCampaignPayload(builder,propertyCampaignCopy(builder))
 expect(JSON.stringify(payload)).not.toMatch(/99 Exact Road|Private property headline|Private marketing description|1 250 000|3 bedrooms|"imageId":"cover"/)
 expect(payload.listing_builder.source.location).toBe('Gardens')
 const pack=checkedPropertyPack(campaign(builder),[current])
 expect(pack.allowNoPhoto).toBe(true)
 expect(pack.images).toEqual([])
 expect(pack.designs).toHaveLength(3)
})
it('reveals only explicitly selected teaser details and rejects a stored unapproved price', () => {
 const allowed=projectPropertySource('coming-soon',current,{...settings,revealTitle:true,revealPhotos:true})
 expect(allowed.title).toBe(source.title);expect(allowed.imageId).toBe('cover');expect(allowed.price).toBe('')
 expect(()=>cleanPropertyBuilder({...build('coming-soon'),source})).toThrow(/unapproved/)
})
it('never substitutes the street address when a restricted campaign has no public area', () => {
 for (const template of ['coming-soon', 'just-sold']) {
  const projected = projectPropertySource(template, {...current, publicArea:''}, settings)
  expect(projected.location).toBe('')
  expect(projected.title).not.toContain('99 Exact Road')
  expect(propertyCampaignGaps({...build(template),source:projected}).length).toBeGreaterThan(0)
 }
})
it('requires price confirmation and never invents old prices or discounts', () => {
 const builder=build('price-reduced')
 expect(propertyCampaignGaps({...builder,settings:{...builder.settings,priceConfirmed:false}}).join(' ')).toContain('Confirm the reduced')
 expect(propertyCampaignCopy(builder).social.body).not.toMatch(/was|save \d|%/i)
 expect(propertyCampaignGaps({...builder,source:{...source,price:'Price on application'}}).length).toBeGreaterThan(0)
})
it('checks real dates, future South African event times, and saved event changes', () => {
 const builder=build('show-day')
 expect(propertyCampaignGaps(builder)).toEqual([])
 for(const changed of [{date:'2026-02-30'},{date:'2020-01-01'},{startTime:'25:00'},{endTime:'09:00'}]) expect(propertyCampaignGaps({...builder,settings:{...builder.settings,...changed}}).length).toBeGreaterThan(0)
 const withEvent={...builder,settings:{...builder.settings,eventId:id(9)}}
 expect(()=>checkedPropertyPack(campaign(withEvent),[current])).toThrow(/show day changed/)
 const event={listingId:id(1),date:'2099-11-20',startTime:'10:00',endTime:'12:00'}
 expect(checkedPropertyPack(campaign(withEvent),[current],event).designs).toHaveLength(7)
})
it('accepts three to six distinct collection members and revalidates every one', () => {
 const additional=[2,3].map(n=>({listingId:id(n),agentId:'',source:{...source,title:`Property ${n}`}}))
 const builder=build('property-collection',additional), currents=[current,...additional.map(item=>({...current,listingId:item.listingId,source:item.source}))]
 expect(propertyCampaignGaps(builder)).toEqual([])
 expect(checkedPropertyPack(campaign(builder),currents).designs).toHaveLength(6)
 expect(propertyCampaignCopy(builder).email.body).toContain('Property 3')
 expect(propertyCampaignCopy(builder).whatsapp.body.length).toBeLessThan(1024)
 expect(()=>checkedPropertyPack(campaign(builder),[current,currents[1],{...currents[2],source:{...source,price:'Changed'}}])).toThrow(/changed/)
 expect(()=>build('property-collection',[{listingId:id(1),source}])).toThrow(/distinct/)
 expect(propertyCampaignGaps(build('property-collection')).join(' ')).toContain('three to six')
})
it('omits sale/asking prices, result claims and private locations from sold campaigns', () => {
 const builder=build('just-sold'), payload=propertyCampaignPayload(builder,propertyCampaignCopy(builder))
 expect(payload.goal).toBe('seller_leads')
 expect(JSON.stringify(payload)).not.toMatch(/1 250 000|99 Exact Road|Private marketing description/)
 expect(propertyCampaignGaps({...builder,settings:{...builder.settings,publicationConfirmed:false}}).length).toBeGreaterThan(0)
 expect(checkedPropertyPack(campaign(builder),[current]).designs).toHaveLength(7)
})
it('creates a complete four-frame spotlight storyboard even with one available photo', () => {
 const pack=checkedPropertyPack(campaign(build('property-spotlight')),[current])
 expect(propertyPackText(pack)['video-storyboard.txt'].split('\n')).toHaveLength(4)
 expect(propertyPackText(pack)['video-storyboard.txt']).toContain('Arrange a viewing')
})
