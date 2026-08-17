import {
  buildDeveloperLeadAccessProfile,
  maskDeveloperLeadForDeveloper,
  normalizeDeveloperLeadStatus,
} from '../core/developerLeads/developerLeadContract.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const DEVELOPER_LEAD_SELECT = [
  'developer_lead_id',
  'developer_org_id',
  'source_agency_org_id',
  'source_agent_user_id',
  'assigned_agent_id',
  'source_lead_id',
  'primary_development_id',
  'preferred_unit_id',
  'converted_transaction_id',
  'ownership_model',
  'lead_owner',
  'selling_model',
  'visibility_state',
  'reservation_state',
  'lead_status',
  'lead_source',
  'budget_min',
  'budget_max',
  'unit_type_interest',
  'qualification_note',
  'next_action_note',
  'public_reference',
  'protected_summary',
  'consent_requested_at',
  'handover_accepted_at',
  'reservation_expires_at',
  'converted_at',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

const PRIVATE_DETAIL_SELECT = [
  'developer_lead_id',
  'buyer_full_name',
  'buyer_email',
  'buyer_phone',
  'private_notes',
  'created_at',
  'updated_at',
].join(', ')

const INTEREST_SELECT = [
  'developer_lead_interest_id',
  'developer_lead_id',
  'developer_org_id',
  'development_id',
  'unit_id',
  'interest_rank',
  'interest_status',
  'budget_min',
  'budget_max',
  'unit_type_interest',
  'is_primary',
  'created_at',
  'updated_at',
].join(', ')

const ONBOARDING_FORM_DATA_SELECT = [
  'id',
  'transaction_id',
  'purchaser_type',
  'form_data',
  'created_at',
  'updated_at',
].join(', ')

export const DEVELOPER_LEAD_PHASE11_CONTRACT = 'developer-leads-phase11-developer-fed-v1'
export const DEVELOPER_LEAD_PHASE12_CONTRACT = 'developer-leads-phase12-agency-fed-privacy-v1'
export const DEVELOPER_LEAD_PHASE22_CONTRACT = 'developer-leads-phase22-agency-handover-release-v1'

