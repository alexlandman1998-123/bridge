import { randomUUID, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, org, actor, unit, vacancy } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
import { getRentalApplicationReview } from '../../src/services/rentals/rentalApplicationRepository.js'
let db, client
const legacyId = randomUUID()
beforeAll(async () => {
  db = await rentalOnboardingDatabase()
  await db.exec(`create function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select case when auth.uid()='${actor}'::uuid and workspace_id='${org}'::uuid then coalesce(nullif(current_setting('test.workspace_role',true),''),'owner') end $$;
    create table rental_application_access_tokens(id uuid default gen_random_uuid(),application_id uuid,token_hash text,expires_at timestamptz,revoked_at timestamptz,last_accessed_at timestamptz,subject_id text);
    alter table organisations add column name text,add column display_name text,add column logo_url text;
    create table organisation_settings(organisation_id uuid,settings_json jsonb);`)
  await db.query("insert into rental_applications(id,organisation_id,unit_id,vacancy_id,application_data) values($1,$2,$3,$4,'{}')", [legacyId, org, unit, vacancy])
  const legacyRequirements = (await db.query("select purpose from rental_onboarding_requirement_summaries where application_id=$1 and active and required", [legacyId])).rows
  for (const requirement of legacyRequirements) await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,file_name) values($1,$2,$3,'legacy evidence.pdf')", [legacyId, org, requirement.purpose])
  await db.query("update rental_applications set application_data=application_data where id=$1", [legacyId])
  await db.query("update rental_applications set status='submitted',submitted_at=now() where id=$1", [legacyId])
  await db.query("update rental_applications set status='under_review' where id=$1", [legacyId])
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261007194611_rental_application_cost_confirmation.sql', import.meta.url), 'utf8'))
  client = rentalOnboardingClient(db, {}, actor)
}, 20000)
afterAll(async () => { await db?.close() })
async function settings(amount, version, instructions = 'Use your application reference when paying.') {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated; select set_config('test.actor','${actor}',true)`)
    return (await tx.query('select rental_save_application_fee_settings($1,$2,$3,$4) result', [org, amount, instructions, version])).rows[0].result
  })
}
async function draft() {
  const id = randomUUID(), token = `costs-${id}`
  await db.query("insert into rental_applications(id,organisation_id,unit_id,vacancy_id,application_data) values($1,$2,$3,$4,$5::jsonb)", [id, org, unit, vacancy, JSON.stringify({ property: { title: 'Selected home', monthlyRent: 10000, depositAmount: 20000 } })])
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at) values($1,$2,'2099-01-01')", [id, createHash('sha256').update(token).digest('hex')])
  const request = (method, body) => handlePublicRentalApplication({ method, body, token, env: { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }, clientFactory: () => client })
  return { id, request }
}
it('limits settings to this organisation’s administrators and rejects invalid or stale fees', async () => {
  expect(await settings(350, 0)).toMatchObject({ amount: 350, version: 1 })
  await expect(settings(400, 0)).rejects.toThrow(/Reload/)
  await expect(settings(-1, 1)).rejects.toThrow(/non-negative/)
  await expect(settings(1.234, 1)).rejects.toThrow(/decimal/)
  await expect(settings(350, 1, '')).rejects.toThrow(/instructions/)
  await db.exec("select set_config('test.workspace_role','agent',false)")
  await expect(settings(400, 1)).rejects.toThrow(/administrators/)
  await db.exec("select set_config('test.workspace_role','owner',false)")
  await db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated; select set_config('test.actor','${randomUUID()}',true)`)
    expect((await tx.query('select * from rental_application_fee_settings')).rows).toHaveLength(0)
    await expect(tx.query('select rental_save_application_fee_settings($1,350,$2,1)', [org, 'Pay'])).rejects.toThrow(/administrators/)
  })
})
it('freezes fees, records server-owned confirmation, exposes it to agents and makes it due only on submission', async () => {
  const first = await draft()
  const initial = await first.request('GET')
  expect(initial.body.application.costs).toMatchObject({ amount: 350, settingsVersion: 1 })
  expect(initial.body.application.feeDueAt).toBeNull()
  await settings(0, 1, '')
  const second = await draft()
  expect((await second.request('GET')).body.application.costs.amount).toBe(0)
  expect((await first.request('GET')).body.application.costs.amount).toBe(350)
  expect((await first.request('PATCH', { action: 'confirm_context', version: 1, propertyAccepted: true, costsAccepted: true })).status).toBe(400)
  expect((await first.request('PUT', { action: 'submit', version: 1 })).body.error).toMatch(/Confirm the property/)
  expect((await first.request('PATCH', { version: 1, patch: { identity: { firstName: 'Tenant' } } })).status).toBe(400)
  expect((await first.request('POST', { action: 'prepare_upload', version: 1 })).status).toBe(400)
  const confirmed = await first.request('PATCH', { action: 'confirm_context', version: 1, propertyAccepted: true, costsAccepted: true, privacyAccepted: true, costs: { amount: 1 }, property: { title: 'Forged' } })
  expect(confirmed.status).toBe(200)
  expect(confirmed.body.application.confirmation).toMatchObject({ source: 'applicant', costs: { amount: 350 }, property: { title: 'Selected home' } })
  expect((await first.request('PATCH', { action: 'confirm_context', version: 1, propertyAccepted: true, costsAccepted: true, privacyAccepted: true })).status).toBe(409)
  await expect(db.query("update rental_applications set cost_snapshot_json='{}' where id=$1", [first.id])).rejects.toThrow(/protected/)
  const required = (await db.query("select purpose from rental_onboarding_requirement_summaries where application_id=$1 and active and required", [first.id])).rows
  for (const requirement of required) await db.query("insert into rental_application_documents(application_id,organisation_id,document_type,file_name) values($1,$2,$3,'local evidence.pdf')", [first.id, org, requirement.purpose])
  await db.query("update rental_applications set application_data=application_data where id=$1", [first.id])
  await db.query("update rental_applications set status='submitted',submitted_at=now(),version=version+1 where id=$1", [first.id])
  const review = await getRentalApplicationReview(first.id, { client })
  expect(review.costs.amount).toBe(350)
  expect(review.confirmation.costs.amount).toBe(350)
  expect(review.feeDueAt).toBeTruthy()
  expect((await first.request('GET')).body.application.feeDueAt).toBeTruthy()
  const originalDue = review.feeDueAt
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    await tx.query("select rental_record_application_review($1,3,'request_changes','{\"message\":\"Please correct your phone number\"}'::jsonb)", [first.id])
  })
  await db.query("update rental_applications set status='submitted',submitted_at=now(),version=version+1 where id=$1", [first.id])
  expect((await first.request('GET')).body.application.feeDueAt).toEqual(originalDue)
})
it('blocks a confirmation that no longer matches the property, and agent-authored acknowledgements', async () => {
  const item = await draft()
  await item.request('PATCH', { action: 'confirm_context', version: 1, propertyAccepted: true, costsAccepted: true, privacyAccepted: true })
  await db.query("update rental_applications set application_data=jsonb_set(application_data,'{property,title}','\"Changed home\"') where id=$1", [item.id])
  await expect(db.query("update rental_applications set status='submitted' where id=$1", [item.id])).rejects.toThrow(/Confirm the property/)
  await db.transaction(async (tx) => {
    await tx.exec(`select set_config('test.actor','${actor}',true)`)
    await expect(tx.query("update rental_applications set confirmation_json='{}' where id=$1", [item.id])).rejects.toThrow(/onboarding endpoint/)
  })
})

it('does not retroactively charge an existing application under review', async () => {
  const legacy = (await db.query('select cost_snapshot_json,application_fee_due_at from rental_applications where id=$1', [legacyId])).rows[0]
  expect(legacy.cost_snapshot_json).toMatchObject({ amount: 0, settingsVersion: 0 })
  expect(legacy.application_fee_due_at).toBeNull()
})
