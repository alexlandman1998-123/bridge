import { readRentalSavedChecklist } from './rentalSavedChecklist.js'
import { uploadRentalApplicationDocument } from './rentalApplicationDocumentUpload.js'
export { validateRentalDocumentUpload } from './rentalApplicationDocumentUpload.js'
import { mergeRentalApplicationData, publicRentalApplicationData, RENTAL_APPLICATION_SCHEMA_VERSION } from '../../src/services/rentals/rentalApplicationFieldContract.js'
import { isRentalApplicantPortalReadyToSubmit } from '../../src/services/rentals/rentalApplicantPortalModel.js'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const text = (value) => String(value ?? '').trim()
const hash = (value) => createHash('sha256').update(text(value)).digest('hex')
const safeData = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const publicApplication = (row = {}, requirements = null) => ({ id: text(row.id), status: text(row.status), version: Number(row.version || 1), data: publicRentalApplicationData(safeData(row.application_data)), updatedAt: row.updated_at || null, submittedAt: row.submitted_at || null, requirements })
function admin(env = process.env, clientFactory = createClient) { const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL); const key = text(env.SUPABASE_SERVICE_ROLE_KEY); if (!url || !key) throw new Error('Rental applicant access is not configured.'); return clientFactory(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }
function tokenFrom(input = {}) { const header = text(input.headers?.authorization || input.headers?.Authorization); return header.startsWith('Bearer ') ? header.slice(7).trim() : text(input.token) }

export async function handlePublicRentalApplication({ method = 'GET', headers = {}, body = {}, token = '', env = process.env, clientFactory = createClient } = {}) {
  const rawToken = tokenFrom({ headers, token }); if (!rawToken) return { status: 401, body: { error: 'This application link is invalid or has expired.' } }
  try {
    const db = admin(env, clientFactory); const now = new Date().toISOString();
    const access = await db.from('rental_application_access_tokens').select('id, application_id, expires_at, revoked_at').eq('token_hash', hash(rawToken)).maybeSingle()
    if (access.error || !access.data || access.data.revoked_at || new Date(access.data.expires_at) <= new Date(now)) return { status: 401, body: { error: 'This application link is invalid or has expired.' } }
    const application = await db.from('rental_applications').select('id, organisation_id, status, version, application_data, updated_at, submitted_at').eq('id', access.data.application_id).maybeSingle()
    if (application.error || !application.data) return { status: 404, body: { error: 'This application is unavailable.' } }
    await db.from('rental_application_access_tokens').update({ last_accessed_at: now }).eq('id', access.data.id)
    if (application.data.status !== 'draft') {
      if (method !== 'GET') return { status: 409, body: { error: 'This application can no longer be edited.' } }
      return { status: 200, body: { application: { id: text(application.data.id), status: text(application.data.status), updatedAt: application.data.updated_at || null }, outcomeVisible: ['approved', 'declined', 'withdrawn'].includes(application.data.status) } }
    }
    const documents = await db.from('rental_application_documents').select('id, document_type, status, file_name, uploaded_at, created_at').eq('application_id', application.data.id).order('created_at', { ascending: false })
    if (documents.error) throw documents.error
    const requirements = await readRentalSavedChecklist(db, application.data)
    const readAfterSave = async (row) => { try { return await readRentalSavedChecklist(db, { ...row, organisation_id: application.data.organisation_id }) } catch { return null } }
    if (method === 'GET') return { status: 200, body: { application: publicApplication(application.data, requirements), documents: documents.data || [], requestedChanges: text(application.data.application_data?.review?.requestedChanges), expiresAt: access.data.expires_at } }
    if (method === 'PUT' && body?.action === 'submit') { const data = safeData(application.data.application_data); if (Number(body.version) !== Number(application.data.version)) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }; if (data.schemaVersion === RENTAL_APPLICATION_SCHEMA_VERSION && body.declarationAccepted !== true) return { status: 400, body: { error: 'Confirm your declaration and authority to submit.' } }; const consentTypes = Array.isArray(body?.consents) ? body.consents.map(text) : []; if (!isRentalApplicantPortalReadyToSubmit({ data, documents: documents.data || [], requirements, consents: Object.fromEntries(consentTypes.map((type) => [type, true])) })) return { status: 400, body: { error: 'Complete the required application fields, upload every required document for the named person or entity, and accept every consent.' } }; const wordingVersion = `rental-application-consent-v1:submission-${application.data.version}:${now}`; const consentRows = ['privacy','credit_check','identity_verification'].map((consent_type) => ({ application_id: application.data.id, organisation_id: application.data.organisation_id, consent_type, wording_version: wordingVersion, accepted_at: now, source: 'applicant', evidence_json: { accepted: true, submitted_at: now, subject: 'primary', source: 'applicant', entityType: data.entity?.type || 'individual', primaryContactRole: data.entity?.primaryContactRole || 'applicant', declarationAccepted: body.declarationAccepted === true } })); const consent = await db.from('rental_application_consents').upsert(consentRows, { onConflict: 'application_id,consent_type,wording_version' }); if (consent.error) throw consent.error; const update = await db.from('rental_applications').update({ status: 'submitted', submitted_at: now, submitted_snapshot_json: data, version: Number(application.data.version) + 1 }).eq('id', application.data.id).eq('version', application.data.version).eq('status', 'draft').select('id, status, version, application_data, updated_at, submitted_at').maybeSingle(); if (update.error || !update.data) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }; return { status: 200, body: { application: publicApplication(update.data, await readAfterSave(update.data)), submitted: true } } }
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
    const update = await db.from('rental_applications').update({ application_data: merged, version: expectedVersion + 1 }).eq('id', application.data.id).eq('version', expectedVersion).eq('status', 'draft').select('id, status, version, application_data, updated_at, submitted_at').maybeSingle()
    if (update.error || !update.data) return { status: 409, body: { error: 'This application changed. Refresh and try again.' } }
    return { status: 200, body: { application: publicApplication(update.data, await readAfterSave(update.data)) } }
  } catch (error) { return { status: 500, body: { error: error?.message || 'Unable to load application.' } } }
}
export function writeNodeJsonResponse(response, result) { response.setHeader('Cache-Control', 'private, no-store'); response.status(result.status).json(result.body) }
