import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function valueAfter(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

function readEnvironment(files) {
  const values = {}
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!match) continue
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return values
}

function required(flag) {
  const value = valueAfter(flag)
  if (!value) throw new Error(`Missing ${flag}.`)
  return value
}

function toText(value = '') {
  return String(value || '').trim()
}

function contactName(contact = {}) {
  return [contact.first_name, contact.last_name].map(toText).filter(Boolean).join(' ') || 'Property24 buyer'
}

const apply = process.argv.includes('--apply')
const organisationId = required('--organisation-id')
const developmentId = required('--development-id')
const listingId = required('--listing-id')
const environment = readEnvironment(['.env', '.env.local'])
const url = environment.VITE_SUPABASE_URL || environment.SUPABASE_URL
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) throw new Error('Missing Supabase credentials in .env/.env.local.')

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const developmentResult = await supabase
  .from('developments')
  .select('id, organisation_id, name')
  .eq('id', developmentId)
  .maybeSingle()

if (developmentResult.error) throw developmentResult.error
if (!developmentResult.data?.id) throw new Error('Development was not found.')
if (toText(developmentResult.data.organisation_id) !== organisationId) {
  throw new Error('The development does not belong to the supplied organisation.')
}

const leadsResult = await supabase
  .from('leads')
  .select('lead_id, organisation_id, assigned_agent_id, source_reference_id, enquired_property_title, property_interest, raw_enquiry_payload, notes, contacts!leads_contact_id_fkey(first_name,last_name,email,phone)')
  .eq('organisation_id', organisationId)
  .eq('listing_id', listingId)
  .eq('lead_source', 'Property24')

if (leadsResult.error) throw leadsResult.error
const sourceLeads = leadsResult.data || []
const sourceLeadIds = sourceLeads.map((lead) => lead.lead_id).filter(Boolean)
const existingResult = sourceLeadIds.length
  ? await supabase
    .from('developer_leads')
    .select('developer_lead_id, source_lead_id')
    .eq('developer_org_id', organisationId)
    .eq('primary_development_id', developmentId)
    .eq('ownership_model', 'agency_introduced')
    .in('source_lead_id', sourceLeadIds)
  : { data: [], error: null }

if (existingResult.error) throw existingResult.error
const existingSourceLeadIds = new Set((existingResult.data || []).map((lead) => lead.source_lead_id))
const missing = sourceLeads.filter((lead) => !existingSourceLeadIds.has(lead.lead_id))

const report = {
  mode: apply ? 'APPLY' : 'DRY_RUN',
  organisationId,
  developmentId,
  developmentName: developmentResult.data.name,
  listingId,
  property24CrmLeadCount: sourceLeads.length,
  existingDeveloperLeadCount: existingSourceLeadIds.size,
  developerLeadsToCreate: missing.length,
}

if (!apply || !missing.length) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const developerLeads = missing.map((lead) => ({
  developer_lead_id: randomUUID(),
  developer_org_id: organisationId,
  source_agency_org_id: organisationId,
  source_agent_user_id: toText(lead.assigned_agent_id) || null,
  assigned_agent_id: toText(lead.assigned_agent_id) || null,
  source_lead_id: lead.lead_id,
  primary_development_id: developmentId,
  ownership_model: 'agency_introduced',
  lead_owner: 'agency',
  selling_model: 'agent_led',
  visibility_state: 'limited',
  reservation_state: 'none',
  lead_status: 'new',
  lead_source: 'Property24 development enquiry',
  unit_type_interest: toText(lead.enquired_property_title || lead.property_interest) || null,
  public_reference: toText(lead.source_reference_id) || null,
  protected_summary: [developmentResult.data.name, toText(lead.enquired_property_title || lead.property_interest), 'Property24 inbound lead'].filter(Boolean).join(' | '),
}))

const developerLeadResult = await supabase.from('developer_leads').insert(developerLeads).select('developer_lead_id, source_lead_id')
if (developerLeadResult.error) throw developerLeadResult.error

const bySourceLeadId = new Map(developerLeads.map((lead) => [lead.source_lead_id, lead]))
const privateRows = missing.map((lead) => {
  const developerLead = bySourceLeadId.get(lead.lead_id)
  const contact = lead.contacts || {}
  return {
    developer_lead_id: developerLead.developer_lead_id,
    buyer_full_name: contactName(contact),
    buyer_email: toText(contact.email).toLowerCase() || null,
    buyer_phone: toText(contact.phone) || null,
    private_notes: toText(lead.notes) || null,
    raw_payload: { source: 'Property24', externalReference: toText(lead.source_reference_id) || null, lead: lead.raw_enquiry_payload || {} },
    handover_source: 'agency',
  }
})
const interestRows = developerLeads.map((lead) => ({
  developer_lead_id: lead.developer_lead_id,
  developer_org_id: organisationId,
  development_id: developmentId,
  interest_rank: 1,
  interest_status: 'interested',
  unit_type_interest: lead.unit_type_interest,
  is_primary: true,
}))

const [privateResult, interestResult] = await Promise.all([
  supabase.from('developer_lead_private_details').insert(privateRows),
  supabase.from('developer_lead_development_interests').insert(interestRows),
])
if (privateResult.error || interestResult.error) {
  const createdIds = developerLeads.map((lead) => lead.developer_lead_id)
  await supabase.from('developer_lead_private_details').delete().in('developer_lead_id', createdIds)
  await supabase.from('developer_lead_development_interests').delete().in('developer_lead_id', createdIds)
  await supabase.from('developer_leads').delete().in('developer_lead_id', createdIds)
  throw privateResult.error || interestResult.error
}

const verification = await supabase
  .from('developer_leads')
  .select('developer_lead_id')
  .eq('developer_org_id', organisationId)
  .eq('primary_development_id', developmentId)
  .in('source_lead_id', missing.map((lead) => lead.lead_id))

if (verification.error) throw verification.error
console.log(JSON.stringify({ ...report, createdDeveloperLeadCount: (verification.data || []).length }, null, 2))
