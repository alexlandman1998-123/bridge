import { createRecruitmentIntakeResponse } from './recruitmentIntakeApi.js'
import { applicantActions } from './recruitmentApplicantAccess.js'
import { HOME_SEEKERS_ORGANISATION_ID } from './homeSeekersWebsiteBridge.js'

const reply = (status, body) => ({ status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }, body })
export async function createHomeSeekersSignupResponse({ method = 'POST', headers = {}, body = {}, env = process.env, client, authClient, preview = env.VERCEL_ENV === 'preview' } = {}) {
  if (method !== 'POST') return reply(405, { error: 'Use POST for recruitment requests.' })
  if (!body || typeof body !== 'object' || Array.isArray(body) || !['context', 'signup', ...applicantActions].includes(body.action)) return reply(400, { error: 'Invalid recruitment request.' })
  if (headers.origin) {
    try { if (new URL(headers.origin).host.toLowerCase() !== String(headers.host || '').toLowerCase()) return reply(403, { error: 'Open the Home Seekers Join Us page to apply.' }) } catch { return reply(403, { error: 'Invalid recruitment request.' }) }
  }
  if (preview) return body.action === 'context'
    ? reply(200, { preview: true, branding: { organisationName: 'Home Seekers' } })
    : reply(503, { error: 'This preview does not create accounts or save enquiries. Your details have not been sent.' })
  const token = env.HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN || ''
  if (!/^[a-f0-9]{64}$/.test(token)) return reply(503, { error: 'Recruitment signup is temporarily unavailable. Please try again later.' })
  // A website cannot select another agency's link, tenant or lead through JSON.
  return createRecruitmentIntakeResponse({ method, headers, env, client, authClient, expectedOrganisationId: HOME_SEEKERS_ORGANISATION_ID,
    body: { action: body.action, token, contact: body.contact, password: body.password, submissionKey: body.submissionKey, companyWebsite: body.companyWebsite, email: body.email, code: body.code, answers: body.answers, revision: body.revision, page: body.page, intent: body.intent, privacyAccepted: body.privacyAccepted, declarationAccepted: body.declarationAccepted } })
}
