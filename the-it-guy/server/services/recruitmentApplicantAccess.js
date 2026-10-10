import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { HOME_SEEKERS_ORGANISATION_ID } from './homeSeekersWebsiteBridge.js'
import { normalizeRecruitmentProfile, recruitmentProfileErrors } from '../../src/pages/recruitment/recruitmentProfileModel.js'

export const applicantActions = ['send_verification', 'verify_email', 'sign_in', 'resume', 'sign_out', 'save_profile', 'submit_profile', 'prepare_document', 'commit_document', 'download_document']
const reply = (status, body) => ({ status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }, body })
const hash = (value) => createHash('sha256').update(value).digest('hex')
const cookieName = (org) => `a9_recruitment_${org.replaceAll('-', '')}`
function cookie(headers, org) {
  const entries = String(headers.cookie || '').split(';').map((entry) => entry.trim())
  const value = entries.find((entry) => entry.startsWith(`${cookieName(org)}=`))?.slice(cookieName(org).length + 1) || ''
  return /^[a-f0-9]{64}$/.test(value) ? value : null
}
function sessionCookie(headers, org, value, clear = false) {
  // Plain HTTP is supported only on loopback. Public hosts always require HTTPS.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(headers.host || ''))
  return `${cookieName(org)}=${value}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 604800}${local ? '' : '; Secure'}`
}
function authProvider(env) {
  // Isolated client: signing in must never replace the service-role DB session.
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }).auth
}
async function homeSeekersDraftReceipt(db, org, tokenHash, applicant) {
  // Return only the random contact receipt key, after canonical session access.
  // It pins later code verification to this enquiry; it grants no access itself.
  const session = await db.from('recruitment_applicant_sessions').select('lead_id').eq('organisation_id', org).eq('token_hash', tokenHash).maybeSingle()
  if (session.error || !session.data?.lead_id) throw new Error('unavailable')
  const receipt = await db.from('recruitment_contact_receipts').select('submission_key').eq('organisation_id', org).eq('lead_id', session.data.lead_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (receipt.error || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(receipt.data?.submission_key || '')) throw new Error('unavailable')
  return { ...applicant, contactSubmissionKey: receipt.data.submission_key }
}
export async function recruitmentApplicantAccess({ db, authClient, link, headers, body, env, codeOnlyVerification = false }) {
  const org = link.organisation_id, action = body.action
  const homeSeekers = org === HOME_SEEKERS_ORGANISATION_ID
  try {
    if (['prepare_document', 'commit_document', 'download_document'].includes(action)) {
      const saved = cookie(headers, org)
      if (!saved) return reply(401, { error: 'Verify your email to open your document pack.' })
      const tokenHash = hash(saved)
      const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
      if (action === 'prepare_document') {
        if (!uuid.test(body.requestId || '') || !body.document || typeof body.document !== 'object' || Array.isArray(body.document)) return reply(400, { error: 'Choose a document to upload.' })
        const document = Object.fromEntries(['name', 'type', 'mimeType', 'size'].map(key => [key, body.document[key]]))
        const { data, error } = await db.rpc('recruitment_prepare_applicant_document', { p_organisation_id: org, p_token_hash: tokenHash, p_request_id: body.requestId, p_document: document })
        if (error) return reply(422, { error: 'Choose a PDF, JPG or PNG up to 10 MB, or contact the agency if the upload limit was reached.' })
        if (data?.unavailable || !data?.path) return reply(401, { error: 'Your session expired or this document pack is locked. Verify your email again.' })
        if (data.committed) return reply(200, { committed: true })
        const signed = await db.storage.from('recruitment-documents').createSignedUploadUrl(data.path, { upsert: false })
        if (signed.error || !signed.data?.signedUrl) throw new Error('unavailable')
        return reply(200, { uploadUrl: signed.data.signedUrl })
      }
      if (action === 'commit_document') {
        if (!uuid.test(body.requestId || '')) return reply(400, { error: 'Invalid document upload request.' })
        const { data, error } = await db.rpc('recruitment_commit_applicant_document', { p_organisation_id: org, p_token_hash: tokenHash, p_request_id: body.requestId })
        if (error) return reply(409, { error: 'The file could not be confirmed. Retry this upload or contact the agency.' })
        if (data?.unavailable) return reply(401, { error: 'Your session expired or this document pack is locked. Verify your email again.' })
        if (!data?.saved) throw new Error('unavailable')
        const resumed = await db.rpc('recruitment_resume_applicant', { p_organisation_id: org, p_token_hash: tokenHash })
        if (resumed.error || !resumed.data) throw new Error('unavailable')
        return reply(200, { saved: true, applicant: resumed.data })
      }
      // Caller selects a retained document, never an arbitrary Storage path.
      const access = await db.rpc('recruitment_applicant_document_access', { p_organisation_id: org, p_token_hash: tokenHash })
      if (access.error) throw access.error
      const lead = access.data?.[0]
      if (!lead) return reply(401, { error: 'Verify your email to open your document pack.' })
      const document = lead.documents_json?.find(item => item.path === body.documentPath)
      if (!document || !document.path.startsWith(`${org}/${lead.id}/`)) return reply(404, { error: 'Document unavailable.' })
      const signed = await db.storage.from('recruitment-documents').createSignedUrl(document.path, 300, { download: document.name })
      if (signed.error || !signed.data?.signedUrl) throw new Error('unavailable')
      return reply(200, { downloadUrl: signed.data.signedUrl })
    }
    if (action === 'submit_profile') {
      const saved = cookie(headers, org)
      if (!saved) return reply(401, { error: 'Sign in and verify your email to submit your application.' })
      if (!Number.isInteger(body.revision) || body.revision < 0 || body.revision > 2147483646 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.submissionKey || '')))
        return reply(400, { error: 'Invalid application submission.' })
      if (body.privacyAccepted !== true || body.declarationAccepted !== true) return reply(422, { error: 'Confirm processing consent and the accuracy declaration.' })
      const { data, error } = await db.rpc('recruitment_submit_verified_profile', { p_organisation_id: org, p_token_hash: hash(saved), p_revision: body.revision, p_submission_key: body.submissionKey, p_privacy_accepted: true, p_declaration_accepted: true })
      if (error) throw error
      if (data?.unavailable) return reply(401, { error: 'Your applicant session expired or this enquiry is no longer available. Sign in again to continue.' })
      if (data?.conflict) return reply(409, { conflict: true, error: 'Your questionnaire was updated elsewhere. Reload and review the saved answers before submitting.' })
      if (data?.invalid) return reply(422, { error: data.error || 'Check and save your questionnaire before submitting.', errors: data.errors })
      if (data?.accepted !== true || data.applicant?.applicationSubmitted !== true || data.applicant.emailVerification !== 'verified') throw new Error('unavailable')
      return reply(200, { accepted: true, duplicate: data.duplicate === true, applicant: data.applicant })
    }
    if (action === 'save_profile') {
      const saved = cookie(headers, org)
      if (!saved) return reply(401, { error: 'Sign in and verify your email to save your questionnaire.' })
      if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers) || JSON.stringify(body.answers).length > 16000
        || !Number.isInteger(body.revision) || body.revision < 0 || body.revision > 2147483646 || !Number.isInteger(body.page) || body.page < 0 || body.page > 3
        || !['save','continue','complete'].includes(body.intent)) return reply(400, { error: 'Invalid questionnaire request.' })
      const answers = normalizeRecruitmentProfile(body.answers)
      const errors = { ...recruitmentProfileErrors(body.answers, {homeSeekers}), ...recruitmentProfileErrors(body.answers, { page: body.intent === 'continue' ? body.page : undefined, required: body.intent !== 'save', homeSeekers }) }
      if (Object.keys(errors).length) return reply(422, { error: 'Check the highlighted answers.', errors })
      const { data, error } = await db.rpc('recruitment_save_profile', { p_organisation_id: org, p_token_hash: hash(saved), p_answers: answers, p_revision: body.revision, p_page: body.page, p_intent: body.intent })
      if (error) throw error
      if (data?.unavailable) return reply(401, { error: 'Your applicant session expired or this enquiry is no longer editable. Sign in again to continue.' })
      if (data?.conflict) return reply(409, { conflict: true, error: 'Your questionnaire was updated elsewhere. Reload the saved draft before continuing.' })
      if (data?.invalid) return reply(422, { error: 'Check the highlighted answers.', errors: data.errors })
      if (data?.saved !== true || data.applicant?.emailVerification !== 'verified') throw new Error('unavailable')
      return reply(200, { saved: true, duplicate: data.duplicate === true, applicant: data.applicant })
    }
    if (action === 'resume' || action === 'sign_out') {
      const saved = cookie(headers, org)
      if (action === 'sign_out') {
        if (saved) {
          const { error } = await db.rpc('recruitment_end_applicant_session', { p_organisation_id: org, p_token_hash: hash(saved) })
          if (error) throw error
        }
        const result = reply(200, { signedOut: true })
        result.headers['Set-Cookie'] = sessionCookie(headers, org, '', true)
        return result
      }
      if (!saved) return reply(200, { applicant: null })
      const { data, error } = await db.rpc('recruitment_resume_applicant', { p_organisation_id: org, p_token_hash: hash(saved) })
      if (error) throw error
      const result = reply(200, { applicant: data && codeOnlyVerification ? await homeSeekersDraftReceipt(db, org, hash(saved), data) : data || null })
      if (!data) result.headers['Set-Cookie'] = sessionCookie(headers, org, '', true)
      return result
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || (body.submissionKey && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.submissionKey))
      || (action === 'verify_email' && !/^(?:\d{6}|\d{8})$/.test(body.code || ''))
      || (action === 'sign_in' && (typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password) > 72))) return reply(400, { error: 'Check your email and login details.' })
    const secret = env.RECRUITMENT_INTAKE_FINGERPRINT_SECRET || env.WEBSITES_LEAD_FINGERPRINT_SECRET || ''
    if (secret.length < 32) throw new Error('unavailable')
    const address = String(headers['x-forwarded-for'] || headers['x-real-ip'] || 'local').split(',')[0].trim().slice(0,512)
    const digest = (value) => createHmac('sha256', secret).update(value).digest('hex')
    const { data: allowed, error: budgetError } = await db.rpc('recruitment_auth_budget', {
      p_kind: action === 'send_verification' ? 'send' : 'authenticate', p_fingerprint: digest(`recruitment-auth:${address}`), p_email_hash: digest(`recruitment-email:${email}`),
    })
    if (budgetError) throw budgetError
    if (allowed !== true) {
      const response = reply(429, { error: 'Please wait before trying again. Verification emails can be requested once a minute.', retryAfterSeconds: 60 })
      response.headers['Retry-After'] = '60'
      return response
    }
    const auth = authClient || authProvider(env)
    if (action === 'send_verification') {
      let query = db.from('recruitment_leads').select('id').eq('organisation_id', org).eq('contact_capture_json->>email', email)
      if (codeOnlyVerification) {
        query = query.not('status', 'in', '(closed_lost,legacy_joined,agent_activated)').order('created_at', { ascending: false })
        if (body.submissionKey) {
          const receipt = await db.from('recruitment_contact_receipts').select('lead_id').eq('organisation_id', org).eq('submission_key', body.submissionKey).maybeSingle()
          if (receipt.error) throw receipt.error
          if (!receipt.data?.lead_id) return reply(202, { verificationRequested: true, resendAfterSeconds: 60 })
          query = query.eq('id', receipt.data.lead_id)
        }
      }
      const { data: enquiry, error } = await query.limit(1).maybeSingle()
      if (error) throw error
      if (enquiry) {
        if (codeOnlyVerification) {
          // Home Seekers uses its own code-only message. Auth templates and
          // activation links for every other organisation remain independent.
          try {
            const delivered = await db.functions.invoke('send-email', { body: { type: 'home_seekers_recruitment_code', leadId: enquiry.id } })
            if (delivered.error || delivered.data?.verificationRequested !== true) throw new Error('unavailable')
            return reply(202, { verificationRequested: true, resendAfterSeconds: 60, codeLength: delivered.data.codeLength })
          } catch {
            return reply(503, { error: 'Your contact details are saved. The verification email could not be sent. Please wait a minute, then request a new code.', retryAfterSeconds: 60 })
          }
        }
        const sent = await auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
        // Nonexistent accounts deliberately receive the same acknowledgement.
        if (sent.error && !['user_not_found', 'signup_disabled', 'otp_disabled'].includes(sent.error.code)) {
          if (sent.error.status === 429) return reply(429, { error: 'Please wait before requesting another verification email.' })
          throw sent.error
        }
      }
      return reply(202, { verificationRequested: true, ...(codeOnlyVerification ? { resendAfterSeconds: 60 } : {}) })
    }
    const result = action === 'verify_email'
      ? await auth.verifyOtp({ email, token: body.code, type: 'email' })
      : await auth.signInWithPassword({ email, password: body.password })
    if (result.error || !result.data?.session?.access_token) {
      if (result.error?.code === 'email_not_confirmed') return reply(409, { verificationRequired: true, error: 'Verify your email before continuing.' })
      return reply(401, { error: action === 'verify_email' ? 'This code is invalid or has expired. Request a new code and try again.' : 'Sign-in failed. Check your email and password, or use an email code.' })
    }
    // Validate with Auth, rather than trusting returned/client-supplied metadata.
    const checked = await auth.getUser(result.data.session.access_token)
    const user = checked.data?.user
    if (checked.error || !user?.id || !user.email_confirmed_at || user.email?.toLowerCase() !== email || user.is_anonymous) return reply(401, { error: 'Your email could not be verified. Please try again.' })
    const opaque = randomBytes(32).toString('hex')
    const { data: opened, error } = await db.rpc('recruitment_open_applicant_session', { p_organisation_id: org, p_user_id: user.id, p_token_hash: hash(opaque), p_submission_key: body.submissionKey || null })
    if (error) throw error
    if (opened !== true) return reply(409, { error: 'No available recruitment enquiry matches this account. Start with your contact details or contact the agency.' })
    const resumed = await db.rpc('recruitment_resume_applicant', { p_organisation_id: org, p_token_hash: hash(opaque) })
    if (resumed.error || !resumed.data) throw resumed.error || new Error('unavailable')
    const response = reply(200, { applicant: codeOnlyVerification ? await homeSeekersDraftReceipt(db, org, hash(opaque), resumed.data) : resumed.data })
    response.headers['Set-Cookie'] = sessionCookie(headers, org, opaque)
    return response
  } catch { return reply(503, { error: 'Applicant access is temporarily unavailable. Your saved contact enquiry is safe. Please try again.' }) }
}
