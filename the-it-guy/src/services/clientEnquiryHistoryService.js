import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { buildClientEnquiryHistory } from '../core/clients/clientEnquiryHistory'

async function readPages(query) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 500) return rows
  }
}
async function readBatches(ids, query) {
  const rows = []
  for (let index = 0; index < ids.length; index += 100) rows.push(...await readPages(() => query(ids.slice(index, index + 100))))
  return rows
}

export async function loadClientEnquiryHistory(client) {
  if (!isSupabaseConfigured || !supabase || !client?.identityId || !client?.organisationId) return { available: false, enquiries: [], count: 0, repeat: false }
  const organisationId = client.organisationId
  // Resolve authorised, permanent client links. Never search by name or phone.
  const links = await readPages(() => supabase.from('agency_client_links').select('source_id')
    .eq('organisation_id', organisationId).eq('client_id', client.identityId).eq('source_kind', 'lead').order('id'))
  const ids = [...new Set(links.map(link => link.source_id))]
  const leads = await readBatches(ids, batch => supabase.from('leads').select('lead_id,organisation_id,lead_source,created_at,listing_id')
    .eq('organisation_id', organisationId).in('lead_id', batch).order('lead_id'))
  // The lead read is also subject to RLS. Only read logs for visible leads.
  const logs = await readBatches(leads.map(lead => lead.lead_id), batch => supabase.from('lead_ingestion_logs')
    .select('log_id,organisation_id,lead_id,listing_id,source,external_reference,status,review_status,duplicate_of_log_id,created_at')
    .eq('organisation_id', organisationId).in('lead_id', batch).order('log_id'))
  const listingIds = [...new Set([...leads, ...logs].map(row => row.listing_id).filter(Boolean))]
  const listings = await readBatches(listingIds, batch => supabase.from('private_listings').select('id,organisation_id,title,property_address')
    .eq('organisation_id', organisationId).in('id', batch).order('id'))
  return { available: true, ...buildClientEnquiryHistory({ organisationId, leads, logs, listings }) }
}
