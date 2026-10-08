import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { rentalLandlordRequirementDefinitions, rentalTenantRequirementDefinitions } from '../../src/services/rentals/rentalOnboardingRequirementModel.js'
import { mapRentalRequirement } from '../../src/services/rentals/rentalSavedRequirementModel.js'
import { buildRentalListingLandlordMatrix, rentalListingDocumentProgress } from '../../src/services/rentals/rentalListingDocumentMatrixModel.js'

let db, leadId, original, payload
const migration = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const matrixRows = async () => (await db.query('select * from rental_onboarding_requirement_summaries where landlord_lead_id=$1 order by scope_key,subject_id,purpose', [leadId])).rows
async function acceptedEvidence(requirement) {
  const documentId = randomUUID()
  await db.query("insert into rental_landlord_onboarding_documents(id,lead_id,organisation_id,requirement_id,generation,discovery_revision,storage_path,file_name,mime_type,file_size_bytes,source,status,reviewed_by,reviewed_at,review_note,completed_signed) values($1,$2,$3,$4,$5,$6,$7,'evidence.pdf','application/pdf',20,'agent','accepted',$8,now(),'Seeded accepted evidence',$9)", [documentId, leadId, org, requirement.id, requirement.generation, requirement.discovery_revision, `local/${documentId}.pdf`, actor, requirement.purpose === 'property_disclosure'])
  await db.query('update rental_onboarding_requirements set current_landlord_document_id=$2 where id=$1', [requirement.id, documentId])
}
beforeAll(async () => {
  db = await rentalOnboardingDatabase()
  await db.exec('create table rental_application_access_tokens(id uuid primary key default gen_random_uuid(),application_id uuid,token_hash text,expires_at timestamptz,revoked_at timestamptz,last_accessed_at timestamptz)')
  await db.exec(migration('20261007204950_rental_application_document_packs.sql'))
  await db.exec(migration('20261007212433_rental_empty_document_pack_readiness.sql'))
  leadId = randomUUID()
  payload = { rentalCrm: { role: 'landlord', classification: 'rental', landlordProfile: { type: 'individual', name: 'Owner', idNumber: 'OWNER-ID' }, landlordPortfolio: [{ id: 'first', address: 'One Road', listingId: 'listing-one' }, { id: 'second', address: 'Two Road', listingId: 'listing-two' }] } }
  await db.query('insert into leads(lead_id,organisation_id,raw_enquiry_payload) values($1,$2,$3::jsonb)', [leadId, org, JSON.stringify(payload)])
  const rows = await matrixRows()
  await acceptedEvidence(rows.find((row) => row.purpose === 'identity'))
  await acceptedEvidence(rows.find((row) => row.purpose === 'property_disclosure' && row.scope_key === 'property:first'))
  original = await matrixRows()
  expect(original.filter((row) => row.current_landlord_document_id).map((row) => row.state)).toEqual(['accepted', 'accepted'])
  await db.exec(migration('20261008120849_rental_landlord_conditional_document_requirements.sql'))
}, 20000)
afterAll(async () => { await db?.close() })
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value
const normalize = (rows, sql = false) => rows.map((row) => canonical({ subject: sql ? row.subject_id : row.subjectId, scope: sql ? row.scope_key : row.scopeKey, purpose: row.purpose, required: row.required, fingerprint: row.fingerprint })).sort((a, b) => JSON.stringify([a.scope, a.subject, a.purpose]).localeCompare(JSON.stringify([b.scope, b.subject, b.purpose])))

it('keeps SQL and browser conditional definitions identical across landlord and tenant scenarios', async () => {
  for (const type of ['individual', 'multiple_owners', 'company', 'close_corporation', 'trust', 'other_entity']) {
    const scenario = { profile: { type, name: 'Owner', idNumber: 'OWNER-ID', people: [{ id: 'owner-two', name: 'Second owner' }] }, portfolio: [
      { id: 'managed', address: 'One Road', serviceType: 'managed_rental', payoutBeneficiaryType: 'third_party', payoutAccountHolder: 'Trustee', payoutAccountReference: 'reference', billingResponsibility: 'Agent meters', occupancyStatus: 'tenanted', leaseEndDate: '2027-01-01', schemeType: 'hoa' },
      { id: 'letting', address: 'Two Road', serviceType: 'letting_only', ownershipType: 'sectional_title' },
      { id: 'plain', address: 'Three Road' },
    ] }
    const sql = (await db.query('select * from rental_private.landlord_definitions($1::jsonb)', [JSON.stringify(scenario)])).rows
    expect(normalize(sql, true)).toEqual(normalize(rentalLandlordRequirementDefinitions(scenario)))
  }
  for (const type of ['individual', 'joint_individuals', 'company', 'close_corporation', 'trust']) {
    const data = { entity: { type, legalName: 'Entity' }, identity: { firstName: 'Alex' }, rentalHistory: { currentAddress: 'One Road' }, income: { monthlyIncome: 20000 }, people: [{ id: 'signer', role: 'authorised_signatory', firstName: 'Sam', authorityBasis: 'Resolution' }, { id: 'guarantor', role: 'guarantor', monthlyIncome: 30000 }] }
    const policy = { version: 4, extendedRequired: false }
    const sql = (await db.query('select * from rental_private.tenant_definitions($1::jsonb)', [JSON.stringify({ ...data, _documentPolicy: policy })])).rows
    expect(normalize(sql, true)).toEqual(normalize(rentalTenantRequirementDefinitions(data, policy)))
  }
})

