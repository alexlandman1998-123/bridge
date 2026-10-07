import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { normalizeRecruitmentProfile, recruitmentProfileErrors } from '../../src/pages/recruitment/recruitmentProfileModel.js'

export const applicantActions = ['send_verification', 'verify_email', 'sign_in', 'resume', 'sign_out', 'save_profile', 'submit_profile']
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
export async function recruitmentApplicantAccess({ db, authClient, link, headers, body, env }) {
  const org = link.organisation_id, action = body.action
  try {
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
      const errors = { ...recruitmentProfileErrors(answers), ...recruitmentProfileErrors(answers, { page: body.intent === 'continue' ? body.page : undefined, required: body.intent !== 'save' }) }
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
      const result = reply(200, { applicant: data || null })
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
    if (allowed !== true) return reply(429, { error: 'Please wait before trying again. Verification emails can be requested once a minute.' })
    const auth = authClient || authProvider(env)
    if (action === 'send_verification') {
      const { data: enquiry, error } = await db.from('recruitment_leads').select('id').eq('organisation_id', org).eq('contact_capture_json->>email', email).limit(1).maybeSingle()
      if (error) throw error
      if (enquiry) {
        const sent = await auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
        // Nonexistent accounts deliberately receive the same acknowledgement.
        if (sent.error && !['user_not_found', 'signup_disabled', 'otp_disabled'].includes(sent.error.code)) {
          if (sent.error.status === 429) return reply(429, { error: 'Please wait before requesting another verification email.' })
          throw sent.error
        }
      }
      return reply(202, { verificationRequested: true })
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
    const response = reply(200, { applicant: resumed.data })
    response.headers['Set-Cookie'] = sessionCookie(headers, org, opaque)
    return response
  } catch { return reply(503, { error: 'Applicant access is temporarily unavailable. Your saved contact enquiry is safe. Please try again.' }) }
}
