import { expect, it } from 'vitest'
import {
  mergeRentalLandlordDiscovery,
  publicRentalLandlordDiscovery,
  rentalLandlordSubmissionErrors,
} from '../rentalLandlordOnboardingModel.js'
const data = {
  profile: {
    type: 'company',
    name: 'Company',
    email: 'a@example.test',
    notes: 'private',
    people: [{ id: 'person', name: 'Director', notes: 'private-person' }],
  },
  portfolio: [
    {
      id: 'one',
      address: 'One Road',
      canonicalPropertyId: 'managed',
      listingId: 'listing',
      currentTenant: 'private',
    },
    { id: 'two', address: 'Two Road' },
  ],
}
it('preserves internal evidence links and private person data in public discovery saves', () => {
  const projected = publicRentalLandlordDiscovery(data)
  expect(projected.profile.notes).toBeUndefined()
  expect(projected.profile.people[0].notes).toBeUndefined()
  projected.profile.people[0].name = 'New director'
  projected.portfolio[0].canonicalPropertyId = 'forged'
  const next = mergeRentalLandlordDiscovery(data, projected, {
    publicSource: true,
  })
  expect(next.profile.people[0]).toMatchObject({
    name: 'New director',
    notes: 'private-person',
  })
  expect(next.portfolio[0]).toMatchObject({
    canonicalPropertyId: 'managed',
    listingId: 'listing',
    currentTenant: 'private',
  })
})
it('rejects duplicate or reserved people and property references instead of merging evidence slots', () => {
  expect(() =>
    mergeRentalLandlordDiscovery(data, {
      profile: { people: [{ id: 'primary' }] },
    }),
  ).toThrow('unique reference')
  expect(() =>
    mergeRentalLandlordDiscovery(data, {
      portfolio: [{ id: 'one' }, { id: 'one' }],
    }),
  ).toThrow('unique reference')
  expect(() =>
    mergeRentalLandlordDiscovery(data, {
      profile: { people: [{ id: 'x' }, { id: 'x' }] },
    }),
  ).toThrow('unique reference')
})
it('requires the agent to change the property set and does not infer an exceptional landlord type', () => {
  expect(() =>
    mergeRentalLandlordDiscovery(
      data,
      { portfolio: [{ id: 'one' }] },
      { publicSource: true },
    ),
  ).toThrow('agent')
  expect(
    rentalLandlordSubmissionErrors({
      ...data,
      profile: { ...data.profile, type: 'foreign_owner' },
    }),
  ).toContain('Resolve the landlord type with your agent.')
  expect(rentalLandlordSubmissionErrors(data)).toEqual([])
})
