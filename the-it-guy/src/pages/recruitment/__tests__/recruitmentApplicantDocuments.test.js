import { expect, it, vi } from 'vitest'
import { recruitmentApplicantAccess } from '../../../../server/services/recruitmentApplicantAccess'
const org = '2958d402-368e-43c9-b728-0098e10505f1', id = '22222222-2222-4222-8222-222222222222', requestId = '33333333-3333-4333-8333-333333333333'
const path = `${org}/${id}/${requestId}`, headers = { cookie: `a9_recruitment_${org.replaceAll('-', '')}=${'a'.repeat(64)}` }
function fixture() {
  const storage = { createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed-upload' } }), createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed-download' } }) }
  const db = { storage: { from: vi.fn(() => storage) }, rpc: vi.fn(async name => ({ data: name === 'recruitment_prepare_applicant_document' ? { path, committed: false } : name === 'recruitment_commit_applicant_document' ? { saved: true } : name === 'recruitment_resume_applicant' ? { documents: [{ path, name: 'id.pdf' }], emailVerification: 'verified' } : [{ id, documents_json: [{ path, name: 'id.pdf' }] }] })) }
  const run = (body, extra = {}) => recruitmentApplicantAccess({ db, link: { organisation_id: org }, headers, env: {}, body, ...extra })
  return { db, storage, run }
}
it('signs only the server-owned upload request and discards caller tenant, role, path and ownership claims', async () => {
  const f = fixture()
  const result = await f.run({ action: 'prepare_document', requestId, document: { name: 'id.pdf', type: 'Identity document', mimeType: 'application/pdf', size: 128, path: 'foreign/file', organisationId: 'foreign' }, leadId: 'foreign', role: 'admin' })
  expect(result).toMatchObject({ status: 200, body: { uploadUrl: 'https://storage.test/signed-upload' } })
  expect(f.db.rpc).toHaveBeenCalledWith('recruitment_prepare_applicant_document', { p_organisation_id: org, p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_request_id: requestId, p_document: { name: 'id.pdf', type: 'Identity document', mimeType: 'application/pdf', size: 128 } })
  expect(f.storage.createSignedUploadUrl).toHaveBeenCalledWith(path, { upsert: false })
  expect(JSON.stringify(f.db.rpc.mock.calls)).not.toContain('foreign')
})
it('never signs an absent, expired or locked applicant session and rejects forged download paths', async () => {
  const f = fixture()
  expect((await f.run({ action: 'prepare_document' }, { headers: {} })).status).toBe(401)
  expect(f.db.rpc).not.toHaveBeenCalled()
  f.db.rpc.mockResolvedValueOnce({ data: { unavailable: true } })
  expect((await f.run({ action: 'prepare_document', requestId, document: {} })).status).toBe(401)
  expect(f.storage.createSignedUploadUrl).not.toHaveBeenCalled()
  expect((await f.run({ action: 'download_document', documentPath: 'foreign/file' })).status).toBe(404)
  expect(f.storage.createSignedUrl).not.toHaveBeenCalled()
})
it('finalises only the retained request and returns the saved applicant document pack', async () => {
  const f = fixture()
  const result = await f.run({ action: 'commit_document', requestId, path: 'foreign', leadId: 'forged' })
  expect(result).toMatchObject({ status: 200, body: { saved: true, applicant: { documents: [{ path }] } } })
  expect(f.db.rpc.mock.calls[0][1]).toEqual({ p_organisation_id: org, p_token_hash: expect.any(String), p_request_id: requestId })
  expect((await f.run({ action: 'download_document', documentPath: path })).status).toBe(200)
  expect(f.storage.createSignedUrl).toHaveBeenCalledWith(path, 300, { download: 'id.pdf' })
})
