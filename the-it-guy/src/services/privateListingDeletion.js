const text = value => String(value || '').trim()

// A local draft can retain a different UUID after it is saved remotely. Resolve
// the exact organisation/reference before treating a missing UUID as deleted.
export async function resolveListingDeletion(client, listingId, { organisationId, listingReference } = {}) {
  const org = text(organisationId)
  const reference = text(listingReference)
  let query = client.from('private_listings').select('id, organisation_id, listing_reference').eq('id', listingId)
  if (org) query = query.eq('organisation_id', org)
  const byId = await query.maybeSingle()
  if (byId.error) throw byId.error
  if (byId.data) {
    if (reference && byId.data.listing_reference !== reference) {
      throw new Error('The listing identity has changed. Refresh the listings page before deleting it.')
    }
    return byId.data
  }
  if (!org || !reference) return null
  const byReference = await client.from('private_listings')
    .select('id, organisation_id, listing_reference')
    .eq('organisation_id', org).eq('listing_reference', reference).limit(2)
  if (byReference.error) throw byReference.error
  if (byReference.data?.length > 1) throw new Error('More than one listing has this reference. Resolve the duplicate before deleting.')
  return byReference.data?.[0] || null
}

export async function verifyListingDeletion(client, listing) {
  if (!listing) return
  const check = await client.from('private_listings').select('id')
    .eq('organisation_id', listing.organisation_id).eq('id', listing.id).maybeSingle()
  if (check.error) throw check.error
  if (check.data) throw new Error('The listing is still saved in Arch9. Deletion was not confirmed; please try again.')
}
