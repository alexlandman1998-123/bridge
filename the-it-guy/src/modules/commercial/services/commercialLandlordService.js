import { createScopedSupabaseClient, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import {
  buildLandlordOnboardingSummary,
  calculateLandlordOnboardingProgress,
  createEmptyLandlordOnboardingForm,
  getLandlordOnboardingDocumentRequirements,
} from '../commercialLandlordOnboardingModel'
import {
  createCommercialLandlord,
  getCommercialActivity,
  getCommercialDocumentRequests,
  getCommercialDocuments,
  getCommercialLookupData,
  logCommercialActivity,
  resolveCommercialOrganisationContext,
} from './commercialApi'

const PORTAL_ACCESS_TABLE = 'commercial_portal_access'
const PORTAL_CONTACTS_TABLE = 'commercial_portal_contacts'
const LANDLORD_CONTACTS_TABLE = 'commercial_landlord_contacts'
const LANDLORD_ONBOARDING_TABLE = 'commercial_landlord_onboarding'
const LANDLORD_ONBOARDING_RESPONSES_TABLE = 'commercial_landlord_onboarding_responses'
const COMMERCIAL_MANDATES_TABLE = 'commercial_mandates'
const COMMERCIAL_DOCUMENTS_TABLE = 'commercial_documents'
const COMMERCIAL_DOCUMENT_REQUESTS_TABLE = 'commercial_document_requests'
const COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES = ['documents', 'transaction-documents', 'private-listing-documents']
const PORTAL_HEADER = 'x-bridge-commercial-portal-token'

function normalizeText(value) {
  return String(value || '').trim()
}

function commercialAddressFields(value = null) {
  if (!value || typeof value !== 'object') return {}
  const placeId = normalizeText(value.googlePlaceId || value.placeId)
  return {
    formatted_address: normalizeText(value.formattedAddress) || null,
    street_number: normalizeText(value.streetNumber) || null,
    route: normalizeText(value.route) || null,
    street_name: normalizeText(value.streetName || value.route) || null,
    street_address: normalizeText(value.streetAddress || value.formattedAddress) || null,
    postal_code: normalizeText(value.postalCode) || null,
    country: normalizeText(value.country) || null,
    latitude: Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : null,
    longitude: Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : null,
    place_id: placeId || null,
    google_place_id: placeId || null,
    address_components: value.addressComponents || null,
    raw_google_response: value.rawGoogleResponse || null,
    geocoding_status: normalizeText(value.geocodingStatus) || (placeId ? 'google_place' : 'manual'),
  }
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isMissingOptionalCommercialTable(error, tableName = '') {
  if (!error) return false
  const code = normalizeText(error.code).toUpperCase()
  const message = normalizeLower(`${error.message || ''} ${error.details || ''} ${error.hint || ''}`)
  const table = normalizeLower(tableName)
  const referencesTable = !table || message.includes(table) || message.includes(`public.${table}`)
  const isMissingTable =
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('could not find the table') ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('schema cache')
  return isMissingTable && referencesTable
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function unique(values = []) {
  return [...new Set((values || []).map((value) => normalizeText(value)).filter(Boolean))]
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function createToken() {
  const bytes = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function addDays(days = 14) {
  const date = new Date()
  date.setDate(date.getDate() + Number(days || 14))
  return date.toISOString()
}

function buildAbsoluteUrl(path = '') {
  const normalized = normalizeText(path)
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (typeof window === 'undefined' || !window.location?.origin) return normalized
  return `${window.location.origin}${normalized.startsWith('/') ? normalized : `/${normalized}`}`
}

function safeFileName(value = '') {
  return normalizeText(value || 'document')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document'
}

function createPortalClient(token = '') {
  const normalized = normalizeText(token)
  if (!normalized) throw new Error('Landlord onboarding token is required.')
  const client = createScopedSupabaseClient({ [PORTAL_HEADER]: normalized })
  if (!client) throw new Error('Supabase is not configured.')
  return client
}

function requireInternalClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function getCurrentUserId() {
  if (!supabase?.auth?.getUser) return ''
  const { data } = await supabase.auth.getUser()
  return normalizeText(data?.user?.id)
}

function buildLandlordDisplayName(landlord = {}, form = {}) {
  const details = form.landlord_details || {}
  return normalizeText(
    details.legal_name ||
      details.full_name ||
      details.trust_name ||
      landlord.legal_name ||
      landlord.name ||
      landlord.contact_person,
  ) || 'Landlord'
}

function buildOnboardingFormLabel(form = {}) {
  const details = form.landlord_details || {}
  return normalizeText(details.legal_name || details.full_name || details.trust_name) || 'Landlord onboarding'
}

function flattenFormData(value, prefix = '', rows = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenFormData(item, prefix ? `${prefix}.${index}` : String(index), rows))
    return rows
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => flattenFormData(nested, prefix ? `${prefix}.${key}` : key, rows))
    return rows
  }
  rows.push({ field_key: prefix, field_value: value ?? null })
  return rows
}

function buildDocumentRequestRows({ organisationId, landlord = {}, onboarding = {}, requirements = [] } = {}) {
  const nowIso = new Date().toISOString()
  return requirements.map((requirement) => ({
    organisation_id: organisationId,
    branch_id: landlord.branch_id || null,
    team_id: landlord.team_id || null,
    broker_id: landlord.broker_id || null,
    entity_type: 'commercial_landlord',
    entity_id: landlord.id,
    document_name: requirement.label,
    category: requirement.category,
    notes: `Landlord onboarding requirement: ${requirement.label}`,
    status: 'requested',
    priority: requirement.required ? 'high' : 'normal',
    requested_from: buildLandlordDisplayName(landlord, onboarding.form_data),
    created_at: nowIso,
    updated_at: nowIso,
  }))
}

async function ensureLandlordDocumentRequests({ organisationId, landlord = {}, onboarding = {} } = {}) {
  const client = requireInternalClient()
  const requirements = getLandlordOnboardingDocumentRequirements({
    entityType: onboarding.entity_type || onboarding.form_data?.entity_type,
    vatRegistered: onboarding.form_data?.landlord_details?.vat_registered,
    ficaApplicable: onboarding.form_data?.landlord_details?.fica_applicable,
  })
  const existing = await getCommercialDocumentRequests('commercial_landlord', landlord.id, organisationId)
  const existingKeys = new Set(existing.map((row) => normalizeLower(row.document_name || row.category)))
  const rows = buildDocumentRequestRows({ organisationId, landlord, onboarding, requirements })
    .filter((row) => !existingKeys.has(normalizeLower(row.document_name)) && !existingKeys.has(normalizeLower(row.category)))
  if (!rows.length) return existing
  const query = await client.from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE).insert(rows).select('*')
  if (query.error) throw query.error
  return [...existing, ...(query.data || [])]
}

async function saveOnboardingResponses(client, onboardingId, form = {}) {
  const flattened = flattenFormData(form).filter((row) => normalizeText(row.field_key))
  if (!flattened.length) return
  const rows = flattened.map((row) => ({
    onboarding_id: onboardingId,
    field_key: row.field_key,
    field_value: row.field_value,
  }))
  const remove = await client.from(LANDLORD_ONBOARDING_RESPONSES_TABLE).delete().eq('onboarding_id', onboardingId)
  if (remove.error) throw remove.error
  const insert = await client.from(LANDLORD_ONBOARDING_RESPONSES_TABLE).insert(rows)
  if (insert.error) throw insert.error
}

async function fetchLandlordDocumentsForToken(client, organisationId, landlordId) {
  const [documentsQuery, requestsQuery] = await Promise.all([
    client
      .from(COMMERCIAL_DOCUMENTS_TABLE)
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('entity_type', 'commercial_landlord')
      .eq('entity_id', landlordId)
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    client
      .from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE)
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('entity_type', 'commercial_landlord')
      .eq('entity_id', landlordId)
      .order('created_at', { ascending: false }),
  ])
  if (documentsQuery.error) throw documentsQuery.error
  if (requestsQuery.error) throw requestsQuery.error
  return {
    documents: documentsQuery.data || [],
    requests: requestsQuery.data || [],
  }
}

