import { supabase } from '../lib/supabaseClient.js'
import { inferLeadCategoryFromRecord } from '../lib/leadCategory.js'
import { getLeadDevelopmentId } from '../core/leads/developmentBuyerLead.js'

const text = (value) => String(value ?? '').trim()
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
const uniqueIds = (values) => [...new Set(values.map(text).filter(isUuid))]

function rows(result) {
  if (result.error) {
    // Older databases may not have the optional development lead foundation.
    if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(result.error.code)) return []
    throw result.error
  }
  return Array.isArray(result.data) ? result.data : []
}

// Read commercial linkage only. Buyer PII continues to come from the agency
// lead/contact and is never copied from protected developer private details.
export async function enrichDevelopmentBuyerLeads(organisationId, leads = [], { client = supabase } = {}) {
  if (!isUuid(organisationId)) throw new Error('A resolved organisation is required to load development links.')
  if (!client || !leads.length) return leads
  const buyers = leads.filter((lead) => inferLeadCategoryFromRecord(lead, 'buyer') === 'buyer')
  const leadIds = uniqueIds(buyers.map((lead) => lead.leadId || lead.lead_id))
  const listingIds = uniqueIds(buyers.flatMap((lead) => [lead.listingId || lead.listing_id, lead.enquiredListingId || lead.enquired_listing_id]))
  // Independent linkage reads share a small worker pool; preserve batch order
  // so the newest matching developer link remains the first choice.
  const requests = []
  for (let offset = 0; offset < leadIds.length; offset += 200) {
    const ids = leadIds.slice(offset, offset + 200)
    requests.push({ kind: 'links', load: () => client.from('developer_leads')
      .select('developer_lead_id, source_lead_id, primary_development_id, preferred_unit_id, reservation_state, reservation_expires_at, lead_status')
      .or(`developer_org_id.eq.${organisationId},source_agency_org_id.eq.${organisationId}`)
      .in('source_lead_id', ids).order('updated_at', { ascending: false }) })
  }
  for (let offset = 0; offset < listingIds.length; offset += 200) {
    const ids = listingIds.slice(offset, offset + 200)
    requests.push({ kind: 'listings', load: () => client.from('private_listings').select('id, development_id')
      .eq('organisation_id', organisationId).in('id', ids) })
  }
  const results = new Array(requests.length)
  let cursor = 0
  let failed = false
  async function worker() {
    while (!failed && cursor < requests.length) {
      const index = cursor++
      try {
        results[index] = rows(await requests[index].load())
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, requests.length) }, worker))
  const links = results.flatMap((result, index) => requests[index].kind === 'links' ? result : [])
  const listings = results.flatMap((result, index) => requests[index].kind === 'listings' ? result : [])
  const listingById = new Map(listings.map((listing) => [listing.id, listing]))
  const linksByLeadId = new Map()
  for (const link of links) {
    const id = text(link.source_lead_id)
    if (!linksByLeadId.has(id)) linksByLeadId.set(id, [])
    linksByLeadId.get(id).push(link)
  }
  return leads.map((lead) => {
    if (inferLeadCategoryFromRecord(lead, 'buyer') !== 'buyer') return lead
    const id = text(lead.leadId || lead.lead_id)
    const selectedListing = listingById.get(lead.listingId || lead.listing_id)
    const enquiredListing = listingById.get(lead.enquiredListingId || lead.enquired_listing_id)
    const explicitDevelopmentId = getLeadDevelopmentId(lead) || text(selectedListing?.development_id || enquiredListing?.development_id)
    const link = (linksByLeadId.get(id) || []).find((row) => row.primary_development_id && (!explicitDevelopmentId || row.primary_development_id === explicitDevelopmentId))
    const developmentId = explicitDevelopmentId || text(link?.primary_development_id)
    if (!developmentId) return lead
    return {
      ...lead,
      developmentId,
      developmentLeadContext: link ? {
        developerLeadId: link.developer_lead_id,
        primaryDevelopmentId: link.primary_development_id,
        preferredUnitId: link.preferred_unit_id || '',
        reservationState: link.reservation_state || 'none',
        reservationExpiresAt: link.reservation_expires_at || null,
        leadStatus: link.lead_status || '',
      } : lead.developmentLeadContext,
    }
  })
}

