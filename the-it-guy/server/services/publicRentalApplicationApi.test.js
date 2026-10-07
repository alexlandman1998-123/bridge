import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
let data, writes, savedRequirements, brandingSettings, brandingQueries
beforeEach(() => {
  writes = []
  brandingQueries = []
  brandingSettings = { agencyOnboarding: { branding: { organisationName: 'Tenant Agency', logoDarkUrl: 'https://example.test/dark.svg', logoLightUrl: 'https://example.test/light.svg', primaryColour: '#113355', secondaryColour: '#224466', accentColour: '#ffcc00' } }, privateIntegrationSecret: 'never-public' }
  savedRequirements = ['identity','proof_of_income'].map((purpose) => ({ id: `primary-${purpose}`, scope_key: 'application', subject_id: 'primary', purpose, required: true, active: true, mode: 'active', generation: 1, state: 'received' }))
  data = { identity: { firstName: 'Alex', lastName: 'Tenant', email: 'alex@example.test' }, employment: { employmentType: 'employed' }, income: { monthlyIncome: 25000 }, rentalHistory: { currentAddress: '12 Road', reasonForMoving: 'Work' }, property: { monthlyRent: 12000 }, onboarding: { sentAt: 'original' }, internalNotes: 'Private note' }
  mocks.createClient.mockReturnValue({ from(table) {
    let patch
    const query = {
      select: () => query, eq: (field, value) => { if (['organisations', 'organisation_settings'].includes(table)) brandingQueries.push({ table, field, value }); return query },
      update: (value) => { patch = value; writes.push({ table, value }); return query },
      upsert: (value) => { writes.push({ table, value }); return Promise.resolve({ data: [], error: null }) },
      order: async () => ({ data: [{ document_type: 'identity', status: 'uploaded' }, { document_type: 'proof_of_income', status: 'uploaded' }], error: null }),
      maybeSingle: async () => table === 'organisation_settings' ? { data: { settings_json: brandingSettings } } : table === 'organisations' ? { data: { name: 'Tenant Agency', logo_url: 'https://example.test/legacy.svg' } } : table === 'rental_application_access_tokens' ? { data: { id: 'access', application_id: 'app', expires_at: '2099-01-01' } } : { data: { id: 'app', organisation_id: 'org', status: patch?.status || 'draft', version: patch?.version || 2, application_data: patch?.application_data || data } },
      then: (resolve) => Promise.resolve({ data: table === 'rental_onboarding_requirement_summaries' ? savedRequirements : [], error: null }).then(resolve),
    }
    return query
  } })
})
const call = (method, body) => handlePublicRentalApplication({ method, body, token: 'test-token', env: { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'fake-test-key' } })
it('returns current organisation CI from the token-owned application and only public branding fields', async () => {
  const result = await handlePublicRentalApplication({ method: 'GET', body: { organisationId: 'other-org' }, token: 'test-token', env: { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'fake-test-key' } })
  expect(result.status).toBe(200)
  expect(result.body.branding).toMatchObject(brandingSettings.agencyOnboarding.branding)
  expect(brandingQueries).toEqual([{ table: 'organisations', field: 'id', value: 'org' }, { table: 'organisation_settings', field: 'organisation_id', value: 'org' }])
  expect(JSON.stringify(result.body)).not.toContain('never-public')
  brandingSettings.agencyOnboarding.branding.accentColour = '#abcdef'
  expect((await call('GET')).body.branding.accentColour).toBe('#abcdef')
})
it('signs configured private logo assets and keeps asset paths out of the response', async () => {
  const branding = brandingSettings.agencyOnboarding.branding
  branding.logoDarkBucket = 'documents'; branding.logoDarkPath = 'agency/private-logo.svg'
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/storage/v1/object/sign/documents/logo.svg?token=test' } })
  mocks.createClient().storage = { from: vi.fn(() => ({ createSignedUrl })) }
  const result = await call('GET')
  expect(result.status).toBe(200)
  expect(createSignedUrl).toHaveBeenCalledWith('agency/private-logo.svg', 604800)
  expect(result.body.branding.logoDarkUrl).toContain('?token=test')
  expect(JSON.stringify(result.body)).not.toContain('agency/private-logo.svg')
})
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
  const result = await call('PUT', { action: 'submit', version: 2, consents: ['privacy', 'credit_check', 'identity_verification'] })
  expect(result.status).toBe(400)
  expect(writes.some((entry) => entry.table === 'rental_application_consents')).toBe(false)
})
it('accepts a complete application and captures a separate submitted snapshot', async () => {
  const result = await call('PUT', { action: 'submit', version: 2, consents: ['privacy', 'credit_check', 'identity_verification'] })
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
  await call('PUT', { action: 'submit', version: 2, consents: ['privacy', 'credit_check', 'identity_verification'] })
  const consents = writes.find((entry) => entry.table === 'rental_application_consents').value
  const submission = writes.find((entry) => entry.table === 'rental_applications').value
  expect(consents).toHaveLength(3)
  for (const consent of consents) {
    expect(consent.wording_version).toBe(`rental-application-consent-v1:submission-2:${submission.submitted_at}`)
    expect(consent.source).toBe('applicant'); expect(consent.accepted_at).toBe(submission.submitted_at)
    expect(consent.evidence_json.submitted_at).toBe(submission.submitted_at)
  }
})
it('persists stale evidence assignments after applicant identity changes and exposes them on reopen', async () => {
  data.identity.identityNumber = 'A'
  data.documentLinks = [{ documentId: 'old', subjectId: 'primary', purpose: 'identity' }]
  const result = await call('PATCH', { version: 2, patch: { identity: { identityNumber: 'B' }, documentLinks: [], documentInvalidations: [] } })
  expect(result.status).toBe(200)
  const saved = writes.find((entry) => entry.table === 'rental_applications').value.application_data
  expect(saved.documentLinks[0].invalidated).toBe(true)
  expect(saved.documentInvalidations).toEqual([{ subjectId: 'primary' }])
  data = JSON.parse(JSON.stringify(saved))
  const reopened = await call('GET')
  expect(reopened.body.application.data.documentLinks[0].invalidated).toBe(true)
  expect(reopened.body.application.data.documentInvalidations).toEqual([{ subjectId: 'primary' }])
})
it.each(['missing','rejected','expired'])('accepts details submission when saved evidence is %s without claiming it is complete', async (state) => {
  savedRequirements[0].state = state
  const result = await call('PUT', { action: 'submit', version: 2, consents: ['privacy', 'credit_check', 'identity_verification'] })
  expect(result.status).toBe(200)
  expect(result.body.application.requirements[0].state).toBe(state)
})
it('exposes saved requirement IDs and generations without exposing internal discovery or storage paths', async () => {
  savedRequirements[0] = { ...savedRequirements[0], generation: 3, fingerprint_json: { confidential: 'private' }, storage_path: 'private/path' }
  const result = await call('GET')
  expect(result.body.application.requirements[0]).toMatchObject({ id: 'primary-identity', generation: 3, state: 'received' })
  expect(JSON.stringify(result.body.application.requirements)).not.toContain('private')
})
