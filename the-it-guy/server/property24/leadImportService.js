import { randomUUID } from 'node:crypto'
import { summarizeProperty24LeadPayload } from './leadService.js'
import {
  createProperty24LeadImportPlan,
  normalizeProperty24LeadForImport,
} from './reconciliationService.js'
import { normalizeProperty24Text } from './client.js'

function normalizeText(value = '') {
  return normalizeProperty24Text(value)
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizePhone(value = '') {
  return normalizeText(value).replace(/[^\d+]/g, '')
}

function splitContactName(name = '') {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Property24', lastName: 'Lead' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.at(-1),
  }
}

function isMissingOptionalTableError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message || error?.details).toLowerCase()
  return code === '42P01' || code === 'PGRST205' || message.includes('does not exist')
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.leads)) return value.leads
  if (Array.isArray(value?.Leads)) return value.Leads
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.Items)) return value.Items
  return []
}

async function maybeSingle(query) {
  if (typeof query.maybeSingle === 'function') return query.maybeSingle()
  return query.single()
}

async function fetchListingDetailsByIds(supabase, listingIds = []) {
  const ids = [...new Set(listingIds.map(normalizeText).filter(Boolean))]
  if (!ids.length) return new Map()
  const result = await supabase
    .from('private_listings')
    .select('id, organisation_id, assigned_agent_id, assigned_agent_email, title')
    .in('id', ids)
  if (result.error) throw result.error
  return new Map((result.data || []).map((row) => [normalizeText(row.id), row]))
}

async function findExistingIngestionLog(supabase, lead = {}) {
  if (!lead.organisationId || !lead.externalReference) return null
  const result = await maybeSingle(
    supabase
      .from('lead_ingestion_logs')
      .select('log_id, lead_id, contact_id, status')
      .eq('organisation_id', lead.organisationId)
      .eq('source', lead.source || 'Property24')
      .eq('external_reference', lead.externalReference),
  )
  if (result.error && result.error.code !== 'PGRST116') throw result.error
  return result.data || null
}

async function findExistingContact(supabase, { organisationId = '', email = '', phone = '' } = {}) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPhone = normalizePhone(phone)
  if (normalizedEmail) {
    const result = await maybeSingle(
      supabase
        .from('contacts')
        .select('contact_id, first_name, last_name, email, phone')
        .eq('organisation_id', organisationId)
        .eq('email', normalizedEmail)
        .order('created_at', { ascending: true })
        .limit(1),
    )
    if (result.error && result.error.code !== 'PGRST116') throw result.error
    if (result.data) return result.data
  }
  if (normalizedPhone) {
    const result = await maybeSingle(
      supabase
        .from('contacts')
        .select('contact_id, first_name, last_name, email, phone')
        .eq('organisation_id', organisationId)
        .eq('phone', normalizedPhone)
        .order('created_at', { ascending: true })
        .limit(1),
    )
    if (result.error && result.error.code !== 'PGRST116') throw result.error
    if (result.data) return result.data
  }
  return null
}

function buildLeadNotes(lead = {}) {
  return [
    lead.message,
    lead.listingNumber ? `Property24 listing number: ${lead.listingNumber}` : '',
    lead.receivedAt ? `Received: ${lead.receivedAt}` : '',
    lead.externalReference ? `Property24 reference: ${lead.externalReference}` : '',
  ].map(normalizeText).filter(Boolean).join('\n')
}

function buildCrmRows(lead = {}, listing = {}) {
  const nowIso = new Date().toISOString()
  const contactId = randomUUID()
  const leadId = randomUUID()
  const { firstName, lastName } = splitContactName(lead.contactName || lead.email || lead.phone)
  const assignedAgentId = normalizeText(listing.assigned_agent_id)
  const assignedAgentEmail = normalizeEmail(listing.assigned_agent_email)
  const title = normalizeText(listing.title)
  const notes = buildLeadNotes(lead)

  return {
    organisationId: normalizeText(lead.organisationId),
    contactId,
    leadId,
    contactRow: {
      contact_id: contactId,
      organisation_id: normalizeText(lead.organisationId),
      assigned_agent_id: assignedAgentId || null,
      first_name: firstName,
      last_name: lastName || null,
      phone: normalizeText(lead.phone) || null,
      email: normalizeEmail(lead.email) || null,
      contact_type: 'Lead',
      notes: notes || null,
      updated_at: nowIso,
    },
    leadRow: {
      lead_id: leadId,
      organisation_id: normalizeText(lead.organisationId),
      assigned_agent_id: assignedAgentId || null,
      assigned_user_id: assignedAgentId || null,
      assigned_agent_email: assignedAgentEmail || null,
      contact_id: contactId,
      lead_category: 'buyer',
      lead_direction: 'Inbound',
      lead_source: 'Property24',
      stage: 'New Lead',
      status: 'New Lead',
      priority: 'High',
      budget: 0,
      area_interest: null,
      property_interest: title || null,
      listing_id: lead.listingId || null,
      enquired_listing_id: lead.listingId || null,
      enquired_property_title: title || null,
      source_reference_id: lead.externalReference || lead.dedupeKey || null,
      raw_enquiry_payload: {
        source: 'Property24',
        externalReference: lead.externalReference || null,
        listingNumber: lead.listingNumber || null,
        receivedAt: lead.receivedAt || null,
        lead: lead.raw || {},
      },
      notes: notes || null,
      updated_at: nowIso,
    },
  }
}

