import { escapePrivatePropertyXml } from '../../server/services/privatePropertyClient.js'
import { createCataloguePortal } from './private-property-location.mjs'

export function createRecoveryPortal({ propertyId, address, status = 'Inactive', afterStatus = status, reference = 'T1234567' }) {
  const calls = []
  const response = (tag, value) => ({ status: 200, data: `<${tag}>${value}</${tag}>` })
  const fields = [['streetName', 'StreetName'], ['streetNumber', 'StreetNumber'], ['complexName', 'ComplexName'], ['unitNumber', 'UnitNumber'], ['suburb', 'Suburb'], ['suburbId', 'SuburbId'], ['town', 'Town'], ['province', 'Province']]
  let current = status
  return {
    ...createCataloguePortal(), calls,
    async getListingStatus(args) { calls.push(['status', args]); return response('GetListingStatusResult', current) },
    async getListingsDetails(args) {
      calls.push(['details', args])
      return response('GetListingsDetailsResult', `<PropertyId>${escapePrivatePropertyXml(propertyId)}</PropertyId><Ref>${escapePrivatePropertyXml(reference)}</Ref>${fields.map(([key, tag]) => `<${tag}>${escapePrivatePropertyXml(address[key] ?? '')}</${tag}>`).join('')}`)
    },
    async listingStatusUpdate(args) { calls.push(['status-update', args]); current = afterStatus; return response('ListingStatusUpdateResult', 'Successful') },
    async updateListing(xml) { calls.push(['update', xml]); return response('UpdateListingResult', 'Successful') },
  }
}
