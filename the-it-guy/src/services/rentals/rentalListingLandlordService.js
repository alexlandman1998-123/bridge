import { supabase } from '../../lib/supabaseClient'
import { getPrivateListing, updatePrivateListing } from '../privateListingService'
import { saveRentalImportedContact } from './rentalClientImportRepository'
import { listRentalLeads } from './rentalLeadService'
import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { landlordProfileErrors } from './rentalLandlordProfileRules.js'
import { updateAgencyCrmContactRecord } from '../../lib/agencyCrmRepository'
import { emitAgencyCrmUpdated } from '../../lib/agencyCrmUpdateBus'
import { createRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import { requestRentalLandlordOnboarding } from './rentalLandlordOnboardingService'
import { buildListingLandlordDiscovery, listingLandlordValues } from './rentalListingLandlordModel'

const text = (value) => String(value ?? '').trim()
const facts = (listing) => listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
const phoneKey = (value) => text(value).replace(/\D/g, '').replace(/^0/, '27')
function stableJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableJson(item))))
  if (value && typeof value === 'object') return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, JSON.parse(stableJson(value[key]))])))
  return JSON.stringify(value ?? null)
}
async function readListingLandlordContact(organisationId, contactId) {
  const result = await supabase.from('contacts').select('contact_id,first_name,last_name,email,phone').eq('organisation_id',organisationId).eq('contact_id',contactId).single()
  if (result.error) throw result.error
  return { name:[result.data.first_name,result.data.last_name].filter(Boolean).join(' '),email:result.data.email,phone:result.data.phone }
}
export function rentalListingHasLandlord(listing, linkedLead = null) {
  return Boolean(facts(listing).landlordContactId || linkedLead?.role === 'landlord')
}
export function validateListingLandlord(values) {
  const errors = landlordProfileErrors({ name: values.landlordName, email: values.landlordEmail, phone: values.landlordPhone, type: values.landlordType })
  if (errors.length) throw new Error(errors[0])
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
  const candidates = leads.filter((lead) => lead.role === 'landlord' && (String(lead.relationships?.listingId || '') === String(listing.id) || (getRentalLeadMetadata(lead.raw)?.landlordPortfolio || []).some((property) => String(property.listingId || '') === String(listing.id))))
  const savedLeadId = facts(listing).landlordLeadId
  const linkedLead = savedLeadId ? candidates.find((lead) => lead.id === savedLeadId) : candidates.length === 1 ? candidates[0] : null
  if (savedLeadId && !linkedLead) throw new Error('The saved landlord onboarding connection is unavailable in this workspace. Refresh before continuing.')
  if (!savedLeadId && candidates.length > 1) throw new Error('More than one landlord lead is linked to this listing. Review the landlord connection before continuing.')
  if (!linkedLead) return { contacts, linkedLead, onboarding: null }
  try {
    const result = await (dependencies.requestOnboarding || requestRentalLandlordOnboarding)(linkedLead.id)
    return { contacts, linkedLead, onboarding: result.onboarding }
  } catch (cause) {
    return { contacts, linkedLead, onboarding: null, onboardingError: cause.message || 'Unable to load landlord onboarding.' }
  }
}
export async function saveListingLandlord(listingId, values, context, dependencies = {}) {
  const api = { getListing: getPrivateListing, updateListing: updatePrivateListing, listContacts: listListingLandlordContacts, saveContact: saveRentalImportedContact, updateContact: updateAgencyCrmContactRecord, readContact: readListingLandlordContact, requestOnboarding: requestRentalLandlordOnboarding, ...dependencies }
  const listing = await api.getListing(listingId, { includeRequirementsAndDocuments: false })
  if (!listing || text(listing.organisationId || listing.organisation_id) !== text(context.organisationId) || text(listing.listingCategory || listing.listing_category || listing.listingType || listing.listing_type).toLowerCase() !== 'rental') throw new Error('This rental listing is unavailable in the selected workspace.')
  validateListingLandlord(values)
  if (context.linkedLead && (context.linkedLead.role !== 'landlord' || !(context.linkedLead.relationships?.listingId === listingId || (getRentalLeadMetadata(context.linkedLead.raw).landlordPortfolio || []).some((property) => property.listingId === listingId)))) throw new Error('Choose the landlord lead connected to this rental listing.')
  if (context.expectedValues && JSON.stringify(listingLandlordValues(listing)) !== JSON.stringify(context.expectedValues)) throw new Error('Landlord details changed. Refresh before saving; your edits are retained.')
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
  let savedOnboarding = null
  if (context.linkedLead && context.mode === 'profile') {
    const onboarding = context.onboarding || (await api.requestOnboarding(context.linkedLead.id)).onboarding
    if (!onboarding || onboarding.status !== 'draft') throw new Error('Submitted landlord onboarding is locked. Request corrections before editing.')
    if (!onboarding.capabilities?.profileConsistency) throw new Error('Profile saving is temporarily unavailable. Your draft is retained; please retry later.')
    const patch = context.discovery || { profile: { ...onboarding.data.profile, name: text(values.landlordName), email: text(values.landlordEmail).toLowerCase(), phone: text(values.landlordPhone), type: values.landlordType } }
    const errors = landlordProfileErrors(patch.profile)
    if (errors.length) throw new Error(errors[0])
    const result = await api.requestOnboarding(context.linkedLead.id, 'PATCH', { version: onboarding.version, expectedDiscovery: onboarding.data, patch })
    if (!result.consistency?.synced && !result.onboarding?.consistency?.synced) throw new Error('The profile save could not be confirmed. Your draft is retained; please retry.')
    if (!result.onboarding) throw new Error('Onboarding saved, but its readback failed. Refresh before continuing.')
    savedOnboarding = result.onboarding
    for (const [key, value] of Object.entries(patch.profile || {})) if (stableJson(savedOnboarding.data?.profile?.[key]) !== stableJson(value)) throw new Error('The saved landlord profile could not be verified. Refresh before continuing.')
    if (patch.portfolio && stableJson(savedOnboarding.data?.portfolio) !== stableJson(patch.portfolio)) throw new Error('The saved rental onboarding details could not be verified. Refresh before continuing.')
    contactId = contactId || text(context.linkedLead.raw?.contactId || context.linkedLead.raw?.contact_id)
    // The versioned RPC committed contact, Client identity and all linked rental
    // listings together. Do not follow it with a stale second listing write.
    try {
      const saved = await api.getListing(listingId, { includeRequirementsAndDocuments: false })
      const expected = { landlordName: text(patch.profile.name), landlordEmail: text(patch.profile.email), landlordPhone: text(patch.profile.phone), landlordType: text(patch.profile.type) }
      for (const [key, value] of Object.entries(expected)) if (text(facts(saved)[key]) !== value) throw new Error('The saved listing landlord details could not be verified.')
      if (contactId) {
        const readback = await api.readContact(context.organisationId, contactId)
        if (text(readback.name) !== expected.landlordName || text(readback.email) !== expected.landlordEmail || text(readback.phone) !== expected.landlordPhone) throw new Error('The saved Client contact could not be verified.')
      }
      emitAgencyCrmUpdated({ organisationId: context.organisationId, leadId: context.linkedLead.id })
      return { ...saved, landlordOnboarding: savedOnboarding }
    } catch (cause) {
      const error = new Error(`Landlord details saved together, but their readback needs a retry. ${cause.message}`)
      error.onboarding = savedOnboarding
      throw error
    }
  }
  const landlordFacts = { landlordName: text(selectedValues.landlordName), landlordEmail: text(selectedValues.landlordEmail).toLowerCase(), landlordPhone: text(selectedValues.landlordPhone), landlordType: text(values.landlordType), ...(contactId ? { landlordContactId: contactId } : {}) }
  const readiness = { ...(listing.sellerCanonicalFactReadiness || listing.seller_canonical_fact_readiness_json || {}), landlordName: Boolean(landlordFacts.landlordName), landlordContact: Boolean(landlordFacts.landlordEmail || landlordFacts.landlordPhone) }
  try {
    if (contactId && context.mode === 'profile') {
      const [firstName, ...lastName] = landlordFacts.landlordName.split(/\s+/)
      await api.updateContact(context.organisationId, contactId, { firstName, lastName: lastName.join(' '), email: landlordFacts.landlordEmail, phone: landlordFacts.landlordPhone })
      const readback = await api.readContact(context.organisationId,contactId)
      if (text(readback.name) !== landlordFacts.landlordName || text(readback.email).toLowerCase() !== landlordFacts.landlordEmail || text(readback.phone) !== landlordFacts.landlordPhone) throw new Error('The saved client contact could not be verified. Retry to confirm it.')
    }
    const previousFacts = facts(listing)
    const capture = previousFacts.rentalCaptureDraft
    const saved = await api.updateListing(listingId, { sellerType: landlordFacts.landlordType, sellerCanonicalFacts: {
      ...previousFacts, ...landlordFacts,
      ...(capture?.version === 1 ? { rentalCaptureDraft: { ...capture, form: { ...capture.form, ...landlordFacts } } } : {}),
    }, sellerCanonicalFactReadiness: readiness, sellerCanonicalFactsUpdatedAt: new Date().toISOString() }, { includeRequirementsAndDocuments: false, expectedUpdatedAt: listing.updatedAt || listing.updated_at })
    for (const [key, value] of Object.entries(landlordFacts)) if (text(facts(saved)[key]) !== value) throw new Error('The landlord connection could not be verified. Retry to confirm it.')
    return savedOnboarding ? { ...saved, landlordOnboarding: savedOnboarding } : saved
  } catch (cause) {
    if (savedOnboarding) {
      const error = new Error(`Onboarding details saved, but the client/listing update needs a retry. ${cause.message}`)
      error.onboarding = savedOnboarding
      throw error
    }
    throw cause
  }
}

