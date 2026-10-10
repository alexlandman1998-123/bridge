import { createClient } from '@supabase/supabase-js'
import { createProperty24ApiResponse } from '../property24/api.js'
import { createPrivatePropertyApiResponse } from '../private-property/api.js'

const rpc = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}
export function publicationJobClient(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Publishing service is unavailable.')
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function dispatchPublicationJob(job, { client, env = process.env, property24 = createProperty24ApiResponse, privateProperty = createPrivatePropertyApiResponse } = {}) {
  const actor = await client.auth.admin.getUserById(job.requested_by)
  if (actor.error || !actor.data?.user?.id) return { status: 403, body: { message: 'Publishing access is no longer available.' } }
  if (job.channel === 'agency_website') {
    const projection = await client.from('listing_publication_data').update({ status: 'Published' }).eq('listing_id', job.listing_id).select('listing_id').single()
    if (projection.error || !projection.data) return { status: 422, body: { message: 'Save website marketing details before publishing.' } }
    const own = await rpc(client, 'listing_publication_website_context', { p_job: job.id, p_claim: job.claim_id, p_partner: false })
    const partner = !own.status?.websiteSiteId
    const { data, error } = await client.functions.invoke(partner ? 'website-partner-listing-publication' : 'website-listing-publication', {
      body: { listingId: job.listing_id, action: 'publish', publicationJobId: job.id, publicationClaimId: job.claim_id },
    })
    if (error) throw error // Transport failure may follow a successful publish.
    return { status: data?.error ? 422 : 200, body: data || {} }
  }
  const listing = await client.from('private_listings').select('listing_category').eq('id', job.listing_id).single()
  if (listing.error) throw listing.error
  const rental = listing.data?.listing_category === 'rental'
  // Reuse browser API authorization and all existing provider checks with a
  // server-resolved actor. This in-process adapter never accepts a user ID from
  // the browser and never stores a bearer token in the job.
  const actorClient = new Proxy(client, { get(target, key) {
    if (key === 'auth') return { ...target.auth, getUser: async () => actor }
    const value = Reflect.get(target, key)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  const expiry = new Date(); expiry.setUTCDate(expiry.getUTCDate() + 90)
  const p24 = job.channel === 'property24'
  return (p24 ? property24 : privateProperty)({
    method: 'POST',
    url: p24 ? `/api/property24/${rental ? 'rentals' : 'listings'}/${job.listing_id}/publish` : `/api/private-property/listings/${job.listing_id}/publish`,
    headers: { authorization: `Bearer ${job.id}` },
    body: p24 ? { environment: 'production', photosChanged: true, expiryDate: expiry.toISOString().slice(0, 10) }
      : { environment: 'production', photosChanged: true, confirm: `PRIVATE_PROPERTY_PUBLISH:${job.listing_id}:production` },
    env, dependencies: { createSupabase: () => actorClient },
  })
}

export function publicationJobOutcome(response) {
  const body = response.body || {}
  const status = String(body.status || body.report?.status || '').toUpperCase()
  if (status === 'UNCERTAIN' || response.status >= 500) return { state: 'uncertain', message: 'Submission could not be confirmed. Check the channel before submitting again.' }
  if (response.status >= 400 || ['BLOCKED','FAILED','REJECTED'].includes(status)) return { state: 'failed', message: String(body.message || body.report?.nextStep || body.error || 'Channel needs attention.').slice(0, 800) }
  return { state: 'accepted', message: 'Submitted. Waiting for the channel to confirm it is live.' }
}

export async function runListingPublicationJobs({ client = publicationJobClient(), listingId = null, env = process.env, dispatch = dispatchPublicationJob } = {}) {
  const jobs = await rpc(client, 'claim_listing_publications', { p_listing_id: listingId })
  const completed = await Promise.allSettled((jobs || []).map(async job => {
    const startedAt = Date.now()
    if (!await rpc(client, 'begin_listing_publication_dispatch', { p_job: job.id, p_claim: job.claim_id })) return { id: job.id, state: 'cancelled' }
    let outcome
    try { outcome = publicationJobOutcome(await dispatch(job, { client, env })) }
    catch { outcome = publicationJobOutcome({ status: 503 }) }
    const result = await client.from('listing_publication_jobs').update({ ...outcome, updated_at: new Date().toISOString() })
      .eq('id', job.id).eq('claim_id', job.claim_id).eq('state', 'dispatching').select('id').single()
    if (result.error || !result.data) throw new Error('Publication receipt could not be saved.')
    const label = { property24: 'Property24', private_property: 'Private Property', agency_website: 'Agency Website' }[job.channel]
    await client.from('private_listing_activity').insert({ private_listing_id: job.listing_id, performed_by: job.requested_by,
      activity_type: `listing_channel_publication_${outcome.state}`, activity_title: `${label} publication ${outcome.state}`, visibility: 'internal',
      metadata: { queueWaitMs: Math.max(0, startedAt - Date.parse(job.created_at)), processingMs: Date.now() - startedAt, channel: label, channelKey: job.channel, action: 'publish', publicationJobId: job.id, ...(outcome.state === 'accepted' ? { acceptedAt: new Date().toISOString() } : { error: outcome.message }) },
    })
    return { id: job.id, state: outcome.state }
  }))
  return completed.map((result, index) => result.status === 'fulfilled' ? result.value : { id: jobs[index].id, state: 'receipt_unconfirmed' })
}