async function fetchOnboardingAccessByToken(client, token) {
  const accessQuery = await client
    .from(PORTAL_ACCESS_TABLE)
    .select(`*, contact:${PORTAL_CONTACTS_TABLE}(*)`)
    .eq('token', normalizeText(token))
    .eq('status', 'active')
    .maybeSingle()
  if (accessQuery.error) throw accessQuery.error
  if (!accessQuery.data) throw new Error('Landlord onboarding link is invalid or inactive.')
  const expiry = asDate(accessQuery.data.expires_at)
  if (expiry && expiry < new Date()) throw new Error('Landlord onboarding link has expired.')
  return accessQuery.data
}

async function fetchOnboardingByToken(token) {
  const client = createPortalClient(token)
  const access = await fetchOnboardingAccessByToken(client, token)
  const contactMetadata = parseJsonObject(access.contact?.metadata)
  const onboardingId = normalizeText(contactMetadata.onboarding_id)
  if (!onboardingId) throw new Error('This landlord onboarding link is missing its onboarding record.')
  const [landlordQuery, onboardingQuery] = await Promise.all([
    client.from('commercial_landlords').select('*').eq('id', access.landlord_id).maybeSingle(),
    client.from(LANDLORD_ONBOARDING_TABLE).select('*').eq('id', onboardingId).maybeSingle(),
  ])
  if (landlordQuery.error) throw landlordQuery.error
  if (onboardingQuery.error) throw onboardingQuery.error
  if (!landlordQuery.data || !onboardingQuery.data) throw new Error('The landlord onboarding record could not be loaded.')
  const [contacts, mandates, propertiesQuery, documentsBundle] = await Promise.all([
    listOptionalLandlordContacts(client, access.landlord_id),
    listOptionalLandlordMandates(client, access.landlord_id),
    client.from('commercial_properties').select('*').eq('landlord_id', access.landlord_id).order('created_at', { ascending: true }),
    fetchLandlordDocumentsForToken(client, access.organisation_id, access.landlord_id),
  ])
  if (propertiesQuery.error) throw propertiesQuery.error

  const propertyIds = (propertiesQuery.data || []).map((row) => row.id)
  const vacanciesQuery = propertyIds.length
    ? await client.from('commercial_vacancies').select('*').in('property_id', propertyIds).order('created_at', { ascending: true })
    : { data: [], error: null }
  if (vacanciesQuery.error) throw vacanciesQuery.error

  return {
    client,
    access,
    landlord: landlordQuery.data,
    onboarding: onboardingQuery.data,
    contacts,
    mandates,
    properties: (propertiesQuery.data || []).map((property) => ({
      ...property,
      vacancies: (vacanciesQuery.data || []).filter((vacancy) => vacancy.property_id === property.id),
    })),
    documents: documentsBundle.documents,
    documentRequests: documentsBundle.requests,
  }
}

function buildProgressForWorkspace(record = {}) {
  const form = createEmptyLandlordOnboardingForm(record.form_data || {})
  const requiredDocuments = getLandlordOnboardingDocumentRequirements({
    entityType: record.entity_type || form.entity_type,
    vatRegistered: form.landlord_details?.vat_registered,
    ficaApplicable: form.landlord_details?.fica_applicable,
  })
  return calculateLandlordOnboardingProgress({
    form,
    uploadedDocuments: record.documents || [],
    requiredDocuments,
  })
}

async function sendLandlordOnboardingEmail({
  onboarding = {},
  landlord = {},
  recipientEmail = '',
  recipientName = '',
  brokerageName = '',
  brokerName = '',
  brokerEmail = '',
  brokerPhone = '',
  messageKind = 'initial_request',
  secureLink = '',
  missingFields = [],
  missingDocuments = [],
} = {}) {
  if (!normalizeText(recipientEmail)) return { skipped: true }
  const result = await invokeEdgeFunction('send-email', {
    body: {
      type: 'commercial_landlord_onboarding',
      to: recipientEmail,
      recipientName: recipientName || buildLandlordDisplayName(landlord, onboarding.form_data),
      landlordName: buildLandlordDisplayName(landlord, onboarding.form_data),
      brokerageName,
      brokerName,
      brokerEmail,
      brokerPhone,
      secureLink: buildAbsoluteUrl(secureLink),
      onboardingLink: buildAbsoluteUrl(secureLink),
      actionLink: buildAbsoluteUrl(secureLink),
      messageKind,
      entityType: onboarding.entity_type || onboarding.form_data?.entity_type,
      missingFields,
      missingDocuments,
      completionPercentage: onboarding.completion_percentage || 0,
    },
  })
  const error = result?.error || result?.data?.error
  if (error) throw new Error(error.message || error || 'Landlord onboarding email could not be sent.')
  return result?.data || { sent: true }
}

function mapLandlordContactToFormRow(contact = {}) {
  return {
    id: contact.id,
    clientKey: contact.client_key || contact.metadata?.clientKey || contact.id,
    full_name: contact.full_name || '',
    position: contact.position || '',
    email: contact.email || '',
    mobile: contact.mobile || '',
    id_number: contact.id_number || '',
    signing_capacity: contact.signing_capacity || '',
    authority_confirmed: Boolean(contact.authority_confirmed),
    can_approve_mandates: Boolean(contact.can_approve_mandates),
    can_approve_leasing_terms: Boolean(contact.can_approve_leasing_terms),
    can_approve_sales_terms: Boolean(contact.can_approve_sales_terms),
    is_primary: Boolean(contact.is_primary),
    portfolio_region: contact.portfolio_region || '',
    responsibilities: Array.isArray(contact.responsibilities) ? contact.responsibilities : [],
    notes: contact.notes || '',
    contact_type: contact.contact_type || '',
  }
}

