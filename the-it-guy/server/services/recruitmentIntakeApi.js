import { createHash, createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { applicationErrors, normalizeRecruitmentApplication } from '../../src/pages/recruitment/recruitmentApplicationModel.js'
import { resolveOnboardingBranding } from '../../src/lib/onboardingBranding.js'
const reply = (status, body) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }, body })
const tokenPattern = /^[a-f0-9]{64}$/
function serverClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('unavailable')
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}
const safeLogo = (value) => { try { return new URL(value).protocol === 'https:' ? value : '' } catch { return '' } }
export async function createLocalRecruitmentIntakeResponse(options = {}) {
  if (options.body?.action === 'submit') return reply(503, { error: 'This local preview cannot submit applications. Use the organisation’s published Join Us link to send your application.' })
  const result = await createRecruitmentIntakeResponse(options)
  return result.status === 200 ? { ...result, body: { ...result.body, preview: true } } : result
}
export async function createRecruitmentIntakeResponse({ method = 'POST', headers = {}, body = {}, env = process.env, client, now = new Date() } = {}) {
  if (method !== 'POST') return reply(405, { error: 'Use POST for application requests.' })
  if (!body || typeof body !== 'object' || Array.isArray(body) || !tokenPattern.test(body.token || '') || !['context','submit'].includes(body.action)) return reply(400, { error: 'Invalid application request.' })
  // Embedded forms post back to their own host; arbitrary cross-origin JSON submissions are rejected.
  if (headers.origin) {
    try { if (new URL(headers.origin).host.toLowerCase() !== String(headers.host || '').toLowerCase()) return reply(403, { error: 'Open the organisation’s Join Us link to apply.' }) } catch { return reply(403, { error: 'Invalid application origin.' }) }
  }
  if (body.action === 'submit' && body.companyWebsite) return reply(202, { accepted: true, duplicate: true })
  try {
    const db = client || serverClient(env)
    const hash = createHash('sha256').update(body.token).digest('hex')
    const { data: link, error: linkError } = await db.from('recruitment_intake_links').select('id,organisation_id,lead_id,channel,expires_at,revoked_at,submitted_at').eq('token_hash', hash).maybeSingle()
    if (linkError) throw linkError
    if (!link || link.revoked_at || new Date(link.expires_at) <= now) return reply(410, { error: 'This application link is unavailable or has expired. Ask the organisation for a new link.' })
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
      return reply(200, { branding: { organisationName: branding.organisationName, logoLightUrl: safeLogo(branding.logoLightUrl), logoDarkUrl: safeLogo(branding.logoDarkUrl), primaryColour: /^#[a-f0-9]{6}$/i.test(branding.primaryColour) ? branding.primaryColour : '#153c35', accentColour: /^#[a-f0-9]{6}$/i.test(branding.accentColour) ? branding.accentColour : '#d4e9dc' }, channel: link.channel, submitted })
    }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.submissionKey || '')) return reply(400, { error: 'Invalid application request.' })
    const errors = applicationErrors(body.answers)
    if (Object.keys(errors).length) return reply(400, { error: 'Please check your application answers.', errors })
    const secret = env.RECRUITMENT_INTAKE_FINGERPRINT_SECRET || env.WEBSITES_LEAD_FINGERPRINT_SECRET || ''
    if (secret.length < 32) throw new Error('unavailable')
    const address = String(headers['x-forwarded-for'] || headers['x-real-ip'] || 'local').split(',')[0].trim().slice(0, 512)
    const fingerprint = createHmac('sha256', secret).update(`recruitment:${address}`).digest('hex')
    const { data, error } = await db.rpc('recruitment_submit_application', { p_link_id: link.id, p_submission_key: body.submissionKey, p_answers: normalizeRecruitmentApplication(body.answers), p_fingerprint: fingerprint })
    if (error) throw error
    if (data?.rateLimited) return reply(429, { error: 'Please wait before sending another application.' })
    if (data?.alreadySubmitted || data?.unavailable) return reply(409, { error: 'This lead has already submitted an application or is no longer accepting one. Contact the organisation.' })
    if (data?.accepted !== true) throw new Error('unavailable')
    return reply(data.duplicate ? 202 : 201, { accepted: true, duplicate: data.duplicate === true })
  } catch {
    return reply(503, { error: 'Applications are temporarily unavailable. Your answers are still here; please try again.' })
  }
}
