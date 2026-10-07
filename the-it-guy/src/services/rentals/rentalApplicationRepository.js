import { mapRentalRequirement } from './rentalSavedRequirementModel.js'
import { mergeRentalApplicationData } from './rentalApplicationFieldContract.js'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { createRentalApplicantAccess } from './rentalApplicantAccessModel.js'

const text = (value) => String(value ?? '').trim()
const fields = 'id, organisation_id, lead_id, vacancy_id, unit_id, applicant_party_id, status, version, application_data, cost_snapshot_json, confirmation_json, application_fee_due_at, created_at, updated_at, submitted_at'
const client = (value = supabase) => { if (!value || (!isSupabaseConfigured && value === supabase)) throw new Error('Rental applications require Supabase configuration.'); return value }
const map = (row = {}) => ({ id: text(row.id), organisationId: text(row.organisation_id), leadId: text(row.lead_id), vacancyId: text(row.vacancy_id), unitId: text(row.unit_id), applicantPartyId: text(row.applicant_party_id), status: text(row.status), version: Number(row.version || 1), data: row.application_data || {}, costs: row.cost_snapshot_json || {}, confirmation: row.confirmation_json || {}, feeDueAt: row.application_fee_due_at || null, submittedAt: row.submitted_at || null, updatedAt: row.updated_at || null, ...(Object.hasOwn(row, 'requirements') ? { requirements: (row.requirements || []).map(mapRentalRequirement) } : {}), ...(Object.hasOwn(row, 'documents') ? { documents: row.documents || [] } : {}) })

