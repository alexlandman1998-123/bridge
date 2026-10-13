import { supabase } from '../../lib/supabaseClient'
import { listingExpiryError } from './listingExpiryModel.js'

export const LISTING_EXPIRY_CHANNELS = { Property24: 'property24', 'Private Property': 'private_property', 'Agency Website': 'agency_website', 'Kingdom Website': 'kingdom_website' }
export async function getListingChannelExpiries(listingId, { client = supabase } = {}) {
  const { data, error } = await client.from('listing_channel_expiries').select('channel,expiry_date,state,message,updated_at').eq('listing_id', listingId)
  if (error) throw new Error('Listing expiry settings could not be loaded. Refresh before changing expiry.')
  return data || []
}
export async function saveListingChannelExpiry(listingId, { expiryDate, channels, previous = [] }, { client = supabase } = {}) {
  const validation = listingExpiryError(expiryDate)
  if (validation) throw new Error(validation)
  const keys = [...new Set(channels.map(name => LISTING_EXPIRY_CHANNELS[name]))]
  if (!keys.length || keys.some(key => !key)) throw new Error('Choose an active listing channel.')
  const expected = Object.fromEntries(keys.map(key => [key, previous.find(row => row.channel === key)?.updated_at || null]))
  const { data, error } = await client.rpc('save_listing_channel_expiry', { p_listing_id: listingId, p_expiry_date: expiryDate, p_channels: keys, p_expected: expected })
  if (error) throw new Error(error.message || 'Listing expiry could not be saved.')
  if (!Array.isArray(data) || data.length !== keys.length || !keys.every(key => data.some(row => row.channel === key && row.expiry_date === expiryDate))) throw new Error('Expiry save could not be confirmed. Refresh before trying again.')
  return { ok: true, settings: data, message: 'Expiry saved. Portal date updates are queued; websites will be removed at the end of the selected day.', results: data.map(row => ({ channel: Object.keys(LISTING_EXPIRY_CHANNELS).find(name => LISTING_EXPIRY_CHANNELS[name] === row.channel), action: 'expiry', status: 'saved', detail: row.message })) }
}
