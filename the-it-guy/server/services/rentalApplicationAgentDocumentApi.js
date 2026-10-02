import { createClient } from '@supabase/supabase-js'
import { uploadRentalApplicationDocument } from './rentalApplicationDocumentUpload.js'
const text = (value) => String(value ?? '').trim()
export async function handleRentalAgentDocumentUpload({ method, headers = {}, body = {}, env = process.env } = {}) {
  if (!['POST', 'GET'].includes(method)) return { status: 405, body: { error: 'Method not allowed.' } }
  const jwt = text(headers.authorization || headers.Authorization).replace(/^Bearer /, '')
  if (!jwt) return { status: 401, body: { error: 'Sign in to upload application evidence.' } }
  try {
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    const scoped = createClient(url, key, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await scoped.auth.getUser(jwt)
    if (auth.error || !auth.data?.user) return { status: 401, body: { error: 'Sign in to upload application evidence.' } }
    const result = await scoped.from('rental_applications').select('id, organisation_id, status, version, application_data').eq('id', text(body.applicationId)).maybeSingle()
    if (result.error || !result.data) return { status: 404, body: { error: 'Application unavailable in your current scope.' } }
    const storageClient = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    if (method === 'GET') {
      const document = await scoped.from('rental_application_documents').select('storage_bucket,storage_path').eq('application_id', result.data.id).eq('id', text(body.documentId)).maybeSingle()
      const item = document.data
      if (document.error || !item || item.storage_bucket !== 'rental-application-documents' || !item.storage_path?.startsWith(`${result.data.organisation_id}/${result.data.id}/`)) return { status: 404, body: { error: 'Document unavailable in your current scope.' } }
      const signed = await storageClient.storage.from(item.storage_bucket).createSignedUrl(item.storage_path, 60)
      if (signed.error) throw signed.error
      return { status: 200, body: { url: signed.data.signedUrl } }
    }
    const uploaded = await uploadRentalApplicationDocument(storageClient, result.data, body, { source: 'agent', applicationClient: scoped, signingSecret: env.SUPABASE_SERVICE_ROLE_KEY })
    if (uploaded.uploadUrl) return { status: 201, body: uploaded }
    return { status: 201, body: { document: uploaded.document, application: { id: uploaded.application.id, status: uploaded.application.status, version: uploaded.application.version, data: uploaded.application.application_data } } }
  } catch (cause) { return { status: /changed/.test(cause.message) ? 409 : 400, body: { error: cause.message || 'Unable to upload application evidence.' } } }
}
