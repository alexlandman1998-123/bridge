import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
let data, writes
beforeEach(() => {
  writes = []
  data = { identity: { firstName: 'Alex', lastName: 'Tenant', email: 'alex@example.test' }, employment: { employmentType: 'employed' }, income: { monthlyIncome: 25000 }, rentalHistory: { currentAddress: '12 Road', reasonForMoving: 'Work' }, property: { monthlyRent: 12000 }, onboarding: { sentAt: 'original' }, internalNotes: 'Private note' }
  mocks.createClient.mockReturnValue({ from(table) {
    let patch
    const query = {
      select: () => query, eq: () => query,
      update: (value) => { patch = value; writes.push({ table, value }); return query },
      upsert: (value) => { writes.push({ table, value }); return Promise.resolve({ data: [], error: null }) },
      order: async () => ({ data: [{ document_type: 'identity', status: 'uploaded' }, { document_type: 'proof_of_income', status: 'uploaded' }], error: null }),
      maybeSingle: async () => table === 'rental_application_access_tokens' ? { data: { id: 'access', application_id: 'app', expires_at: '2099-01-01' } } : { data: { id: 'app', organisation_id: 'org', status: patch?.status || 'draft', version: patch?.version || 2, application_data: patch?.application_data || data } },
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    return query
  } })
})
const call = (method, body) => handlePublicRentalApplication({ method, body, token: 'test-token', env: { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'fake-test-key' } })
it('reopens only applicant-visible fields without exposing agent notes or invitation metadata', async () => {
  const result = await call('GET')
  expect(result.status).toBe(200)
  expect(result.body.application.data.internalNotes).toBeUndefined()
  expect(result.body.application.data.onboarding).toBeUndefined()
  expect(result.body.application.data.identity.firstName).toBe('Alex')
})
it('preserves section fields and server-owned context through applicant save and reopen', async () => {
  const result = await call('PATCH', { version: 2, patch: { identity: { phone: '0825550101' }, property: { monthlyRent: 1 }, onboarding: { sentAt: 'forged' } } })
  expect(result.status).toBe(200)
  expect(result.body.application.data.identity).toEqual({ firstName: 'Alex', lastName: 'Tenant', email: 'alex@example.test', phone: '0825550101' })
  const saved = writes.find((entry) => entry.table === 'rental_applications').value
  expect(saved.application_data.property.monthlyRent).toBe(12000)
  expect(saved.application_data.onboarding.sentAt).toBe('original')
  expect(saved.application_data.internalNotes).toBe('Private note')
})
it('rejects invalid scalar data and prevents blank sections from being submitted', async () => {
  expect((await call('PATCH', { version: 2, patch: { identity: { firstName: {} } } })).status).toBe(400)
  data.identity.firstName = ''
  const result = await call('PUT', { action: 'submit', consents: ['privacy', 'credit_check', 'identity_verification'] })
  expect(result.status).toBe(400)
  expect(writes.some((entry) => entry.table === 'rental_application_consents')).toBe(false)
})
it('accepts a complete application and captures a separate submitted snapshot', async () => {
  const result = await call('PUT', { action: 'submit', consents: ['privacy', 'credit_check', 'identity_verification'] })
  expect(result.status).toBe(200)
  expect(writes.find((entry) => entry.table === 'rental_applications').value.submitted_snapshot_json).toEqual(data)
})
it('upgrades a reopened legacy draft deliberately while keeping invitation and document assignments protected', async () => {
  const result = await call('PATCH', { version: 2, upgradeSchema: true, patch: { entity: { type: 'company', legalName: 'Tenant company' }, documentLinks: [{ documentId: 'forged' }], onboarding: { sentAt: 'forged' } } })
  expect(result.status).toBe(200)
  expect(result.body.application.data.schemaVersion).toBe('arch9_rental_application_fields_v2')
  expect(result.body.application.data.documentLinks).toBeUndefined()
  expect(writes.find((item) => item.table === 'rental_applications').value.application_data.onboarding.sentAt).toBe('original')
})
it('requires the current version and primary applicant declaration before accepting a new-schema submission', async () => {
  data.schemaVersion = 'arch9_rental_application_fields_v2'
  expect((await call('PUT', { action: 'submit', version: 1, declarationAccepted: true })).status).toBe(409)
  expect((await call('PUT', { action: 'submit', version: 2, consents: ['privacy', 'credit_check', 'identity_verification'] })).status).toBe(400)
  expect(writes.some((entry) => entry.table === 'rental_application_consents')).toBe(false)
})

it('shares only explicit correction requests and keeps reviewer notes private', async () => {
  data.review = { requestedChanges: 'Update your occupation date.', landlordDecision: { note: 'Confidential discussion' }, internalNotes: 'Staff only' }
  const result = await call('GET')
  expect(result.body.requestedChanges).toBe('Update your occupation date.')
  expect(result.body.application.data.review).toBeUndefined()
  expect(JSON.stringify(result.body)).not.toContain('Confidential')
})
it('records fresh consent evidence under a distinct submission version with the submission time', async () => {
  await call('PUT', { action: 'submit', consents: ['privacy', 'credit_check', 'identity_verification'] })
  const consents = writes.find((entry) => entry.table === 'rental_application_consents').value
  const submission = writes.find((entry) => entry.table === 'rental_applications').value
  expect(consents).toHaveLength(3)
  for (const consent of consents) {
    expect(consent.wording_version).toBe(`rental-application-consent-v1:submission-2:${submission.submitted_at}`)
    expect(consent.source).toBe('applicant'); expect(consent.accepted_at).toBe(submission.submitted_at)
    expect(consent.evidence_json.submitted_at).toBe(submission.submitted_at)
  }
})
