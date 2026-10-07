import { expect, it, vi } from 'vitest'
import { createRecruitmentIntakeResponse, createLocalRecruitmentIntakeResponse } from '../../../../server/services/recruitmentIntakeApi'
import { createHomeSeekersSignupResponse } from '../../../../server/services/homeSeekersRecruitmentSignupApi'
import { recruitmentSignupRequest } from '../../../services/recruitmentSignupService'
import { recruitmentSignupErrors } from '../recruitmentContactModel'

const org = '2958d402-368e-43c9-b728-0098e10505f1', lead = '11111111-1111-4111-8111-111111111111'
const token = 'a'.repeat(64), submissionKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const contact = { firstName: 'Fixture', lastName: 'Applicant', email: 'applicant@example.test', phone: '+27821234567', privacyAccepted: true }
const password = 'FixturePass123'
const body = { action: 'signup', token, submissionKey, contact, password }
const env = { RECRUITMENT_INTAKE_FINGERPRINT_SECRET: 'x'.repeat(32), HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN: token }
function client({ capture = { accepted: true }, organisationId = org, accountError, lostResponse = false, lookupError, mismatch = false } = {}) {
  const users = new Map()
  const admin = {
    getUserById: vi.fn(async id => ({ data: { user: users.get(id) }, error: lookupError || (users.has(id) ? null : { status: 404 }) })),
    createUser: vi.fn(async values => {
      if (accountError) return { error: accountError }
      const user = { ...values, id: mismatch ? 'other' : values.id }
      users.set(values.id, user)
      return lostResponse ? { error: { message: 'Lost response' } } : { data: { user }, error: null }
    }),
  }
  return { users, auth: { admin }, rpc: vi.fn(async () => ({ data: capture })), from: vi.fn(table => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'recruitment_contact_receipts' ? { lead_id: lead } : { id: 'link', organisation_id: organisationId, channel: 'website', expires_at: '2027-10-07' } }) }
    return q
  }) }
}
const request = (db, extra = {}) => createRecruitmentIntakeResponse({ client: db, env, body, now: new Date('2026-10-07'), ...extra })
it('captures contacts before creating an unconfirmed account and never passes passwords into CRM', async () => {
  const db = client()
  const result = await request(db, { body: { ...body, accountId: 'forged', app_metadata: { role: 'admin' } } })
  expect(result.body).toMatchObject({ verificationRequired: true, contactAccepted: true, emailVerification: 'pending', stage: 'lead_received' })
  expect(db.rpc.mock.invocationCallOrder[0]).toBeLessThan(db.auth.admin.createUser.mock.invocationCallOrder[0])
  expect(JSON.stringify(db.rpc.mock.calls)).not.toContain(password)
  expect(db.auth.admin.createUser).toHaveBeenCalledWith({ id: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/), email: contact.email, password, email_confirm: false, user_metadata: { full_name: 'Fixture Applicant' }, app_metadata: { recruitment_contact_lead_id: lead, recruitment_organisation_id: org } })
  expect(JSON.stringify(result.body)).not.toContain(lead)
  expect(JSON.stringify(result.body)).not.toContain(password)
})
it('recovers retries and lost provider responses without changing the existing password', async () => {
  const db = client({ lostResponse: true })
  expect((await request(db)).body.verificationRequired).toBe(true)
  expect((await request(db, { body: { ...body, password: 'ChangedFixture123' } })).body.duplicate).toBe(true)
  expect(db.auth.admin.createUser).toHaveBeenCalledTimes(1)
  expect(db.auth.admin.createUser.mock.calls[0][0].password).toBe(password)
})
it('continues existing Arch9 emails through verification without changing or exposing the existing account', async () => {
  const db = client({ accountError: { code: 'email_exists', message: 'Private provider detail' } })
  const result = await request(db)
  const fresh = await request(client())
  expect(result).toEqual(fresh)
  expect(result.body).toMatchObject({ accepted: true, contactAccepted: true, verificationRequired: true, emailVerification: 'pending' })
  expect(result.headers).not.toHaveProperty('Set-Cookie')
  expect(result.body).not.toHaveProperty('applicant')
  expect(result.body).not.toHaveProperty('accountCreated')
  expect(db.rpc).toHaveBeenCalledTimes(1)
  expect(db.rpc.mock.calls[0][0]).toBe('recruitment_capture_contact')
  expect(db.users.size).toBe(0)
  expect(JSON.stringify(result.body)).not.toContain('Private provider detail')
})
it('keeps captured contact after other Auth failures and returns a generic error', async () => {
  const db = client({ accountError: { status: 500, code: 'unexpected_failure', message: 'Private provider detail' } })
  const result = await request(db)
  expect(result).toMatchObject({ status: 503, body: { contactAccepted: true } })
  expect(result.body).not.toHaveProperty('accepted')
  expect(result.body.error).not.toContain('Private provider detail')
  expect(db.rpc).toHaveBeenCalledTimes(1)
})
it('rejects invalid passwords and capture conflicts without account access, and fails closed on provider mismatches', async () => {
  for (const value of ['', 'short', '🙂'.repeat(20)]) expect(recruitmentSignupErrors(contact,value)).toHaveProperty('password')
  const db = client()
  expect((await request(db, { body: { ...body, password: '' } })).status).toBe(400)
  expect(db.from).not.toHaveBeenCalled()
  const conflict = client({ capture: { conflict: true } })
  expect((await request(conflict)).status).toBe(409)
  expect(conflict.auth.admin.getUserById).not.toHaveBeenCalled()
  expect((await request(client({ mismatch: true }))).body.accountCreated).toBeUndefined()
  expect((await request(client({ lookupError: { status: 500 } }))).status).toBe(503)
})
it('binds the Home Seekers wrapper to its configured agency and keeps preview writes disabled', async () => {
  const db = client({ organisationId: 'other-agency' })
  expect((await createHomeSeekersSignupResponse({ body: { ...body, token: 'forged', organisationId: 'other-agency' }, env, client: db })).status).toBe(410)
  expect(db.rpc).not.toHaveBeenCalled()
  const preview = client()
  expect((await createHomeSeekersSignupResponse({ body: { action: 'context' }, preview: true, client: preview })).body.preview).toBe(true)
  expect((await createHomeSeekersSignupResponse({ body, preview: true, client: preview })).status).toBe(503)
  expect((await createLocalRecruitmentIntakeResponse({ body, client: preview })).status).toBe(503)
  expect(preview.from).not.toHaveBeenCalled()
  expect((await createHomeSeekersSignupResponse({ body, env: {}, client: preview })).status).toBe(503)
})
it('uses the same signup process for another receiving agency on the shared endpoint', async () => {
  const db = client({ organisationId: 'another-agency' })
  expect((await request(db)).body.verificationRequired).toBe(true)
  expect(db.auth.admin.createUser.mock.calls[0][0].app_metadata.recruitment_organisation_id).toBe('another-agency')
})
it('uses the server deployment environment for preview and rejects every write even with production credentials', async () => {
  const db = client()
  const previewEnv = { ...env, VERCEL_ENV: 'preview' }
  expect((await createHomeSeekersSignupResponse({ body: { action: 'context', preview: false }, env: previewEnv, client: db })).body.preview).toBe(true)
  for (const action of ['signup', 'send_verification', 'verify_email', 'sign_in', 'resume', 'sign_out', 'save_profile', 'submit_profile']) {
    expect((await createHomeSeekersSignupResponse({ body: { ...body, action, preview: false }, env: previewEnv, client: db })).status).toBe(503)
  }
  expect(db.from).not.toHaveBeenCalled()
  expect(db.rpc).not.toHaveBeenCalled()
  expect(db.auth.admin.createUser).not.toHaveBeenCalled()
})
it('client whitelists signup fields, propagates saved-contact errors, and never treats partial acknowledgement as signup success', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ accepted: true, accountCreated: true }) }))
  await recruitmentSignupRequest('signup', { contact: { ...contact, password, organisationId: 'forged' }, password, submissionKey, role: 'admin' }, { endpoint: '/api/home-seekers/recruitment', fetcher })
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ action: 'signup', contact: { ...contact, consentVersion: 'recruitment-contact-v1' }, password, submissionKey, companyWebsite: '' })
  await expect(recruitmentSignupRequest('signup', body, { fetcher: async () => ({ ok: false, status: 503, json: async () => ({ contactAccepted: true, error: 'Fixture signup unavailable' }) }) })).rejects.toMatchObject({ contactAccepted: true, status: 503 })
  await expect(recruitmentSignupRequest('signup', body, { fetcher: async () => ({ ok: true, status: 201, json: async () => ({ accepted: true }) }) })).rejects.toThrow('could not be created')
  await expect(recruitmentSignupRequest('signup', body, { fetcher: async () => ({ ok: true, status: 201, json: async () => ({ accepted: true, contactAccepted: true, verificationRequired: true }) }) })).resolves.toMatchObject({ verificationRequired: true })
  await expect(recruitmentSignupRequest('signup', body, { fetcher: async () => ({ ok: true, status: 201, json: async () => ({ accepted: true, verificationRequired: true }) }) })).rejects.toThrow('could not be created')
})
