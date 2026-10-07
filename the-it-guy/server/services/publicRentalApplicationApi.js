import { personRentalApplication, rentalApplicantDocumentUrl } from './rentalApplicantDocumentAccess.js'
import { readRentalSavedChecklist } from './rentalSavedChecklist.js'
import { uploadRentalApplicationDocument } from './rentalApplicationDocumentUpload.js'
export { validateRentalDocumentUpload } from './rentalApplicationDocumentUpload.js'
import { mergeRentalApplicationData, publicRentalApplicationData, RENTAL_APPLICATION_SCHEMA_VERSION } from '../../src/services/rentals/rentalApplicationFieldContract.js'
import { isRentalApplicantPortalReadyToSubmit } from '../../src/services/rentals/rentalApplicantPortalModel.js'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { isRentalContextConfirmed } from '../../src/services/rentals/rentalApplicationCostModel.js'
import { resolveOnboardingBranding } from '../../src/lib/onboardingBranding.js'

const text = (value) => String(value ?? '').trim()
const hash = (value) => createHash('sha256').update(text(value)).digest('hex')
const safeData = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const publicApplication = (row = {}, requirements = null) => ({ id: text(row.id), status: text(row.status), version: Number(row.version || 1), data: publicRentalApplicationData(safeData(row.application_data)), updatedAt: row.updated_at || null, submittedAt: row.submitted_at || null, requirements, costs: row.cost_snapshot_json || {}, confirmation: row.confirmation_json || {}, feeDueAt: row.application_fee_due_at || null })
function admin(env = process.env, clientFactory = createClient) { const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL); const key = text(env.SUPABASE_SERVICE_ROLE_KEY); if (!url || !key) throw new Error('Rental applicant access is not configured.'); return clientFactory(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }
function tokenFrom(input = {}) { const header = text(input.headers?.authorization || input.headers?.Authorization); return header.startsWith('Bearer ') ? header.slice(7).trim() : text(input.token) }

async function rentalApplicationBranding(db, organisationId) {
  // Resolve only the organisation saved on the token's application. Never use
  // an applicant-supplied organisation or expose the complete settings object.
  const [organisationResult, settingsResult] = await Promise.all([
    db.from('organisations').select('name, display_name, logo_url').eq('id', organisationId).maybeSingle(),
    db.from('organisation_settings').select('settings_json').eq('organisation_id', organisationId).maybeSingle(),
  ])
  if (organisationResult.error) throw organisationResult.error
  if (settingsResult.error) throw settingsResult.error
  const settings = safeData(settingsResult.data?.settings_json)
  const onboarding = safeData(settings.agencyOnboarding)
  const assets = safeData(onboarding.branding)
  const resolved = resolveOnboardingBranding(assets, settings.branding, settings, {
    organisationName: text(onboarding.agencyInformation?.tradingName || onboarding.agencyInformation?.agencyName),
  }, organisationResult.data)
  for (const kind of ['Light', 'Dark', 'Icon']) {
    const bucket = assets[`logo${kind}Bucket`] || (kind === 'Icon' ? assets.portalIconBucket || assets.mobileIconBucket : '')
    const path = assets[`logo${kind}Path`] || (kind === 'Icon' ? assets.portalIconPath || assets.mobileIconPath : '')
    if (bucket && path) {
      const signed = await db.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7)
      if (signed.error) throw signed.error
      if (signed.data?.signedUrl) resolved[`logo${kind}Url`] = signed.data.signedUrl
    }
  }
  return resolved
}

