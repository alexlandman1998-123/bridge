function normalizeText(value) {
  return String(value ?? '').trim()
}

function preferCanonical(value, fallback = '') {
  const normalized = normalizeText(value)
  return normalized || normalizeText(fallback)
}

/**
 * Projects canonical organisation identity and branding onto the attorney-firm
 * runtime shape. The legacy firm remains the source for operational fields only.
 * Empty canonical values fall back during a mixed-version deployment; the Phase 3
 * projection clears the matching legacy value when an intentional clear is saved.
 */
export function projectCanonicalOrganisationOntoAttorneyFirm(firm = null, organisation = null) {
  if (!firm || !organisation?.id) return firm

  return {
    ...firm,
    organisationId: organisation.id,
    name: preferCanonical(
      organisation.display_name || organisation.legal_name || organisation.name,
      firm.name,
    ),
    registrationNumber: preferCanonical(organisation.registration_number, firm.registrationNumber),
    vatNumber: preferCanonical(organisation.vat_number, firm.vatNumber),
    website: preferCanonical(organisation.website, firm.website),
    email: preferCanonical(organisation.company_email, firm.email),
    phone: preferCanonical(organisation.company_phone, firm.phone),
    addressLine1: preferCanonical(organisation.address_line_1, firm.addressLine1),
    addressLine2: preferCanonical(organisation.address_line_2, firm.addressLine2),
    city: preferCanonical(organisation.city, firm.city),
    province: preferCanonical(organisation.province, firm.province),
    postalCode: preferCanonical(organisation.postal_code, firm.postalCode),
    country: preferCanonical(organisation.country, firm.country) || 'South Africa',
    logoUrl: preferCanonical(organisation.logo_url, firm.logoUrl),
    logoBucket: preferCanonical(organisation.logo_bucket, firm.logoBucket),
    logoPath: preferCanonical(organisation.logo_path, firm.logoPath),
    logoDarkUrl: preferCanonical(organisation.logo_dark_url, firm.logoDarkUrl),
    logoDarkBucket: preferCanonical(organisation.logo_dark_bucket, firm.logoDarkBucket),
    logoDarkPath: preferCanonical(organisation.logo_dark_path, firm.logoDarkPath),
    primaryColour: preferCanonical(organisation.primary_colour, firm.primaryColour),
    secondaryColour: preferCanonical(organisation.secondary_colour, firm.secondaryColour),
  }
}