function buildFormFromWorkspace(workspace = {}) {
  const form = createEmptyLandlordOnboardingForm(workspace.onboarding?.form_data || workspace.landlord || {})
  if (!workspace.contacts?.length && !workspace.properties?.length && !workspace.mandates?.length) return form
  const assetManagers = workspace.contacts.filter((row) => row.contact_type === 'asset_manager').map(mapLandlordContactToFormRow)
  const propertyManagers = workspace.contacts.filter((row) => row.contact_type === 'property_manager').map(mapLandlordContactToFormRow)
  const additionalContacts = workspace.contacts.filter((row) => !['asset_manager', 'property_manager'].includes(row.contact_type)).map(mapLandlordContactToFormRow)
  return {
    ...form,
    asset_managers: assetManagers.length ? assetManagers : form.asset_managers,
    property_managers: propertyManagers.length ? propertyManagers : form.property_managers,
    additional_contacts: additionalContacts.length ? additionalContacts : form.additional_contacts,
    properties: workspace.properties.length
      ? workspace.properties.map((property) => ({
          clientKey: property.id,
          id: property.id,
          property_name: property.property_name || '',
          property_type: property.property_type || '',
          address: property.address || '',
          suburb: property.suburb || '',
          city: property.city || '',
          province: property.province || '',
          gla_m2: property.gla_m2 || '',
          ownership_status: parseJsonObject(property.metadata_json).ownership_status || '',
          assigned_asset_manager_key: property.asset_manager_id || '',
          assigned_property_manager_key: property.property_manager_id || '',
          notes: property.notes || '',
          vacancies: (property.vacancies || []).map((vacancy) => ({
            clientKey: vacancy.id,
            id: vacancy.id,
            vacancy_name: vacancy.vacancy_name || '',
            unit_or_floor: vacancy.unit_or_floor || '',
            vacancy_type: parseJsonObject(vacancy.metadata_json).vacancy_type || '',
            available_area_m2: vacancy.available_area_m2 || '',
            rental_per_m2: parseJsonObject(vacancy.metadata_json).rental_per_m2 || '',
            operating_costs: parseJsonObject(vacancy.metadata_json).operating_costs || '',
            availability_date: vacancy.availability_date || '',
            lease_term_preference: parseJsonObject(vacancy.metadata_json).lease_term_preference || '',
            assigned_broker: vacancy.broker_assignment || vacancy.broker_id || '',
            assigned_property_manager_key: vacancy.property_manager_id || '',
            notes: vacancy.notes || '',
          })),
        }))
      : form.properties,
    mandates: workspace.mandates.length
      ? workspace.mandates.map((mandate) => ({
          id: mandate.id,
          mandate_kind: mandate.mandate_kind || '',
          mandate_type: mandate.mandate_type || '',
          start_date: mandate.start_date || '',
          expiry_date: mandate.expiry_date || '',
          commission_structure: mandate.commission_structure || '',
          brokerage_assigned: mandate.brokerage_assigned || '',
          broker_assigned: mandate.broker_assigned || '',
          notes: mandate.notes || '',
          property_client_key: mandate.property_id || '',
          vacancy_client_key: mandate.vacancy_id || '',
        }))
      : form.mandates,
  }
}

async function upsertLandlordContactRows(client, { landlord = {}, rows = [] } = {}) {
  const saved = []
  for (const row of rows) {
    const payload = {
      landlord_id: landlord.id,
      organisation_id: landlord.organisation_id,
      branch_id: landlord.branch_id || null,
      team_id: landlord.team_id || null,
      broker_id: landlord.broker_id || null,
      contact_type: normalizeText(row.contact_type),
      full_name: normalizeText(row.full_name),
      position: normalizeText(row.position) || null,
      email: normalizeText(row.email) || null,
      mobile: normalizeText(row.mobile) || null,
      id_number: normalizeText(row.id_number) || null,
      signing_capacity: normalizeText(row.signing_capacity) || null,
      is_primary: Boolean(row.is_primary),
      authority_confirmed: Boolean(row.authority_confirmed),
      can_approve_mandates: Boolean(row.can_approve_mandates),
      can_approve_leasing_terms: Boolean(row.can_approve_leasing_terms),
      can_approve_sales_terms: Boolean(row.can_approve_sales_terms),
      portfolio_region: normalizeText(row.portfolio_region) || null,
      responsibilities: Array.isArray(row.responsibilities) ? row.responsibilities : [],
      notes: normalizeText(row.notes) || null,
      metadata_json: { clientKey: row.clientKey || row.client_key || row.id || '' },
    }
    if (!payload.full_name) continue
    const query = normalizeText(row.id)
      ? await client.from(LANDLORD_CONTACTS_TABLE).update(payload).eq('id', row.id).select('*').single()
      : await client.from(LANDLORD_CONTACTS_TABLE).insert(payload).select('*').single()
    if (query.error) throw query.error
    saved.push({ ...query.data, clientKey: row.clientKey || row.client_key || query.data?.id })
  }
  return saved
}

async function upsertPropertyRows(client, { landlord = {}, properties = [], contactsByKey = {} } = {}) {
  const saved = []
  for (const property of properties) {
    const payload = {
      organisation_id: landlord.organisation_id,
      branch_id: landlord.branch_id || null,
      team_id: landlord.team_id || null,
      broker_id: landlord.broker_id || null,
      landlord_id: landlord.id,
      property_name: normalizeText(property.property_name),
      property_type: normalizeText(property.property_type) || null,
      address: normalizeText(property.address) || null,
      ...commercialAddressFields(property.addressValue || property.address_value),
      suburb: normalizeText(property.suburb) || null,
      city: normalizeText(property.city) || null,
      province: normalizeText(property.province) || null,
      country: normalizeText(property.addressValue?.country || property.address_value?.country) || 'South Africa',
      gla_m2: normalizeText(property.gla_m2) || null,
      status: 'active',
      notes: normalizeText(property.notes) || null,
      asset_manager_id: contactsByKey[property.assigned_asset_manager_key]?.id || null,
      property_manager_id: contactsByKey[property.assigned_property_manager_key]?.id || null,
      metadata_json: {
        ownership_status: normalizeText(property.ownership_status) || null,
        source: 'landlord_onboarding',
      },
    }
    if (!payload.property_name) continue
    const query = normalizeText(property.id)
      ? await client.from('commercial_properties').update(payload).eq('id', property.id).select('*').single()
      : await client.from('commercial_properties').insert(payload).select('*').single()
    if (query.error) throw query.error
    saved.push({ ...query.data, clientKey: property.clientKey || property.id || query.data?.id, vacancies: property.vacancies || [] })
  }
  return saved
}