export async function handlePublicRentalApplication({ method = 'GET', headers = {}, body = {}, token = '', env = process.env, clientFactory = createClient } = {}) {
  const rawToken = tokenFrom({ headers, token }); if (!rawToken) return { status: 401, body: { error: 'This application link is invalid or has expired.' } }
  try {
    const db = admin(env, clientFactory); const now = new Date().toISOString();
    const access = await db.from('rental_application_access_tokens').select('*').eq('token_hash', hash(rawToken)).maybeSingle()
    if (access.error || !access.data || access.data.revoked_at || new Date(access.data.expires_at) <= new Date(now)) return { status: 401, body: { error: 'This application link is invalid or has expired.' } }
    const application = await db.from('rental_applications').select('id, organisation_id, status, version, application_data, updated_at, submitted_at, cost_snapshot_json, confirmation_json, application_fee_due_at').eq('id', access.data.application_id).maybeSingle()
    if (application.error || !application.data) return { status: 404, body: { error: 'This application is unavailable.' } }
    await db.from('rental_application_access_tokens').update({ last_accessed_at: now }).eq('id', access.data.id)
    const subjectId = text(access.data.subject_id)
    if (subjectId) {
      if (!['submitted', 'under_review'].includes(application.data.status)) return { status: 409, body: { error: 'Your document link is available after submission and before a final decision. Contact your agent.' } }
      if (!['GET', 'POST'].includes(method)) return { status: 403, body: { error: 'This link only collects your own documents and permissions.' } }
      const own = personRentalApplication(application.data, subjectId)
      const requirements = (await readRentalSavedChecklist(db, application.data)).filter((item) => item.subjectId === subjectId)
      if (!requirements.some((item) => item.purpose === 'signed_consent' && item.active && item.generation === Number(access.data.subject_generation))) return { status: 401, body: { error: 'This person’s details changed. Contact your agent for a new link.' } }
      own.data.documentLinks = own.data.documentLinks.filter((link) => !link.invalidated && requirements.some((r) => r.active && (r.documentId === link.documentId || r.id === link.requirementId && r.generation === link.generation)))
      const ids = new Set(own.data.documentLinks.map((link) => link.documentId))
      const documents = await db.from('rental_application_documents').select('id,document_type,status,file_name,uploaded_at,created_at,intake_bundle_id').eq('application_id', application.data.id)
      if (documents.error) throw documents.error
      if (method === 'GET') return { status: 200, body: { application: { ...own, requirements }, documents: (documents.data || []).filter((item) => ids.has(item.id)), branding: await rentalApplicationBranding(db, application.data.organisation_id), expiresAt: access.data.expires_at } }
      if (body.action === 'open_document') return { status: 200, body: await rentalApplicantDocumentUrl(db, application.data, text(body.documentId), subjectId) }
      if (body.action === 'record_person_permission') {
        if (!Number.isInteger(Number(body.version)) || Number(body.version) !== Number(application.data.version)) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }
        if (body.privacyAccepted !== true || body.screeningAccepted !== true || body.identityAccepted !== true || body.ownInformationAccepted !== true) return { status: 400, body: { error: 'Confirm your own details and each permission.' } }
        const requirement = requirements.find((item) => item.purpose === 'signed_consent' && item.active)
        if (!requirement) throw new Error('Your permission requirement is unavailable.')
        const result = await db.rpc('rental_record_person_permission', { p_application_id: application.data.id, p_expected_version: Number(body.version), p_subject_id: subjectId, p_requirement_id: requirement.id, p_generation: requirement.generation })
        if (result.error) throw result.error
        return { status: 200, body: { application: { ...own, requirements: (await readRentalSavedChecklist(db, application.data)).filter((item) => item.subjectId === subjectId) } } }
      }
      if (body.subjectId !== subjectId && body.action !== 'complete_upload') return { status: 403, body: { error: 'Upload only your own documents.' } }
      const uploaded = await uploadRentalApplicationDocument(db, application.data, body, { source: `person:${subjectId}`, signingSecret: env.SUPABASE_SERVICE_ROLE_KEY })
      if (uploaded.uploadUrl) return { status: 201, body: uploaded }
      return { status: 201, body: { document: uploaded.document, application: { ...personRentalApplication(uploaded.application, subjectId, requirements), requirements: (await readRentalSavedChecklist(db, application.data)).filter((item) => item.subjectId === subjectId) } } }
    }
    if (!['draft', 'submitted', 'under_review'].includes(application.data.status)) {
      if (method !== 'GET') return { status: 409, body: { error: 'This application can no longer be edited.' } }
      return { status: 200, body: { application: { id: text(application.data.id), status: text(application.data.status), updatedAt: application.data.updated_at || null, costs: application.data.cost_snapshot_json || {}, feeDueAt: application.data.application_fee_due_at || null }, outcomeVisible: ['approved', 'declined', 'withdrawn'].includes(application.data.status) } }
    }
    if (application.data.status !== 'draft' && !['GET', 'POST'].includes(method)) return { status: 409, body: { error: 'Submitted answers are locked. You can still upload outstanding documents.' } }
    const documents = await db.from('rental_application_documents').select('id, document_type, status, file_name, uploaded_at, created_at, intake_bundle_id').eq('application_id', application.data.id).order('created_at', { ascending: false })
    if (documents.error) throw documents.error
    const requirements = await readRentalSavedChecklist(db, application.data)
    const readAfterSave = async (row) => { try { return await readRentalSavedChecklist(db, { ...row, organisation_id: application.data.organisation_id }) } catch { return null } }
    if (method === 'GET') return { status: 200, body: { application: publicApplication(application.data, requirements), branding: await rentalApplicationBranding(db, application.data.organisation_id), documents: documents.data || [], requestedChanges: text(application.data.application_data?.review?.requestedChanges), expiresAt: access.data.expires_at } }
    if (method === 'PATCH' && body?.action === 'confirm_context') {
      if (Number(body.version) !== Number(application.data.version)) return { status: 409, body: { error: 'This application changed. Refresh before confirming its costs.' } }
      if (body.propertyAccepted !== true || body.costsAccepted !== true || body.privacyAccepted !== true) return { status: 400, body: { error: 'Confirm the property, costs and privacy notice.' } }
      const confirmation = { source: 'applicant', wordingVersion: 'rental-context-v1', acceptedAt: now, privacyAcceptedAt: now, property: safeData(application.data.application_data?.property), costs: safeData(application.data.cost_snapshot_json) }
      const update = await db.from('rental_applications').update({ confirmation_json: confirmation, version: Number(application.data.version) + 1 }).eq('id', application.data.id).eq('version', application.data.version).eq('status', 'draft').select('id, status, version, application_data, updated_at, submitted_at, cost_snapshot_json, confirmation_json, application_fee_due_at').maybeSingle()
      if (update.error) throw update.error
      if (!update.data) return { status: 409, body: { error: 'This application changed. Refresh before confirming its costs.' } }
      return { status: 200, body: { application: publicApplication(update.data, requirements) } }
    }
    if (method === 'POST' && body.action === 'open_document') return { status: 200, body: await rentalApplicantDocumentUrl(db, application.data, text(body.documentId)) }
    if (application.data.status === 'draft' && ['PATCH', 'POST', 'PUT'].includes(method) && Object.keys(safeData(application.data.cost_snapshot_json)).length && !isRentalContextConfirmed(application.data)) return { status: 400, body: { error: 'Confirm the property, costs and privacy notice before continuing.' } }
    if (method === 'PUT' && body?.action === 'submit') { const data = safeData(application.data.application_data); if (Number(body.version) !== Number(application.data.version)) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }; if (data.schemaVersion === RENTAL_APPLICATION_SCHEMA_VERSION && body.declarationAccepted !== true) return { status: 400, body: { error: 'Confirm your declaration and authority to submit.' } }; const consentTypes = Array.isArray(body?.consents) ? body.consents.map(text) : []; if (!isRentalApplicantPortalReadyToSubmit({ data, documents: documents.data || [], requirements, consents: Object.fromEntries(consentTypes.map((type) => [type, true])) })) return { status: 400, body: { error: 'Complete the required application fields and accept every consent. You can upload outstanding documents after submission.' } }; const wordingVersion = `rental-application-consent-v1:submission-${application.data.version}:${now}`; const consentRows = ['privacy','credit_check','identity_verification'].map((consent_type) => ({ application_id: application.data.id, organisation_id: application.data.organisation_id, consent_type, wording_version: wordingVersion, accepted_at: now, source: 'applicant', evidence_json: { accepted: true, submitted_at: now, subject: 'primary', source: 'applicant', entityType: data.entity?.type || 'individual', primaryContactRole: data.entity?.primaryContactRole || 'applicant', declarationAccepted: body.declarationAccepted === true } })); const consent = await db.from('rental_application_consents').upsert(consentRows, { onConflict: 'application_id,consent_type,wording_version' }); if (consent.error) throw consent.error; const update = await db.from('rental_applications').update({ status: 'submitted', submitted_at: now, submitted_snapshot_json: data, version: Number(application.data.version) + 1 }).eq('id', application.data.id).eq('version', application.data.version).eq('status', 'draft').select('id, status, version, application_data, updated_at, submitted_at, cost_snapshot_json, confirmation_json, application_fee_due_at').maybeSingle(); if (update.error || !update.data) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }; return { status: 200, body: { application: publicApplication(update.data, await readAfterSave(update.data)), submitted: true } } }
    if (method === 'POST') {
      try {
        const uploaded = await uploadRentalApplicationDocument(db, application.data, body, { signingSecret: env.SUPABASE_SERVICE_ROLE_KEY })
        return { status: 201, body: uploaded.uploadUrl ? uploaded : { document: uploaded.document, application: publicApplication(uploaded.application, await readAfterSave(uploaded.application)) } }
      } catch (cause) { return { status: /changed/.test(cause.message) ? 409 : 400, body: { error: cause.message || 'Unable to upload document.' } } }
    }
    if (method !== 'PATCH') return { status: 405, body: { error: 'Method not allowed.' } }
    const expectedVersion = Number(body?.version); const patch = safeData(body?.patch)
    if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(application.data.version)) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }
    let merged
    try { merged = mergeRentalApplicationData(application.data.application_data, patch, { source: 'applicant' }); if (body.upgradeSchema === true) merged.schemaVersion = RENTAL_APPLICATION_SCHEMA_VERSION } catch (cause) { return { status: 400, body: { error: cause.message } } }
    const update = await db.from('rental_applications').update({ application_data: merged, version: expectedVersion + 1 }).eq('id', application.data.id).eq('version', expectedVersion).eq('status', 'draft').select('id, status, version, application_data, updated_at, submitted_at, cost_snapshot_json, confirmation_json, application_fee_due_at').maybeSingle()
    if (update.error || !update.data) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }
    return { status: 200, body: { application: publicApplication(update.data, await readAfterSave(update.data)) } }
  } catch (error) { return { status: 500, body: { error: error?.message || 'Unable to load application.' } } }
}
export function writeNodeJsonResponse(response, result) { response.setHeader('Cache-Control', 'private, no-store'); response.status(result.status).json(result.body) }
