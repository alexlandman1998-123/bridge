import { buildProperty24ListingSubmitPlan, buildProperty24RentalListingSubmitPlan } from '../../server/property24/publishService.js'
import { buildSubmitPreview } from '../../server/services/privatePropertyControlledPublishService.js'
import { listingCase } from './listingDiagnosticCases.mjs'

export function photoDiagnostic(category, mode, channel) {
  const fixture = listingCase(category, mode)
  fixture.listing.listing_category = mode === 'rental' ? 'rental' : 'private_sale'
  const branchGuid = '11111111-1111-4111-8111-111111111111'
  const state = { fixture, sync: {}, calls: [] }
  const client = { from(table) {
    state.calls.push(table)
    const data = () => table === 'private_listings' ? fixture.listing : table === 'listing_publication_data' ? fixture.publication : table === 'listing_media' ? fixture.media : table.endsWith('_syncs') ? state.sync : null
    const q = { select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:data()}),then(resolve){return Promise.resolve({data:data()}).then(resolve)} }
    return q
  } }
  state.build = (options = {}) => channel === 'property24'
    ? (mode === 'rental' ? buildProperty24RentalListingSubmitPlan : buildProperty24ListingSubmitPlan)({
      supabase: client, listingId: fixture.listing.id, agencyId: 31382, agentId: 77959, agentSourceReference: 'fixture-agent',
      suburbId: 12345, expiryDate: fixture.expiry, environment: 'production', photosChanged: 'auto', loadImageBytes: false, ...options,
    })
    : buildSubmitPreview({ client, listingId: fixture.listing.id, readiness: {
      environment: 'production', agencyConfig: { branchGuid }, agentMapping: { privatePropertyAgentId: 'FIXTURE' },
    }, overrides: { suburbId: '12345', ...options } })
  state.accept = plan => { state.sync = { agency_id: 31382, listing_number: 1234567, branch_guid: branchGuid,
    property_id: plan.summary.propertyId, environment: 'production', external_status: 'active', last_payload_summary: { ...plan.summary, photoListingNumber: '1234567' } } }
  state.photos = plan => channel === 'property24' ? plan.payload?.photos : plan.payloadPreview?.photoUrls
  state.bytes = plan => Buffer.byteLength(channel === 'property24' ? JSON.stringify(plan.payload) : plan.listingXml)
  return state
}
