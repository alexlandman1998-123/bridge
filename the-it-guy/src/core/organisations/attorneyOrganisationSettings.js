function normalizeText(value) {
  return String(value ?? '').trim()
}

export function buildAttorneyOrganisationSettingsInput(snapshot = {}) {
  const organisation = snapshot?.organisation || {}
  const agencyInformation = snapshot?.onboarding?.agencyInformation || {}
  const branding = snapshot?.onboarding?.branding || {}
  const brandColours = branding.brandColours || {}

  return {
    ...organisation,
    legalName: normalizeText(organisation.legalName || agencyInformation.agencyName || organisation.name),
    registrationNumber: normalizeText(agencyInformation.companyRegistrationNumber ?? organisation.registrationNumber),
    vatNumber: normalizeText(agencyInformation.vatNumber ?? organisation.vatNumber),
    website: normalizeText(agencyInformation.website ?? organisation.website),
    companyEmail: normalizeText(agencyInformation.mainEmailAddress ?? organisation.companyEmail),
    companyPhone: normalizeText(agencyInformation.mainOfficeNumber ?? organisation.companyPhone),
    addressLine1: normalizeText(organisation.addressLine1 ?? agencyInformation.physicalAddress),
    province: normalizeText(organisation.province ?? agencyInformation.province),
    country: normalizeText(organisation.country ?? agencyInformation.country) || 'South Africa',
    logoUrl: normalizeText(branding.logoLight ?? organisation.logoUrl),
    logoBucket: normalizeText(branding.logoLightBucket ?? organisation.logoBucket),
    logoPath: normalizeText(branding.logoLightPath ?? organisation.logoPath),
    logoDarkUrl: normalizeText(branding.logoDark ?? organisation.logoDarkUrl),
    logoDarkBucket: normalizeText(branding.logoDarkBucket ?? organisation.logoDarkBucket),
    logoDarkPath: normalizeText(branding.logoDarkPath ?? organisation.logoDarkPath),
    primaryColour: normalizeText(brandColours.primary ?? organisation.primaryColour),
    secondaryColour: normalizeText(brandColours.secondary ?? organisation.secondaryColour),
  }
}
