import { supabase } from '../lib/supabaseClient'
import { normalizeRecruitmentContact, recruitmentContactErrors } from '../pages/recruitment/recruitmentContactModel'
export async function captureRecruitmentContact(token, contact, submissionKey, options) {
  if (Object.keys(recruitmentContactErrors(contact)).length) throw new Error('Please check your contact details and recruitment consent.')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(submissionKey || '')) throw new Error('Start a new recruitment enquiry before continuing.')
  return recruitmentIntakeRequest(token, { action: 'capture_contact', contact: normalizeRecruitmentContact(contact), submissionKey }, options)
}
export async function recruitmentIntakeRequest(token, details, { fetcher = fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher('/api/public/recruitment-intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ ...details, token }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Your application could not be recorded. Please try again.')
    if (['submit', 'capture_contact', 'signup'].includes(details.action) && result.accepted !== true) throw new Error('Your application could not be recorded. Please try again.')
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The connection took too long. Your answers are still here; please try again.')
    throw error
  } finally { clearTimeout(timer) }
}
export async function createRecruitmentIntakeLink(organisationId, channel, leadId) {
  if (!organisationId || organisationId === 'all' || !['public_link','website','private_link'].includes(channel) || (channel === 'private_link') !== Boolean(leadId)) throw new Error('Choose an organisation and a valid intake link type.')
  if (!supabase) throw new Error('Recruitment connection is unavailable.')
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const expiresAt = new Date(Date.now() + (leadId ? 14 : 365) * 86400000).toISOString()
  const { data, error } = await supabase.from('recruitment_intake_links').insert({ organisation_id: organisationId, lead_id: leadId || null, channel, token_hash: tokenHash, expires_at: expiresAt }).select('id,expires_at,channel').single()
  if (error) throw new Error(['42P01','PGRST205'].includes(error.code) ? 'Recruitment intake setup is pending. Apply the application migration before creating links.' : 'The intake link could not be created. Check your organisation access and the lead stage.')
  return { ...data, url: `${window.location.origin}/join-us/${token}` }
}
export async function listRecruitmentIntakeLinks(organisationId, leadId) {
  let query = supabase.from('recruitment_intake_links').select('id,channel,expires_at,revoked_at,submitted_at').eq('organisation_id', organisationId).order('created_at', { ascending: false })
  query = leadId ? query.eq('lead_id', leadId) : query.is('lead_id', null)
  const { data, error } = await query
  if (error) throw new Error('Intake links could not be loaded. Apply the application migration if setup is pending.')
  return data || []
}
export async function revokeRecruitmentIntakeLink(organisationId, id) {
  const { data, error } = await supabase.from('recruitment_intake_links').update({ revoked_at: new Date().toISOString() }).eq('organisation_id', organisationId).eq('id', id).select('id').maybeSingle()
  if (error || !data) throw new Error('The intake link could not be revoked. Refresh and check your organisation access.')
}
