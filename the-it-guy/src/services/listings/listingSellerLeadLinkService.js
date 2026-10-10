import { supabase } from '../../lib/supabaseClient'
import { emitAgencyCrmUpdated } from '../../lib/agencyCrmUpdateBus'

const text = value => String(value || '').trim()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function getListingSellerLeadId(listing = {}) {
  return text(listing?.sellerLeadId || listing?.seller_lead_id || listing?.originatingCrmLeadId || listing?.originating_crm_lead_id)
}

function requireContext(listing, client) {
  const listingId = text(listing?.id)
  const organisationId = text(listing?.organisationId || listing?.organisation_id)
  if (!client || !UUID.test(listingId) || !UUID.test(organisationId)) {
    throw new Error('Open a saved listing before linking a seller lead.')
  }
  return { listingId, organisationId }
}

export async function searchListingSellerLeads({ listing, search = '' }, { client = supabase } = {}) {
  const { listingId, organisationId } = requireContext(listing, client)
  // Remove PostgREST filter syntax and wildcard characters from user input.
  const words = text(search).replace(/[\\%_,()."'<>;]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5)
  if (words.join(' ').length < 2) return []
  let query = client.from('contacts').select('contact_id, first_name, last_name, email, phone')
    .eq('organisation_id', organisationId)
  for (const word of words) {
    query = query.or(['first_name', 'last_name', 'email', 'phone'].map(field => `${field}.ilike.%${word}%`).join(','))
  }
  const contacts = await query.order('last_name', { ascending: true }).limit(50)
  if (contacts.error) throw contacts.error
  if (!contacts.data?.length) return []
  const leads = await client.from('leads')
    .select('lead_id, contact_id, lead_category, stage, listing_id, enquired_listing_id, seller_property_address')
    .eq('organisation_id', organisationId).eq('lead_category', 'seller')
    .or('lead_domain.is.null,lead_domain.eq.agency')
    .in('contact_id', contacts.data.map(contact => contact.contact_id))
    .or(`listing_id.is.null,listing_id.eq.${listingId}`)
    .or(`enquired_listing_id.is.null,enquired_listing_id.eq.${listingId}`)
    .order('updated_at', { ascending: false }).limit(50)
  if (leads.error) throw leads.error
  if (!leads.data?.length) return []
  const ids = leads.data.map(lead => lead.lead_id).filter(id => UUID.test(id))
  if (!ids.length) return []
  const linkedListings = await client.from('private_listings').select('seller_lead_id, originating_crm_lead_id')
    .eq('organisation_id', organisationId).neq('id', listingId)
    .or(`seller_lead_id.in.(${ids.join(',')}),originating_crm_lead_id.in.(${ids.join(',')})`)
  if (linkedListings.error) throw linkedListings.error
  const alreadyLinked = new Set((linkedListings.data || []).flatMap(row => [row.seller_lead_id, row.originating_crm_lead_id]))
  const byId = new Map(contacts.data.map(contact => [contact.contact_id, contact]))
  return leads.data.filter(lead => UUID.test(lead.lead_id) && byId.has(lead.contact_id) && !alreadyLinked.has(lead.lead_id)).map(lead => {
    const contact = byId.get(lead.contact_id)
    return {
      leadId: lead.lead_id,
      name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Seller',
      email: text(contact.email), phone: text(contact.phone),
      propertyAddress: text(lead.seller_property_address), stage: text(lead.stage),
    }
  })
}

export async function linkListingSellerLead({ listing, leadId }, { client = supabase } = {}) {
  const { listingId, organisationId } = requireContext(listing, client)
  if (!UUID.test(text(leadId))) throw new Error('Choose a seller lead to link.')
  const existingId = getListingSellerLeadId(listing)
  if (existingId && existingId !== leadId) throw new Error('This listing already has a seller lead.')
  // A single database transaction owns both links and checks current permissions
  // and relationships again, including records changed after the search.
  const result = await client.rpc('bridge_link_listing_seller_lead', {
    p_listing_id: listingId, p_lead_id: leadId, p_organisation_id: organisationId,
  })
  if (result.error) {
    if (['PGRST202', '42883'].includes(result.error.code)) {
      throw new Error('Seller lead linking is not available yet. Please try again after the app is updated.')
    }
    throw result.error
  }
  if (result.data?.listingId !== listingId || result.data?.sellerLeadId !== leadId
      || result.data?.originatingCrmLeadId !== leadId || result.data?.organisationId !== organisationId) {
    throw new Error('The seller lead link could not be confirmed. Refresh the listing before trying again.')
  }
  emitAgencyCrmUpdated({ organisationId, leadId, mutation: 'listing-linked' })
  return result.data
}
