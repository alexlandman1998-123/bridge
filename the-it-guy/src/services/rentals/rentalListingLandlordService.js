import { supabase } from '../../lib/supabaseClient'
import { getPrivateListing, updatePrivateListing } from '../privateListingService'
import { saveRentalImportedContact } from './rentalClientImportRepository'
import { listRentalLeads } from './rentalLeadService'
import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { RENTAL_SELECT_OPTIONS } from './rentalListingDraftModel'

const text = (value) => String(value ?? '').trim()
const facts = (listing) => listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
const phoneKey = (value) => text(value).replace(/\D/g, '').replace(/^0/, '27')
export function rentalListingHasLandlord(listing, linkedLead = null) {
  return Boolean(facts(listing).landlordContactId || listing?.sellerLeadId || listing?.seller_lead_id || linkedLead?.id)
}
export function validateListingLandlord(values) {
  if (!text(values.landlordName)) throw new Error('Add the landlord or entity name.')
  if (!text(values.landlordEmail) && !text(values.landlordPhone)) throw new Error('Add an email address or phone number.')
  if (text(values.landlordEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(values.landlordEmail))) throw new Error('Enter a valid email address.')
  if (text(values.landlordPhone) && phoneKey(values.landlordPhone).length < 7) throw new Error('Enter a valid phone number.')
  if (!RENTAL_SELECT_OPTIONS.landlordType.some((option) => option.value === values.landlordType)) throw new Error('Choose a landlord type.')
}
export async function listListingLandlordContacts(organisationId, { client = supabase } = {}) {
  if (!organisationId || !client) throw new Error('Choose a workspace before loading landlords.')
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const result = await client.from('contacts').select('contact_id, organisation_id, first_name, last_name, email, phone, contact_type').eq('organisation_id', organisationId).in('contact_type', ['landlord', 'Landlord']).order('contact_id').range(offset, offset + 999)
    if (result.error) throw result.error
    rows.push(...(result.data || []))
    if ((result.data || []).length < 1000) return rows.map((row) => ({ id: row.contact_id, name: [row.first_name, row.last_name].filter(Boolean).join(' '), email: row.email || '', phone: row.phone || '' }))
  }
}
export async function loadListingLandlordSetup(listing, scope, dependencies = {}) {
  const readContacts = dependencies.listContacts || listListingLandlordContacts
  const readLeads = dependencies.listLeads || listRentalLeads
  const [contacts, leads] = await Promise.all([readContacts(scope.organisationId), readLeads(scope.organisationId, { ...scope, includeClosed: true })])
  const linkedLead = leads.find((lead) => lead.role === 'landlord' && (String(lead.relationships?.listingId || '') === String(listing.id) || (getRentalLeadMetadata(lead.raw)?.landlordPortfolio || []).some((property) => String(property.listingId || '') === String(listing.id)))) || null
  return { contacts, linkedLead }
}
export async function saveListingLandlord(listingId, values, context, dependencies = {}) {
  const api = { getListing: getPrivateListing, updateListing: updatePrivateListing, listContacts: listListingLandlordContacts, saveContact: saveRentalImportedContact, ...dependencies }
  const listing = await api.getListing(listingId, { includeRequirementsAndDocuments: false })
  if (!listing || text(listing.organisationId || listing.organisation_id) !== text(context.organisationId) || text(listing.listingCategory || listing.listing_category || listing.listingType || listing.listing_type).toLowerCase() !== 'rental') throw new Error('This rental listing is unavailable in the selected workspace.')
  validateListingLandlord(values)
  let contactId = text(context.contactId || facts(listing).landlordContactId)
  let selectedValues = values
  if (context.mode === 'existing') {
    const contacts = await api.listContacts(context.organisationId)
    const contact = contacts.find((item) => item.id === contactId)
    if (!contact) throw new Error('Choose a landlord available in this workspace.')
    selectedValues = { ...values, landlordName: contact.name, landlordEmail: contact.email, landlordPhone: contact.phone }
    validateListingLandlord(selectedValues)
  } else if (context.mode === 'new') {
    const contacts = await api.listContacts(context.organisationId)
    const duplicate = contacts.find((item) => item.id !== contactId && ((text(values.landlordEmail) && text(item.email).toLowerCase() === text(values.landlordEmail).toLowerCase()) || (text(values.landlordPhone) && phoneKey(item.phone) === phoneKey(values.landlordPhone))))
    if (duplicate) throw new Error('This landlord is already in Clients. Choose Select existing landlord.')
    if (!contactId) throw new Error('A landlord contact reference is required before saving.')
    await api.saveContact(context.organisationId, { state: 'ready', contactId, name: text(values.landlordName), email: text(values.landlordEmail).toLowerCase(), phone: text(values.landlordPhone), contactType: 'landlord', notes: '' }, { actorId: context.assignedAgentId || null })
  } else if (!rentalListingHasLandlord(listing, context.linkedLead)) {
    throw new Error('Create or select a landlord before editing this profile.')
  }
  const landlordFacts = { landlordName: text(selectedValues.landlordName), landlordEmail: text(selectedValues.landlordEmail).toLowerCase(), landlordPhone: text(selectedValues.landlordPhone), landlordType: text(values.landlordType), ...(contactId ? { landlordContactId: contactId } : {}) }
  const readiness = { ...(listing.sellerCanonicalFactReadiness || listing.seller_canonical_fact_readiness_json || {}), landlordName: Boolean(landlordFacts.landlordName), landlordContact: Boolean(landlordFacts.landlordEmail || landlordFacts.landlordPhone) }
  const saved = await api.updateListing(listingId, { sellerType: landlordFacts.landlordType, sellerCanonicalFacts: { ...facts(listing), ...landlordFacts }, sellerCanonicalFactReadiness: readiness, sellerCanonicalFactsUpdatedAt: new Date().toISOString() }, { includeRequirementsAndDocuments: false })
  for (const [key, value] of Object.entries(landlordFacts)) if (text(facts(saved)[key]) !== value) throw new Error('The landlord connection could not be verified. Retry to confirm it.')
  return saved
}
