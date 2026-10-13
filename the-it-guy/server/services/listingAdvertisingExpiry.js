// Setup edits supersede the previous setup date only for the channel being
// submitted. A date changed in Manage keeps precedence over unchanged setup.
export async function readListingAdvertisingExpiry(client, listingId, channel, setupDate = '') {
  const { data, error } = await client.from('listing_channel_expiries').select('expiry_date,setup_expiry_date,state').eq('listing_id', listingId).eq('channel', channel).maybeSingle()
  if (error) throw new Error('Listing expiry settings could not be checked. Apply the expiry migration before publishing.')
  if (data && setupDate && setupDate !== data.setup_expiry_date && ['updating', 'expiring'].includes(data.state)) throw new Error('An expiry request is in progress. Wait for its result before submitting a different setup date.')
  return setupDate && setupDate !== data?.setup_expiry_date ? setupDate : data?.expiry_date || setupDate
}
