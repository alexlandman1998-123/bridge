import {
  ATTORNEY_LEAD_SERVICE_TYPE_VALUES,
  ATTORNEY_LEAD_STAGE_VALUES,
  getAttorneyLeadLifecycleStatusForStage,
  isAttorneyLeadServiceType,
  isAttorneyLeadStage,
  normalizeAttorneyLeadSourceChannel,
  sanitizeAttorneyLeadCampaignCode,
} from '../core/leads/attorneyLeadContract.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const LEAD_COLUMNS = [
  'lead_id',
  'organisation_id',
  'branch_id',
  'assigned_user_id',
  'contact_id',
  'stage',
  'status',
  'priority',
  'source_channel',
  'campaign_code',
  'last_contacted_at',
  'next_follow_up_at',
  'closed_at',
  'lost_reason',
  'converted_transaction_id',
  'converted_at',
  'notes',
  'created_at',
  'updated_at',
].join(', ')

function normalizeText(value = '', maxLength = 5000) {
  return String(value || '').trim().slice(0, maxLength)
}

function requireClient(client = supabase) {
  if (!client || (client === supabase && !isSupabaseConfigured)) {
    throw new Error('Attorney Leads requires a configured Supabase connection.')
  }
  return client
}

function throwIfError(result, fallback) {
  if (!result?.error) return result?.data
  const error = new Error(result.error.message || fallback)
  error.code = result.error.code || ''
  error.details = result.error.details || ''
  throw error
}

function arrayRows(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function normalizePracticeQualifications(value) {
  const candidates = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(candidates
    .map((item) => normalizeText(item, 40).toLowerCase().replace(/_attorney$/, ''))
    .filter((item) => ['transfer', 'bond', 'cancellation'].includes(item)))]
}

function normalizeContact(row = {}) {
  return {
    id: normalizeText(row.contact_id),
    firstName: normalizeText(row.first_name, 120),
    lastName: normalizeText(row.last_name, 120),
    email: normalizeText(row.email, 254),
    phone: normalizeText(row.phone, 50),
  }
}

function normalizeDetail(row = {}) {
  return {
    serviceType: isAttorneyLeadServiceType(row.service_type) ? row.service_type : 'general_enquiry',
    propertyAddress: normalizeText(row.property_address, 1000),
    propertyValue: row.property_value === null || row.property_value === undefined ? null : Number(row.property_value),
    partyRole: normalizeText(row.party_role, 40) || 'unknown',
    message: normalizeText(row.enquiry_message, 5000),
    intakeLinkId: normalizeText(row.intake_link_id),
    metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {},
  }
}

export function normalizeAttorneyLeadRow(row = {}, contact = {}, detail = {}) {
  const stage = isAttorneyLeadStage(row.stage) ? row.stage : 'new'
  return {
    id: normalizeText(row.lead_id),
    organisationId: normalizeText(row.organisation_id),
    branchId: normalizeText(row.branch_id),
    assignedUserId: normalizeText(row.assigned_user_id),
    contactId: normalizeText(row.contact_id),
    stage,
    status: normalizeText(row.status, 40) || getAttorneyLeadLifecycleStatusForStage(stage),
    priority: normalizeText(row.priority, 40) || 'Medium',
    sourceChannel: normalizeAttorneyLeadSourceChannel(row.source_channel),
    campaignCode: normalizeText(row.campaign_code, 80),
    lastContactedAt: row.last_contacted_at || null,
    nextFollowUpAt: row.next_follow_up_at || null,
    closedAt: row.closed_at || null,
    lostReason: normalizeText(row.lost_reason, 1000),
    convertedTransactionId: normalizeText(row.converted_transaction_id),
    convertedAt: row.converted_at || null,
    notes: normalizeText(row.notes, 5000),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    contact: normalizeContact(contact),
    detail: normalizeDetail(detail),
  }
}