export const DEVELOPER_LEAD_STATUS_OPTIONS = Object.freeze([
  { key: 'new', label: 'Captured' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'viewing', label: 'Viewing' },
  { key: 'onboarding_sent', label: 'Onboarding Sent' },
  { key: 'onboarding_submitted', label: 'Onboarding Submitted' },
  { key: 'otp', label: 'OTP' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost' },
])

export const DEVELOPER_LEAD_SOURCE_FILTER_OPTIONS = Object.freeze([
  { key: 'all', label: 'All lead sources' },
  { key: 'developer', label: 'Developer-fed' },
  { key: 'agency', label: 'Agency-fed' },
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeUuid(value = '') {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null
}

function normalizeEmail(value = '') {
  return normalizeLower(value)
}

function normalizeStatus(value = '') {
  return normalizeDeveloperLeadStatus(value)
}

function normalizeSourceFilter(value = 'all') {
  const normalized = normalizeLower(value)
  return ['developer', 'agency'].includes(normalized) ? normalized : 'all'
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

function requireDeveloperOrgId(developerOrgId = '') {
  const normalized = normalizeUuid(developerOrgId)
  if (!normalized) throw new Error('A valid developer workspace id is required.')
  return normalized
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required for developer leads.')
  }
  return supabase
}

function isMissingDeveloperLeadSchema(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(`${error?.message || ''} ${error?.details || ''}`)
  return code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205' || message.includes('developer_leads')
}

function isMissingOptionalSchema(error, tableName = '') {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeLower(`${error?.message || ''} ${error?.details || ''}`)
  return code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205' || (tableName && message.includes(tableName))
}

function isPermissionError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code)
  const message = normalizeLower(`${error?.message || ''} ${error?.details || ''}`)
  return status === 403 || code === '42501' || message.includes('row-level security') || message.includes('permission denied')
}

function mapOnboardingFormData(row = {}) {
  const formData = row.form_data && typeof row.form_data === 'object' && !Array.isArray(row.form_data)
    ? row.form_data
    : {}
  return {
    id: normalizeText(row.id),
    transactionId: normalizeText(row.transaction_id),
    purchaserType: normalizeText(row.purchaser_type || formData.purchaser_type),
    formData,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    submittedAt: formData.submitted_at || formData.submittedAt || row.updated_at || null,
  }
}

function mapPrivateDetails(row = {}) {
  return {
    buyerFullName: normalizeText(row.buyer_full_name),
    buyerEmail: normalizeEmail(row.buyer_email),
    buyerPhone: normalizeText(row.buyer_phone),
    privateNotes: normalizeText(row.private_notes),
  }
}

function mapInterest(row = {}) {
  return {
    developerLeadInterestId: normalizeText(row.developer_lead_interest_id),
    developerLeadId: normalizeText(row.developer_lead_id),
    developerOrgId: normalizeText(row.developer_org_id),
    developmentId: normalizeText(row.development_id),
    unitId: normalizeText(row.unit_id),
    interestRank: Number(row.interest_rank || 0) || 0,
    interestStatus: normalizeText(row.interest_status) || 'interested',
    budgetMin: nullableNumber(row.budget_min),
    budgetMax: nullableNumber(row.budget_max),
    unitTypeInterest: normalizeText(row.unit_type_interest),
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function mapDeveloperLead(row = {}, { privateDetails = null, interests = [], onboardingFormData = null, maskForDeveloper = true } = {}) {
  const lead = {
    developerLeadId: normalizeText(row.developer_lead_id),
    developerOrgId: normalizeText(row.developer_org_id),
    sourceAgencyOrgId: normalizeText(row.source_agency_org_id),
    sourceAgentUserId: normalizeText(row.source_agent_user_id),
    assignedAgentId: normalizeText(row.assigned_agent_id),
    sourceLeadId: normalizeText(row.source_lead_id),
    primaryDevelopmentId: normalizeText(row.primary_development_id),
    preferredUnitId: normalizeText(row.preferred_unit_id),
    convertedTransactionId: normalizeText(row.converted_transaction_id),
    ownershipModel: normalizeText(row.ownership_model) || 'developer_direct',
    leadOwner: normalizeText(row.lead_owner) || 'developer',
    sellingModel: normalizeText(row.selling_model) || 'developer_led',
    visibilityState: normalizeText(row.visibility_state) || 'full',
    reservationState: normalizeText(row.reservation_state) || 'none',
    leadStatus: normalizeStatus(row.lead_status),
    leadSource: normalizeText(row.lead_source) || 'developer_direct',
    budgetMin: nullableNumber(row.budget_min),
    budgetMax: nullableNumber(row.budget_max),
    unitTypeInterest: normalizeText(row.unit_type_interest),
    qualificationNote: normalizeText(row.qualification_note),
    nextActionNote: normalizeText(row.next_action_note),
    publicReference: normalizeText(row.public_reference),
    protectedSummary: normalizeText(row.protected_summary),
    consentRequestedAt: row.consent_requested_at || null,
    handoverAcceptedAt: row.handover_accepted_at || null,
    reservationExpiresAt: row.reservation_expires_at || null,
    convertedAt: row.converted_at || null,
    createdBy: normalizeText(row.created_by),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    onboardingFormData,
    interestedDevelopmentIds: interests.map((item) => item.developmentId).filter(Boolean),
    interests,
    ...(privateDetails || {}),
  }
  const mapped = {
    ...lead,
    accessProfile: buildDeveloperLeadAccessProfile(lead),
  }
  return maskForDeveloper ? maskDeveloperLeadForDeveloper(mapped) : mapped
}

function buildProtectedSummary(input = {}) {
  return [
    normalizeText(input.buyerFullName) || 'Developer lead',
    normalizeText(input.unitTypeInterest),
    input.budgetMin || input.budgetMax
      ? `Budget ${input.budgetMin || 'open'}-${input.budgetMax || 'open'}`
      : '',
  ].filter(Boolean).join(' | ')
}

async function fetchPrivateDetailsByLeadIds(client, leadIds = []) {
  const ids = leadIds.map(normalizeUuid).filter(Boolean)
  if (!ids.length) return new Map()
  const { data, error } = await client
    .from('developer_lead_private_details')
    .select(PRIVATE_DETAIL_SELECT)
    .in('developer_lead_id', ids)

  if (error) {
    if (isMissingDeveloperLeadSchema(error) || isPermissionError(error)) return new Map()
    throw error
  }

  return new Map((data || []).map((row) => [row.developer_lead_id, mapPrivateDetails(row)]))
}

async function fetchInterestsByLeadIds(client, leadIds = []) {
  const ids = leadIds.map(normalizeUuid).filter(Boolean)
  if (!ids.length) return new Map()
  const { data, error } = await client
    .from('developer_lead_development_interests')
    .select(INTEREST_SELECT)
    .in('developer_lead_id', ids)
    .order('interest_rank', { ascending: true })

  if (error) {
    if (isMissingDeveloperLeadSchema(error) || isPermissionError(error)) return new Map()
    throw error
  }

  return (data || []).reduce((map, row) => {
    const key = row.developer_lead_id
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(mapInterest(row))
    return map
  }, new Map())
}

async function fetchOnboardingFormDataByTransactionIds(client, transactionIds = []) {
  const ids = [...new Set(transactionIds.map(normalizeUuid).filter(Boolean))]
  if (!ids.length) return new Map()

  const { data, error } = await client
    .from('onboarding_form_data')
    .select(ONBOARDING_FORM_DATA_SELECT)
    .in('transaction_id', ids)

  if (error) {
    if (isMissingOptionalSchema(error, 'onboarding_form_data') || isPermissionError(error)) return new Map()
    throw error
  }

  return new Map((data || []).map((row) => [row.transaction_id, mapOnboardingFormData(row)]))
}

export async function listDeveloperFedLeads({ developerOrgId = '', status = 'all' } = {}) {
  return listDeveloperLeadIntake({ developerOrgId, status, source: 'developer' })
}

export async function listAgencyFedDeveloperLeads({ developerOrgId = '', status = 'all' } = {}) {
  return listDeveloperLeadIntake({ developerOrgId, status, source: 'agency' })
}

export async function listAgencyIntroducedDeveloperLeadsForAgency({ sourceAgencyOrgId = '', status = 'all' } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const agencyOrgId = requireDeveloperOrgId(sourceAgencyOrgId)
  const client = requireClient()
  let query = client
    .from('developer_leads')
    .select(DEVELOPER_LEAD_SELECT)
    .eq('source_agency_org_id', agencyOrgId)
    .eq('lead_owner', 'agency')
    .order('updated_at', { ascending: false })

  const normalizedStatus = normalizeStatus(status)
  if (status !== 'all' && normalizedStatus) {
    query = query.eq('lead_status', normalizedStatus)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingDeveloperLeadSchema(error) || isPermissionError(error)) return []
    throw error
  }

  const leadIds = (data || []).map((row) => row.developer_lead_id).filter(Boolean)
  const transactionIds = (data || []).map((row) => row.converted_transaction_id).filter(Boolean)
  const [privateById, interestsById, onboardingByTransactionId] = await Promise.all([
    fetchPrivateDetailsByLeadIds(client, leadIds),
    fetchInterestsByLeadIds(client, leadIds),
    fetchOnboardingFormDataByTransactionIds(client, transactionIds),
  ])

  return (data || []).map((row) => mapDeveloperLead(row, {
    privateDetails: privateById.get(row.developer_lead_id) || null,
    interests: interestsById.get(row.developer_lead_id) || [],
    onboardingFormData: onboardingByTransactionId.get(row.converted_transaction_id) || null,
    maskForDeveloper: false,
  }))
}

export async function listDeveloperLeadIntake({ developerOrgId = '', status = 'all', source = 'all' } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const orgId = requireDeveloperOrgId(developerOrgId)
  const client = requireClient()
  let query = client
    .from('developer_leads')
    .select(DEVELOPER_LEAD_SELECT)
    .eq('developer_org_id', orgId)
    .order('updated_at', { ascending: false })

  const normalizedSource = normalizeSourceFilter(source)
  if (normalizedSource !== 'all') {
    query = query.eq('lead_owner', normalizedSource)
  }

  const normalizedStatus = normalizeStatus(status)
  if (status !== 'all' && normalizedStatus) {
    query = query.eq('lead_status', normalizedStatus)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingDeveloperLeadSchema(error) || isPermissionError(error)) return []
    throw error
  }

  const leadIds = (data || []).map((row) => row.developer_lead_id).filter(Boolean)
  const transactionIds = (data || []).map((row) => row.converted_transaction_id).filter(Boolean)
  const [privateById, interestsById, onboardingByTransactionId] = await Promise.all([
    fetchPrivateDetailsByLeadIds(client, leadIds),
    fetchInterestsByLeadIds(client, leadIds),
    fetchOnboardingFormDataByTransactionIds(client, transactionIds),
  ])

  return (data || []).map((row) => mapDeveloperLead(row, {
    privateDetails: privateById.get(row.developer_lead_id) || null,
    interests: interestsById.get(row.developer_lead_id) || [],
    onboardingFormData: onboardingByTransactionId.get(row.converted_transaction_id) || null,
  }))
}

export async function createAgencyIntroducedDeveloperLead(input = {}) {
  const developerOrgId = requireDeveloperOrgId(input.developerOrgId)
  const sourceAgencyOrgId = requireDeveloperOrgId(input.sourceAgencyOrgId)
  const primaryDevelopmentId = normalizeUuid(input.primaryDevelopmentId)
  if (!primaryDevelopmentId) throw new Error('A primary development is required for agency-fed leads.')

  const client = requireClient()
  const budgetMin = nullableNumber(input.budgetMin)
  const budgetMax = nullableNumber(input.budgetMax)
  const protectedSummary = normalizeText(input.protectedSummary) || buildProtectedSummary({
    ...input,
    buyerFullName: 'Agency protected buyer',
  })
  const now = new Date().toISOString()

  const leadPayload = {
    developer_org_id: developerOrgId,
    source_agency_org_id: sourceAgencyOrgId,
    source_agent_user_id: normalizeUuid(input.sourceAgentUserId),
    assigned_agent_id: normalizeUuid(input.assignedAgentId || input.sourceAgentUserId),
    source_lead_id: normalizeUuid(input.sourceLeadId),
    primary_development_id: primaryDevelopmentId,
    preferred_unit_id: normalizeUuid(input.preferredUnitId),
    ownership_model: 'agency_introduced',
    lead_owner: 'agency',
    selling_model: 'agent_led',
    visibility_state: 'limited',
    reservation_state: 'none',
    lead_status: normalizeStatus(input.leadStatus),
    lead_source: normalizeText(input.leadSource) || 'agency_introduced',
    budget_min: budgetMin,
    budget_max: budgetMax,
    unit_type_interest: normalizeText(input.unitTypeInterest) || null,
    public_reference: normalizeText(input.publicReference) || null,
    protected_summary: protectedSummary,
  }

  const { data: leadRow, error: leadError } = await client
    .from('developer_leads')
    .insert(leadPayload)
    .select(DEVELOPER_LEAD_SELECT)
    .single()

  if (leadError) throw leadError

  const leadId = leadRow.developer_lead_id
  const privatePayload = {
    developer_lead_id: leadId,
    buyer_full_name: normalizeText(input.buyerFullName) || null,
    buyer_email: normalizeEmail(input.buyerEmail) || null,
    buyer_phone: normalizeText(input.buyerPhone) || null,
    buyer_id_number: normalizeText(input.buyerIdNumber) || null,
    private_notes: normalizeText(input.privateNotes) || null,
    raw_payload: {
      source: 'developer_leads_phase12_agency_fed',
      createdAt: now,
      ...(input.rawPayload && typeof input.rawPayload === 'object' ? input.rawPayload : {}),
    },
    consent_reference: normalizeText(input.consentReference) || null,
    consent_captured_at: input.consentCapturedAt || null,
    handover_source: 'agency',
  }

  const privateInsert = await client
    .from('developer_lead_private_details')
    .insert(privatePayload)
    .select(PRIVATE_DETAIL_SELECT)
    .single()

  if (privateInsert.error) throw privateInsert.error

  const interestedDevelopmentIds = [
    primaryDevelopmentId,
    ...(Array.isArray(input.interestedDevelopmentIds) ? input.interestedDevelopmentIds : []),
  ].map(normalizeUuid).filter(Boolean)
  const uniqueDevelopmentIds = [...new Set(interestedDevelopmentIds)]

  if (uniqueDevelopmentIds.length) {
    const interestPayload = uniqueDevelopmentIds.map((developmentId, index) => ({
      developer_lead_id: leadId,
      developer_org_id: developerOrgId,
      development_id: developmentId,
      unit_id: index === 0 ? normalizeUuid(input.preferredUnitId) : null,
      interest_rank: index + 1,
      interest_status: 'interested',
      budget_min: budgetMin,
      budget_max: budgetMax,
      unit_type_interest: normalizeText(input.unitTypeInterest) || null,
      is_primary: developmentId === primaryDevelopmentId,
    }))

    const interestInsert = await client
      .from('developer_lead_development_interests')
      .insert(interestPayload)
      .select(INTEREST_SELECT)

    if (interestInsert.error) throw interestInsert.error
  }

  const activityInsert = await client
    .from('developer_lead_activity')
    .insert({
      developer_lead_id: leadId,
      developer_org_id: developerOrgId,
      source_agency_org_id: sourceAgencyOrgId,
      actor_user_id: normalizeUuid(input.sourceAgentUserId),
      activity_type: 'created',
      activity_note: 'Agency-fed lead introduced with protected buyer details.',
      visibility_scope: 'shared',
      metadata: {
        contract: DEVELOPER_LEAD_PHASE12_CONTRACT,
        privacy: 'developer_limited_until_handover',
      },
    })

  if (activityInsert.error && !isMissingDeveloperLeadSchema(activityInsert.error) && !isPermissionError(activityInsert.error)) {
    throw activityInsert.error
  }

  const interestsById = await fetchInterestsByLeadIds(client, [leadId])
  return mapDeveloperLead(leadRow, {
    privateDetails: mapPrivateDetails(privateInsert.data),
    interests: interestsById.get(leadId) || [],
  })
}

export async function findDeveloperLeadDuplicateWarnings({ developerOrgId = '', buyerEmail = '', buyerPhone = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const orgId = requireDeveloperOrgId(developerOrgId)
  const email = normalizeEmail(buyerEmail)
  const phone = normalizeText(buyerPhone)
  if (!email && !phone) return []

  const client = requireClient()
  const privateQueries = []
  if (email) {
    privateQueries.push(client
      .from('developer_lead_private_details')
      .select('developer_lead_id, buyer_email, buyer_phone')
      .eq('buyer_email', email)
      .limit(10))
  }
  if (phone) {
    privateQueries.push(client
      .from('developer_lead_private_details')
      .select('developer_lead_id, buyer_email, buyer_phone')
      .eq('buyer_phone', phone)
      .limit(10))
  }

  const privateResults = await Promise.all(privateQueries)
  for (const result of privateResults) {
    if (result.error) {
      if (isMissingDeveloperLeadSchema(result.error) || isPermissionError(result.error)) return []
      throw result.error
    }
  }

  const ids = [...new Set(privateResults
    .flatMap((result) => result.data || [])
    .map((row) => normalizeUuid(row.developer_lead_id))
    .filter(Boolean))]
  if (!ids.length) return []

  const leadQuery = await client
    .from('developer_leads')
    .select('developer_lead_id, developer_org_id, lead_status, created_at, updated_at')
    .eq('developer_org_id', orgId)
    .in('developer_lead_id', ids)

  if (leadQuery.error) {
    if (isMissingDeveloperLeadSchema(leadQuery.error) || isPermissionError(leadQuery.error)) return []
    throw leadQuery.error
  }

  return (leadQuery.data || []).map((row) => ({
    developerLeadId: normalizeText(row.developer_lead_id),
    leadStatus: normalizeStatus(row.lead_status),
    updatedAt: row.updated_at || row.created_at || null,
    reason: email ? 'email_match' : 'phone_match',
  }))
}

export async function createDeveloperFedLead(input = {}) {
  const developerOrgId = requireDeveloperOrgId(input.developerOrgId)
  const client = requireClient()
  const primaryDevelopmentId = normalizeUuid(input.primaryDevelopmentId)
  const interestedDevelopmentIds = [
    primaryDevelopmentId,
    ...(Array.isArray(input.interestedDevelopmentIds) ? input.interestedDevelopmentIds : []),
  ].map(normalizeUuid).filter(Boolean)
  const uniqueDevelopmentIds = [...new Set(interestedDevelopmentIds)]
  const assignedAgentId = normalizeUuid(input.assignedAgentId)
  const leadStatus = normalizeStatus(input.leadStatus)
  const budgetMin = nullableNumber(input.budgetMin)
  const budgetMax = nullableNumber(input.budgetMax)
  const now = new Date().toISOString()

  const leadPayload = {
    developer_org_id: developerOrgId,
    assigned_agent_id: assignedAgentId,
    primary_development_id: primaryDevelopmentId,
    preferred_unit_id: normalizeUuid(input.preferredUnitId),
    ownership_model: assignedAgentId ? 'developer_assigned' : 'developer_direct',
    lead_owner: 'developer',
    selling_model: assignedAgentId ? 'agent_led' : 'developer_led',
    visibility_state: 'full',
    reservation_state: 'none',
    lead_status: leadStatus,
    lead_source: normalizeText(input.leadSource) || 'developer_direct',
    budget_min: budgetMin,
    budget_max: budgetMax,
    unit_type_interest: normalizeText(input.unitTypeInterest) || null,
    public_reference: normalizeText(input.publicReference) || null,
    protected_summary: buildProtectedSummary(input),
  }

  const { data: leadRow, error: leadError } = await client
    .from('developer_leads')
    .insert(leadPayload)
    .select(DEVELOPER_LEAD_SELECT)
    .single()

  if (leadError) throw leadError

  const leadId = leadRow.developer_lead_id
  const privatePayload = {
    developer_lead_id: leadId,
    buyer_full_name: normalizeText(input.buyerFullName) || null,
    buyer_email: normalizeEmail(input.buyerEmail) || null,
    buyer_phone: normalizeText(input.buyerPhone) || null,
    private_notes: normalizeText(input.privateNotes) || null,
    raw_payload: {
      source: 'developer_leads_phase11',
      createdAt: now,
    },
  }

  const privateInsert = await client
    .from('developer_lead_private_details')
    .insert(privatePayload)
    .select(PRIVATE_DETAIL_SELECT)
    .single()

  if (privateInsert.error) throw privateInsert.error

  if (uniqueDevelopmentIds.length) {
    const interestPayload = uniqueDevelopmentIds.map((developmentId, index) => ({
      developer_lead_id: leadId,
      developer_org_id: developerOrgId,
      development_id: developmentId,
      unit_id: index === 0 ? normalizeUuid(input.preferredUnitId) : null,
      interest_rank: index + 1,
      interest_status: 'interested',
      budget_min: budgetMin,
      budget_max: budgetMax,
      unit_type_interest: normalizeText(input.unitTypeInterest) || null,
      is_primary: developmentId === primaryDevelopmentId || (!primaryDevelopmentId && index === 0),
    }))

    const interestInsert = await client
      .from('developer_lead_development_interests')
      .insert(interestPayload)
      .select(INTEREST_SELECT)

    if (interestInsert.error) throw interestInsert.error
  }

  const activityInsert = await client
    .from('developer_lead_activity')
    .insert({
      developer_lead_id: leadId,
      developer_org_id: developerOrgId,
      actor_user_id: null,
      activity_type: assignedAgentId ? 'assigned' : 'created',
      activity_note: assignedAgentId ? 'Developer lead created and assigned.' : 'Developer lead created.',
      visibility_scope: 'developer',
      metadata: {
        contract: DEVELOPER_LEAD_PHASE11_CONTRACT,
        leadStatus,
        assignedAgentId,
      },
    })

  if (activityInsert.error && !isMissingDeveloperLeadSchema(activityInsert.error) && !isPermissionError(activityInsert.error)) {
    throw activityInsert.error
  }

  const privateById = new Map([[leadId, mapPrivateDetails(privateInsert.data)]])
  const interestsById = await fetchInterestsByLeadIds(client, [leadId])
  return mapDeveloperLead(leadRow, {
    privateDetails: privateById.get(leadId),
    interests: interestsById.get(leadId) || [],
  })
}

export async function updateDeveloperFedLead(input = {}) {
  const developerOrgId = requireDeveloperOrgId(input.developerOrgId)
  const developerLeadId = normalizeUuid(input.developerLeadId)
  if (!developerLeadId) throw new Error('A valid developer lead id is required.')

  const client = requireClient()
  const patch = {
    lead_status: normalizeStatus(input.leadStatus),
    assigned_agent_id: normalizeUuid(input.assignedAgentId),
    primary_development_id: normalizeUuid(input.primaryDevelopmentId),
    unit_type_interest: normalizeText(input.unitTypeInterest) || null,
    budget_min: nullableNumber(input.budgetMin),
    budget_max: nullableNumber(input.budgetMax),
  }
  patch.ownership_model = patch.assigned_agent_id ? 'developer_assigned' : 'developer_direct'
  patch.selling_model = patch.assigned_agent_id ? 'agent_led' : 'developer_led'

  const { data, error } = await client
    .from('developer_leads')
    .update(patch)
    .eq('developer_org_id', developerOrgId)
    .eq('developer_lead_id', developerLeadId)
    .eq('lead_owner', 'developer')
    .select(DEVELOPER_LEAD_SELECT)
    .single()

  if (error) throw error

  const [privateById, interestsById] = await Promise.all([
    fetchPrivateDetailsByLeadIds(client, [developerLeadId]),
    fetchInterestsByLeadIds(client, [developerLeadId]),
  ])

  return mapDeveloperLead(data, {
    privateDetails: privateById.get(developerLeadId) || null,
    interests: interestsById.get(developerLeadId) || [],
  })
}

export async function updateDeveloperLeadWorkspaceSetup(input = {}) {
  const developerOrgId = requireDeveloperOrgId(input.developerOrgId)
  const developerLeadId = normalizeUuid(input.developerLeadId)
  if (!developerLeadId) throw new Error('A valid developer lead id is required.')

  const patch = {}
  if (Object.prototype.hasOwnProperty.call(input, 'leadStatus')) {
    patch.lead_status = normalizeStatus(input.leadStatus)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'preferredUnitId')) {
    patch.preferred_unit_id = normalizeUuid(input.preferredUnitId)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'primaryDevelopmentId')) {
    patch.primary_development_id = normalizeUuid(input.primaryDevelopmentId)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'qualificationNote')) {
    patch.qualification_note = normalizeText(input.qualificationNote) || null
  }
  if (Object.prototype.hasOwnProperty.call(input, 'nextActionNote')) {
    patch.next_action_note = normalizeText(input.nextActionNote) || null
  }

  if (!Object.keys(patch).length) {
    throw new Error('No developer lead workspace changes were provided.')
  }

  const client = requireClient()
  const { data, error } = await client
    .from('developer_leads')
    .update(patch)
    .eq('developer_org_id', developerOrgId)
    .eq('developer_lead_id', developerLeadId)
    .select(DEVELOPER_LEAD_SELECT)
    .single()

  if (error) throw error

  if (patch.preferred_unit_id && data.primary_development_id) {
    const interestUpdate = await client
      .from('developer_lead_development_interests')
      .update({
        unit_id: patch.preferred_unit_id,
        is_primary: true,
      })
      .eq('developer_org_id', developerOrgId)
      .eq('developer_lead_id', developerLeadId)
      .eq('development_id', data.primary_development_id)

    if (interestUpdate.error && !isMissingDeveloperLeadSchema(interestUpdate.error) && !isPermissionError(interestUpdate.error)) {
      throw interestUpdate.error
    }
  }

  const activityType = patch.lead_status ? 'status_changed' : 'system'
  const activityInsert = await client
    .from('developer_lead_activity')
    .insert({
      developer_lead_id: developerLeadId,
      developer_org_id: developerOrgId,
      source_agency_org_id: normalizeUuid(data.source_agency_org_id),
      actor_user_id: null,
      activity_type: activityType,
      activity_note: normalizeText(input.activityNote) || (patch.lead_status
        ? `Developer lead moved to ${patch.lead_status}.`
        : 'Developer lead setup was updated.'),
      visibility_scope: data.source_agency_org_id ? 'shared' : 'developer',
      metadata: {
        contract: DEVELOPER_LEAD_PHASE11_CONTRACT,
        previousLeadStatus: normalizeText(input.previousLeadStatus) || null,
        nextLeadStatus: patch.lead_status || null,
        preferredUnitId: patch.preferred_unit_id || null,
        qualificationNoteUpdated: Object.prototype.hasOwnProperty.call(patch, 'qualification_note'),
        nextActionNoteUpdated: Object.prototype.hasOwnProperty.call(patch, 'next_action_note'),
      },
    })

  if (activityInsert.error && !isMissingDeveloperLeadSchema(activityInsert.error) && !isPermissionError(activityInsert.error)) {
    throw activityInsert.error
  }

  const [privateById, interestsById] = await Promise.all([
    fetchPrivateDetailsByLeadIds(client, [developerLeadId]),
    fetchInterestsByLeadIds(client, [developerLeadId]),
  ])

  return mapDeveloperLead(data, {
    privateDetails: privateById.get(developerLeadId) || null,
    interests: interestsById.get(developerLeadId) || [],
  })
}