async function persistContact(supabase, rows = {}, lead = {}) {
  const existingContact = await findExistingContact(supabase, {
    organisationId: rows.organisationId,
    email: lead.email,
    phone: lead.phone,
  })
  const contactRow = existingContact?.contact_id
    ? {
        ...rows.contactRow,
        contact_id: existingContact.contact_id,
        first_name: normalizeText(existingContact.first_name) || rows.contactRow.first_name,
        last_name: normalizeText(existingContact.last_name) || rows.contactRow.last_name,
        email: normalizeEmail(existingContact.email) || rows.contactRow.email,
        phone: normalizeText(existingContact.phone) || rows.contactRow.phone,
      }
    : rows.contactRow

  const result = await supabase
    .from('contacts')
    .upsert(contactRow, { onConflict: 'contact_id' })
    .select('contact_id')
    .single()
  if (result.error) throw result.error
  return {
    ...rows,
    contactId: normalizeText(result.data?.contact_id || contactRow.contact_id),
    contactRow,
    reusedContact: Boolean(existingContact),
  }
}

async function persistLead(supabase, rows = {}) {
  const leadRow = {
    ...rows.leadRow,
    contact_id: rows.contactId,
  }
  const result = await supabase
    .from('leads')
    .upsert(leadRow, { onConflict: 'lead_id' })
    .select('lead_id')
    .single()
  if (result.error) throw result.error
  return {
    ...rows,
    leadId: normalizeText(result.data?.lead_id || leadRow.lead_id),
    leadRow,
  }
}

async function persistListingInterest(supabase, rows = {}, lead = {}) {
  if (!lead.listingId) return { ...rows, listingInterest: null }
  const result = await supabase
    .from('lead_listing_interests')
    .upsert({
      organisation_id: rows.organisationId,
      lead_id: rows.leadId,
      contact_id: rows.contactId,
      listing_id: lead.listingId,
      source: 'Property24',
      status: 'interested',
      is_original_enquiry: true,
      is_agent_selected: false,
      is_system_suggested: false,
      notes: 'Property24 enquiry imported automatically.',
    }, { onConflict: 'lead_id,listing_id' })
    .select('interest_id, listing_id')
    .single()
  if (result.error) throw result.error
  return { ...rows, listingInterest: result.data || null }
}

async function persistActivityAndTask(supabase, rows = {}, lead = {}) {
  const nowIso = new Date().toISOString()
  const dueDate = nowIso.slice(0, 10)
  const activity = supabase
    .from('lead_activities')
    .insert({
      organisation_id: rows.organisationId,
      lead_id: rows.leadId,
      agent_id: rows.leadRow.assigned_agent_id || null,
      activity_type: 'Property24 enquiry received',
      activity_note: buildLeadNotes(lead) || 'Property24 enquiry imported.',
      activity_date: lead.receivedAt || nowIso,
      outcome: 'New Lead',
    })
    .select('activity_id')
    .single()
  const task = supabase
    .from('tasks')
    .insert({
      organisation_id: rows.organisationId,
      lead_id: rows.leadId,
      assigned_agent_id: rows.leadRow.assigned_agent_id || null,
      title: 'Contact Property24 Lead',
      description: lead.message || 'Follow up with the Property24 enquiry.',
      due_date: dueDate,
      status: 'Pending',
      priority: 'High',
      updated_at: nowIso,
    })
    .select('task_id')
    .single()
  const [activityResult, taskResult] = await Promise.all([activity, task])
  if (activityResult.error && !isMissingOptionalTableError(activityResult.error)) throw activityResult.error
  if (taskResult.error && !isMissingOptionalTableError(taskResult.error)) throw taskResult.error
  return {
    ...rows,
    activity: activityResult.error ? null : activityResult.data || null,
    task: taskResult.error ? null : taskResult.data || null,
  }
}

async function persistIngestionLog(supabase, rows = {}, lead = {}) {
  const result = await supabase
    .from('lead_ingestion_logs')
    .insert({
      organisation_id: rows.organisationId,
      source: 'Property24',
      external_reference: lead.externalReference || lead.dedupeKey || null,
      payload: {
        source: 'Property24',
        listingNumber: lead.listingNumber || null,
        receivedAt: lead.receivedAt || null,
        lead: lead.raw || {},
      },
      status: 'processed',
      lead_id: rows.leadId,
      contact_id: rows.contactId,
    })
    .select('log_id')
    .single()

  if (result.error) {
    if (result.error.code === '23505') {
      return { ...rows, log: null, duplicate: true }
    }
    throw result.error
  }
  return { ...rows, log: result.data || null, duplicate: false }
}