async function upsertVacancyRows(client, { landlord = {}, properties = [], propertyByKey = {}, contactsByKey = {} } = {}) {
  const saved = []
  for (const property of properties) {
    for (const vacancy of property.vacancies || []) {
      const propertyRecord = propertyByKey[property.clientKey] || propertyByKey[property.id] || propertyByKey[vacancy.property_client_key]
      if (!propertyRecord?.id || !normalizeText(vacancy.vacancy_name)) continue
      const payload = {
        organisation_id: landlord.organisation_id,
        branch_id: landlord.branch_id || null,
        team_id: landlord.team_id || null,
        broker_id: normalizeText(vacancy.assigned_broker) || landlord.broker_id || null,
        landlord_id: landlord.id,
        property_id: propertyRecord.id,
        property_manager_id: contactsByKey[vacancy.assigned_property_manager_key]?.id || null,
        vacancy_name: normalizeText(vacancy.vacancy_name),
        unit_or_floor: normalizeText(vacancy.unit_or_floor) || null,
        available_area_m2: normalizeText(vacancy.available_area_m2) || null,
        asking_rental: normalizeText(vacancy.rental_per_m2) || null,
        availability_date: normalizeText(vacancy.availability_date) || null,
        broker_assignment: normalizeText(vacancy.assigned_broker) || landlord.broker_id || null,
        status: 'available',
        notes: normalizeText(vacancy.notes) || null,
        metadata_json: {
          vacancy_type: normalizeText(vacancy.vacancy_type) || null,
          rental_per_m2: normalizeText(vacancy.rental_per_m2) || null,
          operating_costs: normalizeText(vacancy.operating_costs) || null,
          lease_term_preference: normalizeText(vacancy.lease_term_preference) || null,
          source: 'landlord_onboarding',
        },
      }
      const query = normalizeText(vacancy.id)
        ? await client.from('commercial_vacancies').update(payload).eq('id', vacancy.id).select('*').single()
        : await client.from('commercial_vacancies').insert(payload).select('*').single()
      if (query.error) throw query.error
      saved.push(query.data)
    }
  }
  return saved
}

async function upsertMandateRows(client, { landlord = {}, mandates = [], propertyByKey = {}, vacancyByPropertyId = {} } = {}) {
  const saved = []
  for (const mandate of mandates) {
    if (!normalizeText(mandate.mandate_kind) || !normalizeText(mandate.mandate_type)) continue
    const propertyId = propertyByKey[mandate.property_client_key]?.id || normalizeText(mandate.property_client_key) || null
    const vacancyId = propertyId
      ? (vacancyByPropertyId[propertyId] || []).find((row) => row.id === mandate.vacancy_client_key)?.id || normalizeText(mandate.vacancy_client_key) || null
      : null
    const payload = {
      organisation_id: landlord.organisation_id,
      branch_id: landlord.branch_id || null,
      team_id: landlord.team_id || null,
      broker_id: landlord.broker_id || null,
      landlord_id: landlord.id,
      property_id: propertyId,
      vacancy_id: vacancyId,
      mandate_kind: normalizeText(mandate.mandate_kind),
      mandate_type: normalizeText(mandate.mandate_type),
      start_date: normalizeText(mandate.start_date) || null,
      expiry_date: normalizeText(mandate.expiry_date) || null,
      commission_structure: normalizeText(mandate.commission_structure) || null,
      brokerage_assigned: normalizeText(mandate.brokerage_assigned) || null,
      broker_assigned: normalizeText(mandate.broker_assigned) || null,
      notes: normalizeText(mandate.notes) || null,
      status: 'active',
      metadata_json: { source: 'landlord_onboarding' },
    }
    const query = normalizeText(mandate.id)
      ? await client.from(COMMERCIAL_MANDATES_TABLE).update(payload).eq('id', mandate.id).select('*').single()
      : await client.from(COMMERCIAL_MANDATES_TABLE).insert(payload).select('*').single()
    if (query.error) throw query.error
    saved.push(query.data)
  }
  return saved
}

async function listOptionalLandlordContacts(client, landlordId) {
  if (!normalizeText(landlordId)) return []
  const query = await client.from(LANDLORD_CONTACTS_TABLE).select('*').eq('landlord_id', landlordId).order('created_at', { ascending: true })
  if (query.error) {
    if (isMissingOptionalCommercialTable(query.error, LANDLORD_CONTACTS_TABLE)) return []
    throw query.error
  }
  return query.data || []
}

async function listOptionalLandlordMandates(client, landlordId) {
  if (!normalizeText(landlordId)) return []
  const query = await client.from(COMMERCIAL_MANDATES_TABLE).select('*').eq('landlord_id', landlordId).order('created_at', { ascending: false })
  if (query.error) {
    if (isMissingOptionalCommercialTable(query.error, COMMERCIAL_MANDATES_TABLE)) return []
    throw query.error
  }
  return query.data || []
}

async function listOptionalLandlordOnboardings(client, landlordId) {
  if (!normalizeText(landlordId)) return []
  const query = await client.from(LANDLORD_ONBOARDING_TABLE).select('*').eq('landlord_id', landlordId).order('created_at', { ascending: false })
  if (query.error) {
    if (isMissingOptionalCommercialTable(query.error, LANDLORD_ONBOARDING_TABLE)) return []
    throw query.error
  }
  return query.data || []
}

function summarizeLandlordWorkspace({ landlord = {}, contacts = [], properties = [], vacancies = [], mandates = [], deals = [], leases = [], onboardings = [] } = {}) {
  const primaryAssetManager = contacts.find((row) => row.contact_type === 'asset_manager' && row.is_primary) || contacts.find((row) => row.contact_type === 'asset_manager') || null
  const primaryPropertyManager = contacts.find((row) => row.contact_type === 'property_manager' && row.is_primary) || contacts.find((row) => row.contact_type === 'property_manager') || null
  const latestOnboarding = onboardings[0] || null
  const totalGla = properties.reduce((sum, property) => sum + toNumber(property.gla_m2), 0)
  return {
    totalProperties: properties.length,
    totalGla,
    activeVacancies: vacancies.filter((row) => !['occupied', 'withdrawn', 'archived'].includes(normalizeLower(row.status))).length,
    activeLeasingMandates: mandates.filter((row) => normalizeLower(row.mandate_kind) === 'leasing' && normalizeLower(row.status) === 'active').length,
    activeSalesMandates: mandates.filter((row) => normalizeLower(row.mandate_kind) === 'sales' && normalizeLower(row.status) === 'active').length,
    activeDeals: deals.filter((row) => !['completed', 'lost', 'cancelled'].includes(normalizeLower(row.status))).length,
    activeLeases: leases.filter((row) => ['active', 'executed', 'pending_signature'].includes(normalizeLower(row.status))).length,
    primaryAssetManager,
    primaryPropertyManager,
    mainContact: primaryAssetManager || primaryPropertyManager || { full_name: landlord.contact_person || landlord.name || 'Not set' },
    onboardingStatus: latestOnboarding?.status || landlord.onboarding_status || 'not_sent',
    latestOnboarding,
  }
}

export async function listCommercialLandlordContacts(landlordId) {
  const client = requireInternalClient()
  return listOptionalLandlordContacts(client, landlordId)
}

