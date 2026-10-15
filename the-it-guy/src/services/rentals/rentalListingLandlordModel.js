import { buildRentalListingEditForm } from './rentalListingEditModel'

const text = (value) => String(value ?? '').trim()
export const listingLandlordFacts = (listing) => listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
export function listingLandlordValues(listing, onboarding = null) {
  const form = buildRentalListingEditForm(listing)
  const facts = listingLandlordFacts(listing)
  const profile = onboarding?.data?.profile || {}
  return Object.fromEntries(['Name', 'Email', 'Phone', 'Type'].map((suffix) => {
    const key = `landlord${suffix}`
    const profileKey = suffix.toLowerCase()
    return [key, text(Object.hasOwn(profile, profileKey) ? profile[profileKey] : Object.hasOwn(facts, key) ? facts[key] : form[key])]
  }))
}

export function buildListingLandlordDiscovery(listing) {
  const form = buildRentalListingEditForm(listing)
  const values = listingLandlordValues(listing)
  return {
    profile: { name: values.landlordName, email: values.landlordEmail, phone: values.landlordPhone, type: values.landlordType || 'individual', people: [] },
    portfolio: [{
      id: `listing-${listing.id}`, listingId: listing.id,
      title: form.propertyAddress, address: form.propertyAddress,
      suburb: form.suburb, city: form.city, province: form.province, postalCode: form.postalCode,
      category: form.propertyCategory, propertyType: form.propertyType,
      expectedMonthlyRent: form.monthlyRent, availableFrom: form.availableFrom,
      bedrooms: form.bedrooms, bathrooms: form.bathrooms, parking: form.parkingBays,
      floorSize: form.floorSize, erfSize: form.erfSize,
      furnished: form.furnishedStatus, petsAllowed: form.petsAllowed,
      unitNumber: form.unitNumber, complexName: form.complexName,
    }],
  }
}

export function listingLandlordOnboardingProgress(onboarding, listingId) {
  if (!onboarding) return null
  const profile = onboarding.data?.profile || {}
  const property = onboarding.data?.portfolio?.find((item) => item.listingId === listingId)
  const sections = [
    { label: 'Landlord name and type', complete: Boolean(text(profile.name) && text(profile.type)) },
    { label: 'Contact details', complete: Boolean(text(profile.email) || text(profile.phone)) },
    { label: 'Property address', complete: Boolean(text(property?.address)) },
  ]
  const captured = sections.filter((section) => section.complete).length
  const required = (onboarding.requirements || []).filter((row) => row.active && (row.purpose === 'property_disclosure' || row.required && row.mode !== 'preview') && (!row.scopeKey?.startsWith('property:') || row.scopeKey === `property:${property?.id}`))
  const approved = required.filter((row) => {
    const doc = onboarding.documents?.find((item) => item.id === row.documentId)
    return row.state === 'accepted' && doc?.status === 'accepted' && doc.requirement_id === row.id && doc.generation === row.generation && !doc.invalidated_at && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()) && (row.purpose !== 'property_disclosure' || doc.completed_signed === true)
  }).length
  return { sections, captured, total: sections.length, percent: Math.round(captured / sections.length * 100), documents: { approved, total: required.length } }
}