export async function createPersistedRentalApplication(values = {}, { client: db = supabase } = {}) {
  const payload = { organisation_id: text(values.organisationId), lead_id: text(values.leadId) || null, vacancy_id: text(values.vacancyId), unit_id: text(values.unitId), applicant_party_id: text(values.applicantPartyId) || null, application_data: values.data && typeof values.data === 'object' ? values.data : {}, created_by: text(values.createdBy) || null }
  if (!payload.organisation_id || !payload.vacancy_id || !payload.unit_id) throw new Error('Organisation, vacancy and unit are required.')
  const result = await client(db).from('rental_applications').insert(payload).select(fields).single(); if (result.error) throw result.error; return map(result.data)
}
export async function savePersistedRentalApplication(application, patch = {}, { client: db = supabase } = {}) {
  if (application?.status !== 'draft') throw new Error('Only draft applications can be edited.');
  const result = await client(db).from('rental_applications').update({ application_data: mergeRentalApplicationData(application.data, patch), version: Number(application.version) + 1 }).eq('id', application.id).eq('version', application.version).eq('status', 'draft').select(fields).maybeSingle(); if (result.error) throw result.error; if (!result.data) throw new Error('Application changed elsewhere. Refresh and try again.'); return map(result.data)
}
export async function createPersistedRentalApplicantAccess(applicationId, { expiresInMinutes = 10080, createdBy = '', subjectId = '', client: db = supabase } = {}) {
  const access = await createRentalApplicantAccess({ applicationId, expiresInMinutes }); const result = await client(db).from('rental_application_access_tokens').insert({ application_id: access.applicationId, token_hash: access.tokenHash, expires_at: access.expiresAt, created_by: text(createdBy) || null, ...(subjectId ? { subject_id: text(subjectId) } : {}) }).select('id, expires_at').single(); if (result.error) throw result.error; return { ...access, id: result.data.id, expiresAt: result.data.expires_at }
}
export async function listPersistedRentalApplications(organisationId, { client: db = supabase, includeEvidence = false } = {}) { const result = await client(db).from(includeEvidence ? 'rental_application_review_summaries' : 'rental_applications').select(includeEvidence ? 'id, organisation_id, lead_id, vacancy_id, unit_id, status, version, application_data, submitted_at, updated_at, documents, requirements' : fields).eq('organisation_id', text(organisationId)).order('updated_at', { ascending: false }).limit(100); if (result.error) throw result.error; return (result.data || []).map(map) }
export async function listPersistedRentalApplicationsForLead(organisationId, leadId, { client: db = supabase } = {}) { const result = await client(db).from('rental_applications').select(fields).eq('organisation_id', text(organisationId)).eq('lead_id', text(leadId)).order('updated_at', { ascending: false }).limit(100); if (result.error) throw result.error; return (result.data || []).map(map) }
const tenancyFields = 'id, organisation_id, property_id, unit_id, source_application_id, status, intended_occupation_date, tenant_snapshot_json, created_at, updated_at, rental_leases(id, status, terms_json, created_at, rental_lease_versions(id, status, is_current, monthly_rent, effective_start_date, effective_end_date, occupation_date, rental_lease_signers(signer_role, signer_name)))'
const mapTenancy = (row = {}) => ({ id: text(row.id), organisationId: text(row.organisation_id), propertyId: text(row.property_id), unitId: text(row.unit_id), sourceApplicationId: text(row.source_application_id), status: text(row.status), intendedOccupationDate: row.intended_occupation_date || null, tenant: row.tenant_snapshot_json || {}, lease: Array.isArray(row.rental_leases) ? row.rental_leases[0] || null : row.rental_leases || null, createdAt: row.created_at || null, updatedAt: row.updated_at || null })
export async function listPersistedRentalTenancies(organisationId, { client: db = supabase, offset } = {}) { let query = client(db).from('rental_tenancies').select(tenancyFields).eq('organisation_id', text(organisationId)).order('updated_at', { ascending: false }).order('id'); query = offset === undefined ? query.limit(100) : query.range(offset, offset + 99); const result = await query; if (result.error) throw result.error; return (result.data || []).map(mapTenancy) }
export async function getPersistedRentalTenancy(organisationId, tenancyId, { client: db = supabase } = {}) { const result = await client(db).from('rental_tenancies').select(tenancyFields).eq('organisation_id', text(organisationId)).eq('id', text(tenancyId)).maybeSingle(); if (result.error) throw result.error; return result.data ? mapTenancy(result.data) : null }
export async function getRentalApplicationReview(applicationId, { client: db = supabase } = {}) { const result = await client(db).from('rental_application_review_summaries').select('id, organisation_id, lead_id, status, version, application_data, submitted_snapshot_json, submitted_at, updated_at, documents, consents, requirements').eq('id', text(applicationId)).maybeSingle(); if (result.error) throw result.error; const costs = result.data ? await client(db).from('rental_applications').select('cost_snapshot_json, confirmation_json, application_fee_due_at').eq('id', text(applicationId)).maybeSingle() : { data: null }; if (costs.error) throw costs.error; return result.data ? { costs: costs.data?.cost_snapshot_json || {}, confirmation: costs.data?.confirmation_json || {}, feeDueAt: costs.data?.application_fee_due_at || null, id: result.data.id, organisationId: result.data.organisation_id, leadId: result.data.lead_id, submittedSnapshot: result.data.submitted_snapshot_json, status: result.data.status, version: result.data.version, data: result.data.application_data || {}, submittedAt: result.data.submitted_at, updatedAt: result.data.updated_at, requirements: (result.data.requirements || []).map(mapRentalRequirement), documents: result.data.documents || [], consents: result.data.consents || [] } : null }
const screeningFields = 'id, application_id, organisation_id, check_type, status, result_json, evidence_note, expires_at, reviewed_by, reviewed_at, updated_at'
const mapScreening = (row = {}) => ({ id: text(row.id), applicationId: text(row.application_id), organisationId: text(row.organisation_id), checkType: text(row.check_type), status: text(row.status), result: row.result_json || {}, evidenceNote: text(row.evidence_note), expiresAt: row.expires_at || null, reviewedBy: text(row.reviewed_by), reviewedAt: row.reviewed_at || null, updatedAt: row.updated_at || null })
export async function listRentalApplicationScreeningChecks(applicationId, { client: db = supabase } = {}) { const result = await client(db).from('rental_application_screening_checks').select(screeningFields).eq('application_id', text(applicationId)).order('check_type'); if (result.error) throw result.error; return (result.data || []).map(mapScreening) }
export async function saveRentalApplicationScreeningCheck(values = {}, options = {}) {
  if (!Number.isInteger(values.expectedVersion)) throw new Error('The current application version is required for screening.')
  await recordRentalApplicationReview({ applicationId: values.applicationId, expectedVersion: values.expectedVersion, command: 'screening', payload: { checkType: values.checkType, subjectId: values.subjectId || 'primary', status: values.status, evidenceNote: values.evidenceNote, expiresAt: values.expiresAt } }, options)
  return (await listRentalApplicationScreeningChecks(values.applicationId, options)).find((item) => item.checkType === values.checkType)
}

