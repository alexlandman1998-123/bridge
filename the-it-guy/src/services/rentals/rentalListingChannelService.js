import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { createPrivateListingActivity, getPrivateListingActivity } from '../privateListingService'
import { RENTAL_PORTAL_STATUSES } from './rentalListingChannelModel'

async function call(listingId, channel, action, { body, refresh = false } = {}) {
  if (!listingId) throw new Error('Save the rental listing before managing its channels.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before managing rental listing channels.')
  const token = (await supabase.auth.getSession()).data?.session?.access_token
  if (!token) throw new Error('Sign in again before managing rental listing channels.')
  const query = channel === 'property24' ? `environment=production&refresh=${refresh}` : `environment=production&cached=${!refresh}&recordSync=true`
  const path = channel === 'property24' ? `property24/rentals` : 'private-property/listings'
  const response = await fetch(`/api/${path}/${encodeURIComponent(listingId)}/${action}?${query}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || payload.error || 'Rental channel request failed.')
  if (payload.status === 'FAILED' || payload.status === 'BLOCKED' || payload.report?.status === 'FAILED' || payload.update?.confirmed === false) {
    throw new Error(payload.message || payload.update?.message || 'The portal did not confirm this change. Refresh its status before retrying.')
  }
  return payload
}

export function getRentalPortalStatus(listingId, channel, { refresh = false } = {}) {
  if (!RENTAL_PORTAL_STATUSES[channel]) throw new Error('Unsupported rental listing channel.')
  return call(listingId, channel, 'status', { refresh })
}

export function updateRentalPortalStatus(listingId, channel, status) {
  if (!RENTAL_PORTAL_STATUSES[channel]?.includes(status)) throw new Error('Choose a supported rental portal status.')
  return call(listingId, channel, 'status-update', { body: channel === 'property24'
    ? { status, listingStatus: status }
    : { propertyStatus: status, environment: 'production', ...(status === 'ToLet' ? { confirm: `PRIVATE_PROPERTY_REACTIVATE:${listingId}:production` } : {}) } })
}

export async function loadRentalListingChannels(listingId) {
  const keys = ['property24', 'private_property', 'activity']
  const results = await Promise.allSettled([getRentalPortalStatus(listingId,'property24'), getRentalPortalStatus(listingId,'private_property'), getPrivateListingActivity(listingId,{ requireAvailable: true })])
  const result = { errors: {} }
  results.forEach((value,index) => {
    if (value.status === 'fulfilled') result[keys[index]] = value.value
    else result.errors[keys[index]] = value.reason?.message || 'Channel history could not be loaded.'
  })
  return result
}

export async function recordRentalPublicationEvent(listingId, channel, stage, metadata = {}) {
  const types = { submitted: 'listing_channel_publication_submitted', accepted: 'listing_channel_publication_accepted',
    failed: 'listing_channel_publication_failed', withdrawn: 'listing_channel_withdrawal_succeeded', withdrawal_failed: 'listing_channel_withdrawal_failed', checked: 'rental_channel_status_checked', verified: 'listing_channel_publication_verified' }
  if (!types[stage]) throw new Error('Unsupported publication activity stage.')
  const row = await createPrivateListingActivity({ privateListingId: listingId, activityType: types[stage],
    activityTitle: `${channel.replaceAll('_',' ')} ${stage.replaceAll('_',' ')}`, visibility: 'internal', metadata: { ...metadata, channel } })
  if (!row?.id) throw new Error('Publication activity could not be saved.')
  return row
}

export async function runRentalPublicationAction({ listingId, channel, action, snapshot, perform }) {
  const withdrawal = action === 'withdraw'
  if (!withdrawal) await recordRentalPublicationEvent(listingId,channel,'submitted',{ action, snapshot })
  let result
  try {
    result = await perform()
    if (result?.status === 'FAILED' || result?.status === 'BLOCKED' || result?.report?.status === 'FAILED' || result?.report?.status === 'BLOCKED') throw new Error('The portal did not accept this request.')
  } catch (error) {
    try { await recordRentalPublicationEvent(listingId,channel,withdrawal ? 'withdrawal_failed' : 'failed',{ action,error:error.message }) } catch { /* Retain the provider error. */ }
    throw error
  }
  try {
    const report = result?.report || {}
    const reference = report.databaseWrite?.listingNumber || report.databaseWrite?.property24Reference || report.syncResult?.privatePropertyRef || report.privatePropertyReference || ''
    await recordRentalPublicationEvent(listingId,channel,withdrawal ? 'withdrawn' : 'accepted',{ action,snapshot,reference })
  } catch {
    const error = new Error('The portal accepted the request, but its activity could not be saved. Refresh status before retrying.')
    error.operationAccepted = true
    throw error
  }
  return result
}
