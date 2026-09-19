export const SELLER_SUBJECT_OWNERSHIP_FIXTURES = Object.freeze([
  {
    key: 'individual',
    label: 'Individual',
    form: { ownerEntityType: 'natural_person', ownerStructureType: 'individual', ownershipType: 'individual' },
    expectedBranch: 'individual',
    listingProfileSupported: true,
  },
  {
    key: 'married',
    label: 'Married individual',
    form: { ownerEntityType: 'natural_person', ownerStructureType: 'married_cop', ownershipType: 'married_cop' },
    expectedBranch: 'married',
    listingProfileSupported: true,
  },
  {
    key: 'multiple_owners',
    label: 'Multiple owners',
    form: { ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners', ownershipType: 'multiple_owners' },
    expectedBranch: 'multiple_owners',
    listingProfileSupported: true,
  },
  {
    key: 'company',
    label: 'Company',
    form: { ownerEntityType: 'company', ownerStructureType: 'company', ownershipType: 'company' },
    expectedBranch: 'company',
    listingProfileSupported: true,
  },
  {
    key: 'trust',
    label: 'Trust',
    form: { ownerEntityType: 'trust', ownerStructureType: 'trust', ownershipType: 'trust' },
    expectedBranch: 'trust',
    listingProfileSupported: true,
  },
  {
    key: 'deceased_estate',
    label: 'Deceased estate',
    form: { ownerEntityType: 'deceased_estate', ownerStructureType: 'deceased_estate', ownershipType: 'deceased_estate' },
    expectedBranch: 'deceased_estate',
    listingProfileSupported: true,
  },
  {
    key: 'foreign_individual',
    label: 'Foreign individual',
    form: { ownerEntityType: 'foreign', ownerStructureType: 'foreign_individual', ownershipType: 'foreign_individual' },
    expectedBranch: 'individual',
    listingProfileSupported: true,
  },
  {
    key: 'power_of_attorney',
    label: 'Power of attorney',
    form: { ownerEntityType: 'natural_person', ownerStructureType: 'power_of_attorney', ownershipType: 'power_of_attorney' },
    expectedBranch: 'power_of_attorney',
    listingProfileSupported: false,
    knownGap: 'The current listing-side profile builder has no power-of-attorney branch.',
  },
])

export const SELLER_SUBJECT_PHASE0_KNOWN_GAPS = Object.freeze([
  'The seller lead profile compatibility resolver defaults an unresolved seller to individual.',
  'The listing-side profile builder does not yet model a power-of-attorney seller branch.',
  'Lead, listing, and onboarding currently resolve ownership from separate compatibility paths.',
])