export async function requestAgencyLeadHandover({ developerOrgId = '', developerLeadId = '' } = {}) {
  const orgId = requireDeveloperOrgId(developerOrgId)
  const leadId = normalizeUuid(developerLeadId)
  if (!leadId) throw new Error('A valid developer lead id is required.')

  const client = requireClient()
  const { data, error } = await client
    .from('developer_leads')
    .update({
      visibility_state: 'consent_pending',
      consent_requested_at: new Date().toISOString(),
    })
    .eq('developer_org_id', orgId)
    .eq('developer_lead_id', leadId)
    .eq('lead_owner', 'agency')
    .in('visibility_state', ['limited', 'consent_pending'])
    .select(DEVELOPER_LEAD_SELECT)
    .single()

  if (error) throw error

  const activityInsert = await client
    .from('developer_lead_activity')
    .insert({
      developer_lead_id: leadId,
      developer_org_id: orgId,
      source_agency_org_id: normalizeUuid(data.source_agency_org_id),
      actor_user_id: null,
      activity_type: 'handover_requested',
      activity_note: 'Developer requested buyer detail handover from the source agency.',
      visibility_scope: 'shared',
      metadata: {
        contract: DEVELOPER_LEAD_PHASE12_CONTRACT,
        nextVisibilityState: 'consent_pending',
      },
    })

  if (activityInsert.error && !isMissingDeveloperLeadSchema(activityInsert.error) && !isPermissionError(activityInsert.error)) {
    throw activityInsert.error
  }

  const interestsById = await fetchInterestsByLeadIds(client, [leadId])
  return mapDeveloperLead(data, {
    interests: interestsById.get(leadId) || [],
  })
}

