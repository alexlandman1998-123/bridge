import { createHash, createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { applicationErrors, normalizeRecruitmentApplication } from '../../src/pages/recruitment/recruitmentApplicationModel.js'
import { resolveOnboardingBranding } from '../../src/lib/onboardingBranding.js'
import { normalizeRecruitmentContact, recruitmentContactErrors, recruitmentSignupErrors } from '../../src/pages/recruitment/recruitmentContactModel.js'
import { createRecruitmentApplicant } from './recruitmentApplicantSignup.js'
import { applicantActions, recruitmentApplicantAccess } from './recruitmentApplicantAccess.js'
const reply = (status, body) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }, body })
const tokenPattern = /^[a-f0-9]{64}$/
function serverClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('unavailable')
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}
const safeLogo = (value) => { try { return new URL(value).protocol === 'https:' ? value : '' } catch { return '' } }
export async function createLocalRecruitmentIntakeResponse(options = {}) {
  if (['submit', 'capture_contact', 'signup', ...applicantActions.filter(action => action !== 'resume')].includes(options.body?.action)) return reply(503, { error: 'This local preview cannot create accounts, save recruitment details or submit applications. Use the organisation’s published Join Us link.' })
  if (options.body?.action === 'resume') return reply(200, { applicant: null, preview: true })
  const result = await createRecruitmentIntakeResponse(options)
  return result.status === 200 ? { ...result, body: { ...result.body, preview: true } } : result
}
export async function createRecruitmentIntakeResponse({ method = 'POST', headers = {}, body = {}, env = process.env, client, now = new Date(), expectedOrganisationId, authClient } = {}) {
  if (method !== 'POST') return reply(405, { error: 'Use POST for application requests.' })
  if (!body || typeof body !== 'object' || Array.isArray(body) || !tokenPattern.test(body.token || '') || !['context','submit','capture_contact','signup', ...applicantActions].includes(body.action)) return reply(400, { error: 'Invalid application request.' })
  // Embedded forms post back to their own host; arbitrary cross-origin JSON submissions are rejected.
  if (headers.origin) {
    try { if (new URL(headers.origin).host.toLowerCase() !== String(headers.host || '').toLowerCase()) return reply(403, { error: 'Open the organisation’s Join Us link to apply.' }) } catch { return reply(403, { error: 'Invalid application origin.' }) }
  }
  const signingUp = body.action === 'signup'
  const capturing = body.action === 'capture_contact' || signingUp
  if (capturing && (!body.contact || typeof body.contact !== 'object' || Array.isArray(body.contact))) return reply(400, { error: 'Please complete your contact details.' })
  if (capturing) {
    const errors = signingUp ? recruitmentSignupErrors(body.contact, body.password) : recruitmentContactErrors(body.contact)
    if (Object.keys(errors).length) return reply(400, { error: 'Please check your contact details.', errors })
  }
  if (body.action !== 'context' && body.companyWebsite) return reply(202, { accepted: true, duplicate: true })
  try {
    const db = client || serverClient(env)
    const hash = createHash('sha256').update(body.token).digest('hex')
    const { data: link, error: linkError } = await db.from('recruitment_intake_links').select('id,organisation_id,lead_id,channel,expires_at,revoked_at,submitted_at').eq('token_hash', hash).maybeSingle()
    if (linkError) throw linkError
    if (!link || (expectedOrganisationId && link.organisation_id !== expectedOrganisationId) || link.revoked_at || (new Date(link.expires_at) <= now && !['resume', 'sign_out'].includes(body.action))) return reply(410, { error: 'This application link is unavailable or has expired. Ask the organisation for a new link.' })
    if (applicantActions.includes(body.action)) {
      if (link.lead_id || !['website', 'public_link'].includes(link.channel)) return reply(409, { error: 'Use the public Join Us page to access your applicant account.' })
      return recruitmentApplicantAccess({ db, authClient, link, headers, body, env })
    }
    if (capturing && (link.lead_id || !['website', 'public_link'].includes(link.channel))) return reply(409, { error: 'Use a public Join Us link to start a new recruitment enquiry.' })
    let submitted = Boolean(link.submitted_at)
    if (link.lead_id) {
      const { data: lead, error: leadError } = await db.from('recruitment_leads').select('status,application_submitted_at').eq('organisation_id', link.organisation_id).eq('id', link.lead_id).maybeSingle()
      if (leadError) throw leadError
      if (!lead || !['lead_received','application_submitted'].includes(lead.status)) return reply(410, { error: 'This lead is no longer accepting an application. Contact the organisation.' })
      submitted = submitted || Boolean(lead.application_submitted_at)
    }
    if (body.action === 'context') {
      const { data: brand, error: brandError } = await db.from('organisation_branding').select('organisation_display_name,logo_light_url,logo_dark_url,primary_brand_color,secondary_brand_color,accent_brand_color').eq('organisation_id', link.organisation_id).maybeSingle()
      if (brandError) throw brandError
      const { data: organisation, error: orgError } = await db.from('organisations').select('name').eq('id', link.organisation_id).maybeSingle()
      if (orgError || !organisation) throw orgError || new Error('unavailable')
      const branding = resolveOnboardingBranding({ ...brand, organisationName: brand?.organisation_display_name || organisation.name })
      let applicant = null
      if (String(headers.cookie || '').includes('a9_recruitment_')) {
        const resumed = await recruitmentApplicantAccess({ db, authClient, link, headers, body: { action: 'resume' }, env })
        if (resumed.status !== 200) return resumed
        applicant = resumed.body.applicant
      }
      return reply(200, { branding: { organisationName: branding.organisationName, logoLightUrl: safeLogo(branding.logoLightUrl), logoDarkUrl: safeLogo(branding.logoDarkUrl), primaryColour: /^#[a-f0-9]{6}$/i.test(branding.primaryColour) ? branding.primaryColour : '#153c35', accentColour: /^#[a-f0-9]{6}$/i.test(branding.accentColour) ? branding.accentColour : '#d4e9dc' }, channel: link.channel, submitted, ...(applicant ? { applicant } : {}) })
    }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.submissionKey || '')) return reply(400, { error: 'Invalid application request.' })
    const errors = capturing ? {} : applicationErrors(body.answers)
    if (Object.keys(errors).length) return reply(400, { error: 'Please check your application answers.', errors })
    const secret = env.RECRUITMENT_INTAKE_FINGERPRINT_SECRET || env.WEBSITES_LEAD_FINGERPRINT_SECRET || ''
    if (secret.length < 32) throw new Error('unavailable')
    const address = String(headers['x-forwarded-for'] || headers['x-real-ip'] || 'local').split(',')[0].trim().slice(0, 512)
    const fingerprint = createHmac('sha256', secret).update(`${capturing ? 'recruitment-contact' : 'recruitment'}:${address}`).digest('hex')
    const parameters = { p_link_id: link.id, p_submission_key: body.submissionKey, p_fingerprint: fingerprint }
    if (capturing) parameters.p_contact = normalizeRecruitmentContact(body.contact)
    else parameters.p_answers = normalizeRecruitmentApplication(body.answers)
    const { data, error } = await db.rpc(capturing ? 'recruitment_capture_contact' : 'recruitment_submit_application', parameters)
    if (error) throw error
    if (data?.rateLimited) return reply(429, { error: capturing ? 'Please wait before sending another recruitment enquiry.' : 'Please wait before sending another application.' })
    if (data?.conflict) return reply(409, { error: 'These details differ from the saved enquiry. Contact the organisation to update your enquiry.' })
    if (data?.alreadySubmitted || data?.unavailable) return reply(409, { error: 'This lead has already submitted an application or is no longer accepting one. Contact the organisation.' })
    if (data?.accepted !== true) throw new Error('unavailable')
    if (signingUp) {
      try {
        const account = await createRecruitmentApplicant(db, link, body.submissionKey, normalizeRecruitmentContact(body.contact), body.password)
        return reply(account.duplicate ? 202 : 201, { accepted: true, contactAccepted: true, verificationRequired: true, duplicate: account.duplicate, stage: 'lead_received', emailVerification: 'pending' })
      } catch {
        return reply(503, { contactAccepted: true, error: 'Your contact details are saved. Your account could not be created. Please retry, or contact the agency if you already have an account.' })
      }
    }
    return reply(data.duplicate ? 202 : 201, { accepted: true, duplicate: data.duplicate === true, ...(capturing ? { stage: 'lead_received', emailVerification: 'pending' } : {}) })
  } catch {
    return reply(503, { error: capturing ? 'Your contact details could not be recorded. Please try again.' : 'Applications are temporarily unavailable. Your answers are still here; please try again.' })
  }
}