export async function listAttorneyLeads({ organisationId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId) return []
  const db = requireClient(client)
  const leadsResult = await db
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('organisation_id', scopedOrganisationId)
    .eq('lead_domain', 'attorney')
    .order('created_at', { ascending: false })
    .limit(500)
  const leadRows = throwIfError(leadsResult, 'Unable to load Attorney Leads.') || []
  if (!leadRows.length) return []

  const leadIds = leadRows.map((row) => row.lead_id).filter(Boolean)
  const contactIds = [...new Set(leadRows.map((row) => row.contact_id).filter(Boolean))]
  const [contactsResult, detailsResult] = await Promise.all([
    contactIds.length
      ? db.from('contacts').select('contact_id, first_name, last_name, email, phone').eq('organisation_id', scopedOrganisationId).in('contact_id', contactIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('attorney_lead_details').select('lead_id, service_type, property_address, property_value, party_role, enquiry_message, intake_link_id, metadata_json').eq('organisation_id', scopedOrganisationId).in('lead_id', leadIds),
  ])
  const contacts = throwIfError(contactsResult, 'Unable to load Attorney Lead contacts.') || []
  const details = throwIfError(detailsResult, 'Unable to load Attorney Lead details.') || []
  const contactById = new Map(contacts.map((row) => [row.contact_id, row]))
  const detailByLeadId = new Map(details.map((row) => [row.lead_id, row]))
  return leadRows.map((row) => normalizeAttorneyLeadRow(
    row,
    contactById.get(row.contact_id),
    detailByLeadId.get(row.lead_id),
  ))
}

export async function listAttorneyLeadActivities({ organisationId, leadId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!scopedOrganisationId || !scopedLeadId) return []
  const db = requireClient(client)
  const result = await db
    .from('lead_activities')
    .select('activity_id, activity_type, activity_note, activity_date, outcome, agent_id, created_at')
    .eq('organisation_id', scopedOrganisationId)
    .eq('lead_id', scopedLeadId)
    .order('activity_date', { ascending: false })
    .limit(100)
  return (throwIfError(result, 'Unable to load Attorney Lead activity.') || []).map((row) => ({
    id: normalizeText(row.activity_id),
    type: normalizeText(row.activity_type, 120) || 'Activity',
    note: normalizeText(row.activity_note, 5000),
    date: row.activity_date || row.created_at || null,
    outcome: normalizeText(row.outcome, 120),
    agentId: normalizeText(row.agent_id),
  }))
}

export async function listAttorneyLeadQuotes({ organisationId, leadId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!scopedOrganisationId || !scopedLeadId) return []
  const db = requireClient(client)
  const result = await db
    .from('attorney_lead_quotes')
    .select('id, quote_number, version_number, status, currency, professional_fee, vat_amount, disbursements, total_amount, valid_until, internal_note, decision_reason, sent_at, decided_at, created_at, updated_at')
    .eq('organisation_id', scopedOrganisationId)
    .eq('lead_id', scopedLeadId)
    .order('version_number', { ascending: false })
  return (throwIfError(result, 'Unable to load Attorney Lead quotes.') || []).map((row) => ({
    id: normalizeText(row.id),
    quoteNumber: normalizeText(row.quote_number, 40),
    versionNumber: Number(row.version_number || 1),
    status: normalizeText(row.status, 40) || 'draft',
    currency: normalizeText(row.currency, 3) || 'ZAR',
    professionalFee: Number(row.professional_fee || 0),
    vatAmount: Number(row.vat_amount || 0),
    disbursements: Number(row.disbursements || 0),
    totalAmount: Number(row.total_amount || 0),
    validUntil: row.valid_until || null,
    internalNote: normalizeText(row.internal_note, 2000),
    decisionReason: normalizeText(row.decision_reason, 1000),
    sentAt: row.sent_at || null,
    decidedAt: row.decided_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }))
}

export async function listAttorneyLeadQuotePublicLinks({ organisationId, leadId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!scopedOrganisationId || !scopedLeadId) return []
  const db = requireClient(client)
  const result = await db
    .from('attorney_lead_quote_public_links')
    .select('id, quote_id, status, expires_at, used_at, revoked_at, last_email_delivery_id, last_email_status, last_emailed_at, email_attempt_count, created_at')
    .eq('organisation_id', scopedOrganisationId)
    .eq('lead_id', scopedLeadId)
    .order('created_at', { ascending: false })
  return (throwIfError(result, 'Unable to load Attorney quote sharing links.') || []).map((row) => ({
    id: normalizeText(row.id),
    quoteId: normalizeText(row.quote_id),
    status: normalizeText(row.status, 20),
    expiresAt: row.expires_at || null,
    usedAt: row.used_at || null,
    revokedAt: row.revoked_at || null,
    lastEmailDeliveryId: normalizeText(row.last_email_delivery_id),
    lastEmailStatus: normalizeText(row.last_email_status, 20),
    lastEmailedAt: row.last_emailed_at || null,
    emailAttemptCount: Number(row.email_attempt_count || 0),
    createdAt: row.created_at || null,
  }))
}

export async function createAttorneyLeadQuote({ organisationId, leadId, values, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  const professionalFee = normalizeText(values?.professionalFee, 40)
  const vatAmount = normalizeText(values?.vatAmount, 40)
  const disbursements = normalizeText(values?.disbursements, 40)
  const validUntil = normalizeText(values?.validUntil, 10)
  if (!scopedOrganisationId || !scopedLeadId) throw new Error('Attorney Lead context is required.')
  for (const [label, value] of [['professional fee', professionalFee], ['VAT amount', vatAmount], ['disbursements', disbursements]]) {
    if (value && (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) > 9999999999.99)) throw new Error(`Enter a valid ${label}.`)
  }
  if (Number(professionalFee || 0) + Number(vatAmount || 0) + Number(disbursements || 0) <= 0) throw new Error('Quote total must be greater than zero.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new Error('Choose a valid quote expiry date.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_create_attorney_lead_quote', {
    p_organisation_id: scopedOrganisationId,
    p_lead_id: scopedLeadId,
    p_payload: {
      professional_fee: professionalFee || '0',
      vat_amount: vatAmount || '0',
      disbursements: disbursements || '0',
      valid_until: validUntil,
      internal_note: normalizeText(values?.internalNote, 2000) || null,
    },
  })
  const data = throwIfError(result, 'Unable to create Attorney Lead quote.')
  if (!data?.success || !data?.quote_id) throw new Error('Attorney Lead quote creation was not confirmed.')
  return data
}

