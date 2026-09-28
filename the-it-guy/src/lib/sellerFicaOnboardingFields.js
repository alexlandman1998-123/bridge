const text = (value) => String(value ?? '').trim()

export function sellerFicaBranch(form = {}) {
  const branch = text(form.branch || form.ownerStructureType || form.ownershipType).toLowerCase()
  if (branch.includes('company') || branch === 'close_corporation') return 'company'
  if (branch.includes('trust')) return 'trust'
  return branch
}

export function getSellerFicaOnboardingMissing(form = {}) {
  const branch = sellerFicaBranch(form)
  const missing = []
  if (!text(form.occupation)) missing.push('Occupation or business activity')
  if (!text(form.sourceOfFunds)) missing.push('Source of funds / wealth')
  if (!['yes', 'no'].includes(text(form.politicallyExposedPerson).toLowerCase())) missing.push('Political exposure declaration')
  if (text(form.politicallyExposedPerson).toLowerCase() === 'yes' && !text(form.politicallyExposedDetails)) {
    missing.push('Political exposure details')
  }
  const requiredPeople = (key, label) => {
    const people = Array.isArray(form[key]) ? form[key] : []
    if (!people.length) {
      missing.push(label)
      return
    }
    if (people.some((person) => !text(person.name || person.firstName || person.first_name) || !text(person.surname || person.lastName || person.last_name) || !text(person.idNumber || person.id_number) || !text(person.nationality) || !text(person.residentialAddress || person.residential_address))) {
      missing.push(`${label}: full name, ID / passport, nationality and residential address`)
    }
  }
  if (branch === 'company') {
    requiredPeople('companyBeneficialOwners', 'Beneficial owners / controllers')
    if ((Array.isArray(form.companyBeneficialOwners) ? form.companyBeneficialOwners : []).some((person) => !text(person.ownershipShare) && !text(person.controlBasis))) {
      missing.push('Beneficial ownership share or control basis')
    }
  }
  if (branch === 'trust') {
    requiredPeople('trustFounders', 'Trust founders')
    if (!text(form.trustBeneficiaryClass)) requiredPeople('trustBeneficiaries', 'Named beneficiaries or beneficiary class')
    else if (Array.isArray(form.trustBeneficiaries) && form.trustBeneficiaries.length) requiredPeople('trustBeneficiaries', 'Named beneficiaries')
  }
  return missing
}