export async function importProperty24PreparedLeads({
  supabase,
  leads = [],
  listingDetailsById,
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  const listingsById = listingDetailsById || await fetchListingDetailsByIds(
    supabase,
    leads.map((lead) => lead.listingId),
  )
  const results = []

  for (const lead of leads) {
    const listing = listingsById.get(normalizeText(lead.listingId)) || {}
    if (!lead.readyForCrmIngestion || lead.duplicateInResponse) {
      results.push({
        externalReference: lead.externalReference || null,
        listingNumber: lead.listingNumber || null,
        listingId: lead.listingId || null,
        status: lead.duplicateInResponse ? 'duplicate_in_response' : 'needs_review',
        reason: lead.duplicateInResponse ? 'Duplicate lead in Property24 response.' : 'Missing listing, organisation, or contact identity.',
      })
      continue
    }

    try {
      const existingLog = await findExistingIngestionLog(supabase, lead)
      if (existingLog) {
        results.push({
          externalReference: lead.externalReference || null,
          listingNumber: lead.listingNumber || null,
          listingId: lead.listingId || null,
          status: 'already_imported',
          leadId: existingLog.lead_id || null,
          contactId: existingLog.contact_id || null,
          logId: existingLog.log_id || null,
        })
        continue
      }

      const rows = buildCrmRows(lead, listing)
      const persisted = await persistIngestionLog(
        supabase,
        await persistActivityAndTask(
          supabase,
          await persistListingInterest(
            supabase,
            await persistLead(
              supabase,
              await persistContact(supabase, rows, lead),
            ),
            lead,
          ),
          lead,
        ),
        lead,
      )

      results.push({
        externalReference: lead.externalReference || null,
        listingNumber: lead.listingNumber || null,
        listingId: lead.listingId || null,
        status: persisted.duplicate ? 'already_imported' : 'imported',
        leadId: persisted.leadId || null,
        contactId: persisted.contactId || null,
        logId: persisted.log?.log_id || null,
        reusedContact: Boolean(persisted.reusedContact),
      })
    } catch (error) {
      results.push({
        externalReference: lead.externalReference || null,
        listingNumber: lead.listingNumber || null,
        listingId: lead.listingId || null,
        status: 'failed',
        error: error.message,
      })
    }
  }

  return {
    summary: {
      receivedCount: leads.length,
      importedCount: results.filter((result) => result.status === 'imported').length,
      alreadyImportedCount: results.filter((result) => result.status === 'already_imported').length,
      needsReviewCount: results.filter((result) => ['needs_review', 'duplicate_in_response'].includes(result.status)).length,
      failedCount: results.filter((result) => result.status === 'failed').length,
    },
    results,
  }
}

export async function importProperty24LeadPlan({ supabase, plan } = {}) {
  if (!plan) throw new Error('Property24 lead import plan is required.')
  const importResult = await importProperty24PreparedLeads({
    supabase,
    leads: plan.leads || [],
  })
  return {
    ...plan,
    mode: 'APPLIED',
    safety: {
      property24ApiCalled: true,
      databaseWritten: importResult.summary.importedCount > 0,
      leadsCreated: importResult.summary.importedCount > 0,
    },
    import: importResult,
  }
}

export async function pullAndImportProperty24Leads({
  supabase,
  property24,
  config = {},
  now = new Date(),
} = {}) {
  const plan = await createProperty24LeadImportPlan({ supabase, property24, config, now })
  if (!config.applyLeads) {
    return {
      ...plan,
      mode: 'DRY_RUN',
      safety: {
        property24ApiCalled: true,
        databaseWritten: false,
        leadsCreated: false,
      },
    }
  }
  return importProperty24LeadPlan({ supabase, plan })
}

export async function importProperty24ListingLeadPayload({
  supabase,
  payload,
  listing,
  sync,
} = {}) {
  const listingNumber = Number(sync?.listing_number || listing?.property24_reference || 0) || null
  const listingMap = new Map([
    [
      listingNumber,
      {
        listingId: normalizeText(listing?.id),
        listing: {
          organisationId: normalizeText(listing?.organisation_id),
        },
      },
    ],
  ])
  const duplicateKeys = new Set()
  const leads = asArray(payload).map((rawLead) => {
    const normalized = normalizeProperty24LeadForImport(
      {
        ...rawLead,
        listingNumber: rawLead?.listingNumber || rawLead?.ListingNumber || listingNumber,
      },
      listingMap,
    )
    const duplicateInResponse = duplicateKeys.has(normalized.dedupeKey)
    duplicateKeys.add(normalized.dedupeKey)
    return { ...normalized, duplicateInResponse }
  })
  const importResult = await importProperty24PreparedLeads({
    supabase,
    leads,
    listingDetailsById: new Map([[normalizeText(listing?.id), listing]]),
  })
  return {
    summary: summarizeProperty24LeadPayload(payload),
    import: importResult,
  }
}
