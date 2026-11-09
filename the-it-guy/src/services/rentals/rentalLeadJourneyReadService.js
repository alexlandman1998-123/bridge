import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { projectRentalLeadJourney } from './rentalLeadJourneyProjection.js'

const text = value => String(value ?? '').trim()

async function readBatches(db, table, fields, organisationId, column, ids) {
  const rows = []
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100)
    for (let offset = 0; ; offset += 1000) {
      const result = await db.from(table).select(fields).eq('organisation_id', organisationId)
        .in(column, batch).order('id').range(offset, offset + 999)
      if (result.error) throw new Error(`Rental journey progress could not be loaded. Refresh to retry. ${result.error.message || ''}`.trim())
      const page = result.data || []
      rows.push(...page.filter(row => row.organisation_id === organisationId && batch.includes(text(row[column]))))
      if (page.length < 1000) break
    }
  }
  return rows
}

export async function enrichRentalLeadJourneyViews(organisationId, leads = [], { client: db = supabase } = {}) {
  const tenantIds = [...new Set(leads.filter(lead => lead.role === 'tenant').map(lead => text(lead.id)).filter(Boolean))]
  if (!tenantIds.length) return leads
  if (!text(organisationId) || !db || (db === supabase && !isSupabaseConfigured)) throw new Error('Rental journey progress requires a configured workspace.')
  // Read only progress fields, not full application forms, documents or tokens.
  const applications = await readBatches(db, 'rental_applications',
    'id,organisation_id,lead_id,status,onboarding_sent_at:application_data->onboarding->>sentAt', organisationId, 'lead_id', tenantIds)
  if (!applications.length) return leads
  const conversions = await readBatches(db, 'rental_tenancies',
    'id,organisation_id,source_application_id,status,rental_leases(id,status)', organisationId, 'source_application_id', applications.map(row => row.id))
  const byLead = new Map()
  const tenancyByApplication = new Map(conversions.map(row => [row.source_application_id, row]))
  for (const row of applications) {
    if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, { applications: [], conversions: [] })
    const evidence = byLead.get(row.lead_id)
    evidence.applications.push({ id: row.id, status: row.status, data: { onboarding: { sentAt: row.onboarding_sent_at } } })
    if (tenancyByApplication.has(row.id)) evidence.conversions.push(tenancyByApplication.get(row.id))
  }
  return leads.map(lead => projectRentalLeadJourney(lead, byLead.get(lead.id)))
}