export async function saveCommercialLandlordContact(landlordId, payload = {}) {
  const client = requireInternalClient()
  const landlordQuery = await client.from('commercial_landlords').select('*').eq('id', landlordId).single()
  if (landlordQuery.error) throw landlordQuery.error
  const saved = await upsertLandlordContactRows(client, {
    landlord: landlordQuery.data,
    rows: [{ ...payload, id: payload.id || '' }],
  })
  return saved[0] || null
}

export async function listCommercialLandlordMandates(landlordId) {
  const client = requireInternalClient()
  return listOptionalLandlordMandates(client, landlordId)
}

export async function saveCommercialLandlordMandate(landlordId, payload = {}) {
  const client = requireInternalClient()
  const landlordQuery = await client.from('commercial_landlords').select('*').eq('id', landlordId).single()
  if (landlordQuery.error) throw landlordQuery.error
  const saved = await upsertMandateRows(client, {
    landlord: landlordQuery.data,
    mandates: [{ ...payload, id: payload.id || '' }],
    propertyByKey: {},
    vacancyByPropertyId: {},
  })
  return saved[0] || null
}

export async function getCommercialLandlordWorkspaceData(organisationId, landlordId) {
  const client = requireInternalClient()
  const lookups = await getCommercialLookupData(organisationId)
  const landlord = (lookups.landlords || []).find((row) => row.id === landlordId) || null
  if (!landlord) return { landlord: null }
  const [contacts, mandates, onboardings, activity, documents, requests] = await Promise.all([
    listOptionalLandlordContacts(client, landlordId),
    listOptionalLandlordMandates(client, landlordId),
    listOptionalLandlordOnboardings(client, landlordId),
    getCommercialActivity({ organisationId, entityType: 'commercial_landlord', entityId: landlordId }),
    getCommercialDocuments('commercial_landlord', landlordId, organisationId),
    getCommercialDocumentRequests('commercial_landlord', landlordId, organisationId),
  ])
  const properties = (lookups.properties || []).filter((row) => row.landlord_id === landlordId)
  const propertyIds = new Set(properties.map((row) => row.id))
  const vacancies = (lookups.vacancies || []).filter((row) => row.landlord_id === landlordId || propertyIds.has(row.property_id))
  const propertyIdSet = new Set(properties.map((row) => row.id))
  const vacancyIdSet = new Set(vacancies.map((row) => row.id))
  const deals = (lookups.deals || []).filter((row) => row.landlord_id === landlordId || propertyIdSet.has(row.property_id) || vacancyIdSet.has(row.vacancy_id))
  const leases = (lookups.leases || []).filter((row) => row.landlord_id === landlordId || propertyIdSet.has(row.property_id) || vacancyIdSet.has(row.vacancy_id))
  const relatedActivityGroups = await Promise.all([
    ...properties.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_property', entityId: row.id })),
    ...vacancies.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_vacancy', entityId: row.id })),
    ...mandates.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_mandate', entityId: row.id })),
  ])
  const fullActivity = [...(activity || []), ...relatedActivityGroups.flat().filter(Boolean)]
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
  const onboardingEnriched = onboardings.map((row) => ({
    ...row,
    documents,
    documentRequests: requests,
    progress: buildProgressForWorkspace({ ...row, documents }),
    form_data: createEmptyLandlordOnboardingForm(row.form_data || {}),
  }))
  return {
    landlord,
    contacts,
    mandates,
    properties,
    vacancies,
    deals,
    leases,
    documents,
    documentRequests: requests,
    onboardings: onboardingEnriched,
    activity: fullActivity,
    summary: summarizeLandlordWorkspace({
      landlord,
      contacts,
      properties,
      vacancies,
      mandates,
      deals,
      leases,
      onboardings: onboardingEnriched,
    }),
    lookups,
  }
}