export async function listBuyerLeadDevelopmentOptions(organisationId, { client = supabase } = {}) {
  if (!isUuid(organisationId) || !client) throw new Error('A resolved organisation is required to load developments.')
  const [ownedResult, relationshipResult] = await Promise.all([
    client.from('developments').select('id, name, status').eq('organisation_id', organisationId),
    client.from('development_organisation_relationships').select('development_id').eq('organisation_id', organisationId).eq('status', 'active').eq('can_view', true),
  ])
  const owned = rows(ownedResult)
  const sharedIds = uniqueIds(rows(relationshipResult).map((row) => row.development_id))
  const shared = []
  for (let offset = 0; offset < sharedIds.length; offset += 200) {
    shared.push(...rows(await client.from('developments').select('id, name, status').in('id', sharedIds.slice(offset, offset + 200))))
  }
  return [...new Map([...owned, ...shared].map((row) => [row.id, row])).values()]
    .filter((row) => !['archived', 'deleted', 'cancelled', 'closed'].includes(text(row.status).toLowerCase()))
    .map((row) => ({ id: row.id, label: text(row.name) || 'Untitled development' }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// Only read buyer identities owned by the active workspace. Developer access to
// an introduced lead does not imply access to the introducing agency's CRM.
export async function enrichDevelopmentLeadBuyerContacts(organisationId, leads = [], { client = supabase } = {}) {
  if (!isUuid(organisationId) || !client) return leads
  const maskedAgencyIds = uniqueIds(leads.filter(lead => lead.leadOwner === 'agency' && lead.sourceAgencyOrgId === organisationId && !lead.sourceLeadId).map(lead => lead.developerLeadId))
  const agencyLinks = []
  for (let offset = 0; offset < maskedAgencyIds.length; offset += 200) {
    agencyLinks.push(...rows(await client.from('developer_leads').select('developer_lead_id, source_lead_id')
      .eq('source_agency_org_id', organisationId).in('developer_lead_id', maskedAgencyIds.slice(offset, offset + 200))))
  }
  const sourceByDeveloperLead = new Map(agencyLinks.map(link => [link.developer_lead_id, link.source_lead_id]))
  const scopedLeads = leads.map(lead => lead.leadOwner === 'agency' && lead.sourceAgencyOrgId === organisationId && !lead.sourceLeadId && sourceByDeveloperLead.has(lead.developerLeadId)
    ? { ...lead, sourceLeadId: sourceByDeveloperLead.get(lead.developerLeadId) } : lead)
  const eligible = scopedLeads.filter(lead => (lead.leadOwner === 'agency' ? lead.sourceAgencyOrgId : lead.developerOrgId) === organisationId)
  const ids = uniqueIds(eligible.map(lead => lead.sourceLeadId))
  if (!ids.length) return leads
  const sourceRows = []
  for (let offset = 0; offset < ids.length; offset += 200) {
    sourceRows.push(...rows(await client.from('leads').select('lead_id, contact_id, converted_transaction_id')
      .eq('organisation_id', organisationId).in('lead_id', ids.slice(offset, offset + 200))))
  }
  const contactIds = uniqueIds(sourceRows.map(lead => lead.contact_id))
  const contacts = []
  for (let offset = 0; offset < contactIds.length; offset += 200) {
    contacts.push(...rows(await client.from('contacts').select('contact_id, first_name, last_name, email, phone')
      .eq('organisation_id', organisationId).in('contact_id', contactIds.slice(offset, offset + 200))))
  }
  const contactById = new Map(contacts.map(contact => [contact.contact_id, contact]))
  const sourceRowByLead = new Map(sourceRows.map(row => [row.lead_id, row]))
  const contactByLead = new Map(sourceRows.map(lead => [lead.lead_id, contactById.get(lead.contact_id)]))
  const eligibleIds = new Set(ids)
  return scopedLeads.map(lead => {
    const owned = (lead.leadOwner === 'agency' ? lead.sourceAgencyOrgId : lead.developerOrgId) === organisationId
    const contact = owned && eligibleIds.has(lead.sourceLeadId) && contactByLead.get(lead.sourceLeadId)
    if (!contact) return lead
    return { ...lead,
      buyerWorkspaceTransactionId: text(sourceRowByLead.get(lead.sourceLeadId)?.converted_transaction_id),
      buyerFullName: [text(contact.first_name), text(contact.last_name)].filter(Boolean).join(' ') || lead.buyerFullName,
      buyerEmail: text(contact.email),
      buyerPhone: text(contact.phone),
    }
  })
}
