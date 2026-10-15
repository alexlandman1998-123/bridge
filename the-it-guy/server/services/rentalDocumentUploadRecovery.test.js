import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { rentalJourneyAcceptanceDatabase, actor, org } from '../tests/fixtures/rentalJourneyAcceptanceDatabase.js'
import { handleRentalLandlordOnboarding, handlePublicRentalLandlordOnboarding } from './rentalLandlordOnboardingApi.js'
import { uploadRentalApplicationFile } from '../../src/services/rentals/rentalApplicationFileUpload.js'
const env = { SUPABASE_URL: 'https://fixture.test', SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_SERVICE_ROLE_KEY: 'fixture-server' }
let fixture, leadId, onboarding, token, interrupt = false, dropCompletion = false
const paths = []
const body = result => { if (result.status >= 400) throw new Error(result.body.error); return result.body }
const agentRequest = async payload => body(await handleRentalLandlordOnboarding({ method: payload ? 'POST' : 'GET', headers: { Authorization: 'Bearer fixture-agent' }, body: { leadId, ...payload }, env, clientFactory: (_url, _key, options) => options.global ? fixture.agent : fixture.admin }))
const publicRequest = async payload => {
  const result = body(await handlePublicRentalLandlordOnboarding({ method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: payload, env, clientFactory: () => fixture.admin }))
  if (payload.action === 'complete_upload' && dropCompletion) { dropCompletion = false; throw new TypeError('Saved response lost') }
  return result
}
beforeAll(async () => {
  fixture = await rentalJourneyAcceptanceDatabase()
  const storageFrom = fixture.admin.storage.from
  fixture.admin.storage.from = bucket => {
    const storage = storageFrom(bucket), info = storage.info
    return { ...storage, info: async path => { const result = await info(path); return result.error ? { error: { statusCode: 404, message: 'Object not found' } } : result } }
  }
  leadId = randomUUID()
  await fixture.scopedWork(tx => tx.query("insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,lead_category,stage,raw_enquiry_payload) values($1,$2,$3,$3,'seller','New Lead',$4)", [leadId, org, actor, JSON.stringify({ classification: 'rental', role: 'landlord', stage: 'new' })]))
  const initial = (await agentRequest()).onboarding
  onboarding = body(await handleRentalLandlordOnboarding({ method: 'PATCH', headers: { Authorization: 'Bearer fixture-agent' }, body: { leadId, version: initial.version, patch: { profile: { type: 'individual', name: 'Upload owner', email: 'owner@example.test', idNumber: 'Fixture identity', address: '12 Owner Road' }, portfolio: [{ id: 'home', title: 'Upload home', address: '12 Saved Road', ownershipType: 'sole_owner', serviceType: 'letting_only', occupancyStatus: 'vacant', schemeType: 'none' }] } }, env, clientFactory: (_url, _key, options) => options.global ? fixture.agent : fixture.admin })).onboarding
  token = (await agentRequest({ action: 'create_access' })).token
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    paths.push(url)
    if (interrupt) { interrupt = false; throw new TypeError('Transfer interrupted before bytes arrived') }
    await fixture.storeSignedUpload(url, options.body, options.headers['Content-Type'])
    return { ok: true }
  }))
}, 20000)
afterAll(async () => { vi.unstubAllGlobals(); await fixture?.db.close() })

it('retries one interrupted landlord file, confirms its real assignment, opens and replaces it, and rejects revoked access', async () => {
  const requirement = onboarding.requirements.find(row => row.purpose === 'identity' && row.active)
  const slot = { ...requirement, requirementId: requirement.id }
  const file = new File(['%PDF-1.7\nOriginal identity\n%%EOF'], 'Identity.pdf', { type: 'application/pdf', lastModified: 1 })
  const progress = vi.fn()
  const upload = selected => uploadRentalApplicationFile(selected, slot, onboarding.version, publicRequest, { onProgress: progress, scope: ['landlord', leadId] })
  interrupt = true
  await expect(upload(file)).rejects.toMatchObject({ code: 'document_save_unconfirmed' })
  expect(fixture.files.size).toBe(0)
  dropCompletion = true
  const saved = await upload(file)
  expect(paths[1]).toBe(paths[0])
  expect(saved.documentId).toBeTruthy()
  expect(progress.mock.calls.at(-1)[0].stage).toBe('complete')
  onboarding = saved.onboarding
  expect(onboarding.requirements.find(row => row.id === requirement.id)).toMatchObject({ state: 'received', documentId: saved.documentId })
  expect((await fixture.db.query('select count(*)::int count from rental_landlord_onboarding_documents where lead_id=$1', [leadId])).rows[0].count).toBe(1)
  const opened = await publicRequest({ action: 'document_url', version: onboarding.version, documentId: saved.documentId })
  expect(opened.url).toContain('ttl=60')
  expect([...fixture.files.values()][0].toString()).toContain('Original identity')
  const retry = await upload(file)
  expect(retry.documentId).toBe(saved.documentId)
  expect(paths).toHaveLength(2)
  const replacement = new File(['%PDF-1.7\nReplacement identity\n%%EOF'], 'Identity.pdf', { type: 'application/pdf', lastModified: 1 })
  onboarding = (await upload(replacement)).onboarding
  expect(onboarding.documents).toHaveLength(2)
  expect(onboarding.requirements.find(row => row.id === requirement.id).documentId).not.toBe(saved.documentId)
  expect(fixture.files.size).toBe(2)
  await fixture.db.query('update rental_landlord_onboarding_access set revoked_at=now() where lead_id=$1', [leadId])
  await expect(upload(replacement)).rejects.toThrow()
  expect(paths).toHaveLength(3)
}, 20000)
