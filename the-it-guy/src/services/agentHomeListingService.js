import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import { getListingOverviewAnalytics } from './listings/listingOverviewPerformanceService.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (value) => String(value || '').trim()
const key = (value) => text(value).toLowerCase().replace(/[\s-]+/g, '_')
const LEAD_FIELDS = 'lead_id,listing_id,enquired_listing_id,lead_category,stage,status,converted_transaction_id'

export function getAgentHomeListingSellerName(listing = {}, form = {}) {
  const facts = listing.sellerCanonicalFacts || listing.sellerOnboarding?.canonicalFacts || {}
  const seller = facts.seller || {}
  return [
    facts.fullName, facts.sellerName, facts.name,
    [facts.firstName, facts.lastName].filter(Boolean).join(' '),
    seller.full_name, seller.fullName,
    [seller.first_name || seller.firstName, seller.surname || seller.lastName].filter(Boolean).join(' '),
    facts.company?.registered_name, facts.trust?.name,
    listing.seller?.name,
    form.fullName, form.sellerName,
    [form.sellerFirstName || form.firstName, form.sellerSurname || form.lastName].filter(Boolean).join(' '),
    form.companyName, form.trustName, form.primaryContactName,
  ].map(text).find(Boolean) || 'Seller pending'
}

export function summarizeAgentHomeListingViews(data) {
  if (!data?.period?.completedDaysOnly || data.windowDays !== 30 || !data.period.startDate || !data.period.endDate) {
    return { views: null, partialViews: false }
  }
  const metrics = ['property24', 'privateProperty', 'website'].map((channel) => data[channel]?.metrics?.views)
  const available = metrics.filter((metric) => metric?.available === true && Number.isFinite(metric.value) && metric.value >= 0)
  return {
    views: available.length ? available.reduce((total, metric) => total + metric.value, 0) : null,
    partialViews: available.length > 0 && (available.length < metrics.length || available.some((metric) => !metric.complete)),
  }
}

function isNewEnquiry(lead) {
  const category = key(lead.lead_category)
  if (category.includes('seller') || category.includes('landlord') || lead.converted_transaction_id) return false
  if (/converted|closed|lost|archived|deleted/.test(key(lead.status))) return false
  return ['new', 'new_lead', 'new_enquiry', 'new_inquiry'].includes(key(lead.stage || lead.status))
}

async function readAll(buildQuery, signal) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    let request = buildQuery().range(offset, offset + 999)
    if (signal) request = request.abortSignal(signal)
    const { data, error } = await request
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) return rows
  }
}

async function readNewLeadCounts(organisationId, ids, signal) {
  const [interests, directLeads] = await Promise.all([
    readAll(() => supabase.from('lead_listing_interests').select('id,listing_id,lead_id,status')
      .eq('organisation_id', organisationId).in('listing_id', ids).order('id'), signal),
    readAll(() => supabase.from('leads').select(LEAD_FIELDS).eq('organisation_id', organisationId)
      .or(`listing_id.in.(${ids.join(',')}),enquired_listing_id.in.(${ids.join(',')})`).order('lead_id'), signal),
  ])
  const currentInterests = interests.filter((interest) => !['dismissed', 'not_interested', 'archived', 'deleted'].includes(key(interest.status)))
  const leads = new Map(directLeads.map((lead) => [lead.lead_id, lead]))
  const missingIds = [...new Set(currentInterests.map((interest) => interest.lead_id).filter((id) => UUID.test(id || '') && !leads.has(id)))]
  for (let offset = 0; offset < missingIds.length; offset += 100) {
    const linked = await readAll(() => supabase.from('leads').select(LEAD_FIELDS)
      .eq('organisation_id', organisationId).in('lead_id', missingIds.slice(offset, offset + 100)).order('lead_id'), signal)
    linked.forEach((lead) => leads.set(lead.lead_id, lead))
  }
  const counts = new Map(ids.map((id) => [id, new Set()]))
  const add = (listingId, leadId) => {
    if (counts.has(listingId) && leads.has(leadId) && isNewEnquiry(leads.get(leadId))) counts.get(listingId).add(leadId)
  }
  directLeads.forEach((lead) => {
    add(lead.listing_id, lead.lead_id)
    add(lead.enquired_listing_id, lead.lead_id)
  })
  currentInterests.forEach((interest) => add(interest.listing_id, interest.lead_id))
  return Object.fromEntries([...counts].map(([id, leadIds]) => [id, leadIds.size]))
}

// Only the compact, agent-scoped summary rows passed by the home page are read.
// Photos use the existing cover reader; these reads never hydrate documents or galleries.
export async function loadAgentHomeListingStats({ organisationId, listings = [], signal } = {}) {
  const ids = [...new Set(listings.filter((listing) => listing.organisationId === organisationId)
    .map((listing) => listing.id).filter((id) => UUID.test(id || '')))]
  if (!isSupabaseConfigured || !supabase || !UUID.test(organisationId || '') || !ids.length) return {}
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const result = Object.fromEntries(ids.map((id) => [id, { views: null, partialViews: false, newLeads: null }]))
  let next = 0
  await Promise.all([
    readNewLeadCounts(organisationId, ids, signal).then((counts) => {
      ids.forEach((id) => { result[id].newLeads = counts[id] })
    }).catch(() => {}),
    readAll(() => supabase.from('private_listing_seller_onboarding').select('id,private_listing_id,form_data')
      .in('private_listing_id', ids).order('id'), signal).then((rows) => {
      const forms = new Map(rows.map((row) => [row.private_listing_id, row.form_data]))
      listings.forEach((listing) => {
        if (result[listing.id]) result[listing.id].sellerName = getAgentHomeListingSellerName(listing, forms.get(listing.id) || {})
      })
    }).catch(() => {}),
    ...Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (next < ids.length && !signal?.aborted) {
        const id = ids[next++]
        try {
          const data = await getListingOverviewAnalytics({ organisationId, listingId: id, days: 30, signal })
          Object.assign(result[id], summarizeAgentHomeListingViews(data))
        } catch { /* Keep unavailable statistics distinct from a verified zero. */ }
      }
    }),
  ])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return result
}
