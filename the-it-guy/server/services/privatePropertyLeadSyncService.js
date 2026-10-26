import { createPrivatePropertyClient, extractPrivatePropertyXmlBlocks, extractPrivatePropertyXmlTag } from './privatePropertyClient.js'
import { resolvePrivatePropertyCredentials } from './privatePropertyAgencyConfigService.js'

const text = (value) => String(value || '').trim()
const key = (value) => text(value).toLowerCase()
async function checked(query) { const result = await query; if (result.error) throw result.error; return result.data }

export function parsePrivatePropertyLeads(xml) {
  // An empty, valid result is distinct from a malformed or unrelated SOAP reply.
  if (!/<(?:\w+:)?ListingLeadDetailsFeedResult(?:\s|\/|>)/.test(xml)) throw new Error('private_property_lead_response_invalid')
  return extractPrivatePropertyXmlBlocks(xml, 'ListingLeadDetail').map((block) => {
    const field = (name) => extractPrivatePropertyXmlTag(block, name)
    const date = field('Date')
    // The supplier emits South African local timestamps without an offset.
    const timestamp = date && !/(Z|[+-]\d{2}:\d{2})$/i.test(date) ? `${date}+02:00` : date
    const lead = { id: field('LeadId'), branch: field('BranchId'), listing: field('UniqueListingId'), ref: field('PPRef'),
      name: field('FromName'), email: field('FromEmail'), phone: field('FromContactNumber'), type: field('LeadType'), message: field('Message'), date: timestamp }
    if (!lead.id || !lead.branch || !Number.isFinite(Date.parse(timestamp)) || !(lead.name || lead.email || lead.phone)) throw new Error('private_property_lead_identity_invalid')
    return lead
  })
}

export async function runPrivatePropertyLeadSync({ client, secrets = process.env, apply = false, startDate,
  now = new Date(), maxPages = 20, createPortal = createPrivatePropertyClient } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new Error('Invalid lead page limit.')
  const since = startDate || new Date(now.getTime() - 60 * 86400000).toISOString()
  if (!Number.isFinite(Date.parse(since)) || Date.parse(since) > now.getTime()) throw new Error('Invalid lead start date.')
  const configs = (await checked(client.from('private_property_agency_configs').select('*').eq('environment', 'production')
    .eq('enabled', true).in('status', ['approved', 'active'])) || []).filter((row) => row.go_live_approved_at)
  const branches = new Set()
  for (const config of configs) {
    if (!config.branch_guid || branches.has(key(config.branch_guid))) throw new Error('private_property_lead_branch_conflict')
    branches.add(key(config.branch_guid))
  }
  const reports = []
  for (const config of configs) {
    const report = { configId: config.id, organisationId: config.organisation_id, status: 'COMPLETE', pages: 0, matched: 0, duplicates: 0, eligible: 0, imported: 0, historical: 0, unlinked: 0, otherBranch: 0 }
    try {
      // Never send credentials to an arbitrary configured host.
      if (config.base_url !== 'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx') throw new Error('private_property_lead_host_invalid')
      const credentials = await resolvePrivatePropertyCredentials({ client, config, secrets })
      if (credentials.missingSecrets.length) throw new Error('private_property_lead_credentials_missing')
      const portal = createPortal({ baseUrl: config.base_url, username: credentials.username, password: credentials.password })
      const leads = new Map(), cursors = new Set(['0'])
      let cursor = '0', complete = false
      for (let page = 0; page < maxPages; page++) {
        const response = await portal.getListingLeadDetailsFeed({ startDate: since, continuationKey: cursor })
        report.pages++
        const rows = parsePrivatePropertyLeads(response.data)
        for (const row of rows) {
          if (key(row.branch) === key(config.branch_guid)) leads.set(row.id, row)
          else report.otherBranch++
        }
        const next = text(response.summary?.continuationKey)
        if (!rows.length || !next) { complete = true; break }
        if (cursors.has(next)) throw new Error('private_property_lead_cursor_repeated')
        cursors.add(next); cursor = next
      }
      if (!complete) throw new Error('private_property_lead_page_limit')
      // Fetch the full inventory; Supabase's default row cap must not hide mappings.
      const mappings = []
      for (let offset = 0; ; offset += 500) {
        if (offset >= 10000) throw new Error('private_property_lead_mapping_limit')
        const page = await checked(client.from('private_property_listing_syncs')
          .select('private_listing_id,property_id,private_property_ref,listing_type,private_listings!inner(id,organisation_id)')
          .eq('environment', 'production').eq('branch_guid', config.branch_guid)
          .eq('private_listings.organisation_id', config.organisation_id).order('private_listing_id').range(offset, offset + 499)) || []
        mappings.push(...page); if (page.length < 500) break
      }
      for (const lead of leads.values()) {
        report.matched++
        const candidates = mappings.filter((row) => (lead.listing && [row.property_id, row.private_listing_id].some((id) => key(id) === key(lead.listing))) || (lead.ref && key(row.private_property_ref) === key(lead.ref)))
        if (new Set(candidates.map((row) => row.private_listing_id)).size > 1) throw new Error('private_property_lead_listing_ambiguous')
        const mapping = candidates[0]
        if (!mapping) report.unlinked++
        const reference = `PP:${lead.id}`
        const existing = await checked(client.from('lead_ingestion_logs').select('lead_id').eq('organisation_id', config.organisation_id)
          .eq('source', 'Private Property').eq('external_reference', reference).eq('status', 'processed').limit(1))
        if (existing?.length) { report.duplicates++; continue }
        const historical = Date.parse(lead.date) < now.getTime() - 24 * 3600000
        report.eligible++; if (historical) report.historical++
        if (!apply) continue
        const rental = mapping?.listing_type === 'Rental' || /^RR/i.test(lead.ref)
        await checked(client.rpc('private_property_ingest_lead', {
          p_organisation_id: config.organisation_id, p_external_reference: reference, p_name: lead.name, p_email: lead.email,
          p_phone: lead.phone, p_message: lead.message, p_listing_id: mapping?.private_listing_id || null,
          p_raw_payload: { leadId: lead.id, leadDateTime: lead.date, branchId: lead.branch, listingId: lead.listing,
            listingReference: lead.ref, listingType: rental ? 'Rental' : 'Sale', leadType: lead.type,
            ingestionMethod: 'ListingLeadDetailsFeed', arch9NotificationHistorical: historical,
            ...(rental ? { arch9RentalLead: true, classification: 'rental', role: 'tenant' } : {}) },
        }))
        report.imported++
      }
    } catch (error) {
      report.status = 'FAILED'
      // SOAP errors can contain supplier responses; retain only a safe diagnostic code.
      report.error = /^private_property_lead_\w+$/.test(error.message) ? error.message : 'private_property_lead_sync_failed'
    }
    reports.push(report)
  }
  return { status: !configs.length || reports.some((row) => row.status === 'FAILED') ? 'ATTENTION_REQUIRED' : 'COMPLETE',
    mode: apply ? 'APPLY' : 'DRY_RUN', startDate: since, configuredBranches: configs.length, reports }
}
