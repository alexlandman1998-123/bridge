function normalizeText(value) {
  return String(value ?? '').trim()
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

export function isAttorneyWorkspace(authState = {}) {
  return (
    normalizeText(authState.workspaceType) === 'attorney_firm' ||
    normalizeText(authState.currentWorkspace?.type) === 'attorney_firm'
  )
}

export function buildAttorneyWorkspaceOrganisationFallback(authState = {}) {
  const workspace = authState.currentWorkspace || {}
  const raw = workspace.raw || {}
  const membership = authState.currentMembership || {}
  const firmId = firstText(workspace.id, membership.workspaceId)
  const organisationId = firstText(
    workspace.organisationId,
    workspace.organisation_id,
    raw.organisation_id,
    firmId,
  )
  const logoUrl = firstText(workspace.logoUrl, workspace.logo_url, raw.logo_url)
  const logoDarkUrl = firstText(workspace.logoDarkUrl, workspace.logo_dark_url, raw.logo_dark_url)

  const organisation = {
    id: organisationId,
    workspaceId: firmId,
    organisationId,
    partnerOrganisationId: organisationId,
    name: firstText(workspace.name, raw.name, 'Attorney Firm'),
    displayName: firstText(workspace.displayName, workspace.name, raw.name, 'Attorney Firm'),
    legalName: firstText(workspace.legalName, raw.legal_name, workspace.name, raw.name),
    type: 'attorney_firm',
    registrationNumber: firstText(workspace.registrationNumber, raw.registration_number),
    vatNumber: firstText(workspace.vatNumber, raw.vat_number),
    logoUrl,
    logo_url: logoUrl || null,
    logoBucket: firstText(workspace.logoBucket, raw.logo_bucket),
    logoPath: firstText(workspace.logoPath, raw.logo_path),
    logoDarkUrl,
    logoDarkBucket: firstText(workspace.logoDarkBucket, raw.logo_dark_bucket),
    logoDarkPath: firstText(workspace.logoDarkPath, raw.logo_dark_path),
    primaryColour: firstText(workspace.primaryColour, raw.primary_colour),
    secondaryColour: firstText(workspace.secondaryColour, raw.secondary_colour),
    companyEmail: firstText(workspace.email, raw.email),
    companyPhone: firstText(workspace.phone, raw.phone),
    website: firstText(workspace.website, raw.website),
    addressLine1: firstText(workspace.addressLine1, raw.address_line_1),
    addressLine2: firstText(workspace.addressLine2, raw.address_line_2),
    formattedAddress: firstText(workspace.formattedAddress, raw.formatted_address),
    suburb: firstText(workspace.suburb, raw.suburb),
    city: firstText(workspace.city, raw.city),
    province: firstText(workspace.province, raw.province),
    postalCode: firstText(workspace.postalCode, raw.postal_code),
    country: firstText(workspace.country, raw.country, 'South Africa'),
  }

  return {
    organisation,
    organisationSettings: {},
    onboarding: {
      organisationType: 'attorney_firm',
      agencyInformation: {
        agencyName: organisation.name,
        tradingName: organisation.displayName,
        companyRegistrationNumber: organisation.registrationNumber,
        vatNumber: organisation.vatNumber,
        website: organisation.website,
        mainOfficeNumber: organisation.companyPhone,
        mainEmailAddress: organisation.companyEmail,
        physicalAddress: organisation.addressLine1,
        province: organisation.province,
        country: organisation.country,
      },
      branding: {
        logoLight: logoUrl,
        logoDark: logoDarkUrl,
        brandColours: {
          primary: organisation.primaryColour,
          secondary: organisation.secondaryColour,
        },
      },
    },
    membershipRole: firstText(membership.workspaceRole, membership.role, 'viewer'),
    membershipStatus: firstText(membership.status, 'active'),
    onboardingMode: 'attorney_workspace_fallback',
    persisted: Boolean(organisationId),
    hydrationSource: 'attorney_workspace_fallback',
  }
}

function preferCanonical(canonical = {}, fallback = {}) {
  const result = { ...fallback, ...canonical }
  for (const [key, value] of Object.entries(fallback)) {
    if (!normalizeText(canonical?.[key])) result[key] = value
  }
  return result
}

export function hydrateAttorneyOrganisationSnapshot(snapshot = {}, authState = {}) {
  const fallback = buildAttorneyWorkspaceOrganisationFallback(authState)
  const organisation = preferCanonical(snapshot.organisation || {}, fallback.organisation)
  const existingOnboarding = snapshot.onboarding || {}
  const existingAgencyInformation = existingOnboarding.agencyInformation || {}
  const existingBranding = existingOnboarding.branding || {}
  const existingColours = existingBranding.brandColours || {}

  const agencyInformation = {
    ...existingAgencyInformation,
    agencyName: firstText(organisation.name, existingAgencyInformation.agencyName),
    tradingName: firstText(organisation.displayName, organisation.name, existingAgencyInformation.tradingName),
    companyRegistrationNumber: firstText(organisation.registrationNumber, existingAgencyInformation.companyRegistrationNumber),
    vatNumber: firstText(organisation.vatNumber, fallback.organisation.vatNumber, existingAgencyInformation.vatNumber),
    website: firstText(organisation.website, existingAgencyInformation.website),
    mainOfficeNumber: firstText(organisation.companyPhone, existingAgencyInformation.mainOfficeNumber),
    mainEmailAddress: firstText(organisation.companyEmail, existingAgencyInformation.mainEmailAddress),
    physicalAddress: firstText(organisation.addressLine1, existingAgencyInformation.physicalAddress),
    province: firstText(organisation.province, existingAgencyInformation.province),
    country: firstText(organisation.country, existingAgencyInformation.country, 'South Africa'),
  }

  const logoLight = firstText(organisation.logoUrl, fallback.organisation.logoUrl, existingBranding.logoLight)
  const branding = {
    ...existingBranding,
    logoLight,
    logoLightBucket: firstText(organisation.logoBucket, existingBranding.logoLightBucket),
    logoLightPath: firstText(organisation.logoPath, existingBranding.logoLightPath),
    logoDark: firstText(organisation.logoDarkUrl, fallback.onboarding.branding.logoDark, existingBranding.logoDark),
    logoDarkBucket: firstText(organisation.logoDarkBucket, existingBranding.logoDarkBucket),
    logoDarkPath: firstText(organisation.logoDarkPath, existingBranding.logoDarkPath),
    brandColours: {
      ...existingColours,
      primary: firstText(organisation.primaryColour, fallback.onboarding.branding.brandColours.primary, existingColours.primary),
      secondary: firstText(organisation.secondaryColour, fallback.onboarding.branding.brandColours.secondary, existingColours.secondary),
    },
  }

  return {
    ...fallback,
    ...snapshot,
    organisation,
    organisationSettings: snapshot.organisationSettings || fallback.organisationSettings,
    onboarding: {
      ...existingOnboarding,
      organisationType: 'attorney_firm',
      agencyInformation,
      branding,
    },
    membershipRole: firstText(snapshot.membershipRole, fallback.membershipRole),
    membershipStatus: firstText(snapshot.membershipStatus, fallback.membershipStatus),
    onboardingMode: snapshot.onboardingMode || 'attorney_organisation_hydrated',
    persisted: snapshot.persisted !== false,
    hydrationSource: 'backing_organisation',
  }
}
