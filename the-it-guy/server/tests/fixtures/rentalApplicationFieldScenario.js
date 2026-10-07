import { RENTAL_APPLICATION_FIELD_GROUPS, RENTAL_APPLICATION_SCHEMA_VERSION } from '../../../src/services/rentals/rentalApplicationFieldContract.js'

// Every applicant-editable field is populated so an added field cannot silently
// disappear between the public API, agent repository and tenancy snapshot.
export function rentalApplicationFieldScenario(type) {
  const data = { schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION }
  for (const group of RENTAL_APPLICATION_FIELD_GROUPS.filter((item) => !item.readOnly)) {
    const fields = Object.fromEntries(group.fields.map((field) => [field.key,
      field.type === 'number' ? 25000 : field.type === 'boolean' ? false : field.type === 'email' ? `${group.key}@example.test` : field.type === 'date' ? '2026-11-01' : `${group.key}-${field.key}`,
    ]))
    data[group.key] = group.collection ? [fields] : fields
  }
  Object.assign(data.entity, { type, primaryContactRole: type === 'trust' ? 'trustee' : 'authorised_signatory' })
  Object.assign(data.identity, { identityType: 'passport', dateOfBirth: '1990-01-01' })
  Object.assign(data.employment, { employmentType: 'employed' })
  Object.assign(data.contacts, { preferredContactMethod: 'email' })
  Object.assign(data.household, { occupantCount: 2, leasePeriodMonths: 12, pets: 'no', guarantorRequired: false })
  Object.assign(data.income, { otherIncome: 0, monthlyObligations: 1500 })
  Object.assign(data.rentalHistory, { housingSituation: 'renting' })
  Object.assign(data.people[0], { id: 'additional-person', role: type === 'joint_individuals' ? 'co_tenant' : type === 'trust' ? 'trustee' : type === 'individual' ? 'guarantor' : 'authorised_signatory', identityType: 'passport', employmentType: 'employed' })
  return data
}