export async function createListingLandlordLead(listing, contact, discovery, context, client = supabase) {
  const assignedAgentId = text(listing.assignedAgentId || listing.assigned_agent_id || context.assignedAgentId)
  const payload = {
    lead_id: context.leadId, organisation_id: context.organisationId, contact_id: contact.id,
    branch_id: listing.branchId || listing.branch_id || context.branchId || null,
    assigned_agent_id: assignedAgentId || null, assigned_user_id: assignedAgentId || null,
    ownership_status: assignedAgentId ? 'assigned' : 'awaiting_assignment', assigned_at: assignedAgentId ? new Date().toISOString() : null,
    created_by: context.assignedAgentId || null, lead_category: 'seller', lead_direction: 'Inbound',
    lead_source: 'Manual', stage: 'New', status: 'New',
    seller_property_address: discovery.portfolio[0].address,
    raw_enquiry_payload: createRentalCrmLeadMetadata({ leadId: context.leadId, organisationId: context.organisationId, role: 'landlord', assignedAgentId, branchId: listing.branchId || listing.branch_id, relationships: { listingId: listing.id }, legacy: { landlordProfile: discovery.profile, landlordPortfolio: discovery.portfolio } }),
  }
  // Insert only: an uncertain acknowledgement must never overwrite a committed lead.
  const result = await client.from('leads').insert(payload).select('lead_id').single().catch((error) => ({ error }))
  const readback = await client.from('leads').select('lead_id,organisation_id,contact_id,raw_enquiry_payload').eq('lead_id', context.leadId).eq('organisation_id', context.organisationId).maybeSingle()
  const raw = readback.data
  if (readback.error || !raw || raw.contact_id !== contact.id || getRentalLeadMetadata(raw).role !== 'landlord' || getRentalLeadMetadata(raw).relationships.listingId !== listing.id) throw new Error(result.error?.message || 'Landlord onboarding setup could not be verified. Retry to confirm it.')
  emitAgencyCrmUpdated({ organisationId: context.organisationId, leadId: raw.lead_id, mutation: 'created' })
  return { id: raw.lead_id, role: 'landlord', raw, relationships: { listingId: listing.id } }
}