export async function createCommercialLandlordOnboarding({
  landlordId = '',
  landlordDraft = {},
  recipientName = '',
  recipientEmail = '',
  recipientPhone = '',
  expiryDays = 14,
} = {}) {
  const client = requireInternalClient()
  const context = await resolveCommercialOrganisationContext()
  const organisationId = normalizeText(context.organisationId)
  const brokerName = normalizeText(context.profile?.fullName || context.profile?.displayName || context.profile?.email)
  const brokerEmail = normalizeText(context.profile?.email)
  const brokerPhone = normalizeText(context.profile?.phone || context.profile?.mobile)
  const brokerageName = normalizeText(context.organisation?.displayName || context.organisation?.name) || 'Arch9 Commercial'
  if (!organisationId) throw new Error('Commercial organisation context is not available.')

  let landlord = null
  if (normalizeText(landlordId)) {
    const query = await client.from('commercial_landlords').select('*').eq('id', landlordId).single()
    if (query.error) throw query.error
    landlord = query.data
  } else {
    const created = await createCommercialLandlord({
      organisation_id: organisationId,
      name: normalizeText(landlordDraft.name || landlordDraft.legal_name),
      legal_name: normalizeText(landlordDraft.legal_name || landlordDraft.name),
      entity_type: normalizeLower(landlordDraft.entity_type || 'company'),
      onboarding_status: 'not_sent',
      email: normalizeText(landlordDraft.email || recipientEmail) || null,
      main_email: normalizeText(landlordDraft.email || recipientEmail) || null,
      phone: normalizeText(landlordDraft.phone || recipientPhone) || null,
      main_phone: normalizeText(landlordDraft.phone || recipientPhone) || null,
      contact_person: normalizeText(landlordDraft.contact_person || recipientName) || null,
      status: 'active',
    })
    landlord = created
  }

  const form = createEmptyLandlordOnboardingForm({
    entity_type: landlord.entity_type || landlord.landlord_type || 'company',
    legal_name: landlord.legal_name || landlord.name,
    trading_name: landlord.trading_name,
    registered_address: landlord.registered_address,
    postal_address: landlord.postal_address,
    main_email: landlord.main_email || landlord.email,
    main_phone: landlord.main_phone || landlord.phone,
    website: landlord.website,
    contact_person: landlord.contact_person,
  })
  const requiredDocuments = getLandlordOnboardingDocumentRequirements({
    entityType: form.entity_type,
    vatRegistered: form.landlord_details?.vat_registered,
    ficaApplicable: form.landlord_details?.fica_applicable,
  })
  const progress = calculateLandlordOnboardingProgress({
    form,
    uploadedDocuments: [],
    requiredDocuments,
  })
  const currentUserId = await getCurrentUserId()
  const onboardingPayload = {
    organisation_id: organisationId,
    landlord_id: landlord.id,
    created_by: currentUserId || null,
    entity_type: form.entity_type,
    portfolio_type: form.portfolio.asset_types,
    status: 'sent',
    completion_percentage: progress.completionPercentage,
    form_data: form,
    missing_field_keys: progress.missingFieldKeys,
    required_document_keys: requiredDocuments.map((document) => document.key),
    missing_document_keys: progress.missingDocumentKeys,
    expires_at: addDays(expiryDays),
    last_email_kind: 'initial_request',
    last_email_sent_at: new Date().toISOString(),
    secure_token: createToken(),
  }
  const onboardingQuery = await client.from(LANDLORD_ONBOARDING_TABLE).insert(onboardingPayload).select('*').single()
  if (onboardingQuery.error) throw onboardingQuery.error
  const onboarding = onboardingQuery.data

  const transactionKey = `landlord_onboarding:${onboarding.id}`
  const contactPayload = {
    organisation_id: organisationId,
    commercial_transaction_id: transactionKey,
    portal_role: 'landlord',
    entity_type: 'commercial_landlord',
    entity_id: landlord.id,
    contact_name: normalizeText(recipientName || landlord.contact_person || landlord.name),
    contact_email: normalizeText(recipientEmail || landlord.main_email || landlord.email),
    contact_phone: normalizeText(recipientPhone || landlord.main_phone || landlord.phone) || null,
    company_name: landlord.legal_name || landlord.name,
    status: 'active',
    metadata: {
      source: 'commercial_landlord_onboarding',
      onboarding_id: onboarding.id,
      broker_name: brokerName,
      broker_email: brokerEmail,
      broker_phone: brokerPhone,
      brokerage_name: brokerageName,
    },
  }
  const contactQuery = await client.from(PORTAL_CONTACTS_TABLE).insert(contactPayload).select('*').single()
  if (contactQuery.error) throw contactQuery.error
  const accessPayload = {
    organisation_id: organisationId,
    contact_id: contactQuery.data.id,
    commercial_transaction_id: transactionKey,
    portal_role: 'landlord',
    token: onboarding.secure_token,
    status: 'active',
    expires_at: onboarding.expires_at,
    invitation_sent_at: new Date().toISOString(),
    visibility: {
      documents: true,
      timeline: false,
      messages: false,
      lease: false,
      properties: true,
      requirements: false,
      viewings: false,
      transactions: false,
    },
    landlord_id: landlord.id,
  }
  const accessQuery = await client.from(PORTAL_ACCESS_TABLE).insert(accessPayload).select('*').single()
  if (accessQuery.error) throw accessQuery.error

  const updateOnboardingQuery = await client
    .from(LANDLORD_ONBOARDING_TABLE)
    .update({ portal_access_id: accessQuery.data.id })
    .eq('id', onboarding.id)
    .select('*')
    .single()
  if (updateOnboardingQuery.error) throw updateOnboardingQuery.error

  await saveOnboardingResponses(client, onboarding.id, form)
  await ensureLandlordDocumentRequests({
    organisationId,
    landlord,
    onboarding: { ...updateOnboardingQuery.data, form_data: form, entity_type: form.entity_type },
  })
  await client
    .from('commercial_landlords')
    .update({
      onboarding_status: 'sent',
      main_email: contactPayload.contact_email || landlord.main_email,
      main_phone: contactPayload.contact_phone || landlord.main_phone,
      contact_person: contactPayload.contact_name || landlord.contact_person,
      email: contactPayload.contact_email || landlord.email,
      phone: contactPayload.contact_phone || landlord.phone,
    })
    .eq('id', landlord.id)

  const secureLink = `/commercial/landlord-onboarding/${onboarding.secure_token}`
  await sendLandlordOnboardingEmail({
    onboarding: { ...updateOnboardingQuery.data, form_data: form },
    landlord,
    recipientEmail: contactPayload.contact_email,
    recipientName: contactPayload.contact_name,
    brokerageName,
    brokerName,
    brokerEmail,
    brokerPhone,
    messageKind: 'initial_request',
    secureLink,
  })
  await logCommercialActivity({
    organisation_id: organisationId,
    entityType: 'commercial_landlord',
    entityId: landlord.id,
    activityType: 'landlord_onboarding_sent',
    title: 'Landlord onboarding sent',
    body: `Secure onboarding was sent to ${contactPayload.contact_name || contactPayload.contact_email}.`,
    metadata: { onboardingId: onboarding.id, secureLink },
  }).catch(() => null)
  return {
    landlord,
    onboarding: { ...updateOnboardingQuery.data, form_data: form },
    contact: contactQuery.data,
    access: accessQuery.data,
    secureLink,
  }
}

export async function resendCommercialLandlordOnboarding(onboardingId, messageKind = 'reminder') {
  const client = requireInternalClient()
  const context = await resolveCommercialOrganisationContext()
  const brokerName = normalizeText(context.profile?.fullName || context.profile?.displayName || context.profile?.email)
  const brokerEmail = normalizeText(context.profile?.email)
  const brokerPhone = normalizeText(context.profile?.phone || context.profile?.mobile)
  const brokerageName = normalizeText(context.organisation?.displayName || context.organisation?.name) || 'Arch9 Commercial'
  const onboardingQuery = await client.from(LANDLORD_ONBOARDING_TABLE).select('*').eq('id', onboardingId).single()
  if (onboardingQuery.error) throw onboardingQuery.error
  const landlordQuery = await client.from('commercial_landlords').select('*').eq('id', onboardingQuery.data.landlord_id).single()
  if (landlordQuery.error) throw landlordQuery.error
  const accessQuery = await client
    .from(PORTAL_ACCESS_TABLE)
    .select(`*, contact:${PORTAL_CONTACTS_TABLE}(*)`)
    .eq('id', onboardingQuery.data.portal_access_id)
    .single()
  if (accessQuery.error) throw accessQuery.error
  const onboarding = onboardingQuery.data
  const landlord = landlordQuery.data
  const requiredDocuments = getLandlordOnboardingDocumentRequirements({
    entityType: onboarding.entity_type,
    vatRegistered: onboarding.form_data?.landlord_details?.vat_registered,
    ficaApplicable: onboarding.form_data?.landlord_details?.fica_applicable,
  })
  const documents = await getCommercialDocuments('commercial_landlord', landlord.id, landlord.organisation_id)
  const progress = calculateLandlordOnboardingProgress({
    form: createEmptyLandlordOnboardingForm(onboarding.form_data || {}),
    uploadedDocuments: documents,
    requiredDocuments,
  })
  const secureLink = `/commercial/landlord-onboarding/${onboarding.secure_token}`
  const missingDocuments = requiredDocuments
    .filter((document) => progress.missingDocumentKeys.includes(document.key))
    .map((document) => document.label)
  await sendLandlordOnboardingEmail({
    onboarding,
    landlord,
    recipientEmail: accessQuery.data.contact?.contact_email,
    recipientName: accessQuery.data.contact?.contact_name,
    brokerageName,
    brokerName,
    brokerEmail,
    brokerPhone,
    messageKind,
    secureLink,
    missingFields: progress.missingFieldKeys,
    missingDocuments,
  })
  const patch = {
    last_email_kind: messageKind,
    last_email_sent_at: new Date().toISOString(),
    status: messageKind === 'missing_information' ? 'missing_information' : onboarding.status,
  }
  const updated = await client.from(LANDLORD_ONBOARDING_TABLE).update(patch).eq('id', onboardingId).select('*').single()
  if (updated.error) throw updated.error
  await logCommercialActivity({
    organisation_id: landlord.organisation_id,
    entityType: 'commercial_landlord',
    entityId: landlord.id,
    activityType: `landlord_onboarding_${messageKind}`,
    title: messageKind === 'missing_information' ? 'Missing information requested' : 'Landlord onboarding resent',
    body: messageKind === 'missing_information'
      ? 'A missing information follow-up was sent to the landlord.'
      : 'The landlord onboarding link was resent.',
    metadata: { onboardingId, messageKind },
  }).catch(() => null)
  return { ...updated.data, secureLink }
}

