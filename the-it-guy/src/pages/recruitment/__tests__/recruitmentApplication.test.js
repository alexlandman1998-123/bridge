import { expect, it, vi } from 'vitest'
import { applicationErrors, applicationRequirements, applicationVersion, normalizeRecruitmentApplication } from '../recruitmentApplicationModel'
import { createRecruitmentIntakeResponse, createLocalRecruitmentIntakeResponse } from '../../../../server/services/recruitmentIntakeApi'
import { recruitmentIntakeRequest } from '../../../services/recruitmentIntakeService'
import handler from '../../../../api/public/recruitment-intake'
const token = 'a'.repeat(64)
export const answers = { name: 'Sam Applicant', email: 'sam@example.test', phone: '0821234567', area: 'Pretoria', yearsExperience: '0', dealsPerMonth: '0', activeMandates: 'no', motivation: 'Support and training', practitionerStatus: 'new_entrant', qualificationRoute: 'none', qualificationStatus: 'not_started', pdeStatus: 'not_started', practicalStatus: 'not_started', cpdStatus: 'not_applicable', privacyAccepted: true, declarationAccepted: true }
const body = { action: 'submit', token, submissionKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', answers }
function client(result = { accepted: true }) {
  const from = vi.fn((table) => {
    const data = table === 'recruitment_intake_links' ? { id: 'link', organisation_id: 'org', channel: 'public_link', expires_at: '2027-10-05T00:00:00Z' } : table === 'organisations' ? { name: 'Acme Estate' } : { organisation_display_name: 'Acme Estate', logo_light_url: 'https://example.test/logo.png', primary_brand_color: '#563377' }
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); return query
  })
  return { from, rpc: vi.fn().mockResolvedValue({ data: result, error: null }) }
}
const options = { env: { RECRUITMENT_INTAKE_FINGERPRINT_SECRET: 'x'.repeat(32) }, now: new Date('2026-10-05T00:00:00Z') }
it('validates new entrants and conditionally requires FFC and mandate details', () => {
  expect(applicationErrors(answers)).toEqual({})
  expect(applicationErrors({ ...answers, practitionerStatus: 'candidate', ffcStatus: 'current', activeMandates: 'yes' })).toMatchObject({ ffcNumber: expect.any(String), ffcExpiry: expect.any(String), mandateCount: expect.any(String), handoverNotes: expect.any(String) })
  expect(applicationErrors({ ...answers, practitionerStatus: 'candidate', ffcStatus: 'current', ffcNumber: '123', ffcExpiry: '2026-02-30' })).toHaveProperty('ffcExpiry')
  expect(applicationErrors({ ...answers, dealsPerMonth: '-1', currentSplit: '101', privacyAccepted: false })).toMatchObject({ dealsPerMonth: expect.any(String), currentSplit: expect.any(String), privacyAccepted: expect.any(String) })
  expect(normalizeRecruitmentApplication({ ...answers, organisationId: 'forged', status: 'application_approved', ffcNumber: 'stale', email: 'SAM@EXAMPLE.TEST' })).toMatchObject({ ffcNumber: '', email: 'sam@example.test', ffcStatus: 'not_held' })
  expect(normalizeRecruitmentApplication({ ...answers, status: 'application_approved' })).not.toHaveProperty('status')
})
it('derives review requirements without claiming FFC verification', () => {
  expect(applicationRequirements({ version: applicationVersion, answers: normalizeRecruitmentApplication(answers) })).toHaveLength(4)
  expect(applicationRequirements({ version: applicationVersion, answers: normalizeRecruitmentApplication(answers) })[0].note).toContain('new entrant')
})
it('returns branding only, without exposing existing lead data or internal organisation IDs', async () => {
  const db = client()
  const result = await createRecruitmentIntakeResponse({ ...options, client: db, body: { token, action: 'context' } })
  expect(result.status).toBe(200)
  expect(result.body.branding).toMatchObject({ organisationName: 'Acme Estate', primaryColour: '#563377', logoLightUrl: 'https://example.test/logo.png' })
  expect(result.body).not.toHaveProperty('organisation_id')
  expect(result.body).not.toHaveProperty('answers')
  expect(db.rpc).not.toHaveBeenCalled()
})
it('submits whitelisted answers and a hashed sender through the server-only RPC', async () => {
  const db = client()
  const result = await createRecruitmentIntakeResponse({ ...options, client: db, headers: { host: 'app.example.test', origin: 'https://app.example.test', 'x-forwarded-for': '127.0.0.1' }, body: { ...body, organisationId: 'forged', answers: { ...answers, status: 'agent_activated' } } })
  expect(result.status).toBe(201)
  expect(result.body).toEqual({ accepted: true, duplicate: false })
  expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_link_id: 'link', p_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(db.rpc.mock.calls[0][1].p_answers).not.toHaveProperty('status')
})
it('fails closed for invalid payloads, origins, links, rate limits and missing sender secret', async () => {
  const db = client({ rateLimited: true })
  expect((await createRecruitmentIntakeResponse({ ...options, client: db, body, headers: { host: 'app.example.test', origin: 'https://attacker.test' } })).status).toBe(403)
  expect((await createRecruitmentIntakeResponse({ ...options, client: db, body: { ...body, answers: { ...answers, privacyAccepted: false } } })).status).toBe(400)
  expect((await createRecruitmentIntakeResponse({ ...options, client: db, body })).status).toBe(429)
  expect((await createRecruitmentIntakeResponse({ ...options, client: db, env: {}, body })).status).toBe(503)
  expect((await createRecruitmentIntakeResponse({ ...options, client: db, now: new Date('2028-01-01'), body })).status).toBe(410)
  expect((await createRecruitmentIntakeResponse({ ...options, client: db, body: { ...body, companyWebsite: 'bot.test' } })).status).toBe(202)
})
it('requires server acknowledgement and preserves answers after a timeout', async () => {
  await expect(recruitmentIntakeRequest(token, body, { fetcher: async () => ({ ok: true, json: async () => ({}) }) })).rejects.toThrow('could not be recorded')
  await expect(recruitmentIntakeRequest(token, body, { timeoutMs: 5, fetcher: (_url, { signal }) => new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) })).rejects.toThrow('answers are still here')
})
it('caps request size before accessing the intake database', async () => {
  const response = { setHeader: vi.fn(), end: vi.fn() }
  await handler({ method: 'POST', headers: {}, body: { token, answers: { motivation: 'x'.repeat(25000) } } }, response)
  expect(response.statusCode).toBe(413)
})

it('loads real intake context in local preview while blocking every submission before database access', async () => {
  const db = client()
  const context = await createLocalRecruitmentIntakeResponse({ ...options, client: db, body: { token, action: 'context' } })
  expect(context.status).toBe(200)
  expect(context.body).toMatchObject({ preview: true, branding: { organisationName: 'Acme Estate' } })
  db.from.mockClear()
  const submission = await createLocalRecruitmentIntakeResponse({ ...options, client: db, body })
  expect(submission.status).toBe(503)
  expect(db.from).not.toHaveBeenCalled()
  expect(db.rpc).not.toHaveBeenCalled()
  expect(submission.body).not.toHaveProperty('accepted')
})
