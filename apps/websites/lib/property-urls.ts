export type PropertyUrlIdentity = {
  id: string
  title: string
  reference: string
}

function slugifyTitle(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'property'
}

/** A public Arch9 listing reference is stable even when the listing title changes. */
export function isArch9ListingReference(reference: string): boolean {
  return /^A9-[A-Z0-9]{2,12}-[0-9]{6,}$/i.test(reference.trim())
}

export function legacyPropertySlug(property: Pick<PropertyUrlIdentity, 'id' | 'title'>): string {
  return `${slugifyTitle(property.title)}-${property.id}`
}

export function propertySlug(property: PropertyUrlIdentity): string {
  const reference = property.reference.trim().toUpperCase()
  return isArch9ListingReference(reference) ? reference : legacyPropertySlug(property)
}

export function matchesPropertySlug(property: PropertyUrlIdentity, slug: string): boolean {
  const candidate = slug.trim()
  return propertySlug(property).toLowerCase() === candidate.toLowerCase()
    || legacyPropertySlug(property).toLowerCase() === candidate.toLowerCase()
}
