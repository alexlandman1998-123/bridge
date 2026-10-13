import { normalizeSellerProfileType } from './sellerPartyAuthorityContract.js'

const text = (value) => String(value ?? '').trim()

// The legal owner determines the questions; a company's signatory is still a person.
export function getSellerFicaDeclarationGroups(profileType) {
  const type = normalizeSellerProfileType(profileType)
  const personal = ['individual', 'married', 'multiple_owners', 'foreign_individual', 'power_of_attorney'].includes(type)
  const business = ['company', 'close_corporation', 'foreign_company', 'other'].includes(type)
  return [
    { title: 'Identity and tax', fields: ['idType', 'saResident', 'incomeTaxNumber', ...(personal ? ['maritalStatus'] : [])] },
    ...(personal ? [{ title: 'Employment and occupation', fields: ['occupation', 'employer', 'jobTitle'] }] : []),
    ...(business ? [{ title: 'Business activity', fields: ['occupation', 'industryOfBusiness', 'countriesOfTrade', 'dualUseGoods', 'armsWeapons'] }] : []),
    ...(!personal && !business ? [{ title: 'Representative occupation', fields: ['occupation'] }] : []),
    { title: 'Funds and declarations', fields: ['sourceOfWealth', 'sourceOfIncome', 'politicallyInfluentialPerson', 'actingOnBehalfOfAnother', ...(type === 'deceased_estate' ? ['heirInEstate'] : [])] },
    { title: 'Banking details', fields: ['bankName', 'accountName', 'accountNumber', 'accountType'] },
  ]
}

export function normalizeSellerFicaIdType(value) {
  const valueKey = text(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['id', 'sa_id', 'sa_identity', 'south_african_id', 'south_african_identity_document'].includes(valueKey)) return 'sa_id'
  if (['passport', 'foreign_passport'].includes(valueKey)) return 'passport'
  if (['refugee_id', 'refugee_identity_document'].includes(valueKey)) return 'refugee_id'
  return text(value)
}

export function sellerYesNoValue(value) {
  const normalized = text(value).toLowerCase()
  if (['yes', 'true', '1'].includes(normalized)) return 'yes'
  if (['no', 'false', '0'].includes(normalized)) return 'no'
  return ''
}

export function sellerFicaBranch(form = {}) {
  const branch = text(form.branch || form.ownerStructureType || form.owner_structure_type || form.ownershipType || form.ownership_type).toLowerCase()
  if (branch.includes('company') || branch === 'close_corporation') return 'company'
  if (branch.includes('trust')) return 'trust'
  return branch
}

export function getSellerFicaOnboardingMissing(form = {}) {
  const branch = sellerFicaBranch(form)
  const missing = []
  if (!text(form.occupation)) missing.push('Occupation or business activity')
  const exposure = sellerYesNoValue(form.politicallyExposedPerson ?? form.politically_exposed_person)
  if (!text(form.sourceOfFunds ?? form.source_of_funds)) missing.push('Source of funds / wealth')
  if (!exposure) missing.push('Political exposure declaration')
  if (exposure === 'yes' && !text(form.politicallyExposedDetails ?? form.politically_exposed_details)) {
    missing.push('Political exposure details')
  }
  const requiredPeople = (people, label) => {
    if (!people.length) {
      missing.push(label)
      return
    }
    if (people.some((person) => !text(person.name || person.firstName || person.first_name) || !text(person.surname || person.lastName || person.last_name) || !text(person.idNumber || person.id_number) || !text(person.nationality) || !text(person.residentialAddress || person.residential_address))) {
      missing.push(`${label}: full name, ID / passport, nationality and residential address`)
    }
  }
  if (branch === 'company') {
    const people = form.companyBeneficialOwners ?? form.company_beneficial_owners
    const owners = Array.isArray(people) ? people : []
    requiredPeople(owners, 'Beneficial owners / controllers')
    if (owners.some((person) => !text(person.ownershipShare ?? person.ownership_share) && !text(person.controlBasis ?? person.control_basis))) {
      missing.push('Beneficial ownership share or control basis')
    }
  }
  if (branch === 'trust') {
    const founders = form.trustFounders ?? form.trust_founders
    const beneficiaries = form.trustBeneficiaries ?? form.trust_beneficiaries
    requiredPeople(Array.isArray(founders) ? founders : [], 'Trust founders')
    if (!text(form.trustBeneficiaryClass ?? form.trust_beneficiary_class)) requiredPeople(Array.isArray(beneficiaries) ? beneficiaries : [], 'Named beneficiaries or beneficiary class')
    else if (Array.isArray(beneficiaries) && beneficiaries.length) requiredPeople(beneficiaries, 'Named beneficiaries')
  }
  return missing
}