export async function releaseAgencyDeveloperLeadHandover({
  sourceAgencyOrgId = '',
  developerLeadId = '',
  actorUserId = '',
  consentReference = '',
} = {}) {
  const agencyOrgId = requireDeveloperOrgId(sourceAgencyOrgId)
  const leadId = normalizeUuid(developerLeadId)
  if (!leadId) throw new Error('A valid developer lead id is required.')

  const client = requireClient()
  const acceptedAt = new Date().toISOString()
  const { data, error } = await client
    .from('developer_leads')
    .update({
      visibility_state: 'handed_over',
      handover_accepted_at: acceptedAt,
    })
    .eq('source_agency_org_id', agencyOrgId)
    .eq('developer_lead_id', leadId)
    .eq('lead_owner', 'agency')
    .eq('visibility_state', 'consent_pending')
    .select(DEVELOPER_LEAD_SELECT)
    .single()

  if (error) throw error

  const privateUpdate = await client
    .from('developer_lead_private_details')
    .update({
      consent_reference: normalizeText(consentReference) || 'agency_release_confirmed',
      consent_captured_at: acceptedAt,
      handover_source: 'agency',
    })
    .eq('developer_lead_id', leadId)
    .select(PRIVATE_DETAIL_SELECT)
    .single()

  if (privateUpdate.error && !isMissingDeveloperLeadSchema(privateUpdate.error) && !isPermissionError(privateUpdate.error)) {
    throw privateUpdate.error
  }

  const activityInsert = await client
    .from('developer_lead_activity')
    .insert({
      developer_lead_id: leadId,
      developer_org_id: normalizeUuid(data.developer_org_id),
      source_agency_org_id: agencyOrgId,
      actor_user_id: normalizeUuid(actorUserId),
      activity_type: 'handover_completed',
      activity_note: 'Agency released buyer details to the developer.',
      visibility_scope: 'shared',
      metadata: {
        contract: DEVELOPER_LEAD_PHASE22_CONTRACT,
        previousVisibilityState: 'consent_pending',
        nextVisibilityState: 'handed_over',
      },
    })

  if (activityInsert.error && !isMissingDeveloperLeadSchema(activityInsert.error) && !isPermissionError(activityInsert.error)) {
    throw activityInsert.error
  }

  const interestsById = await fetchInterestsByLeadIds(client, [leadId])
  return mapDeveloperLead(data, {
    privateDetails: privateUpdate.data ? mapPrivateDetails(privateUpdate.data) : null,
    interests: interestsById.get(leadId) || [],
    maskForDeveloper: false,
  })
}
