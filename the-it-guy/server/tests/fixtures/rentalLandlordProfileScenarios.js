import { selectLandlordSignatory } from '../../../src/services/rentals/rentalLandlordSignatories.js'

// Independent, complete capture examples for all five legal structures and both
// foreign/other classifications. No hosted identities, documents or credentials.
export const landlordLegalStructures = ['individual', 'company', 'trust', 'close_corporation', 'multiple_owners']
export const landlordAcceptanceScenarios = landlordLegalStructures.flatMap(structure =>
  [structure, 'foreign_owner', 'other_entity'].map(type => ({ label: type === structure ? type : `${type}/${structure}`, type, structure })),
)
export function landlordAcceptanceProfile(scenario, reference) {
  const { type, structure } = scenario
  let profile = {
    type, name: `Acceptance ${reference}`, email: `${reference}@example.test`, phone: '0821234567',
    residentialAddress: '10 Owner Road, Pretoria', taxNumber: 'TAX-KEEP', vatRegistered: 'yes', vatNumber: 'VAT-KEEP',
    notes: 'PRIVATE agent notes', people: [],
    ...(type !== structure ? { legalStructure: structure } : {}),
    ...(type === 'foreign_owner' ? { country: 'Canada' } : {}),
    ...(type === 'other_entity' ? { otherEntityDescription: 'Agent confirmed ownership arrangement' } : {}),
  }
  if (structure === 'unresolved') return profile
  if (structure === 'individual') return { ...profile, idNumber: 'OWNER-PASSPORT', maritalStatus: 'married', maritalRegime: 'in_community', spouseName: 'Spouse', spouseIdNumber: 'SPOUSE-ID', hasRepresentative: 'no' }
  const role = { company: 'Director', trust: 'Trustee', close_corporation: 'Member', multiple_owners: 'Owner' }[structure]
  const person = { id: 'person-one', name: `${role} One`, role, idNumber: 'PERSON-ID', residentialAddress: '11 Person Road', email: 'person@example.test', phone: '0831234567', ownershipShare: '60', signingAuthority: true, internalReference: 'PRIVATE person reference' }
  profile = {
    ...profile, registrationNumber: 'ENTITY-REG', hasRepresentative: 'yes', authorityBasis: 'RESOLUTION-1', resolutionDate: '2026-10-01',
    people: [person, ...(structure === 'multiple_owners' ? [{ ...person, id: 'person-two', name: 'Owner Two', ownershipShare: '40', signingAuthority: false }] : [])],
  }
  return selectLandlordSignatory(profile, person.id)
}
