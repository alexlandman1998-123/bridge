import { expect, it, vi } from 'vitest'
import { createRecruitmentApplicantSetupResponse } from '../../../../server/services/recruitmentApplicantSetupApi'
const org = '2958d402-368e-43c9-b728-0098e10505f1', user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const headers = { host: 'app.arch9.test', origin: 'https://app.arch9.test', cookie: `a9_recruitment_${org.replaceAll('-', '')}=${'a'.repeat(64)}` }
function fixture() {
  const storage = { createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/upload' } }), createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/photo' } }) }
  const db = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: user, email_confirmed_at: '2026-10-10' } } }) }, storage: { from: vi.fn(() => storage) },
    rpc: vi.fn(async name => ({ data: name === 'recruitment_prepare_applicant_photo' ? { path: `${org}/own/photo` } : name === 'recruitment_commit_applicant_photo' ? { saved: true } : name === 'recruitment_resume_applicant' ? { emailVerification: 'verified', applicationSubmitted: true, documents: [] } : name === 'recruitment_applicant_setup_photo' ? { path: `${org}/own/photo`, name: 'photo.png' } : name === 'recruitment_applicant_account_receipt' ? requestId : true })) }
  return { db, storage, run: (body, extra = {}) => createRecruitmentApplicantSetupResponse({ headers, body, client: db, env: {}, ...extra }) }
}
it('requires same-origin applicant sessions and exposes no signup, staff or form editing commands', async () => {
  const f = fixture()
  for (const action of ['signup', 'save_profile', 'submit_profile', 'approve', 'context']) expect((await f.run({ action })).status).toBe(400)
  expect((await f.run({ action: 'prepare_photo', requestId }, { headers: { ...headers, origin: 'https://foreign.test' } })).status).toBe(403)
  expect((await f.run({ action: 'prepare_photo', requestId }, { headers: { host: headers.host } })).status).toBe(401)
  expect(f.db.rpc).not.toHaveBeenCalled()
})
it('signs only server-owned photos and ignores caller ownership, lead, path and role claims', async () => {
  const f = fixture()
  expect((await f.run({ action: 'prepare_photo', requestId, photo: { name: 'photo.png', mimeType: 'image/png', size: 128, path: 'foreign' }, userId: 'foreign', organisationId: 'foreign', role: 'admin' })).body.uploadUrl).toBe('https://storage.test/upload')
  expect(f.db.rpc.mock.calls[0][1]).toEqual({ p_organisation_id: org, p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_request_id: requestId, p_photo: { name: 'photo.png', mimeType: 'image/png', size: 128 } })
  expect(f.storage.createSignedUploadUrl).toHaveBeenCalledWith(`${org}/own/photo`, { upsert: false })
  expect((await f.run({ action: 'commit_photo', requestId })).body.applicant.photo.url).toBe('https://storage.test/photo')
})
it('turns a validated normal Arch9 login into a restricted applicant cookie without trusting supplied identity', async () => {
  const f = fixture()
  expect((await f.run({ action: 'open_account', userId: 'foreign' }, { headers: { ...headers, authorization: 'Bearer validated-session' } })).headers['Set-Cookie']).toMatch(/Path=\/api\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure/)
  expect(f.db.auth.getUser).toHaveBeenCalledWith('validated-session')
  expect(f.db.rpc).toHaveBeenCalledWith('recruitment_applicant_account_receipt', { p_user_id: user })
  expect(JSON.stringify(f.db.rpc.mock.calls)).not.toContain('foreign')
  f.db.auth.getUser.mockResolvedValueOnce({ error: { message: 'invalid' }, data: { user: null } })
  expect((await f.run({ action: 'open_account' }, { headers: { ...headers, authorization: 'Bearer forged' } })).status).toBe(401)
})
it('opens a verified saved draft after the common login, with no upload or workspace access', async () => {
  const f = fixture()
  f.db.rpc.mockImplementation(async name => ({ data: name === 'recruitment_resume_applicant' ? { emailVerification: 'verified', applicationSubmitted: false, stage: 'lead_received', contact: { email: 'draft@example.test' } } : name === 'recruitment_applicant_account_receipt' ? requestId : true }))
  const result = await f.run({ action: 'open_account' }, { headers: { ...headers, authorization: 'Bearer validated-session' } })
  expect(result.status).toBe(200)
  expect(result.body.applicant).toMatchObject({ applicationSubmitted: false, stage: 'lead_received' })
  expect(f.db.rpc).not.toHaveBeenCalledWith('recruitment_applicant_setup_photo', expect.anything())
  expect(f.storage.createSignedUploadUrl).not.toHaveBeenCalled()
})
it('opens a restricted profile with a verified application password and ignores forged account claims', async () => {
  const f = fixture(), email = 'applicant@agency.test', lead = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  f.db.from = vi.fn(table => {
    const data = table === 'recruitment_intake_links' ? { id: requestId, organisation_id: org, channel: 'website', expires_at: '2099-01-01' } : table === 'recruitment_applicant_sessions' ? { lead_id: lead } : { submission_key: requestId }
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data }) }
    return q
  })
  const auth = { signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { access_token: 'validated-password-session' } } }), getUser: vi.fn().mockResolvedValue({ data: { user: { id: user, email, email_confirmed_at: '2026-10-10' } } }) }
  const result = await f.run({ action: 'sign_in', email, password: 'FixturePass123', userId: 'forged', role: 'admin' }, { authClient: auth, env: { HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN: 'b'.repeat(64), RECRUITMENT_INTAKE_FINGERPRINT_SECRET: 'x'.repeat(32) } })
  expect(result.status).toBe(200)
  expect(result.body.applicant.applicationSubmitted).toBe(true)
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email, password: 'FixturePass123' })
  expect(auth.getUser).toHaveBeenCalledWith('validated-password-session')
  expect(result.headers['Set-Cookie']).toMatch(/HttpOnly; SameSite=Lax; Max-Age=604800; Secure/)
  expect(f.db.rpc).toHaveBeenCalledWith('recruitment_open_applicant_session', expect.objectContaining({ p_user_id: user, p_organisation_id: org }))
  expect(JSON.stringify(f.db.rpc.mock.calls)).not.toContain('forged')
  expect(JSON.stringify(result.body)).not.toContain('FixturePass123')
  expect(JSON.stringify(result.body)).not.toContain('validated-password-session')
})
