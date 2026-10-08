import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org, unit, vacancy } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { mapRentalRequirement } from '../../src/services/rentals/rentalSavedRequirementModel.js'
import { buildRentalListingTenantMatrix } from '../../src/services/rentals/rentalListingDocumentMatrixModel.js'

it('reads actual saved requirements and files through the scoped view without changing evidence', async () => {
  const db = await rentalOnboardingDatabase()
  try {
    // The lightweight fixture omits application RLS. Install the existing
    // production policy so the view's permission test exercises the real boundary.
    const foundation = readFileSync(new URL('../../../supabase/migrations/20260905141014_rental_applications_and_applicant_access.sql', import.meta.url), 'utf8')
    await db.exec('alter table rental_applications enable row level security;')
    await db.exec(foundation.match(/create policy rental_applications_scoped[\s\S]*?;/)[0])
    const listingId = randomUUID(), applicationId = randomUUID(), otherId = randomUUID(), documentId = randomUUID()
    const data = { entity: { type: 'individual' }, identity: { firstName: 'Amy', identityNumber: '123' }, property: { listingId }, income: { monthlyIncome: 10000 } }
    for (const [id, applicationData] of [[applicationId, data], [otherId, { ...data, property: { listingId: randomUUID() } }]]) {
      await db.query('insert into rental_applications(id,organisation_id,unit_id,vacancy_id,application_data) values($1,$2,$3,$4,$5::jsonb)', [id, org, unit, vacancy, JSON.stringify(applicationData)])
    }
    await db.query("insert into rental_application_documents(id,organisation_id,application_id,document_type,file_name) values($1,$2,$3,'identity','amy-id.pdf')", [documentId, org, applicationId])
    await db.query('update rental_applications set application_data=$2::jsonb where id=$1', [applicationId, JSON.stringify({ ...data, documentLinks: [{ documentId, subjectId: 'primary', purpose: 'identity', source: 'agent' }] })])
    const before = (await db.query('select count(*) count from rental_onboarding_evidence_assignments')).rows[0].count
    const read = (userId, organisationId = org) => db.transaction(async (tx) => {
      await tx.query("select set_config('test.actor',$1,true)", [userId])
      await tx.exec('set local role authenticated')
      return (await tx.query(`select id, organisation_id, lead_id, status, version, application_data, submitted_at, updated_at, documents, requirements
        from rental_application_review_summaries where organisation_id=$1 and application_data->'property'->>'listingId'=$2 order by updated_at desc,id limit 100`, [organisationId, listingId])).rows
    })
    const rows = await read(actor)
    expect(rows.map((row) => row.id)).toEqual([applicationId])
    const matrix = buildRentalListingTenantMatrix({ id: rows[0].id, data: rows[0].application_data, documents: rows[0].documents, requirements: rows[0].requirements.map(mapRentalRequirement) })
    expect(matrix.rows.find((row) => row.purpose === 'identity')).toMatchObject({ state: 'received', documents: [{ id: documentId, name: 'amy-id.pdf' }] })
    expect(matrix.rows.find((row) => row.purpose === 'proof_of_income')).toMatchObject({ state: 'missing', documents: [] })
    expect(await read(randomUUID())).toEqual([])
    expect(await read(actor, randomUUID())).toEqual([])
    expect((await db.query('select count(*) count from rental_onboarding_evidence_assignments')).rows[0].count).toBe(before)
  } finally {
    await db.close()
  }
}, 20000)
