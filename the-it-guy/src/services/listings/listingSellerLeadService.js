import { supabase } from '../../lib/supabaseClient'
import { createAgencyCrmLeadRecord, updateAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { buildLeadListingLinkPatch } from '../../lib/agencyLeadSelection'
import { buildListingSellerLeadPayload } from '../../lib/listingSellerLeadPayload'
import { assessSellerLeadPersistence } from '../../lib/listingDataIntegrity'
import { updatePrivateListing } from '../privateListingService'

const text = (value) => String(value || '').trim()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LISTING_FIELDS = 'id, organisation_id, seller_lead_id, originating_crm_lead_id, listing_category, seller_type'

// RFC 4122 UUIDv5 identities survive a reload or a failure between contact,
// lead and listing writes, so retrying cannot create another seller lead.
async function listingCaptureUuid(name) {
  const namespace = Uint8Array.from('6ba7b8119dad11d180b400c04fd430c8'.match(/../g), (byte) => Number.parseInt(byte, 16))
  const input = new TextEncoder().encode(name)
  const bytes = new Uint8Array(namespace.length + input.length)
  bytes.set(namespace)
  bytes.set(input, namespace.length)
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-1', bytes)).slice(0, 16)
  hash[6] = (hash[6] & 15) | 80
  hash[8] = (hash[8] & 63) | 128
  const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function ensureListingSellerLead({ listing = {}, seller = {}, assignment = {}, actor = null, source = 'Manual Entry', notes = '' } = {}, {
  client = supabase,
  createLead = createAgencyCrmLeadRecord,
  updateLead = updateAgencyCrmLeadRecord,
  updateListing = updatePrivateListing,
} = {}) {
  if (!Object.values(seller).some((value) => text(value))) return null
  const id = text(listing.id)
  const organisationId = text(listing.organisationId || listing.organisation_id)
  if (!client || !UUID.test(id) || !UUID.test(organisationId)) throw new Error('A saved listing and organisation are required to create the seller lead.')
  const saved = await client.from('private_listings').select(LISTING_FIELDS).eq('organisation_id', organisationId).eq('id', id).single()
  if (saved.error) throw saved.error
  if (!saved.data?.id || saved.data.organisation_id !== organisationId) throw new Error('The listing could not be verified in this organisation.')
  if (text(saved.data.listing_category).toLowerCase().includes('rental') || text(saved.data.seller_type).toLowerCase() === 'developer') return null
  const sellerId = text(saved.data.seller_lead_id)
  const originId = text(saved.data.originating_crm_lead_id)
  if (sellerId && originId && sellerId !== originId) throw new Error('This listing has conflicting seller lead links. Review the seller before saving.')
  const stableLeadId = await listingCaptureUuid(`https://arch9.co.za/listing-seller-lead/${organisationId}/${id}`)
  const linkedId = sellerId || originId
  const leadFields = 'lead_id, organisation_id, contact_id, lead_category, listing_id'
  let leadQuery
  if (linkedId) {
    leadQuery = await client.from('leads').select(leadFields).eq('organisation_id', organisationId).eq('lead_id', linkedId).maybeSingle()
  } else {
    const candidates = await client.from('leads').select(leadFields).eq('organisation_id', organisationId).eq('listing_id', id).eq('lead_category', 'seller').limit(2)
    if (candidates.error) throw candidates.error
    if (candidates.data?.length > 1) throw new Error('More than one seller lead is linked to this listing. Review the seller before saving.')
    leadQuery = candidates.data?.length
      ? { data: candidates.data[0] }
      : await client.from('leads').select(leadFields).eq('organisation_id', organisationId).eq('lead_id', stableLeadId).maybeSingle()
  }
  if (leadQuery.error) throw leadQuery.error
  if (linkedId && !leadQuery.data) throw new Error('The linked seller lead could not be verified. Review the seller before saving.')
  let lead = leadQuery.data ? {
    leadId: leadQuery.data.lead_id, organisationId: leadQuery.data.organisation_id,
    contactId: leadQuery.data.contact_id,
  } : null
  if (lead) {
    if (text(leadQuery.data.lead_category).toLowerCase() !== 'seller' || (leadQuery.data.listing_id && leadQuery.data.listing_id !== id)) throw new Error('The saved lead is not the seller for this listing.')
    const contact = await client.from('contacts').select('contact_id').eq('organisation_id', organisationId).eq('contact_id', lead.contactId).maybeSingle()
    if (contact.error) throw contact.error
    if (!contact.data) throw new Error('The seller lead has no verified contact. Review the seller before saving.')
  } else {
    const payload = buildListingSellerLeadPayload({ seller, assignment, source, notes, property: {
      ...listing, title: listing.listingTitle || listing.title,
      propertyAddress: listing.addressLine1 || listing.address_line_1 || listing.propertyAddress,
    } })
    payload.contact.contactId = await listingCaptureUuid(`https://arch9.co.za/listing-seller-contact/${organisationId}/${id}`)
    payload.lead = { ...payload.lead, ...buildLeadListingLinkPatch(listing), leadId: stableLeadId, stage: 'Listing Created', status: 'Listing Created' }
    lead = await createLead(organisationId, payload, { actor })
  }
  const integrity = assessSellerLeadPersistence({ organisationId, sellerLead: lead, expectedSeller: seller })
  if (!integrity.ok) throw new Error(integrity.message)
  if (sellerId !== lead.leadId || originId !== lead.leadId) {
    await updateListing(id, { sellerLeadId: lead.leadId, originatingCrmLeadId: lead.leadId }, { includeRequirementsAndDocuments: false })
  }
  if (leadQuery.data?.listing_id !== id) await updateLead(organisationId, lead.leadId, buildLeadListingLinkPatch(listing))
  const [listingCheck, leadCheck] = await Promise.all([
    client.from('private_listings').select(LISTING_FIELDS).eq('organisation_id', organisationId).eq('id', id).single(),
    client.from('leads').select(leadFields).eq('organisation_id', organisationId).eq('lead_id', lead.leadId).single(),
  ])
  if (listingCheck.error) throw listingCheck.error
  if (leadCheck.error) throw leadCheck.error
  if (listingCheck.data?.seller_lead_id !== lead.leadId || listingCheck.data?.originating_crm_lead_id !== lead.leadId || leadCheck.data?.listing_id !== id || leadCheck.data?.contact_id !== lead.contactId || text(leadCheck.data?.lead_category).toLowerCase() !== 'seller') throw new Error('The listing was saved, but its seller lead link could not be verified. Retry to finish saving the same listing.')
  return lead
}
