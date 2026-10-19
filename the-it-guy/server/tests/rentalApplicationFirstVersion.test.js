import { createHash } from 'node:crypto'
import { handlePublicRentalApplication } from '../services/publicRentalApplicationApi.js'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { rentalTenantApplicationDatabase, org, lead, actor, listing } from './fixtures/rentalTenantApplicationDatabase.js'
import { rentalOnboardingClient } from './fixtures/rentalOnboardingClient.js'
import { ensureRentalListingVacancy } from '../../src/services/rentals/rentalListingInventoryRepository.js'
import { prepareRentalTenantApplication } from '../../src/services/rentals/rentalTenantApplicationService.js'
import { getRentalApplicationFeeSettings, saveRentalApplicationFeeSettings } from '../../src/services/rentals/rentalApplicationFeeSettingsService.js'
import { mergeRentalApplicationData, publicRentalApplicationData } from '../../src/services/rentals/rentalApplicationFieldContract.js'
import { savePersistedRentalApplication } from '../../src/services/rentals/rentalApplicationRepository.js'
let db, client, application, vacancyId
beforeAll(async () => {
  db = await rentalTenantApplicationDatabase()
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261019204416_rental_application_first_version.sql', import.meta.url), 'utf8'))
  client = rentalOnboardingClient(db, {}, actor, true)
  await db.query("select set_config('test.actor',$1,false)", [actor])
  vacancyId = (await ensureRentalListingVacancy(listing, org, { client })).vacancyId
  await db.query("update rental_vacancies set status='preparing' where id=$1", [vacancyId])
  await db.query("update rental_vacancies set status='marketing' where id=$1", [vacancyId])
}, 20000)
afterAll(async () => { await db?.close() })
it('saves optional guidance with version guards and no default affordability threshold', async () => {
  const initial = await getRentalApplicationFeeSettings(org, { client })
  expect(initial.policy).toEqual({})
  const saved = await saveRentalApplicationFeeSettings(org, { ...initial, policy: { maxRentToNetIncomePercent: '35', documentMonths: '3', sponsorPolicy: 'manual_review', guarantorPolicy: 'considered' } }, { client })
  expect(saved.application_policy_json).toMatchObject({ maxRentToNetIncomePercent: 35, documentMonths: 3 })
  await expect(saveRentalApplicationFeeSettings(org, { ...initial, policy: {} }, { client })).rejects.toThrow(/changed/)
  await expect(saveRentalApplicationFeeSettings(org, { ...initial, version: saved.version, policy: { documentMonths: 1.5 } }, { client })).rejects.toThrow(/whole document/)
})
it('prefills qualification once, excludes permissions and internal notes, and snapshots policy', async () => {
  await db.query(`update leads set raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{qualification}',$2::jsonb) where lead_id=$1`, [lead, JSON.stringify({ occupationDate: '2026-12-01', occupants: 3, pets: 'No pets', employmentStatus: 'Self-employed', depositAvailable: 'No', screeningConsent: 'Yes', additionalNotes: 'Private call notes' })])
  application = await prepareRentalTenantApplication(org, lead, vacancyId, { client })
  expect(application.data.household).toMatchObject({ intendedOccupationDate: '2026-12-01', occupantCount: '3', pets: 'no' })
  expect(application.data.employment.employmentType).toBe('self_employed')
  expect(application.data.income.depositAvailable).toBe(false)
  expect(application.data.applicationPolicy.documentMonths).toBe(3)
  expect(JSON.stringify(publicRentalApplicationData(application.data))).not.toMatch(/screeningConsent|Private call notes/)
  application = await savePersistedRentalApplication(application, { household: { occupantCount: 2, pets: 'yes' } }, { client })
  const settings = await getRentalApplicationFeeSettings(org, { client })
  await saveRentalApplicationFeeSettings(org, { ...settings, policy: { documentMonths: 6 } }, { client })
  const reopened = await prepareRentalTenantApplication(org, lead, vacancyId, { client })
  expect(reopened.data.household).toMatchObject({ occupantCount: 2, pets: 'yes' })
  expect(reopened.data.applicationPolicy.documentMonths).toBe(3)
})
it('roundtrips answers, normalises sponsor evidence, and protects policy against all application edits', async () => {
  const patch = { income: { netMonthlyIncome: 25000, grossMonthlyIncome: 32000, incomeFrequency: 'monthly', debtRepayments: 2000, livingExpenses: 6000, otherObligations: 500, rentPayer: 'mixed', depositPayer: 'sponsor', rentContribution: 7000 }, employment: { contractType: 'fixed_term', contractEndDate: '2027-12-01', verificationContactEmail: 'hr@example.test' }, rentalHistory: { firstTimeRenter: true, monthsAtAddress: 24 }, occupants: [{ id: 'adult-one', firstName: 'Other', lastName: 'Adult', signsLease: false }], people: [{ id: 'sponsor', role: 'sponsor', firstName: 'Support', lastName: 'Person', identityNumber: 'LOCAL', email: 'support@example.test', monthlyIncome: 30000, rentContribution: 4000, depositContribution: 22000, supportDuration: 'Full lease' }] }
  application = await savePersistedRentalApplication(application, patch, { client })
  const publicData = publicRentalApplicationData(application.data)
  expect(publicData.income).toMatchObject({ netMonthlyIncome: 25000, monthlyIncome: 25000, incomeBasis: 'net' })
  expect(publicData.people[0]).toMatchObject({ role: 'sponsor', contributesToAffordability: true, rentContribution: 4000 })
  expect(publicData.occupants).toEqual(patch.occupants)
  expect(mergeRentalApplicationData(application.data, { applicationPolicy: { documentMonths: 1 } }, { source: 'applicant' }).applicationPolicy.documentMonths).toBe(3)
  await expect(savePersistedRentalApplication(application, { applicationPolicy: { documentMonths: 1 } }, { client })).rejects.toThrow(/protected/)
  const token = 'isolated-tenant-first-version'
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at) values($1,$2,'2099-01-01')", [application.id, createHash('sha256').update(token).digest('hex')])
  const request = (method, body) => handlePublicRentalApplication({ method, body, token, env: { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }, clientFactory: () => rentalOnboardingClient(db, {}, actor) })
  const confirmation = await request('PATCH', { action: 'confirm_context', version: application.version, propertyAccepted: true, costsAccepted: true, privacyAccepted: true })
  expect(confirmation.status).toBe(200)
  const publicSaved = await request('PATCH', { version: confirmation.body.application.version, patch: { income: { netMonthlyIncome: 27000 }, applicationPolicy: { documentMonths: 1 }, occupants: patch.occupants } })
  expect(publicSaved.status).toBe(200)
  expect(publicSaved.body.application.data.income).toMatchObject({ netMonthlyIncome: 27000, monthlyIncome: 27000 })
  const publicReopened = await request('GET')
  expect(publicReopened.body.application.data.applicationPolicy.documentMonths).toBe(3)
  expect(publicReopened.body.application.data.occupants).toEqual(patch.occupants)
  await db.exec("create or replace function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select 'agent'::text $$;")
  await expect(saveRentalApplicationFeeSettings(org, { amount: 0, paymentInstructions: '', version: 2, policy: {} }, { client })).rejects.toThrow(/administrators/)
})