const decisionFields = 'id, decision, reason, evidence_json, target_version, decided_by, decided_at'
const notificationFields = 'id, application_event_id, notification_type, delivery_status, retry_count, next_attempt_at, last_error, updated_at'
export async function listRentalApplicationDecisions(applicationId, { client: db = supabase } = {}) { const result = await client(db).from('rental_application_decisions').select(decisionFields).eq('application_id', text(applicationId)).order('decided_at', { ascending: false }); if (result.error) throw result.error; return result.data || [] }
export async function listRentalApplicationNotifications(applicationId, { client: db = supabase } = {}) { const result = await client(db).from('rental_application_notification_outbox').select(notificationFields).eq('application_id', text(applicationId)).order('created_at', { ascending: false }); if (result.error) throw result.error; return result.data || [] }
export async function decideRentalApplication({ applicationId, expectedVersion, decision, reason, evidence = {} } = {}, { client: db = supabase } = {}) { const result = await client(db).rpc('rental_decide_application', { p_application_id: text(applicationId), p_expected_version: Number(expectedVersion), p_decision: text(decision), p_reason: text(reason), p_evidence_json: evidence && typeof evidence === 'object' ? evidence : {} }); if (result.error) throw result.error; return result.data }
export async function retryRentalApplicationNotification(outboxId, { client: db = supabase } = {}) { const result = await client(db).rpc('rental_retry_application_notification', { p_outbox_id: text(outboxId) }); if (result.error) throw result.error; return result.data }
export async function getRentalApplicationTenancyConversion(applicationId, { client: db = supabase } = {}) { const result = await client(db).from('rental_tenancies').select('id, status, intended_occupation_date, created_at, rental_leases(id, status, created_at)').eq('source_application_id', text(applicationId)).maybeSingle(); if (result.error) throw result.error; return result.data || null }
export async function convertRentalApplicationToTenancy({ applicationId, expectedVersion } = {}, { client: db = supabase } = {}) { const result = await client(db).rpc('rental_convert_application_to_tenancy', { p_application_id: text(applicationId), p_expected_version: Number(expectedVersion) }); if (result.error) throw result.error; return result.data }
export async function revokePersistedRentalApplicantAccess(accessId, { client: db = supabase } = {}) { const result = await client(db).from('rental_application_access_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', text(accessId)).select('id, expires_at, revoked_at').single(); if (result.error) throw result.error; return result.data }

export async function listPersistedRentalApplicantAccess(applicationId, { client: db = supabase } = {}) {
  const result = await client(db).from('rental_application_access_tokens').select('id, expires_at, revoked_at, created_at, last_accessed_at').eq('application_id', text(applicationId)).order('created_at', { ascending: false })
  if (result.error) throw result.error
  return result.data || []
}

export async function recordRentalApplicationReview({ applicationId, expectedVersion, command, payload = {} }, { client: db = supabase } = {}) {
  const result = await client(db).rpc('rental_record_application_review', { p_application_id: text(applicationId), p_expected_version: Number(expectedVersion), p_command: command, p_payload: payload })
  if (result.error) throw result.error
  return result.data
}
export async function listRentalApplicationEvents(applicationId, { client: db = supabase } = {}) {
  const result = await client(db).from('rental_application_events').select('id,event_type,aggregate_version,payload_json,occurred_by,occurred_at').eq('application_id', text(applicationId)).order('occurred_at', { ascending: false })
  if (result.error) throw result.error
  return result.data || []
}
export async function getRentalApplicationDocumentUrl(applicationId, documentId) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Sign in to view application evidence.')
  const response = await fetch(`/api/rentals/application-documents?applicationId=${encodeURIComponent(applicationId)}&documentId=${encodeURIComponent(documentId)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Unable to open application evidence.')
  return result.url
}

// Read the complete application set for one listing; organisation scope is explicit.
export async function listPersistedRentalApplicationsForListing(organisationId, listingId, { client: db = supabase } = {}) {
  if (!text(organisationId) || !text(listingId)) return []
  const rows = []
  for (let offset = 0; ; offset += 100) {
    const result = await client(db).from('rental_applications').select(fields)
      .eq('organisation_id', text(organisationId)).eq('application_data->property->>listingId', text(listingId))
      .order('updated_at', { ascending: false }).order('id').range(offset, offset + 99)
    if (result.error) throw result.error
    rows.push(...(result.data || []).map(map))
    if ((result.data || []).length < 100) return rows
  }
}

export async function listPersistedRentalTenanciesForApplications(organisationId, applicationIds, { client: db = supabase } = {}) {
  const ids = [...new Set((applicationIds || []).map(text).filter(Boolean))]
  if (!text(organisationId) || !ids.length) return []
  const rows = []
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100)
    for (let offset = 0; ; offset += 100) {
      const result = await client(db).from('rental_tenancies').select(tenancyFields)
        .eq('organisation_id', text(organisationId)).in('source_application_id', batch)
        .order('updated_at', { ascending: false }).order('id').range(offset, offset + 99)
      if (result.error) throw result.error
      rows.push(...(result.data || []).map(mapTenancy))
      if ((result.data || []).length < 100) break
    }
  }
  return rows
}