export async function markCommercialLandlordOnboardingComplete(onboardingId) {
  const client = requireInternalClient()
  const onboardingQuery = await client.from(LANDLORD_ONBOARDING_TABLE).update({
    status: 'complete',
    approved_at: new Date().toISOString(),
    approved_by: await getCurrentUserId() || null,
  }).eq('id', onboardingId).select('*').single()
  if (onboardingQuery.error) throw onboardingQuery.error
  await client.from('commercial_landlords').update({ onboarding_status: 'complete' }).eq('id', onboardingQuery.data.landlord_id)
  return onboardingQuery.data
}

export async function getCommercialLandlordOnboardingByToken(token) {
  const workspace = await fetchOnboardingByToken(token)
  const form = buildFormFromWorkspace(workspace)
  const requiredDocuments = getLandlordOnboardingDocumentRequirements({
    entityType: workspace.onboarding.entity_type || form.entity_type,
    vatRegistered: form.landlord_details?.vat_registered,
    ficaApplicable: form.landlord_details?.fica_applicable,
  })
  const progress = calculateLandlordOnboardingProgress({
    form,
    uploadedDocuments: workspace.documents,
    requiredDocuments,
  })
  await workspace.client
    .from(PORTAL_ACCESS_TABLE)
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', workspace.access.id)
  await workspace.client
    .from(LANDLORD_ONBOARDING_TABLE)
    .update({
      status: ['submitted', 'missing_information', 'complete'].includes(normalizeLower(workspace.onboarding.status))
        ? workspace.onboarding.status
        : (workspace.access.last_opened_at ? 'in_progress' : 'opened'),
      last_opened_at: new Date().toISOString(),
      completion_percentage: progress.completionPercentage,
      missing_field_keys: progress.missingFieldKeys,
      missing_document_keys: progress.missingDocumentKeys,
    })
    .eq('id', workspace.onboarding.id)
    .catch(() => null)
  return {
    access: workspace.access,
    landlord: workspace.landlord,
    onboarding: workspace.onboarding,
    form,
    contacts: workspace.contacts,
    properties: workspace.properties,
    mandates: workspace.mandates,
    documents: workspace.documents,
    documentRequests: workspace.documentRequests,
    requiredDocuments,
    progress,
    summaryRows: buildLandlordOnboardingSummary(form),
  }
}

export async function saveCommercialLandlordOnboardingDraft(token, formInput = {}) {
  const workspace = await fetchOnboardingByToken(token)
  const form = createEmptyLandlordOnboardingForm(formInput)
  const requiredDocuments = getLandlordOnboardingDocumentRequirements({
    entityType: form.entity_type,
    vatRegistered: form.landlord_details?.vat_registered,
    ficaApplicable: form.landlord_details?.fica_applicable,
  })
  const progress = calculateLandlordOnboardingProgress({
    form,
    uploadedDocuments: workspace.documents,
    requiredDocuments,
  })
  const patch = {
    entity_type: form.entity_type,
    portfolio_type: form.portfolio.asset_types,
    status: ['submitted', 'missing_information', 'complete'].includes(normalizeLower(workspace.onboarding.status))
      ? workspace.onboarding.status
      : 'in_progress',
    form_data: form,
    completion_percentage: progress.completionPercentage,
    missing_field_keys: progress.missingFieldKeys,
    required_document_keys: requiredDocuments.map((document) => document.key),
    missing_document_keys: progress.missingDocumentKeys,
    updated_at: new Date().toISOString(),
  }
  const update = await workspace.client.from(LANDLORD_ONBOARDING_TABLE).update(patch).eq('id', workspace.onboarding.id).select('*').single()
  if (update.error) throw update.error
  await saveOnboardingResponses(workspace.client, workspace.onboarding.id, form)
  return {
    onboarding: update.data,
    form,
    progress,
  }
}