export async function transitionAttorneyLeadQuote({ organisationId, quoteId, status, reason = '', client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedQuoteId = normalizeText(quoteId)
  const scopedStatus = normalizeText(status, 20).toLowerCase()
  if (!scopedOrganisationId || !scopedQuoteId) throw new Error('Attorney Lead quote context is required.')
  if (!['sent', 'accepted', 'declined'].includes(scopedStatus)) throw new Error('Choose a valid quote action.')
  if (scopedStatus === 'declined' && !normalizeText(reason, 1000)) throw new Error('Add a reason before declining the quote.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_transition_attorney_lead_quote', {
    p_organisation_id: scopedOrganisationId,
    p_quote_id: scopedQuoteId,
    p_status: scopedStatus,
    p_reason: normalizeText(reason, 1000) || null,
  })
  const data = throwIfError(result, 'Unable to update Attorney Lead quote.')
  if (!data?.success) throw new Error('Attorney Lead quote update was not confirmed.')
  return data
}

export async function createAttorneyQuotePublicLink({ organisationId, quoteId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedQuoteId = normalizeText(quoteId)
  if (!scopedOrganisationId || !scopedQuoteId) throw new Error('Attorney quote sharing context is required.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_create_attorney_quote_public_link', {
    p_organisation_id: scopedOrganisationId,
    p_quote_id: scopedQuoteId,
  })
  const data = throwIfError(result, 'Unable to create the secure Attorney quote link.')
  if (!data?.success || !data?.link_id || !/^[0-9a-f]{64}$/.test(data?.token || '')) {
    throw new Error('Secure Attorney quote link creation was not confirmed.')
  }
  return {
    linkId: normalizeText(data.link_id),
    quoteId: normalizeText(data.quote_id),
    token: normalizeText(data.token, 64),
    expiresAt: data.expires_at || null,
  }
}

export async function revokeAttorneyQuotePublicLink({ organisationId, linkId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLinkId = normalizeText(linkId)
  if (!scopedOrganisationId || !scopedLinkId) throw new Error('Attorney quote link context is required.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_revoke_attorney_quote_public_link', {
    p_organisation_id: scopedOrganisationId,
    p_link_id: scopedLinkId,
  })
  const data = throwIfError(result, 'Unable to revoke the secure Attorney quote link.')
  if (!data?.success) throw new Error('Attorney quote link revocation was not confirmed.')
  return data
}

export async function listAttorneyLeadAssignees({ organisationId, leadId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!scopedOrganisationId || !scopedLeadId) return []
  const db = requireClient(client)
  const result = await db.rpc('bridge_list_attorney_lead_assignees', {
    p_organisation_id: scopedOrganisationId,
    p_lead_id: scopedLeadId,
  })
  return arrayRows(throwIfError(result, 'Unable to load Attorney Lead assignees.')).map((row) => ({
    userId: normalizeText(row.user_id),
    name: normalizeText(row.display_name, 240) || 'Attorney team member',
    email: normalizeText(row.email, 254),
    role: normalizeText(row.member_role, 80),
    professionalRole: normalizeText(row.professional_role || row.attorney_professional_role, 80),
    practiceQualifications: normalizePracticeQualifications(
      row.practice_qualifications || row.attorney_practice_qualifications,
    ),
    branchId: normalizeText(row.branch_id),
  }))
}

export async function assignAttorneyLead({ organisationId, leadId, assignedUserId = '', reason = '', client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!scopedOrganisationId || !scopedLeadId) throw new Error('Attorney Lead context is required.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_assign_attorney_lead', {
    p_organisation_id: scopedOrganisationId,
    p_lead_id: scopedLeadId,
    p_assigned_user_id: normalizeText(assignedUserId) || null,
    p_reason: normalizeText(reason, 500) || null,
  })
  const data = throwIfError(result, 'Unable to assign Attorney Lead.')
  if (!data?.success) throw new Error('Attorney Lead assignment was not confirmed.')
  return data
}

export async function addAttorneyLeadActivity({ organisationId, leadId, activityType, note, outcome = '', client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!scopedOrganisationId || !scopedLeadId) throw new Error('Attorney Lead context is required.')
  const scopedActivityType = normalizeText(activityType, 40).toLowerCase()
  const scopedNote = normalizeText(note, 5000)
  if (!['note', 'call', 'email', 'meeting', 'whatsapp'].includes(scopedActivityType)) {
    throw new Error('Choose a valid activity type.')
  }
  if (!scopedNote) throw new Error('Activity notes are required.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_add_attorney_lead_activity', {
    p_organisation_id: scopedOrganisationId,
    p_lead_id: scopedLeadId,
    p_activity_type: scopedActivityType,
    p_note: scopedNote,
    p_outcome: normalizeText(outcome, 120) || null,
  })
  const data = throwIfError(result, 'Unable to add Attorney Lead activity.')
  if (!data?.success) throw new Error('Attorney Lead activity was not confirmed.')
  return data
}

export async function setAttorneyLeadFollowUp({ organisationId, leadId, nextFollowUpAt = null, note = '', client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!scopedOrganisationId || !scopedLeadId) throw new Error('Attorney Lead context is required.')
  const nextDate = nextFollowUpAt ? new Date(nextFollowUpAt) : null
  if (nextDate && Number.isNaN(nextDate.getTime())) throw new Error('Choose a valid follow-up date and time.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_set_attorney_lead_follow_up', {
    p_organisation_id: scopedOrganisationId,
    p_lead_id: scopedLeadId,
    p_next_follow_up_at: nextDate ? nextDate.toISOString() : null,
    p_note: normalizeText(note, 1000) || null,
  })
  const data = throwIfError(result, 'Unable to update Attorney Lead follow-up.')
  if (!data?.success) throw new Error('Attorney Lead follow-up was not confirmed.')
  return data
}

export async function convertAttorneyLeadToMatter({ organisationId, leadId, values, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  const matterType = normalizeText(values?.matterType, 40).toLowerCase()
  const clientRole = normalizeText(values?.clientRole, 40).toLowerCase()
  const propertyAddress = normalizeText(values?.propertyAddress, 1000)
  const assignedUserId = normalizeText(values?.assignedUserId)
  const financeType = normalizeText(values?.financeType || 'cash', 40).toLowerCase()
  const propertyValue = normalizeText(values?.propertyValue, 40)

  if (!scopedOrganisationId || !scopedLeadId) throw new Error('Attorney Lead context is required.')
  if (!['transfer', 'bond', 'cancellation'].includes(matterType)) throw new Error('Choose a valid Matter type.')
  if (!['buyer', 'seller', 'borrower', 'owner'].includes(clientRole)) throw new Error('Choose the client role.')
  const validClientRoles = {
    transfer: ['buyer', 'seller'],
    bond: ['buyer', 'borrower', 'owner'],
    cancellation: ['seller', 'owner'],
  }
  if (!validClientRoles[matterType].includes(clientRole)) throw new Error('The client role does not match the Matter type.')
  if (!propertyAddress) throw new Error('Property address is required before conversion.')
  if (!assignedUserId) throw new Error('Choose the Attorney who will own the Matter.')
  if (!['cash', 'bond', 'combination', 'hybrid'].includes(financeType)) throw new Error('Choose a valid finance type.')
  if (propertyValue && (!/^\d+(?:\.\d{1,2})?$/.test(propertyValue) || Number(propertyValue) > 9999999999.99)) {
    throw new Error('Enter a valid Matter value.')
  }

  const db = requireClient(client)
  const result = await db.rpc('bridge_convert_attorney_lead_to_matter', {
    p_organisation_id: scopedOrganisationId,
    p_lead_id: scopedLeadId,
    p_payload: {
      matter_type: matterType,
      client_role: clientRole,
      property_address: propertyAddress,
      property_value: propertyValue || null,
      assigned_user_id: assignedUserId,
      finance_type: financeType,
      conversion_note: normalizeText(values?.conversionNote, 1000) || null,
    },
  })
  const data = throwIfError(result, 'Unable to convert Attorney Lead to Matter.')
  if (!data?.success) throw new Error(data?.message || 'Attorney Lead conversion was not completed.')
  if (!data?.transaction_id || !data?.assignment_id) throw new Error('Matter conversion lineage was not confirmed.')
  return {
    success: true,
    existing: data.existing === true,
    leadId: normalizeText(data.lead_id),
    transactionId: normalizeText(data.transaction_id),
    assignmentId: normalizeText(data.assignment_id),
    matterType: normalizeText(data.matter_type),
  }
}

export async function createAttorneyLead({ organisationId, values, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId) throw new Error('Attorney workspace is required.')
  const db = requireClient(client)
  const serviceType = normalizeText(values?.serviceType).toLowerCase()
  if (!ATTORNEY_LEAD_SERVICE_TYPE_VALUES.includes(serviceType)) throw new Error('Choose a valid service.')
  const firstName = normalizeText(values?.firstName, 120)
  const email = normalizeText(values?.email, 254).toLowerCase()
  const phone = normalizeText(values?.phone, 40)
  if (!firstName) throw new Error('First name is required.')
  if (!email && !phone) throw new Error('Email or phone is required.')

  const result = await db.rpc('bridge_create_attorney_lead', {
    p_organisation_id: scopedOrganisationId,
    p_payload: {
      first_name: firstName,
      last_name: normalizeText(values?.lastName, 120) || null,
      email: email || null,
      phone: phone || null,
      service_type: serviceType,
      source_channel: normalizeAttorneyLeadSourceChannel(values?.sourceChannel || 'manual'),
      campaign_code: sanitizeAttorneyLeadCampaignCode(values?.campaignCode),
      property_address: normalizeText(values?.propertyAddress, 1000) || null,
      property_value: normalizeText(values?.propertyValue, 40) || null,
      party_role: normalizeText(values?.partyRole, 40).toLowerCase() || 'unknown',
      message: normalizeText(values?.message, 5000) || null,
      priority: ['Low', 'Medium', 'High', 'Urgent'].includes(values?.priority) ? values.priority : 'Medium',
    },
  })
  const data = throwIfError(result, 'Unable to create Attorney Lead.')
  if (!data?.success || !data?.lead_id) throw new Error('Attorney Lead creation was not confirmed.')
  return { success: true, leadId: data.lead_id }
}

export async function updateAttorneyLeadLifecycle({ organisationId, leadId, stage, lostReason = '', client = supabase } = {}) {
  const scopedStage = normalizeText(stage).toLowerCase()
  if (!ATTORNEY_LEAD_STAGE_VALUES.includes(scopedStage)) throw new Error('Choose a valid Lead stage.')
  if (scopedStage === 'lost' && !normalizeText(lostReason)) throw new Error('Add a reason before marking this Lead lost.')
  const db = requireClient(client)
  const result = await db.rpc('bridge_update_attorney_lead_lifecycle', {
    p_organisation_id: normalizeText(organisationId),
    p_lead_id: normalizeText(leadId),
    p_stage: scopedStage,
    p_lost_reason: normalizeText(lostReason, 1000) || null,
  })
  const data = throwIfError(result, 'Unable to update Attorney Lead stage.')
  if (!data?.success) throw new Error('Attorney Lead update was not confirmed.')
  return data
}

export async function getAttorneyPublicIntakeLink({ organisationId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId) return null
  const db = requireClient(client)
  const result = await db
    .from('public_intake_links')
    .select('id, slug, status, heading, introduction, service_config_json, disabled_at, updated_at')
    .eq('organisation_id', scopedOrganisationId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = throwIfError(result, 'Unable to load the public intake link.')
  if (!row) return null
  return {
    id: normalizeText(row.id),
    slug: normalizeText(row.slug),
    status: normalizeText(row.status),
    heading: normalizeText(row.heading, 160),
    introduction: normalizeText(row.introduction, 1000),
    serviceTypes: Array.isArray(row.service_config_json) ? row.service_config_json : [],
    disabledAt: row.disabled_at || null,
    updatedAt: row.updated_at || null,
  }
}

export async function getAttorneyLeadsLaunchReadiness({ organisationId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId) return null
  const db = requireClient(client)
  const result = await db.rpc('bridge_attorney_leads_launch_readiness', {
    p_organisation_id: scopedOrganisationId,
  })
  const row = throwIfError(result, 'Unable to load Attorney Leads launch readiness.') || {}
  const journey = row.journey && typeof row.journey === 'object' ? row.journey : {}
  const operations = row.operations && typeof row.operations === 'object' ? row.operations : {}
  return {
    status: ['ready', 'attention', 'blocked'].includes(row.status) ? row.status : 'blocked',
    checkedAt: row.checked_at || null,
    journey: {
      created: journey.created === true,
      active: journey.active === true,
      slug: normalizeText(journey.slug),
      servicesReady: journey.services_ready === true,
      brandingReady: journey.branding_ready === true,
      contactReady: journey.contact_ready === true,
    },
    operations: {
      qualifiedOwnerCount: Number(operations.qualified_owner_count || 0),
      openLeads: Number(operations.open_leads || 0),
      dueFollowUps: Number(operations.due_follow_ups || 0),
      publicSubmissions30d: Number(operations.public_submissions_30d || 0),
      failedConversions: Number(operations.failed_conversions || 0),
    },
    blockers: Array.isArray(row.blockers) ? row.blockers.map((value) => normalizeText(value, 500)).filter(Boolean) : [],
    warnings: Array.isArray(row.warnings) ? row.warnings.map((value) => normalizeText(value, 500)).filter(Boolean) : [],
  }
}

function normalizeAttorneyLeadSlaSettings(row = {}) {
  const businessDays = Array.isArray(row.business_days)
    ? row.business_days.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
    : [1, 2, 3, 4, 5]
  return {
    remindersEnabled: row.reminders_enabled !== false,
    firstContactSlaHours: Number(row.first_contact_sla_hours || 24),
    followUpGraceMinutes: Number(row.follow_up_grace_minutes ?? 15),
    escalationEnabled: row.escalation_enabled === true,
    escalationAfterHours: Number(row.escalation_after_hours || 4),
    escalationUserId: normalizeText(row.escalation_user_id),
    timezoneName: normalizeText(row.timezone_name, 100) || 'Africa/Johannesburg',
    businessDays: businessDays.length ? businessDays : [1, 2, 3, 4, 5],
    businessHoursStart: normalizeText(row.business_hours_start, 5) || '08:00',
    businessHoursEnd: normalizeText(row.business_hours_end, 5) || '17:00',
    quietHoursEnabled: row.quiet_hours_enabled !== false,
    updatedAt: row.updated_at || null,
  }
}

export async function getAttorneyLeadSlaSettings({ organisationId, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId) return normalizeAttorneyLeadSlaSettings()
  const db = requireClient(client)
  const result = await db.rpc('bridge_get_attorney_lead_sla_settings', {
    p_organisation_id: scopedOrganisationId,
  })
  return normalizeAttorneyLeadSlaSettings(throwIfError(result, 'Unable to load Attorney Lead SLA settings.'))
}

export async function updateAttorneyLeadSlaSettings({ organisationId, values, client = supabase } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId) throw new Error('Attorney workspace is required.')
  const firstContactSlaHours = Number(values?.firstContactSlaHours)
  const followUpGraceMinutes = Number(values?.followUpGraceMinutes)
  const escalationAfterHours = Number(values?.escalationAfterHours)
  const businessDays = [...new Set((values?.businessDays || []).map(Number))].sort((left, right) => left - right)
  const timezoneName = normalizeText(values?.timezoneName, 100)
  const businessHoursStart = normalizeText(values?.businessHoursStart, 5)
  const businessHoursEnd = normalizeText(values?.businessHoursEnd, 5)
  if (!Number.isInteger(firstContactSlaHours) || firstContactSlaHours < 1 || firstContactSlaHours > 168) throw new Error('First-contact SLA must be between 1 and 168 hours.')
  if (!Number.isInteger(followUpGraceMinutes) || followUpGraceMinutes < 0 || followUpGraceMinutes > 1440) throw new Error('Follow-up grace must be between 0 and 1,440 minutes.')
  if (!Number.isInteger(escalationAfterHours) || escalationAfterHours < 1 || escalationAfterHours > 168) throw new Error('Escalation delay must be between 1 and 168 hours.')
  if (!businessDays.length || businessDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('Choose at least one valid business day.')
  if (!timezoneName) throw new Error('Timezone is required.')
  if (!/^\d{2}:\d{2}$/.test(businessHoursStart) || !/^\d{2}:\d{2}$/.test(businessHoursEnd) || businessHoursStart >= businessHoursEnd) throw new Error('Choose valid business hours.')

  const db = requireClient(client)
  const result = await db.rpc('bridge_update_attorney_lead_sla_settings', {
    p_organisation_id: scopedOrganisationId,
    p_payload: {
      reminders_enabled: values?.remindersEnabled !== false,
      first_contact_sla_hours: firstContactSlaHours,
      follow_up_grace_minutes: followUpGraceMinutes,
      escalation_enabled: values?.escalationEnabled === true,
      escalation_after_hours: escalationAfterHours,
      escalation_user_id: normalizeText(values?.escalationUserId) || null,
      timezone_name: timezoneName,
      business_days: businessDays,
      business_hours_start: businessHoursStart,
      business_hours_end: businessHoursEnd,
      quiet_hours_enabled: values?.quietHoursEnabled !== false,
    },
  })
  return normalizeAttorneyLeadSlaSettings(throwIfError(result, 'Unable to update Attorney Lead SLA settings.'))
}

export async function ensureAttorneyPublicIntakeLink({ organisationId, client = supabase } = {}) {
  const db = requireClient(client)
  const result = await db.rpc('bridge_ensure_attorney_public_intake_link', {
    p_organisation_id: normalizeText(organisationId),
  })
  const rows = arrayRows(throwIfError(result, 'Unable to create the public intake link.'))
  const row = rows[0]
  if (!row?.slug) throw new Error('Public intake link creation was not confirmed.')
  return {
    id: normalizeText(row.id),
    slug: normalizeText(row.slug),
    status: normalizeText(row.status),
    heading: normalizeText(row.heading, 160),
    introduction: normalizeText(row.introduction, 1000),
    serviceTypes: Array.isArray(row.service_config_json) ? row.service_config_json : [],
  }
}

export async function setAttorneyPublicIntakeLinkStatus({ linkId, status, client = supabase } = {}) {
  const nextStatus = status === 'active' ? 'active' : 'disabled'
  const db = requireClient(client)
  const result = await db
    .from('public_intake_links')
    .update({
      status: nextStatus,
      disabled_at: nextStatus === 'active' ? null : new Date().toISOString(),
    })
    .eq('id', normalizeText(linkId))
    .select('id, slug, status, heading, introduction, service_config_json, disabled_at, updated_at')
    .single()
  const row = throwIfError(result, 'Unable to update the public intake link.')
  return {
    id: normalizeText(row.id),
    slug: normalizeText(row.slug),
    status: normalizeText(row.status),
    heading: normalizeText(row.heading, 160),
    introduction: normalizeText(row.introduction, 1000),
    serviceTypes: Array.isArray(row.service_config_json) ? row.service_config_json : [],
    disabledAt: row.disabled_at || null,
    updatedAt: row.updated_at || null,
  }
}
