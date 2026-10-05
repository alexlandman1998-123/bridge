import { createHash } from 'node:crypto'

const table = 'rental_publication_attempts'
export const rentalPublicationPendingMessage = 'The previous portal request has an unconfirmed outcome. Reconcile that request before sending again; it may already have been accepted.'
export function isDefinitePortalRejection(error = {}) {
  const status = Number(error.status)
  return status >= 400 && status < 500 && ![408,409,429].includes(status)
}
export async function getRentalPublicationAttempt(client, listingId, channel, environment) {
  const { data, error } = await client.from(table).select('*').eq('private_listing_id',listingId)
    .eq('channel',channel).eq('environment',environment).in('state',['dispatching','uncertain'])
    .order('started_at',{ ascending:false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}
export async function beginRentalPublicationAttempt({ client, listingId, channel, environment, operation = 'publish', identity, payload }) {
  if (!identity || !payload) throw new Error('The rental submission needs its exact portal identity and payload.')
  const listing = await client.from('private_listings').select('id,organisation_id,listing_category').eq('id',listingId).single()
  if (listing.error) throw listing.error
  if (listing.data?.listing_category !== 'rental') return null
  if (!listing.data.organisation_id) throw new Error('Rental organisation is unavailable.')
  const { data, error } = await client.from(table).insert({ private_listing_id:listingId, organisation_id:listing.data.organisation_id,
    channel,environment,operation,identity,payload_digest:createHash('sha256').update(typeof payload === 'string' ? payload : JSON.stringify(payload)).digest('hex') }).select('*').single()
  if (error) {
    const failure = new Error(error.code === '23505' ? rentalPublicationPendingMessage : 'The rental submission record could not be saved. No portal request was sent.')
    failure.code = error.code === '23505' ? 'RENTAL_PUBLICATION_PENDING' : 'RENTAL_PUBLICATION_JOURNAL_UNAVAILABLE'
    failure.status = 409
    throw failure
  }
  if (!data?.id) throw new Error('The rental submission record was not confirmed. No portal request was sent.')
  // Another request may have prepared a create payload before the previous
  // request finished. Recheck terminal receipts AFTER acquiring the slot so
  // releasing that slot cannot let a stale create send a duplicate listing.
  const completed = await client.from(table).select('*').eq('private_listing_id',listingId).eq('channel',channel)
    .eq('environment',environment).in('state',['accepted','reconciled']).order('started_at',{ ascending:false }).limit(1).maybeSingle()
  if (completed.error) throw completed.error
  const previous = completed.data
  if (operation === 'publish' && previous) {
    const stale = channel === 'property24'
      ? !identity.listingNumber || String(identity.listingNumber) !== String(previous.receipt?.reference)
      : !identity.existed || identity.propertyId !== previous.identity?.propertyId || identity.branchGuid !== previous.identity?.branchGuid
    if (stale) {
      await updateRentalPublicationAttempt(client,data,{ state:'rejected',last_error:'A stale publish candidate was blocked before sending.' })
      const failure = new Error('This rental already has a confirmed portal submission. Reload its saved reference and recheck the listing before sending changes.')
      failure.code = 'RENTAL_PUBLICATION_STALE_CANDIDATE'
      failure.status = 409
      throw failure
    }
  }
  // A failed pre-dispatch read keeps the slot until reconciliation.
  return data
}
export async function updateRentalPublicationAttempt(client, attempt, patch) {
  if (!attempt) return null
  const { data, error } = await client.from(table).update({ ...patch,updated_at:new Date().toISOString(),
    ...(['accepted','rejected','reconciled'].includes(patch.state) ? { resolved_at:new Date().toISOString() } : {}) })
    .eq('id',attempt.id).in('state',['dispatching','uncertain']).select('*').single()
  if (error) throw error
  if (!data?.id) throw new Error('The rental submission outcome could not be recorded.')
  return data
}
export async function retainUncertainRentalPublication(client, attempt, error, receipt = {}) {
  if (!attempt) return
  try { await updateRentalPublicationAttempt(client,attempt,{ state:'uncertain',receipt,last_error:error?.message || rentalPublicationPendingMessage }) }
  catch { /* The already committed dispatching row continues to block duplicate sends. */ }
}
export function publicRentalPublicationAttempt(attempt) {
  if (!attempt) return null
  return { id:attempt.id,state:attempt.state,operation:attempt.operation,startedAt:attempt.started_at,
    reference:attempt.receipt?.reference || attempt.identity?.listingNumber || attempt.identity?.propertyId || '',
    requiresReconciliation:['dispatching','uncertain'].includes(attempt.state), message:rentalPublicationPendingMessage }
}
