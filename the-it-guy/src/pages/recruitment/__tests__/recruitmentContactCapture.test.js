import { expect, it, vi } from 'vitest'
import { normalizeRecruitmentContact, recruitmentContactErrors } from '../recruitmentContactModel'
import { captureRecruitmentContact } from '../../../services/recruitmentIntakeService'
import { createRecruitmentIntakeResponse, createLocalRecruitmentIntakeResponse } from '../../../../server/services/recruitmentIntakeApi'

const contact = { firstName: 'Sam', lastName: 'Agent', email: 'SAM@EXAMPLE.TEST', phone: '+27821234567', privacyAccepted: true }
const token = 'a'.repeat(64), submissionKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const body = { action: 'capture_contact', token, submissionKey, contact }
const env = { RECRUITMENT_INTAKE_FINGERPRINT_SECRET: 'x'.repeat(32) }
function client(result = { accepted: true, duplicate: false }, overrides = {}) {
  const link = { id: 'link', organisation_id: 'agency', channel: 'website', expires_at: '2027-10-07T00:00:00Z', ...overrides }
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: link, error: null }) }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
  return { from: vi.fn(() => query), rpc: vi.fn().mockResolvedValue({ data: result, error: null }) }
}
const request = (db, extra = {}) => createRecruitmentIntakeResponse({ client: db, body, env, now: new Date('2026-10-07T00:00:00Z'), ...extra })

it('validates names, international mobile numbers and consent and excludes credential and identity claims', () => {
  expect(recruitmentContactErrors(contact)).toEqual({})
  expect(normalizeRecruitmentContact({ ...contact, password: 'never-store', organisationId: 'other', emailVerified: true })).toEqual({ ...contact, email: 'sam@example.test', consentVersion: 'recruitment-contact-v1' })
  expect(recruitmentContactErrors({ firstName: '', lastName: 'a'.repeat(61), email: 'bad', phone: '12', privacyAccepted: 'true' })).toMatchObject({ firstName: expect.any(String), lastName: expect.any(String), email: expect.any(String), phone: expect.any(String), privacyAccepted: expect.any(String) })
  expect(recruitmentContactErrors({ ...contact, firstName: 'a'.repeat(60), lastName: 'b'.repeat(60) })).toHaveProperty('lastName')
  expect(recruitmentContactErrors({ ...contact, phone: '1'.repeat(16) })).toHaveProperty('phone')
})
it('captures against the server-resolved agency link without accepting tenant, lead, password or verification claims', async () => {
  const db = client()
  const result = await request(db, { headers: { host: 'agency.example.test', origin: 'https://agency.example.test', 'x-forwarded-for': '192.0.2.1' }, body: { ...body, organisationId: 'forged', leadId: 'forged', contact: { ...contact, password: 'never-store', emailVerification: 'verified' } } })
  expect(result).toMatchObject({ status: 201, body: { accepted: true, duplicate: false, stage: 'lead_received', emailVerification: 'pending' } })
  expect(db.rpc.mock.calls[0]).toEqual(['recruitment_capture_contact', { p_link_id: 'link', p_submission_key: submissionKey, p_contact: normalizeRecruitmentContact(contact), p_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }])
  expect(JSON.stringify(db.rpc.mock.calls)).not.toContain('never-store')
  expect(result.body).not.toHaveProperty('leadId')
  expect(result.body).not.toHaveProperty('organisationId')
})
it('blocks invalid contact/consent and cross-origin requests before using the database', async () => {
  const db = client()
  expect((await request(db, { body: { ...body, contact: { ...contact, privacyAccepted: false } } })).status).toBe(400)
  expect((await request(db, { body: { ...body, contact: [] } })).status).toBe(400)
  expect((await request(db, { headers: { host: 'agency.test', origin: 'https://other.test' } })).status).toBe(403)
  expect(db.from).not.toHaveBeenCalled()
  expect(db.rpc).not.toHaveBeenCalled()
})
it('rejects private, expired and revoked links and fails closed without configured fingerprint protection', async () => {
  for (const overrides of [{ channel: 'private_link', lead_id: 'existing' }, { revoked_at: '2026-10-06' }, { expires_at: '2026-10-06' }]) {
    const db = client(undefined, overrides)
    expect((await request(db)).status).toBe(overrides.lead_id ? 409 : 410)
    expect(db.rpc).not.toHaveBeenCalled()
  }
  const db = client()
  expect((await request(db, { env: {} })).status).toBe(503)
  expect(db.rpc).not.toHaveBeenCalled()
})
it('reports acknowledgement, payload conflicts, unavailable links and rate limits without returning private receipt data', async () => {
  expect((await request(client({ accepted: true, duplicate: true, leadId: 'private', contact }))).body).toEqual({ accepted: true, duplicate: true, stage: 'lead_received', emailVerification: 'pending' })
  expect((await request(client({ conflict: true }))).status).toBe(409)
  expect((await request(client({ unavailable: true }))).status).toBe(409)
  expect((await request(client({ rateLimited: true }))).status).toBe(429)
  expect((await request(client({}))).status).toBe(503)
})
it('keeps all local contact writes disabled before any database access', async () => {
  const db = client()
  const result = await createLocalRecruitmentIntakeResponse({ client: db, body, env })
  expect(result.status).toBe(503)
  expect(result.body).not.toHaveProperty('accepted')
  expect(db.from).not.toHaveBeenCalled()
  expect(db.rpc).not.toHaveBeenCalled()
})
it('uses the same retry key, strips credentials and requires acceptance from the client request', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) })
  const details = { ...contact, password: 'never-store', organisationId: 'forged' }
  await captureRecruitmentContact(token, details, submissionKey, { fetcher })
  await captureRecruitmentContact(token, details, submissionKey, { fetcher })
  expect(fetcher.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([body, body].map(value => ({ ...value, contact: normalizeRecruitmentContact(contact) })))
  await expect(captureRecruitmentContact(token, contact, submissionKey, { fetcher: async () => ({ ok: true, json: async () => ({}) }) })).rejects.toThrow('could not be recorded')
  await expect(captureRecruitmentContact(token, contact, '', { fetcher })).rejects.toThrow('new recruitment enquiry')
})
