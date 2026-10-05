import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { createPrivateListingActivity, getPrivateListingActivity } from '../privateListingService'
import { RENTAL_PORTAL_STATUSES } from './rentalListingChannelModel'

async function call(listingId, channel, action, { body, refresh = false, allowUncertain = false } = {}) {
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
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || 'Rental channel request failed.')
    error.definiteRejection = [400,401,403,404,422].includes(response.status) && payload.status !== 'UNCERTAIN' && payload.report?.status !== 'UNCERTAIN'
    throw error
  }
  if (!allowUncertain && (payload.status === 'UNCERTAIN' || payload.report?.status === 'UNCERTAIN')) {
    const error = new Error(payload.message || payload.report?.error?.message || 'The portal request outcome is unconfirmed. Reconcile it before sending again.')
    error.outcomeUncertain = true
    throw error
  }
  if (payload.status === 'FAILED' || payload.status === 'BLOCKED' || payload.report?.status === 'FAILED' || payload.update?.confirmed === false) {
    throw new Error(payload.message || payload.update?.message || 'The portal did not confirm this change. Refresh its status before retrying.')
  }
  return payload
}

export function getRentalPortalStatus(listingId, channel, { refresh = false } = {}) {
  if (!RENTAL_PORTAL_STATUSES[channel]) throw new Error('Unsupported rental listing channel.')
  return call(listingId, channel, 'status', { refresh,allowUncertain:true })
}

export function reconcileRentalPortalPublication(listingId,channel) {
  return channel === 'property24' ? call(listingId,channel,'reconcile',{ body:{},allowUncertain:true })
    : call(listingId,channel,'status',{ refresh:true,allowUncertain:true })
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
  const types = { uncertain: 'rental_channel_publication_uncertain', submitted: 'listing_channel_publication_submitted', accepted: 'listing_channel_publication_accepted',
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
    if (result?.status === 'UNCERTAIN' || result?.report?.status === 'UNCERTAIN') {
      const error = new Error(result?.message || result?.report?.error?.message || result?.report?.nextStep || 'The portal outcome is unconfirmed. Reconcile before sending again.')
      error.outcomeUncertain = true
      throw error
    }
    if (result?.status === 'FAILED' || result?.status === 'BLOCKED' || result?.report?.status === 'FAILED' || result?.report?.status === 'BLOCKED') { const error = new Error('The portal did not accept this request.'); error.definiteRejection = true; throw error }
  } catch (error) {
    try { await recordRentalPublicationEvent(listingId,channel,error.definiteRejection ? withdrawal ? 'withdrawal_failed' : 'failed' : 'uncertain',{ action,error:error.message }) } catch { /* Retain the provider error. */ }
    throw error
  }
  try {
    const report = result?.report || {}
    const reference = report.databaseWrite?.listingNumber || report.databaseWrite?.property24Reference || report.syncResult?.privatePropertyRef || report.privatePropertyReference || report.apiResponse?.privatePropertyReference || ''
    await recordRentalPublicationEvent(listingId,channel,withdrawal ? 'withdrawn' : 'accepted',{ action,snapshot,reference })
  } catch {
    const error = new Error('The portal accepted the request, but its activity could not be saved. Refresh status before retrying.')
    error.operationAccepted = true
    throw error
  }
  return result
}