export async function startListingLandlordOnboarding(listingId, context, dependencies = {}) {
  const api = { getListing: getPrivateListing, updateListing: updatePrivateListing, loadSetup: loadListingLandlordSetup, createLead: createListingLandlordLead, requestOnboarding: requestRentalLandlordOnboarding, ...dependencies }
  const listing = await api.getListing(listingId, { includeRequirementsAndDocuments: false })
  if (!listing || text(listing.organisationId || listing.organisation_id) !== text(context.organisationId) || text(listing.listingCategory || listing.listing_category || listing.listingType || listing.listing_type) !== 'rental') throw new Error('This rental listing is unavailable in the selected workspace.')
  const setup = await api.loadSetup(listing, context)
  let linkedLead = setup.linkedLead
  if (!linkedLead) {
    const contact = setup.contacts.find((item) => item.id === facts(listing).landlordContactId)
    if (!contact) throw new Error('Connect a landlord from Clients before starting onboarding.')
    const discovery = buildListingLandlordDiscovery(listing)
    validateListingLandlord(listingLandlordValues(listing))
    if (!text(discovery.portfolio[0].address)) throw new Error('Save the rental property address before starting onboarding.')
    if (!context.leadId) throw new Error('A landlord onboarding reference is required.')
    linkedLead = await api.createLead(listing, contact, discovery, context)
  }
  const saved = await api.updateListing(listingId, { sellerCanonicalFacts: { ...facts(listing), landlordLeadId: linkedLead.id } }, { includeRequirementsAndDocuments: false, expectedUpdatedAt: listing.updatedAt || listing.updated_at })
  if (facts(saved).landlordLeadId !== linkedLead.id) throw new Error('The onboarding connection could not be verified. Retry to confirm it.')
  const result = await api.requestOnboarding(linkedLead.id)
  return { listing: saved, setup: { ...setup, linkedLead, onboarding: result.onboarding, onboardingError: '' } }
}
