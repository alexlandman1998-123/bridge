import assert from 'node:assert/strict'
import { createPersistedRentalApplication } from '../rentalApplicationRepository.js'

const calls = []
const fakeClient = {
  from(table) {
    calls.push({ table })
    return {
      insert(payload) {
        calls.push({ payload })
        return {
          select() {
            return {
              async single() {
                return { data: { id: 'application-1', organisation_id: 'org-1', lead_id: payload.lead_id, vacancy_id: 'vacancy-1', unit_id: 'unit-1', applicant_party_id: null, status: 'draft', version: 1, application_data: {}, updated_at: null }, error: null }
              },
            }
          },
        }
      },
    }
  },
}

const application = await createPersistedRentalApplication({ organisationId: 'org-1', leadId: 'lead-1', vacancyId: 'vacancy-1', unitId: 'unit-1' }, { client: fakeClient })
assert.equal(calls[0].table, 'rental_applications')
assert.equal(calls[1].payload.lead_id, 'lead-1')
assert.equal(application.leadId, 'lead-1')

console.log('Rental application repository linkage checks passed.')
