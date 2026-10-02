import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), upload: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('./rentalApplicationDocumentUpload.js', () => ({ uploadRentalApplicationDocument: mocks.upload }))
import { handleRentalAgentDocumentUpload } from './rentalApplicationAgentDocumentApi.js'
const env = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public-test', SUPABASE_SERVICE_ROLE_KEY: 'server-test' }
let scoped, query
beforeEach(() => {
  vi.clearAllMocks()
  query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'app', organisation_id: 'org', status: 'draft', version: 2 } }) }
  scoped = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'agent' } } }) }, from: vi.fn().mockReturnValue(query) }
  mocks.createClient.mockReturnValueOnce(scoped).mockReturnValue({ storage: 'admin' })
  mocks.upload.mockResolvedValue({ document: { id: 'doc' }, application: { id: 'app', status: 'draft', version: 3, application_data: {} } })
})
const call = (overrides = {}) => handleRentalAgentDocumentUpload({ method: 'POST', headers: { Authorization: 'Bearer agent-test' }, body: { applicationId: 'app' }, env, ...overrides })
it('requires authenticated agent and an application visible through RLS before privileged storage is used', async () => {
  expect((await call({ headers: {} })).status).toBe(401)
  expect(mocks.createClient).not.toHaveBeenCalled()
  scoped.auth.getUser.mockResolvedValue({ error: new Error('expired') })
  expect((await call()).status).toBe(401)
  expect(mocks.upload).not.toHaveBeenCalled()
})
it('never creates a privileged client for an out-of-scope application', async () => {
  query.maybeSingle.mockResolvedValue({ data: null })
  expect((await call()).status).toBe(404)
  expect(mocks.createClient).toHaveBeenCalledOnce(); expect(mocks.upload).not.toHaveBeenCalled()
})
it('uses the agent-scoped client for record writes and returns the latest application version', async () => {
  const result = await call()
  expect(result.status).toBe(201); expect(result.body.application.version).toBe(3)
  expect(mocks.createClient.mock.calls[0][2].global.headers.Authorization).toBe('Bearer agent-test')
  expect(mocks.upload.mock.calls[0][3].applicationClient).toBe(scoped)
  expect(mocks.upload.mock.calls[0][3].source).toBe('agent')
})
it('only signs private documents belonging to the visible application for sixty seconds', async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: { id: 'app', organisation_id: 'org' } }).mockResolvedValueOnce({ data: { storage_bucket: 'rental-application-documents', storage_path: 'org/app/original.pdf' } })
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/private-signed-test' } })
  mocks.createClient.mockReset().mockReturnValueOnce(scoped).mockReturnValue({ storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) } })
  const result = await call({ method: 'GET', body: { applicationId: 'app', documentId: 'doc' } })
  expect(result.status).toBe(200); expect(createSignedUrl).toHaveBeenCalledWith('org/app/original.pdf', 60)
  expect(mocks.upload).not.toHaveBeenCalled()
})
it('refuses download paths from another application even if a document row is returned', async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: { id: 'app', organisation_id: 'org' } }).mockResolvedValueOnce({ data: { storage_bucket: 'rental-application-documents', storage_path: 'org/other-app/private.pdf' } })
  expect((await call({ method: 'GET', body: { applicationId: 'app', documentId: 'doc' } })).status).toBe(404)
})
