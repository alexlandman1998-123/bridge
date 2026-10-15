const text = value => String(value ?? '').trim()
export const LANDLORD_SIGNATORY_PERSON_FIELDS = {
  authorisedSignatoryName: 'name',
  authorisedSignatoryIdNumber: 'idNumber',
  authorisedSignatoryNationality: 'nationality',
  authorisedSignatoryEmail: 'email',
  authorisedSignatoryPhone: 'phone',
}
export function landlordPersonSignatoryDetails(person = {}) {
  return {
    ...Object.fromEntries(Object.entries(LANDLORD_SIGNATORY_PERSON_FIELDS).map(([profileKey, personKey]) => [profileKey, text(person[personKey])])),
    authorisedSignatoryCapacity: text(person.capacity) || text(person.role),
  }
}
export function selectLandlordSignatory(profile, id) {
  if (!id) return { ...profile, primarySignatoryId: '' }
  const person = (profile.people || []).find(item => item.id === id)
  if (!person) return profile
  return {
    ...profile, primarySignatoryId: id, ...landlordPersonSignatoryDetails(person),
    people: profile.people.map(item => item.id === id ? { ...item, signingAuthority: true } : item),
  }
}
export function updateLandlordPeople(profile, people) {
  const next = { ...profile, people }
  if (!profile.primarySignatoryId) return next
  const selected = people.find(person => person.id === profile.primarySignatoryId && person.signingAuthority === true)
  return selected ? { ...next, ...landlordPersonSignatoryDetails(selected) }
    : { ...next, primarySignatoryId: '', ...landlordPersonSignatoryDetails() }
}
export function landlordSelectedSignatoryErrors(profile) {
  const id = text(profile.primarySignatoryId)
  if (!id) return []
  const person = (Array.isArray(profile.people) ? profile.people : []).find(item => text(item.id) === id)
  if (!person || person.signingAuthority !== true) return ['Choose a current authorised person as the primary signatory, or enter separate signatory details.']
  if (Object.entries(landlordPersonSignatoryDetails(person)).some(([key, value]) => text(profile[key]) !== value)) return ['The selected signatory’s details changed. Reselect the person before saving.']
  return []
}
