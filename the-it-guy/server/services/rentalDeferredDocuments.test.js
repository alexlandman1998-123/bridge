import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org, unit, vacancy } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { rentalApplicationFieldScenario } from '../tests/fixtures/rentalApplicationFieldScenario.js'
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
import { getRentalApplicationReview } from '../../src/services/rentals/rentalApplicationRepository.js'
import { rentalApplicationApprovalReadiness } from '../../src/services/rentals/rentalApplicationReviewModel.js'
let db, client
const files = new Map()
const storage = { from: () => ({ upload: async (path, binary, options) => { files.set(path, { size: binary.length, contentType: options.contentType }); return { data: {} } }, remove: async (paths) => { paths.forEach((path) => files.delete(path)); return {} }, info: async (path) => ({ data: files.get(path) }), createSignedUploadUrl: async (path) => ({ data: { signedUrl: `https://local.test/${path}` } }) }) }
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
it.each(['individual', 'joint_individuals', 'company', 'close_corporation', 'trust'])('submits %s details without documents and collects named evidence later without changing the submitted answers', async (type) => {
  const item = await application(type)
  expect(item.submitted.feeDueAt).toBeTruthy()
  expect(item.submitted.requirements.filter((r) => r.required).every((r) => r.state === 'missing')).toBe(true)
  expect((await item.request('PATCH', { version: 3, patch: { identity: { firstName: 'Forged' } } })).status).toBe(409)
  const requirement = item.submitted.requirements.find((r) => r.subjectId === 'additional-person' && r.purpose === 'signed_consent')
  const upload = await item.request('POST', bodyFor(item.submitted, requirement))
  expect(upload.status, JSON.stringify(upload.body)).toBe(201)
  expect(upload.body.application.version).toBe(4)
  expect(upload.body.application.requirements.find((r) => r.id === requirement.id)).toMatchObject({ state: 'received', generation: requirement.generation, documentId: upload.body.document.id })
  const agent = await getRentalApplicationReview(item.id, { client })
  expect(agent.submittedSnapshot).toEqual(item.data)
  expect(agent.data).toMatchObject(item.data)
  expect(agent.data.documentLinks).toHaveLength(1)
  expect(agent.feeDueAt).toEqual(item.submitted.feeDueAt)
  expect(rentalApplicationApprovalReadiness(agent).ready).toBe(false)
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    await expect(tx.query("select rental_decide_application($1,4,'approved','Ready','{}')", [item.id])).rejects.toThrow(/uploaded identity|acceptance|saved evidence/)
  })
  expect((await item.request('GET')).body.application.requirements.find((r) => r.id === requirement.id).state).toBe('received')
})
it('recovers repeated signed completions after submission and protects accepted evidence', async () => {
  const item = await application()
  const requirement = item.submitted.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'identity')
  const prepared = await item.request('POST', { ...bodyFor(item.submitted, requirement), action: 'prepare_upload', fileSize: 20 })
  expect(prepared.status).toBe(201)
  files.set(new URL(prepared.body.uploadUrl).pathname.slice(1), { size: 20, contentType: 'application/pdf' })
  const uploaded = await item.request('POST', { action: 'complete_upload', version: 3, ticket: prepared.body.ticket })
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201)
  const filesBeforeRetry = files.size
  const repeated = await item.request('POST', { action: 'complete_upload', version: 3, ticket: prepared.body.ticket })
  expect(repeated.status).toBe(201)
  expect(repeated.body.document.id).toBe(uploaded.body.document.id)
  expect(repeated.body.application.version).toBe(4)
  expect(files.size).toBe(filesBeforeRetry)
  const persisted = await db.query('select id from rental_application_documents where application_id=$1', [item.id])
  expect(persisted.rows.map((row) => row.id)).toEqual([uploaded.body.document.id])
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    await tx.query("select rental_record_application_review($1,4,'review_document',$2::jsonb)", [item.id, JSON.stringify({ documentId: uploaded.body.document.id, status: 'accepted', note: 'Identity checked' })])
  })
  const current = (await item.request('GET')).body.application
  const count = files.size
  expect((await item.request('POST', bodyFor(current, current.requirements.find((r) => r.id === requirement.id)))).body.error).toMatch(/already been accepted/)
  expect(files.size).toBe(count)
  await expect(db.query("update rental_applications set application_data=jsonb_set(application_data,'{identity,firstName}','\"Forged\"') where id=$1", [item.id])).rejects.toThrow(/answers are locked/)
  await expect(db.query("update rental_applications set submitted_snapshot_json='{}' where id=$1", [item.id])).rejects.toThrow(/snapshot/)
})
it('rejects closed or expired links and out-of-scope agent attachments', async () => {
  const item = await application()
  const requirement = item.submitted.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'identity')
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${randomUUID()}',true)`)
    await expect(tx.query('select rental_attach_submitted_document($1,3,$2,$3,$4)', [item.id, randomUUID(), requirement.id, requirement.generation])).rejects.toThrow(/scope/)
  })
  await db.query("update rental_application_access_tokens set expires_at='2000-01-01' where application_id=$1", [item.id])
  expect((await item.request('POST', bodyFor(item.submitted, requirement))).status).toBe(401)
  await db.query("update rental_application_access_tokens set expires_at='2099-01-01' where application_id=$1", [item.id])
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    await tx.query("select rental_decide_application($1,3,'withdrawn','Applicant withdrew','{}')", [item.id])
  })
  expect((await item.request('POST', bodyFor(item.submitted, requirement))).status).toBe(409)
})
it('allows approval only after later evidence is accepted and all current reviews are complete', async () => {
  const item = await application()
  let current = item.submitted
  for (const requirement of item.submitted.requirements.filter((r) => r.required)) {
    const upload = await item.request('POST', bodyFor(current, requirement))
    expect(upload.status, JSON.stringify(upload.body)).toBe(201)
    current = upload.body.application
  }
  const agent = await getRentalApplicationReview(item.id, { client })
  let version = current.version
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    const review = async (command, payload) => { const result = (await tx.query('select rental_record_application_review($1,$2,$3,$4::jsonb) result', [item.id, version, command, JSON.stringify(payload)])).rows[0].result; version = result.version }
    for (const document of agent.documents) await review('review_document', { documentId: document.id, status: 'accepted', note: 'Current evidence checked' })
    for (const kind of ['identity', 'fica', 'affordability', 'employment', 'reference']) for (const subjectId of ['primary', 'additional-person']) await review('screening', { checkType: kind, subjectId, status: 'passed', evidenceNote: 'Evidence checked', expiresAt: '2099-01-01' })
    await review('landlord_response', { name: 'Owner', outcome: 'approved', channel: 'written', note: 'Approved after review' })
    await tx.query("select rental_decide_application($1,$2,'approved','Checks complete','{}')", [item.id, version])
  })
  expect((await getRentalApplicationReview(item.id, { client })).status).toBe('approved')
  expect((await item.request('POST', bodyFor(current, current.requirements[0]))).status).toBe(409)
})
it('does not treat an unattached upload as another person’s legacy evidence during review', async () => {
  const item = await application()
  const requirement = item.submitted.requirements.find((r) => r.subjectId === 'additional-person' && r.purpose === 'identity')
  const documentId = (await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,file_name,storage_path,intake_requirement_id,intake_generation) values($1,$2,'identity','pending.pdf',$3,$4,$5) returning id", [item.id, org, `${org}/${item.id}/pending.pdf`, requirement.id, requirement.generation])).rows[0].id
  await db.transaction(async (tx) => { await tx.exec(`select set_config('test.actor','${actor}',true)`); await tx.query("select rental_record_application_review($1,3,'start_review','{}')", [item.id]) })
  const current = (await item.request('GET')).body.application
  expect(current.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'identity').state).toBe('missing')
  expect(current.requirements.find((r) => r.id === requirement.id).state).toBe('missing')
  const assigned = await client.rpc('rental_attach_submitted_document', { p_application_id: item.id, p_expected_version: current.version, p_document_id: documentId, p_requirement_id: requirement.id, p_generation: requirement.generation })
  expect(assigned.error).toBeNull()
  const reopened = (await item.request('GET')).body.application
  expect(reopened.requirements.find((r) => r.id === requirement.id).state).toBe('received')
  expect(reopened.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'identity').state).toBe('missing')
})
it('replaces rejected evidence and clears only the affected person’s screening results', async () => {
  const item = await application()
  const requirement = item.submitted.requirements.find((r) => r.subjectId === 'additional-person' && r.purpose === 'identity')
  const uploaded = await item.request('POST', bodyFor(item.submitted, requirement))
  expect(uploaded.status).toBe(201)
  let version = uploaded.body.application.version
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    const review = async (command, payload) => { version = (await tx.query('select rental_record_application_review($1,$2,$3,$4::jsonb) result', [item.id, version, command, JSON.stringify(payload)])).rows[0].result.version }
    for (const subjectId of ['primary', 'additional-person']) await review('screening', { checkType: 'identity', subjectId, status: 'passed', evidenceNote: 'Previous review', expiresAt: '2099-01-01' })
    await review('review_document', { documentId: uploaded.body.document.id, status: 'rejected', note: 'Unreadable' })
  })
  const current = (await item.request('GET')).body.application
  expect(current.requirements.find((r) => r.id === requirement.id).state).toBe('rejected')
  const replacement = await item.request('POST', bodyFor(current, requirement))
  expect(replacement.status, JSON.stringify(replacement.body)).toBe(201)
  expect(replacement.body.application.requirements.find((r) => r.id === requirement.id).state).toBe('received')
  const check = (await db.query("select result_json from rental_application_screening_checks where application_id=$1 and check_type='identity'", [item.id])).rows[0].result_json
  expect(check.subjects.primary.status).toBe('passed')
  expect(check.subjects['additional-person']).toBeUndefined()
  expect((await getRentalApplicationReview(item.id, { client })).submittedSnapshot).toEqual(item.data)
})
it('collects evidence for a previously submitted application without reopening historical cost confirmation', async () => {
  const item = await application()
  // Reproduce a historical submitted row backfilled with zero fee and no new acknowledgement.
  await db.transaction(async (tx) => {
    await tx.exec('alter table rental_applications disable trigger rental_application_cost_integrity')
    await tx.query("update rental_applications set confirmation_json='{}',cost_snapshot_json=jsonb_set(cost_snapshot_json,'{amount}','0'),application_fee_due_at=null,version=version+1 where id=$1", [item.id])
    await tx.exec('alter table rental_applications enable trigger rental_application_cost_integrity')
  })
  const current = (await item.request('GET')).body.application
  expect(current.confirmation).toEqual({})
  const requirement = current.requirements.find((r) => r.subjectId === 'primary' && r.purpose === 'identity')
  const upload = await item.request('POST', bodyFor(current, requirement))
  expect(upload.status, JSON.stringify(upload.body)).toBe(201)
  expect(upload.body.application.confirmation).toEqual({})
  expect(upload.body.application.feeDueAt).toBeNull()
  expect((await getRentalApplicationReview(item.id, { client })).submittedSnapshot).toEqual(item.data)
})
