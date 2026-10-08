import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { rentalOnboardingDatabase, actor, org, unit, vacancy } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { rentalApplicationFieldScenario } from '../tests/fixtures/rentalApplicationFieldScenario.js'
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
import { handleRentalAgentDocumentUpload } from './rentalApplicationAgentDocumentApi.js'
import { getRentalApplicationReview, recordRentalApplicationReview } from '../../src/services/rentals/rentalApplicationRepository.js'
import { buildRentalListingTenantMatrix, rentalListingDocumentProgress } from '../../src/services/rentals/rentalListingDocumentMatrixModel.js'
import { uploadRentalListingRequirement, reviewRentalListingDocument } from '../../src/services/rentals/rentalListingDocumentActions.js'
import { uploadRentalApplicationFile } from '../../src/services/rentals/rentalApplicationFileUpload.js'

let db, client, scoped
const files = new Map()
const env = { SUPABASE_URL: 'https://local.test', SUPABASE_ANON_KEY: 'local-anon', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }
const storage = { from: () => ({ remove: async (paths) => { paths.forEach((path) => files.delete(path)); return {} }, info: async (path) => ({ data: files.get(path) }), createSignedUrl: async (path) => ({ data: { signedUrl: `https://local.test/private/${path}` } }), createSignedUploadUrl: async (path) => ({ data: { signedUrl: `https://local.test/${path}` } }) }) }
beforeAll(async () => {
  db = await rentalOnboardingDatabase()
  await db.exec(`create function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select 'owner'::text $$;
    alter table rental_application_documents add column mime_type text, add column file_size_bytes integer;
    create table rental_application_access_tokens(id uuid default gen_random_uuid(),application_id uuid,token_hash text,expires_at timestamptz,revoked_at timestamptz,last_accessed_at timestamptz,subject_id text);
    create unique index consent_retry on rental_application_consents(application_id,consent_type,wording_version);
    alter table organisations add column name text,add column display_name text,add column logo_url text;
    create table organisation_settings(organisation_id uuid,settings_json jsonb);`)
  const migration = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8')
  await db.exec(migration('20261007194611_rental_application_cost_confirmation.sql'))
  const base = migration('20260905141014_rental_applications_and_applicant_access.sql')
  await db.exec(base.slice(base.indexOf('create or replace function public.rental_application_validate_scope()'), base.indexOf('drop trigger if exists trg_rental_applications_updated_at')))
  await db.exec('alter table rental_applications enable row level security')
  await db.exec(base.match(/create policy rental_applications_scoped[\s\S]*?;/)[0])
  await db.query("insert into rental_application_fee_settings(organisation_id,amount,payment_instructions) values($1,350,'Payment instructions')", [org])
  await db.exec(migration('20261007204950_rental_application_document_packs.sql'))
  await db.exec(migration('20261007212433_rental_empty_document_pack_readiness.sql'))
  client = rentalOnboardingClient(db, storage, actor)
  scoped = rentalOnboardingClient(db, storage, actor, true)
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    expect(options.method).toBe('PUT')
    files.set(new URL(url).pathname.slice(1), { size: options.body.size, contentType: options.headers['Content-Type'] })
    return { ok: true }
  }))
}, 20000)
afterAll(async () => { vi.unstubAllGlobals(); await db?.close() })

it('uploads, reviews and replaces the real saved pack through scoped, versioned commands', async () => {
  const id = randomUUID(), token = `matrix-${id}`
  const data = { ...rentalApplicationFieldScenario('individual'), property: { title: 'Selected home', monthlyRent: 11000, depositAmount: 22000 } }
  await db.query('insert into rental_applications(id,organisation_id,unit_id,vacancy_id,application_data) values($1,$2,$3,$4,$5::jsonb)', [id, org, unit, vacancy, JSON.stringify(data)])
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at) values($1,$2,'2099-01-01')", [id, createHash('sha256').update(token).digest('hex')])
  const publicRequest = (method, body) => handlePublicRentalApplication({ method, body, token, env, clientFactory: () => client })
  expect((await publicRequest('PATCH', { action: 'confirm_context', version: 1, propertyAccepted: true, costsAccepted: true, privacyAccepted: true })).status).toBe(200)
  expect((await publicRequest('PUT', { action: 'submit', version: 2, declarationAccepted: true, consents: ['privacy', 'credit_check', 'identity_verification'] })).status).toBe(200)
  const read = async () => buildRentalListingTenantMatrix(await getRentalApplicationReview(id, { client: scoped }))
  const income = (section) => section.rows.find((item) => item.purpose === 'proof_of_income' && item.subjectId === 'primary')
  const agentRequest = async (application, body) => {
    const result = await handleRentalAgentDocumentUpload({ method: 'POST', headers: { authorization: 'Bearer fixture-agent' }, body: { ...body, applicationId: application.id }, env, clientFactory: (_url, _key, options) => options.global ? scoped : client })
    if (result.status !== 201) throw new Error(result.body.error)
    return result.body
  }
  const dependencies = {
    uploadRentalApplicationEvidence: async (application, file, slot) => {
      const result = await uploadRentalApplicationFile(file, slot, application.version, (body) => agentRequest(application, body))
      return { ...result, application: { ...application, ...result.application } }
    },
    recordRentalApplicationReview: (values) => recordRentalApplicationReview(values, { client: scoped }),
  }
  let section = await read()
  const initial = section
  const selected = (name) => ({ name, type: 'application/pdf', size: 20 })
  await uploadRentalListingRequirement('tenant', section, income(section), [selected('one.pdf'), selected('two.pdf')], dependencies)
  section = await read()
  expect(section.application.version).toBe(initial.application.version + 2)
  expect(income(section).documents).toHaveLength(2)
  expect(new Set(income(section).documents.map((file) => file.intake_bundle_id)).size).toBe(1)
  const pack = income(section).documents
  await reviewRentalListingDocument('tenant', section, pack[0], { status: 'accepted', note: 'First month checked' }, dependencies)
  section = await read()
  expect(income(section).state).toBe('received')
  await reviewRentalListingDocument('tenant', section, pack[1], { status: 'accepted', note: 'Second month checked' }, dependencies)
  section = await read()
  expect(income(section).state).toBe('accepted')
  expect(rentalListingDocumentProgress({ tenants: [section] }).complete).toBe(1)
  await expect(uploadRentalListingRequirement('tenant', section, income(section), [selected('blocked.pdf')], dependencies)).rejects.toThrow('locked')
  await reviewRentalListingDocument('tenant', section, pack[1], { status: 'rejected', note: 'Correction needed' }, dependencies)
  section = await read()
  expect(income(section).state).toBe('rejected')
  const storageBefore = files.size
  await expect(uploadRentalListingRequirement('tenant', initial, income(initial), [selected('stale.pdf')], dependencies)).rejects.toThrow('changed')
  expect(files.size).toBe(storageBefore)
  await uploadRentalListingRequirement('tenant', section, income(section), [selected('replacement.pdf')], dependencies)
  section = await read()
  expect(income(section).documents.map((file) => file.name)).toEqual(['replacement.pdf'])
  expect(income(section).state).toBe('received')
  expect(section.application.documents).toHaveLength(3)
  const denied = await handleRentalAgentDocumentUpload({ method: 'GET', headers: { authorization: 'Bearer fixture-agent' }, body: { applicationId: id, documentId: pack[0].id }, env, clientFactory: (_url, _key, options) => options.global ? rentalOnboardingClient(db, storage, randomUUID(), true) : client })
  expect(denied.status).toBe(404)
}, 20000)