export async function submitCommercialLandlordOnboarding(token, formInput = {}) {
  const workspace = await fetchOnboardingByToken(token)
  const form = createEmptyLandlordOnboardingForm(formInput)
  const requiredDocuments = getLandlordOnboardingDocumentRequirements({
    entityType: form.entity_type,
    vatRegistered: form.landlord_details?.vat_registered,
    ficaApplicable: form.landlord_details?.fica_applicable,
  })
  const progress = calculateLandlordOnboardingProgress({
    form,
    uploadedDocuments: workspace.documents,
    requiredDocuments,
  })

  const landlordPatch = {
    legal_name: normalizeText(form.landlord_details.legal_name || form.landlord_details.full_name || form.landlord_details.trust_name) || workspace.landlord.legal_name || workspace.landlord.name,
    trading_name: normalizeText(form.landlord_details.trading_name) || null,
    name: normalizeText(form.landlord_details.legal_name || form.landlord_details.full_name || form.landlord_details.trust_name) || workspace.landlord.name,
    entity_type: normalizeText(form.entity_type) || null,
    registration_number: normalizeText(form.landlord_details.registration_number || form.landlord_details.trust_registration_number) || null,
    vat_number: normalizeText(form.landlord_details.vat_number) || null,
    vat_registered: Boolean(form.landlord_details.vat_registered),
    registered_address: normalizeText(form.landlord_details.registered_address || form.landlord_details.residential_address) || null,
    postal_address: normalizeText(form.landlord_details.postal_address) || null,
    main_email: normalizeText(form.landlord_details.main_email_address) || null,
    main_phone: normalizeText(form.landlord_details.main_contact_number) || null,
    email: normalizeText(form.landlord_details.main_email_address) || null,
    phone: normalizeText(form.landlord_details.main_contact_number) || null,
    website: normalizeText(form.landlord_details.website) || null,
    contact_person: normalizeText(form.landlord_details.full_name || form.asset_managers?.[0]?.full_name) || null,
    portfolio_type: form.portfolio.asset_types,
    total_gla_estimate: normalizeText(form.portfolio.estimated_total_gla) || null,
    number_of_properties_estimate: normalizeText(form.portfolio.number_of_properties) || null,
    onboarding_status: progress.missingCount ? 'missing_information' : 'submitted',
    portfolio_notes: normalizeText(form.portfolio.portfolio_notes) || null,
    metadata_json: {
      residential_address: normalizeText(form.landlord_details.residential_address) || null,
      masters_office_reference: normalizeText(form.landlord_details.masters_office_reference) || null,
      trust_name: normalizeText(form.landlord_details.trust_name) || null,
      trust_registration_number: normalizeText(form.landlord_details.trust_registration_number) || null,
      fica_applicable: form.landlord_details.fica_applicable !== false,
      primary_regions: unique(form.portfolio.primary_regions),
      existing_broker_relationships: form.broker_relationships.relationships || [],
      banking_details: form.banking_details || {},
      approval_permissions: form.approval_permissions || {},
      onboarding_notes: normalizeText(form.onboarding_notes) || null,
    },
  }
  const landlordUpdate = await workspace.client.from('commercial_landlords').update(landlordPatch).eq('id', workspace.landlord.id).select('*').single()
  if (landlordUpdate.error) throw landlordUpdate.error

  const savedContacts = await upsertLandlordContactRows(workspace.client, {
    landlord: landlordUpdate.data,
    rows: [
      ...(form.asset_managers || []).map((row) => ({ ...row, contact_type: 'asset_manager' })),
      ...(form.property_managers || []).map((row) => ({ ...row, contact_type: 'property_manager' })),
      ...(form.additional_contacts || []),
    ],
  })
  const contactsByKey = savedContacts.reduce((map, contact) => {
    map[contact.clientKey || contact.id] = contact
    map[contact.id] = contact
    return map
  }, {})
  const savedProperties = await upsertPropertyRows(workspace.client, {
    landlord: landlordUpdate.data,
    properties: form.properties || [],
    contactsByKey,
  })
  const propertyByKey = savedProperties.reduce((map, property) => {
    map[property.clientKey || property.id] = property
    map[property.id] = property
    return map
  }, {})
  const savedVacancies = await upsertVacancyRows(workspace.client, {
    landlord: landlordUpdate.data,
    properties: form.properties || [],
    propertyByKey,
    contactsByKey,
  })
  const vacancyByPropertyId = savedVacancies.reduce((map, vacancy) => {
    if (!map[vacancy.property_id]) map[vacancy.property_id] = []
    map[vacancy.property_id].push(vacancy)
    return map
  }, {})
  const savedMandates = await upsertMandateRows(workspace.client, {
    landlord: landlordUpdate.data,
    mandates: form.mandates || [],
    propertyByKey,
    vacancyByPropertyId,
  })

  const onboardingPatch = {
    entity_type: form.entity_type,
    portfolio_type: form.portfolio.asset_types,
    form_data: form,
    completion_percentage: progress.completionPercentage,
    missing_field_keys: progress.missingFieldKeys,
    required_document_keys: requiredDocuments.map((document) => document.key),
    missing_document_keys: progress.missingDocumentKeys,
    submitted_at: new Date().toISOString(),
    status: progress.missingCount ? 'missing_information' : 'submitted',
  }
  const onboardingUpdate = await workspace.client
    .from(LANDLORD_ONBOARDING_TABLE)
    .update(onboardingPatch)
    .eq('id', workspace.onboarding.id)
    .select('*')
    .single()
  if (onboardingUpdate.error) throw onboardingUpdate.error
  await saveOnboardingResponses(workspace.client, workspace.onboarding.id, form)
  await ensureLandlordDocumentRequests({
    organisationId: workspace.landlord.organisation_id,
    landlord: landlordUpdate.data,
    onboarding: { ...onboardingUpdate.data, form_data: form, entity_type: form.entity_type },
  })
  await logCommercialActivity({
    organisation_id: workspace.landlord.organisation_id,
    entityType: 'commercial_landlord',
    entityId: workspace.landlord.id,
    activityType: 'landlord_onboarding_submitted',
    title: 'Landlord onboarding submitted',
    body: `${buildOnboardingFormLabel(form)} was submitted through the secure onboarding link.`,
    metadata: {
      onboardingId: workspace.onboarding.id,
      propertyCount: savedProperties.length,
      vacancyCount: savedVacancies.length,
      mandateCount: savedMandates.length,
    },
  }).catch(() => null)
  if (progress.missingCount) {
    await resendCommercialLandlordOnboarding(workspace.onboarding.id, 'missing_information').catch(() => null)
  } else {
    await resendCommercialLandlordOnboarding(workspace.onboarding.id, 'completion_confirmation').catch(() => null)
  }
  return {
    landlord: landlordUpdate.data,
    onboarding: onboardingUpdate.data,
    contacts: savedContacts,
    properties: savedProperties,
    vacancies: savedVacancies,
    mandates: savedMandates,
    progress,
  }
}

async function uploadPortalFile(client, { accessId, file }) {
  if (!file) throw new Error('Choose a document to upload.')
  const objectPath = ['commercial-landlord-onboarding', safeFileName(accessId), `${Date.now()}-${safeFileName(file.name || 'document')}`].join('/')
  for (const bucket of COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES) {
    const upload = await client.storage.from(bucket).upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
    if (!upload.error) return { bucket, path: objectPath }
    if (!/bucket|not found|does not exist/i.test(String(upload.error.message || ''))) throw upload.error
  }
  throw new Error('Commercial document storage is not configured.')
}

export async function uploadCommercialLandlordOnboardingDocument({
  token = '',
  file = null,
  category = 'supporting_documents',
  documentRequestId = '',
  notes = '',
} = {}) {
  const workspace = await fetchOnboardingByToken(token)
  const request = (workspace.documentRequests || []).find((row) => row.id === documentRequestId)
  const upload = await uploadPortalFile(workspace.client, { accessId: workspace.access.id, file })
  const documentPayload = {
    organisation_id: workspace.landlord.organisation_id,
    branch_id: workspace.landlord.branch_id || null,
    team_id: workspace.landlord.team_id || null,
    broker_id: workspace.landlord.broker_id || null,
    entity_type: 'commercial_landlord',
    entity_id: workspace.landlord.id,
    document_name: request?.document_name || file?.name || 'Landlord onboarding document',
    category: normalizeText(category || request?.category || 'supporting_documents'),
    status: 'uploaded',
    notes: normalizeText(notes) || null,
    file_name: file?.name || 'document',
    file_path: upload.path,
    file_bucket: upload.bucket,
    file_size: file?.size || null,
    mime_type: file?.type || null,
    uploaded_at: new Date().toISOString(),
    metadata_json: {
      documentKey: normalizeText(request?.document_name || request?.category || category),
      source: 'commercial_landlord_onboarding',
    },
  }
  const insert = await workspace.client.from(COMMERCIAL_DOCUMENTS_TABLE).insert(documentPayload).select('*').single()
  if (insert.error) throw insert.error
  if (request?.id) {
    await workspace.client
      .from(COMMERCIAL_DOCUMENT_REQUESTS_TABLE)
      .update({ status: 'uploaded', completed_document_id: insert.data.id })
      .eq('id', request.id)
      .catch(() => null)
  }
  await workspace.client
    .from(LANDLORD_ONBOARDING_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', workspace.onboarding.id)
    .catch(() => null)
  return insert.data
}
