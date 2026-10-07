import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { buildTenantIntakeLeadPatch } from '../../src/services/rentals/rentalTenantIntakeModel.js'
import { getRentalCrmLeadMetadata } from '../../src/services/rentals/rentalCrmLeadModel.js'
import { tenantQualificationProgress } from '../../src/services/rentals/rentalTenantWorkspaceModel.js'

const org = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const linkId = '33333333-3333-4333-8333-333333333333'
const answers = { monthlyBudget: '12000', desiredArea: 'Newlands', occupationDate: '2026-11-01', employmentStatus: 'Employed', depositAvailable: 'Yes', screeningConsent: 'No', propertyNeed: 'Apartment', occupants: '2', pets: 'No pets', additionalNotes: '' }
const raw = { portalReference: 'preserve', rentalCrm: { classification: 'rental', role: 'tenant', stage: 'contacted', consents: { privacy: 'granted' }, relationships: { listingId: id }, qualification: { bedrooms: 2 }, outcome: { status: 'open' } } }
const request = { availabilitySlots: [{ date: '2026-10-15', startTime: '10:00', endTime: '11:00' }], timezone: 'Africa/Johannesburg' }
let db
const build = (values = answers) => buildTenantIntakeLeadPatch({ lead_id: id, organisation_id: org, raw_enquiry_payload: raw }, values, request, '2026-10-07T12:00:00Z')
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table leads(lead_id uuid primary key, organisation_id uuid, lead_domain text, status text,
      stage text, notes text, raw_enquiry_payload jsonb, budget numeric, area_interest text, updated_at timestamptz);
    create table buyer_viewing_preference_links(id uuid primary key, lead_id uuid, organisation_id uuid,
      status text, expires_at timestamptz, response jsonb, submitted_at timestamptz, updated_at timestamptz);`)
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261007160802_rental_tenant_qualification_submission.sql', import.meta.url), 'utf8'))
})
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec('delete from buyer_viewing_preference_links; delete from leads;')
  await db.query('insert into leads values($1,$2,\'agency\',\'New Lead\',\'Contacted\',\'Keep existing notes\',$3,0,\'\',now())', [id, org, raw])
  await db.query("insert into buyer_viewing_preference_links values($1,$2,$3,'pending',now()+interval '14 days','{}',null,now())", [linkId, id, org])
})
async function submit(expected = raw) {
  const patch = build()
  return db.query('select rental_submit_tenant_qualification($1,$2,$3,$4,$5,$6)', [linkId, expected, patch.raw_enquiry_payload, { enquiryKind: 'rental', tenantQualification: answers, viewingRequest: request }, patch.budget, patch.area_interest])
}
it('saves qualification and request into the nested rental model without losing portal evidence or advancing stages', async () => {
  const patch = build()
  const metadata = getRentalCrmLeadMetadata({ raw_enquiry_payload: patch.raw_enquiry_payload })
  expect(metadata.qualification).toMatchObject({ monthlyBudget: 12000, desiredArea: 'Newlands', occupants: 2, bedrooms: 2 })
  expect(metadata.consents).toMatchObject({ screening: 'declined', privacy: 'granted' })
  expect(metadata.viewingRequest.status).toBe('requested')
  expect(metadata.stage).toBe('contacted')
  expect(tenantQualificationProgress(metadata).count).toBe(10)
  expect(patch.raw_enquiry_payload.portalReference).toBe('preserve')
  await submit()
  const lead = (await db.query('select * from leads')).rows[0]
  expect(lead.stage).toBe('Contacted')
  expect(lead.notes).toBe('Keep existing notes')
  expect(lead.budget).toBe('12000')
  expect((await db.query('select status from buyer_viewing_preference_links')).rows[0].status).toBe('submitted')
  await expect(submit()).rejects.toThrow(/closed/)
})
it('rejects stale answers without closing the link', async () => {
  await expect(submit({ ...raw, portalReference: 'stale' })).rejects.toThrow(/changed/)
  expect((await db.query('select status from buyer_viewing_preference_links')).rows[0].status).toBe('pending')
  expect((await db.query('select budget from leads')).rows[0].budget).toBe('0')
})
it('rejects expired, missing, foreign and closed lead contexts', async () => {
  await db.exec("update buyer_viewing_preference_links set expires_at=now()-interval '1 day'")
  await expect(submit()).rejects.toThrow(/closed/)
  await db.exec("update buyer_viewing_preference_links set expires_at=now()+interval '1 day'; update leads set status='Lost'")
  await expect(submit()).rejects.toThrow(/unavailable/)
  await db.exec("update leads set status='New Lead', organisation_id='44444444-4444-4444-8444-444444444444'")
  await expect(submit()).rejects.toThrow(/unavailable/)
})
it('rolls back the lead save if closing the link fails', async () => {
  await db.exec("create function reject_link_update() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end $$; create trigger reject_link before update on buyer_viewing_preference_links for each row execute function reject_link_update();")
  try {
    await expect(submit()).rejects.toThrow(/fixture failure/)
    expect((await db.query('select budget from leads')).rows[0].budget).toBe('0')
  } finally { await db.exec('drop trigger reject_link on buyer_viewing_preference_links; drop function reject_link_update();') }
})
it('only grants the transaction to service_role', async () => {
  for (const role of ['anon', 'authenticated']) {
    const result = await db.query("select has_function_privilege($1,'rental_submit_tenant_qualification(uuid,jsonb,jsonb,jsonb,numeric,text)','execute') as allowed", [role])
    expect(result.rows[0].allowed).toBe(false)
  }
})
it('rejects missing questions, invented consent and invalid numbers and dates', () => {
  for (const change of [{ screeningConsent: 'granted' }, { occupants: '1.5' }, { monthlyBudget: '-1' }, { employmentStatus: '' }, { occupationDate: '2026-02-31' }]) expect(() => build({ ...answers, ...change })).toThrow()
})
