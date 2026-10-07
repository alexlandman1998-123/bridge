import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org, unit, vacancy } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { rentalApplicationFieldScenario } from '../tests/fixtures/rentalApplicationFieldScenario.js'
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
import { getRentalApplicationReview } from '../../src/services/rentals/rentalApplicationRepository.js'
let db, client
const files = new Map()
const storage = { from: () => ({ upload: async (path, binary, options) => { files.set(path, { size: binary.length, contentType: options.contentType }); return { data: {} } }, remove: async (paths) => { paths.forEach((path) => files.delete(path)); return {} }, info: async (path) => ({ data: files.get(path) }), createSignedUrl: async (path) => ({ data: { signedUrl: `https://local.test/private/${path}` } }), createSignedUploadUrl: async (path) => ({ data: { signedUrl: `https://local.test/${path}` } }) }) }
beforeAll(async () => {
  db = await rentalOnboardingDatabase()
  await db.exec(`create function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select 'owner'::text $$;
    alter table rental_application_documents add column mime_type text, add column file_size_bytes integer;
    create table rental_application_access_tokens(id uuid default gen_random_uuid(),application_id uuid,token_hash text,expires_at timestamptz,revoked_at timestamptz,last_accessed_at timestamptz,subject_id text);
    create unique index consent_retry on rental_application_consents(application_id,consent_type,wording_version);
    alter table organisations add column name text,add column display_name text,add column logo_url text;
    create table organisation_settings(organisation_id uuid,settings_json jsonb);`)
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261007194611_rental_application_cost_confirmation.sql', import.meta.url), 'utf8'))
  const base = readFileSync(new URL('../../../supabase/migrations/20260905141014_rental_applications_and_applicant_access.sql', import.meta.url), 'utf8')
  await db.exec(base.slice(base.indexOf('create or replace function public.rental_application_validate_scope()'), base.indexOf('drop trigger if exists trg_rental_applications_updated_at')))
  await db.query("insert into rental_application_fee_settings(organisation_id,amount,payment_instructions) values($1,350,'Payment instructions')", [org])
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261007204950_rental_application_document_packs.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261007212433_rental_empty_document_pack_readiness.sql', import.meta.url), 'utf8'))
  client = rentalOnboardingClient(db, storage, actor)
}, 20000)
afterAll(async () => { await db?.close() })
async function application(type = 'individual') {
  const id = randomUUID(), token = `deferred-${id}`
  const data = { ...rentalApplicationFieldScenario(type), property: { title: 'Selected home', monthlyRent: 11000, depositAmount: 22000 } }
  await db.query('insert into rental_applications(id,organisation_id,unit_id,vacancy_id,application_data) values($1,$2,$3,$4,$5::jsonb)', [id, org, unit, vacancy, JSON.stringify(data)])
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at) values($1,$2,'2099-01-01')", [id, createHash('sha256').update(token).digest('hex')])
  const request = (method, body) => handlePublicRentalApplication({ method, body, token, env: { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }, clientFactory: () => client })
  expect((await request('PATCH', { action: 'confirm_context', version: 1, propertyAccepted: true, costsAccepted: true, privacyAccepted: true })).status).toBe(200)
  const result = await request('PUT', { action: 'submit', version: 2, declarationAccepted: true, consents: ['privacy', 'credit_check', 'identity_verification'] })
  expect(result.status).toBe(200)
  return { id, request, data, submitted: result.body.application }
}
const bodyFor = (application, requirement) => ({ version: application.version, subjectId: requirement.subjectId, purpose: requirement.purpose, requirementId: requirement.id, generation: requirement.generation, fileName: 'evidence.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('Local evidence').toString('base64') })
it('saves the expanded scenario matrix on new applications and protects its policy snapshot', async () => {
  const item = await application('trust')
  expect(item.submitted.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'address')).toMatchObject({ required: false })
  expect(item.submitted.requirements.find((r) => r.subjectId === 'entity' && r.purpose === 'beneficial_ownership')).toMatchObject({ required: false })
  expect(item.submitted.requirements.find((r) => r.subjectId === 'entity' && r.purpose === 'trust_authority')).toMatchObject({ required: true })
  await expect(db.query('select rental_attach_submitted_document($1,null,$2,$3,1)', [item.id, randomUUID(), randomUUID()])).rejects.toThrow(/changed/)
  await expect(db.query("update rental_applications set document_policy_json='{}',version=version+1 where id=$1", [item.id])).rejects.toThrow(/policy snapshot/)
})
it('requires acceptance of every current pack file and retains previous packs as history', async () => {
  const item = await application()
  const requirement = item.submitted.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'proof_of_income')
  const first = await item.request('POST', bodyFor(item.submitted, requirement))
  expect(first.status, JSON.stringify(first.body)).toBe(201)
  const second = await item.request('POST', { ...bodyFor(first.body.application, requirement), appendToPack: true, fileName: 'month-two.pdf' })
  expect(second.status, JSON.stringify(second.body)).toBe(201)
  expect(first.body.document.intake_bundle_id).toBe(second.body.document.intake_bundle_id)
  let version = second.body.application.version
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    const result = await tx.query("select rental_record_application_review($1,$2,'review_document',$3::jsonb) result", [item.id, version, JSON.stringify({ documentId: first.body.document.id, status: 'accepted', note: 'First month checked' })]); version = result.rows[0].result.version
  })
  expect((await item.request('GET')).body.application.requirements.find((r) => r.id === requirement.id).state).toBe('received')
  await db.transaction(async (tx) => { await tx.exec(`select set_config('test.actor','${actor}',true)`); const result = await tx.query("select rental_record_application_review($1,$2,'review_document',$3::jsonb) result", [item.id, version, JSON.stringify({ documentId: second.body.document.id, status: 'rejected', note: 'Unreadable' })]); version = result.rows[0].result.version })
  expect((await item.request('GET')).body.application.requirements.find((r) => r.id === requirement.id).state).toBe('rejected')
  const current = (await item.request('GET')).body.application
  const replaced = await item.request('POST', { ...bodyFor(current, requirement), fileName: 'replacement.pdf' })
  expect(replaced.status).toBe(201)
  expect(replaced.body.document.intake_bundle_id).not.toBe(first.body.document.intake_bundle_id)
  expect(replaced.body.application.requirements.find((r) => r.id === requirement.id).state).toBe('received')
  expect((await getRentalApplicationReview(item.id, { client })).documents).toHaveLength(3)
})
it('keeps participant links private and records only that person’s current permissions', async () => {
  const item = await application('company'), token = `person-${randomUUID()}`
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at,subject_id) values($1,$2,'2099-01-01','additional-person')", [item.id, createHash('sha256').update(token).digest('hex')])
  const ownRequest = (method, body) => handlePublicRentalApplication({ method, body, token, env: { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }, clientFactory: () => client })
  const opened = await ownRequest('GET')
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  expect(opened.body.application.portalType).toBe('person')
  expect(opened.body.application.data.identity).toBeUndefined()
  expect(opened.body.application.data.entity).toBeUndefined()
  expect(opened.body.application.costs).toBeUndefined()
  expect(opened.body.application.requirements.every((r) => r.subjectId === 'additional-person')).toBe(true)
  expect((await ownRequest('PATCH', { version: 3, patch: { identity: { firstName: 'Forged' } } })).status).toBe(403)
  const primary = item.submitted.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'identity')
  expect((await ownRequest('POST', bodyFor(item.submitted, primary))).status).toBe(403)
  const ownIdentity = opened.body.application.requirements.find((r) => r.purpose === 'identity')
  const uploaded = await ownRequest('POST', bodyFor(opened.body.application, ownIdentity))
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201)
  const preview = await ownRequest('POST', { action: 'open_document', documentId: uploaded.body.document.id })
  expect(preview.status).toBe(200)
  expect(preview.body.url).toMatch(/private/)
  expect((await ownRequest('POST', { action: 'record_person_permission', version: uploaded.body.application.version })).status).toBe(400)
  expect((await ownRequest('POST', { action: 'record_person_permission', privacyAccepted: true, identityAccepted: true, screeningAccepted: true, ownInformationAccepted: true })).status).toBe(409)
  const confirmed = await ownRequest('POST', { action: 'record_person_permission', version: uploaded.body.application.version, privacyAccepted: true, identityAccepted: true, screeningAccepted: true, ownInformationAccepted: true })
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
  expect(confirmed.body.application.requirements.find((r) => r.purpose === 'signed_consent').state).toBe('accepted')
  expect((await getRentalApplicationReview(item.id, { client })).requirements.find((r) => r.subjectId === 'additional-person' && r.purpose === 'signed_consent').state).toBe('accepted')
  const evidence = (await db.query('select * from rental_application_person_permissions where application_id=$1', [item.id])).rows[0]
  expect(evidence.evidence_json.person.id).toBe('additional-person')
  expect((await db.query("select rental_current_document_status($1,application_data,'additional-person','signed_consent') result from rental_applications where id=$1", [item.id])).rows[0].result).toBe('accepted')
  await db.transaction(async (tx) => { await tx.exec(`set local role authenticated`); await expect(tx.query('select rental_record_person_permission($1,4,$2,$3,1)', [item.id, 'additional-person', ownIdentity.id])).rejects.toThrow(/permission denied/) })
})
it('blocks a participant from opening someone else’s file and rejects forged upload receipts', async () => {
  const item = await application(), token = `person-${randomUUID()}`
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at,subject_id) values($1,$2,'2099-01-01','additional-person')", [item.id, createHash('sha256').update(token).digest('hex')])
  const ownRequest = (body) => handlePublicRentalApplication({ method: 'POST', body, token, env: { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }, clientFactory: () => client })
  const requirement = item.submitted.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'identity')
  const prepared = await item.request('POST', { ...bodyFor(item.submitted, requirement), action: 'prepare_upload', fileSize: 20 })
  expect(prepared.status).toBe(201)
  expect((await ownRequest({ action: 'complete_upload', version: 3, ticket: prepared.body.ticket })).status).not.toBe(201)
  const uploaded = await item.request('POST', bodyFor(item.submitted, requirement))
  expect(uploaded.status).toBe(201)
  expect((await ownRequest({ action: 'open_document', documentId: uploaded.body.document.id })).status).not.toBe(200)
  await db.query('update rental_application_access_tokens set revoked_at=now() where token_hash=$1', [createHash('sha256').update(token).digest('hex')])
  expect((await ownRequest({ action: 'record_person_permission' })).status).toBe(401)
})
it('invalidates a person link when that person’s saved identity changes', async () => {
  const item = await application(), token = `person-${randomUUID()}`
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at,subject_id) values($1,$2,'2099-01-01','additional-person')", [item.id, createHash('sha256').update(token).digest('hex')])
  await db.transaction(async (tx) => { await tx.exec(`select set_config('test.actor','${actor}',true)`); await tx.query("select rental_record_application_review($1,3,'request_changes','{\"message\":\"Correct identity\"}')", [item.id]) })
  let current = (await item.request('GET')).body.application
  const people = current.data.people.map((person) => ({ ...person, identityNumber: 'NEW-IDENTITY' }))
  const saved = await item.request('PATCH', { version: current.version, patch: { people } })
  expect(saved.status).toBe(200)
  current = saved.body.application
  const submitted = await item.request('PUT', { action: 'submit', version: current.version, declarationAccepted: true, consents: ['privacy','credit_check','identity_verification'] })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
  const opened = await handlePublicRentalApplication({ method: 'GET', token, env: { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }, clientFactory: () => client })
  expect(opened.status).toBe(401)
})
