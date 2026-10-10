import { expect, it } from 'vitest'
import { getListingEditChannels } from '../listingEditChannels'
it('retains active channels but never reselects a withdrawn portal from its old reference or saved selection', () => {
 expect(getListingEditChannels({ property24Status:'withdrawn', property24Reference:'old', privatePropertyStatus:'published', privatePropertyReference:'live', externalLinks:[{platform:'Property24',status:'Published'}] },['property24','private_property'])).toEqual(['arch9_seller_experience','private_property'])
})
it('honours withdrawn external links and keeps active website publication selected', () => {
 expect(getListingEditChannels({ externalLinks:[{platform:'Private Property',status:'Withdrawn'},{platform:'Agency Website',status:'Published'}] },['private_property'])).toEqual(['arch9_seller_experience','agency_website'])
})

it('does not restore a website removed through website channel management', () => {
 expect(getListingEditChannels({bridgeListingStatus:'Published',bridgeListingPublicUrl:'https://example.test/property',websitePublication:{status:'unpublished'}},['agency_website'])).toEqual(['arch9_seller_experience'])
})
