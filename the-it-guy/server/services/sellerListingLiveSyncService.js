function normalizeText(value) {
  return String(value ?? '').trim()
}

function unique(values = []) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

async function updateLeadToListingLive(client, { organisationId, leadId, listingId }) {
  const result = await client
    .from('leads')
    .update({
      stage: 'Listing Live',
      status: 'Live',
      listing_id: listingId,
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', organisationId)
    .eq('lead_id', leadId)
    .select('lead_id')

  if (result.error) throw result.error
  return (result.data || []).length
}

export async function syncSellerLeadForLiveListing({ client, listingId, source = 'portal' } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedListingId) throw new Error('listingId is required.')

  const listingResult = await client
    .from('private_listings')
    .select('id, organisation_id, seller_lead_id, originating_crm_lead_id')
    .eq('id', normalizedListingId)
    .single()
  if (listingResult.error) throw listingResult.error

  const listing = listingResult.data
  const lifecycleUpdate = await client
    .from('private_listings')
    .update({
      listing_status: 'active',
      listing_visibility: 'active_market',
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedListingId)
    .select('id, listing_status, listing_visibility, is_active')
    .single()
  if (lifecycleUpdate.error) throw lifecycleUpdate.error

  const leadIds = unique([listing.seller_lead_id, listing.originating_crm_lead_id])
  const linkedLeads = await client
    .from('leads')
    .select('lead_id')
    .eq('organisation_id', listing.organisation_id)
    .eq('listing_id', normalizedListingId)
  if (linkedLeads.error) throw linkedLeads.error
  leadIds.push(...unique((linkedLeads.data || []).map((lead) => lead.lead_id)))

  let updatedLeadCount = 0
  for (const leadId of unique(leadIds)) {
    updatedLeadCount += await updateLeadToListingLive(client, {
      organisationId: listing.organisation_id,
      leadId,
      listingId: normalizedListingId,
    })
  }

  return {
    listing: lifecycleUpdate.data,
    updatedLeadCount,
    source: normalizeText(source) || 'portal',
  }
}
