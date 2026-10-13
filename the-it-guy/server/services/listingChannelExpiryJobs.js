import { publicationJobClient } from './listingPublicationJobs.js'
import { createProperty24ApiResponse } from '../property24/api.js'
import { createPrivatePropertyApiResponse } from '../private-property/api.js'

const labels = { property24: 'Property24', private_property: 'Private Property', agency_website: 'Agency Website', kingdom_website: 'Kingdom Website' }
export function listingExpiryOutcome(response, action) {
  const body = response.body || {}
  if (response.status >= 500 || body.status === 'UNCERTAIN') return { state: action === 'update' ? 'update_uncertain' : 'expiry_uncertain', message: 'The channel response is uncertain. Check the advert before sending again.' }
  const accepted = action === 'update' ? body.status === 'SUBMITTED' : response.website ? body.publication?.status === 'unpublished' : response.channel === 'property24' ? body.status === 'SUBMITTED' : body.update?.status === 'UPDATED'
  if (response.status >= 400 || !accepted) return { state: action === 'update' ? 'update_failed' : 'expiry_failed', message: 'The channel has not accepted this expiry change. Check its status and requirements.' }
  return { state: action === 'update' ? 'scheduled' : 'expired', message: action === 'update' ? 'Portal accepted the expiry date. Removal is scheduled for the end of that day.' : 'Channel accepted removal. Check the public advert to confirm.' }
}
export async function dispatchListingExpiry(job, { client, env = process.env, property24 = createProperty24ApiResponse, privateProperty = createPrivatePropertyApiResponse } = {}) {
  const actor = await client.auth.admin.getUserById(job.requested_by)
  if (actor.error || !actor.data?.user?.id) return { status: 403, body: {} }
  if (['agency_website', 'kingdom_website'].includes(job.channel)) {
    const { data, error } = await client.functions.invoke(job.channel === 'kingdom_website' ? 'website-partner-listing-publication' : 'website-listing-publication', { body: { listingId: job.listing_id, action: 'unpublish', expiryJobId: job.id, expiryClaimId: job.claim_id } })
    return { status: error ? 503 : 200, website: true, body: data || {} }
  }
  const listing = await client.from('private_listings').select('listing_category,listing_status').eq('id', job.listing_id).single()
  if (listing.error) throw listing.error
  const actorClient = new Proxy(client, { get(target, key) {
    if (key === 'auth') return { ...target.auth, getUser: async () => actor }
    const value = Reflect.get(target, key)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  const p24 = job.channel === 'property24'
  const updating = job.state === 'updating'
  const result = await (p24 ? property24 : privateProperty)({ method: 'POST', headers: { authorization: `Bearer ${job.id}` },
    url: p24 ? `/api/property24/${listing.data?.listing_category === 'rental' ? 'rentals' : 'listings'}/${job.listing_id}/${updating ? 'publish' : 'status-update'}` : `/api/private-property/listings/${job.listing_id}/${updating ? 'publish' : 'status-update'}`,
    body: updating ? { environment: 'production', expiryDate: job.expiry_date, photosChanged: false, ...(p24 ? { status: listing.data?.listing_status === 'under_offer' ? 'Pending' : 'Active' } : { confirm: `PRIVATE_PROPERTY_PUBLISH:${job.listing_id}:production` }) }
      : p24 ? { environment: 'production', status: 'Expired' } : { environment: 'production', propertyStatus: 'Inactive' },
    env, dependencies: { createSupabase: () => actorClient },
  })
  return { ...result, channel: job.channel }
}
export async function runListingChannelExpiryJobs({ client = publicationJobClient(), env = process.env, dispatch = dispatchListingExpiry } = {}) {
  const claim = await client.rpc('claim_listing_channel_expiries')
  if (claim.error) throw claim.error
  const results = await Promise.allSettled((claim.data || []).map(async job => {
    const action = job.state === 'updating' ? 'update' : 'expire'
    let outcome
    try { outcome = listingExpiryOutcome(await dispatch(job, { client, env }), action) }
    catch { outcome = listingExpiryOutcome({ status: 503 }, action) }
    const receipt = await client.from('listing_channel_expiries').update({ ...outcome, updated_at: new Date().toISOString() }).eq('id', job.id).eq('claim_id', job.claim_id).eq('state', job.state).select('id').single()
    if (receipt.error || !receipt.data) throw new Error('Expiry receipt could not be saved.')
    const activity = await client.from('private_listing_activity').insert({ private_listing_id: job.listing_id, performed_by: job.requested_by, visibility: 'internal', activity_type: 'listing_channel_expiry_result', activity_title: `${labels[job.channel]} listing expiry`, metadata: { channel: labels[job.channel], channelKey: job.channel, action: 'expiry', expiryDate: job.expiry_date, expiryState: outcome.state, detail: outcome.message } })
    if (activity.error) throw activity.error
    return { channel: job.channel, ...outcome }
  }))
  return results.map((result, index) => result.status === 'fulfilled' ? result.value : { channel: claim.data[index].channel, state: 'receipt_unconfirmed' })
}