it('adds rows only on a discovery save, records one revision and preserves existing accepted base evidence', async () => {
  expect(await matrixRows()).toEqual(original)
  payload.rentalCrm.landlordPortfolio[0] = { ...payload.rentalCrm.landlordPortfolio[0], serviceType: 'managed_rental', payoutBeneficiaryType: 'third_party', payoutAccountHolder: 'Trustee', payoutAccountReference: 'first-account', occupancyStatus: 'tenanted', schemeType: 'hoa' }
  const save = () => db.query('update leads set raw_enquiry_payload=$2::jsonb where lead_id=$1', [leadId, JSON.stringify(payload)])
  await save()
  const rows = await matrixRows()
  const newRows = rows.filter((row) => !original.some((old) => old.id === row.id))
  expect(newRows.map((row) => row.purpose).sort()).toEqual(['existing_tenancy_pack', 'management_information', 'payout_account', 'scheme_rules', 'third_party_payee_authority'])
  for (const old of original) expect(rows.find((row) => row.id === old.id)).toMatchObject({ generation: old.generation, current_landlord_document_id: old.current_landlord_document_id, state: old.state })
  expect(rows.every((row) => row.mode === 'preview')).toBe(true)
  const matrix = buildRentalListingLandlordMatrix({ id: 'listing-one' }, { id: leadId }, { data: { profile: payload.rentalCrm.landlordProfile, portfolio: payload.rentalCrm.landlordPortfolio }, requirements: rows.map(mapRentalRequirement), documents: [] })
  expect(matrix.rows.every((row) => row.scopeKey === 'identity' || row.scopeKey === 'property:first')).toBe(true)
  expect(rentalListingDocumentProgress({ landlords: [matrix] })).toMatchObject({ total: 0, complete: 0 })
  const revisions = (await db.query('select count(*)::int count from rental_onboarding_checklist_revisions where checklist_id=$1', [rows[0].checklist_id])).rows[0].count
  await save()
  expect((await matrixRows()).map((row) => [row.id, row.generation])).toEqual(rows.map((row) => [row.id, row.generation]))
  expect((await db.query('select count(*)::int count from rental_onboarding_checklist_revisions where checklist_id=$1', [rows[0].checklist_id])).rows[0].count).toBe(revisions)
  expect((await db.query('select requirements_json from rental_onboarding_checklist_revisions where checklist_id=$1 order by discovery_revision desc limit 1', [rows[0].checklist_id])).rows[0].requirements_json).toHaveLength(rows.length)
})

it('supersedes only the changed conditional generations and retires branches without deleting evidence history', async () => {
  await acceptedEvidence((await matrixRows()).find((row) => row.purpose === 'payout_account'))
  const before = await matrixRows()
  payload.rentalCrm.landlordPortfolio[0].payoutAccountReference = 'second-account'
  await db.query('update leads set raw_enquiry_payload=$2::jsonb where lead_id=$1', [leadId, JSON.stringify(payload)])
  const changed = await matrixRows()
  for (const old of before) expect(changed.find((row) => row.id === old.id).generation).toBe(old.generation + (['payout_account', 'third_party_payee_authority'].includes(old.purpose) ? 1 : 0))
  expect(changed.find((row) => row.purpose === 'payout_account')).toMatchObject({ state: 'missing', current_landlord_document_id: null })
  payload.rentalCrm.landlordPortfolio[0].currentTenant = 'Replacement tenancy'
  await db.query('update leads set raw_enquiry_payload=$2::jsonb where lead_id=$1', [leadId, JSON.stringify(payload)])
  const tenancyChanged = await matrixRows()
  for (const old of changed) expect(tenancyChanged.find((row) => row.id === old.id).generation).toBe(old.generation + (old.purpose === 'existing_tenancy_pack' ? 1 : 0))
  payload.rentalCrm.landlordPortfolio[0].serviceType = 'letting_only'
  await db.query('update leads set raw_enquiry_payload=$2::jsonb where lead_id=$1', [leadId, JSON.stringify(payload)])
  const retired = await matrixRows()
  expect(retired.filter((row) => ['payout_account', 'third_party_payee_authority', 'management_information', 'existing_tenancy_pack'].includes(row.purpose)).every((row) => !row.active && row.state === 'superseded')).toBe(true)
  expect(retired.find((row) => row.purpose === 'scheme_rules').active).toBe(true)
  expect((await db.query('select count(*)::int count from rental_landlord_onboarding_documents where lead_id=$1', [leadId])).rows[0].count).toBe(3)
  for (const role of ['anon', 'authenticated']) {
    await db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`)
      await expect(tx.query('select * from rental_private.landlord_definitions($1::jsonb)', ['{}'])).rejects.toThrow('permission denied')
    })
  }
})
