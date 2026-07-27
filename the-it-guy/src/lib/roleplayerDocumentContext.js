function normalizeText(value) {
  return String(value ?? '').trim()
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function compactJoin(values = [], separator = ', ') {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(separator)
}

function firstPresent(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

function readPath(source = {}, path = '') {
  if (!source || typeof source !== 'object') return ''
  return String(path || '').split('.').reduce((current, part) => {
    if (!current || typeof current !== 'object') return undefined
    return current[part]
  }, source)
}

function firstFromSources(sources = [], aliases = []) {
  for (const source of sources) {
    for (const alias of aliases) {
      const value = readPath(source, alias)
      if (value === null || value === undefined) continue
      if (typeof value === 'string' && !value.trim()) continue
      return value
    }
  }
  return ''
}

function normalizeComparableText(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function uniqueComparableValues(values = []) {
  const seen = new Set()
  const unique = []
  for (const value of values) {
    const normalized = normalizeComparableText(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(normalized)
  }
  return unique
}

export const ROLEPLAYER_DOCUMENT_CONTEXT_PARITY_VERSION = 'roleplayer_document_context_parity_v1'

export const ROLEPLAYER_DOCUMENT_CONTEXT_PARITY_FIELDS = Object.freeze([
  'sellerName',
  'sellerIdNumber',
  'sellerId',
  'propertyId',
  'listingId',
  'transactionId',
  'transactionReference',
  'organisationName',
  'agencyName',
  'legalName',
  'registrationNumber',
  'vatNumber',
  'fspNumber',
  'physicalAddress',
  'email',
  'phone',
  'website',
  'logoUrl',
  'logoLightUrl',
  'logoDarkUrl',
  'agencyLogoUrl',
])

export function resolveDocumentAssetUrl(value = '', assetBaseUrl = '') {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  const path = raw.startsWith('/') ? raw : `/${raw}`
  const base = normalizeText(assetBaseUrl).replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

export function resolveDocumentBrandingContext({
  sources = [],
  context = {},
  assetBaseUrl = '',
  fallbackOrganisationName = 'Agency Workspace',
} = {}) {
  const normalizedSources = [
    ...sources,
    isPlainObject(context?.branding) ? context.branding : null,
    context,
  ].filter(isPlainObject)
  const merged = Object.assign({}, ...[...normalizedSources].reverse())
  const resolvedAssetBaseUrl = normalizeText(assetBaseUrl || context?.assetBaseUrl || context?.asset_base_url)
  const organisationName = normalizeText(firstFromSources(normalizedSources, [
    'organisationName',
    'organisation_name',
    'organizationName',
    'organization_name',
    'agencyName',
    'agency_name',
    'displayName',
    'display_name',
    'name',
  ])) || fallbackOrganisationName
  const agencyName = normalizeText(firstFromSources(normalizedSources, [
    'agencyName',
    'agency_name',
    'organisationName',
    'organisation_name',
    'organizationName',
    'organization_name',
    'displayName',
    'display_name',
    'name',
  ])) || organisationName
  const legalName = normalizeText(firstFromSources(normalizedSources, [
    'legalName',
    'legal_name',
    'organisationLegalName',
    'organisation_legal_name',
    'organizationLegalName',
    'organization_legal_name',
    'companyLegalName',
    'company_legal_name',
    'registeredName',
    'registered_name',
  ])) || organisationName
  const registrationNumber = normalizeText(firstFromSources(normalizedSources, [
    'registrationNumber',
    'registration_number',
    'agencyRegistrationNumber',
    'agency_registration_number',
    'companyRegistrationNumber',
    'company_registration_number',
    'organisationRegistrationNumber',
    'organisation_registration_number',
    'organizationRegistrationNumber',
    'organization_registration_number',
  ]))
  const vatNumber = normalizeText(firstFromSources(normalizedSources, [
    'vatNumber',
    'vat_number',
    'taxNumber',
    'tax_number',
    'organisationVatNumber',
    'organisation_vat_number',
    'organizationVatNumber',
    'organization_vat_number',
  ]))
  const fspNumber = normalizeText(firstFromSources(normalizedSources, [
    'fspNumber',
    'fsp_number',
    'ffcNumber',
    'ffc_number',
    'organisationFspNumber',
    'organisation_fsp_number',
    'organizationFspNumber',
    'organization_fsp_number',
  ]))
  const physicalAddress = normalizeText(firstFromSources(normalizedSources, [
    'physicalAddress',
    'physical_address',
    'organisationPhysicalAddress',
    'organisation_physical_address',
    'organizationPhysicalAddress',
    'organization_physical_address',
    'agencyAddress',
    'agency_address',
    'address',
  ])) || compactJoin([
    firstFromSources(normalizedSources, ['addressLine1', 'address_line_1']),
    firstFromSources(normalizedSources, ['addressLine2', 'address_line_2']),
    firstFromSources(normalizedSources, ['city']),
    firstFromSources(normalizedSources, ['province']),
    firstFromSources(normalizedSources, ['postalCode', 'postal_code']),
  ])
  const email = normalizeText(firstFromSources(normalizedSources, [
    'email',
    'organisationEmail',
    'organisation_email',
    'organizationEmail',
    'organization_email',
    'contactEmail',
    'contact_email',
    'companyEmail',
    'company_email',
    'agencyEmail',
    'agency_email',
  ]))
  const phone = normalizeText(firstFromSources(normalizedSources, [
    'telephone',
    'phoneNumber',
    'phone_number',
    'phone',
    'telephoneNumber',
    'telephone_number',
    'contactPhone',
    'contact_phone',
    'organisationPhone',
    'organisation_phone',
    'organizationPhone',
    'organization_phone',
    'agencyPhone',
    'agency_phone',
  ]))
  const website = normalizeText(firstFromSources(normalizedSources, [
    'website',
    'websiteUrl',
    'website_url',
    'organisationWebsite',
    'organisation_website',
    'organizationWebsite',
    'organization_website',
    'companyWebsite',
    'company_website',
    'agencyWebsite',
    'agency_website',
  ]))
  const logoLightUrl = resolveDocumentAssetUrl(firstFromSources(normalizedSources, [
    'logoLightUrl',
    'logo_light_url',
    'logoLight',
    'organisationLogoLightUrl',
    'organisation_logo_light_url',
    'organizationLogoLightUrl',
    'organization_logo_light_url',
    'agencyLogoLightUrl',
    'agency_logo_light_url',
  ]), resolvedAssetBaseUrl)
  const logoDarkUrl = resolveDocumentAssetUrl(firstFromSources(normalizedSources, [
    'logoDarkUrl',
    'logo_dark_url',
    'logoDark',
    'logoHighContrastUrl',
    'logo_high_contrast_url',
    'organisationLogoDarkUrl',
    'organisation_logo_dark_url',
    'organisationLogoHighContrastUrl',
    'organisation_logo_high_contrast_url',
    'organisation_high_contrast_logo_url',
    'organizationLogoDarkUrl',
    'organization_logo_dark_url',
    'organizationLogoHighContrastUrl',
    'organization_logo_high_contrast_url',
    'agencyLogoDarkUrl',
    'agency_logo_dark_url',
    'agencyLogoHighContrastUrl',
    'agency_logo_high_contrast_url',
  ]), resolvedAssetBaseUrl)
  const logoUrl = resolveDocumentAssetUrl(firstFromSources(normalizedSources, [
    'logoUrl',
    'logo_url',
    'organisationLogoUrl',
    'organisation_logo_url',
    'organizationLogoUrl',
    'organization_logo_url',
    'agencyLogoUrl',
    'agency_logo_url',
  ]), resolvedAssetBaseUrl)
  const agencyLogoUrl = firstPresent(logoLightUrl, logoUrl, logoDarkUrl)
  const contactItems = [
    ['company', legalName],
    ['registration', registrationNumber],
    ['tax', vatNumber],
    ['license', fspNumber],
    ['address', physicalAddress],
    ['email', email],
    ['phone', phone],
    ['website', website],
  ]
    .map(([type, value]) => ({ type, value: normalizeText(value) }))
    .filter((item) => item.value)

  return {
    ...merged,
    organisationName,
    agencyName,
    legalName,
    registrationNumber,
    vatNumber,
    fspNumber,
    physicalAddress,
    email,
    phone,
    website,
    logoUrl,
    logoDarkUrl,
    logoLightUrl,
    agencyLogoUrl,
    contactItems,
  }
}

export function resolveSellerDisclosureDocumentContext({
  listing = {},
  formData = {},
  portalData = {},
  activeSellingContext = {},
  generatedDocument = {},
  disclosure = {},
  assetBaseUrl = '',
} = {}) {
  const safeListing = isPlainObject(listing) ? listing : {}
  const safeFormData = isPlainObject(formData) ? formData : {}
  const safePortalData = isPlainObject(portalData) ? portalData : {}
  const safeActiveSellingContext = isPlainObject(activeSellingContext) ? activeSellingContext : {}
  const safeDisclosure = isPlainObject(disclosure) ? disclosure : {}
  const resolvedGeneratedDocument = isPlainObject(generatedDocument) && Object.keys(generatedDocument).length
    ? generatedDocument
    : isPlainObject(safeDisclosure.generatedDocument)
      ? safeDisclosure.generatedDocument
      : isPlainObject(safeDisclosure.generated_document)
        ? safeDisclosure.generated_document
        : {}
  const agency = isPlainObject(safeListing.agency) ? safeListing.agency : {}
  const organisation = isPlainObject(safeListing.organisation)
    ? safeListing.organisation
    : isPlainObject(safeListing.organization)
      ? safeListing.organization
      : {}
  const branding = resolveDocumentBrandingContext({
    sources: [
      isPlainObject(safeActiveSellingContext.branding) ? safeActiveSellingContext.branding : null,
      isPlainObject(safePortalData.branding) ? safePortalData.branding : null,
      isPlainObject(safeFormData.portalBranding) ? safeFormData.portalBranding : null,
      isPlainObject(safeFormData.branding) ? safeFormData.branding : null,
      isPlainObject(safeListing.branding) ? safeListing.branding : null,
      organisation,
      agency,
      safeListing,
    ].filter(isPlainObject),
    assetBaseUrl: assetBaseUrl || safeListing.assetBaseUrl || safeListing.asset_base_url,
  })

  return {
    sellerName: normalizeText(firstPresent(
      safeFormData.sellerName,
      [safeFormData.sellerFirstName, safeFormData.sellerSurname].filter(Boolean).join(' '),
      safeFormData.seller_full_name,
      safeFormData.fullName,
      safeFormData.full_name,
      safePortalData.sellerName,
      safePortalData.seller_name,
      safeListing.seller?.name,
      safeListing.sellerName,
      safeListing.seller_name,
    )),
    sellerIdNumber: normalizeText(firstPresent(
      safeFormData.sellerIdNumber,
      safeFormData.seller_id_number,
      safeFormData.idNumber,
      safeFormData.id_number,
      safeFormData.passportNumber,
      safeFormData.passport_number,
      safeListing.seller?.idNumber,
      safeListing.seller?.id_number,
      safeListing.sellerIdNumber,
      safeListing.seller_id_number,
    )),
    sellerId: normalizeText(firstPresent(
      resolvedGeneratedDocument.sellerId,
      resolvedGeneratedDocument.seller_id,
      safeListing.sellerProfileId,
      safeListing.seller_profile_id,
      safePortalData.sellerProfileId,
      safePortalData.seller_profile_id,
    )),
    propertyId: normalizeText(firstPresent(
      resolvedGeneratedDocument.propertyId,
      resolvedGeneratedDocument.property_id,
      safeListing.propertyProfileId,
      safeListing.property_profile_id,
      safePortalData.propertyProfileId,
      safePortalData.property_profile_id,
    )),
    listingId: normalizeText(firstPresent(
      resolvedGeneratedDocument.listingId,
      resolvedGeneratedDocument.listing_id,
      safeListing.id,
      safeListing.private_listing_id,
      safePortalData.listingId,
      safePortalData.listing_id,
    )),
    transactionId: normalizeText(firstPresent(
      resolvedGeneratedDocument.transactionId,
      resolvedGeneratedDocument.transaction_id,
      safeListing.transactionId,
      safeListing.transaction_id,
      safePortalData.transaction?.id,
      safePortalData.transactionId,
      safePortalData.transaction_id,
    )),
    transactionReference: normalizeText(firstPresent(
      safePortalData.transaction?.reference,
      safePortalData.transactionReference,
      safePortalData.transaction_reference,
      safeListing.transactionReference,
      safeListing.transaction_reference,
    )),
    assetBaseUrl: normalizeText(assetBaseUrl || safeListing.assetBaseUrl || safeListing.asset_base_url),
    branding,
  }
}

export function buildRoleplayerDocumentContextParitySnapshot({
  surfaceKey = 'unknown',
  surfaceLabel = '',
  source = {},
  context = {},
  roleplayer = {},
  branding = null,
  assetBaseUrl = '',
} = {}) {
  const sources = [source, context, roleplayer].filter(isPlainObject)
  const resolvedBranding = resolveDocumentBrandingContext({
    sources: [
      branding,
      isPlainObject(source?.branding) ? source.branding : null,
      isPlainObject(context?.branding) ? context.branding : null,
      isPlainObject(roleplayer?.branding) ? roleplayer.branding : null,
      ...sources,
    ].filter(isPlainObject),
    assetBaseUrl: assetBaseUrl || source?.assetBaseUrl || source?.asset_base_url || context?.assetBaseUrl || context?.asset_base_url,
    fallbackOrganisationName: '',
  })

  const snapshot = {
    version: ROLEPLAYER_DOCUMENT_CONTEXT_PARITY_VERSION,
    surfaceKey: normalizeComparableText(surfaceKey) || 'unknown',
    surfaceLabel: normalizeComparableText(surfaceLabel),
    sellerName: normalizeComparableText(firstFromSources(sources, [
      'sellerName',
      'seller_name',
      'seller.fullName',
      'seller.full_name',
      'seller.name',
      'seller.displayName',
      'seller.display_name',
      'signatures.sellerName',
      'placeholders.seller_full_name',
    ])),
    sellerIdNumber: normalizeComparableText(firstFromSources(sources, [
      'sellerIdNumber',
      'seller_id_number',
      'idNumber',
      'id_number',
      'identityNumber',
      'identity_number',
      'passportNumber',
      'passport_number',
      'seller.idNumber',
      'seller.id_number',
      'seller.identityNumber',
      'seller.identity_number',
      'placeholders.seller_id_number',
    ])),
    sellerId: normalizeComparableText(firstFromSources(sources, [
      'sellerId',
      'seller_id',
      'sellerProfileId',
      'seller_profile_id',
      'generatedDocument.sellerId',
      'generated_document.seller_id',
    ])),
    propertyId: normalizeComparableText(firstFromSources(sources, [
      'propertyId',
      'property_id',
      'propertyProfileId',
      'property_profile_id',
      'generatedDocument.propertyId',
      'generated_document.property_id',
      'sourceSnapshot.privateListing.propertyProfileId',
      'sourceSnapshot.privateListing.property_profile_id',
    ])),
    listingId: normalizeComparableText(firstFromSources(sources, [
      'listingId',
      'listing_id',
      'id',
      'private_listing_id',
      'generatedDocument.listingId',
      'generated_document.listing_id',
      'sourceSnapshot.privateListing.id',
    ])),
    transactionId: normalizeComparableText(firstFromSources(sources, [
      'transactionId',
      'transaction_id',
      'transaction.id',
      'generatedDocument.transactionId',
      'generated_document.transaction_id',
      'sourceSnapshot.transaction.id',
    ])),
    transactionReference: normalizeComparableText(firstFromSources(sources, [
      'transactionReference',
      'transaction_reference',
      'transaction.reference',
      'sourceSnapshot.transaction.reference',
    ])),
    organisationName: normalizeComparableText(resolvedBranding.organisationName),
    agencyName: normalizeComparableText(resolvedBranding.agencyName),
    legalName: normalizeComparableText(resolvedBranding.legalName),
    registrationNumber: normalizeComparableText(resolvedBranding.registrationNumber),
    vatNumber: normalizeComparableText(resolvedBranding.vatNumber),
    fspNumber: normalizeComparableText(resolvedBranding.fspNumber),
    physicalAddress: normalizeComparableText(resolvedBranding.physicalAddress),
    email: normalizeComparableText(resolvedBranding.email),
    phone: normalizeComparableText(resolvedBranding.phone),
    website: normalizeComparableText(resolvedBranding.website),
    logoUrl: normalizeComparableText(resolvedBranding.logoUrl),
    logoLightUrl: normalizeComparableText(resolvedBranding.logoLightUrl),
    logoDarkUrl: normalizeComparableText(resolvedBranding.logoDarkUrl),
    agencyLogoUrl: normalizeComparableText(resolvedBranding.agencyLogoUrl),
    contactItems: resolvedBranding.contactItems,
  }

  return snapshot
}

export function compareRoleplayerDocumentContextParity(snapshots = [], {
  fields = ROLEPLAYER_DOCUMENT_CONTEXT_PARITY_FIELDS,
  requiredFields = [],
} = {}) {
  const normalizedSnapshots = snapshots
    .filter(isPlainObject)
    .map((snapshot, index) => ({
      ...snapshot,
      surfaceKey: normalizeComparableText(snapshot.surfaceKey) || `surface_${index + 1}`,
    }))
  const issues = []

  for (const field of fields) {
    const required = requiredFields.includes(field)
    const surfaceValues = normalizedSnapshots.map((snapshot) => ({
      surfaceKey: snapshot.surfaceKey,
      value: normalizeComparableText(snapshot[field]),
    }))
    const populatedValues = uniqueComparableValues(surfaceValues.map((entry) => entry.value))
    if (required) {
      for (const entry of surfaceValues) {
        if (!entry.value) {
          issues.push({
            code: 'roleplayer_context_field_missing',
            field,
            surfaceKey: entry.surfaceKey,
          })
        }
      }
    }
    if (populatedValues.length > 1) {
      issues.push({
        code: 'roleplayer_context_field_mismatch',
        field,
        expected: populatedValues[0],
        actualValues: populatedValues,
        surfaces: surfaceValues.filter((entry) => entry.value),
      })
    }
  }

  return {
    version: ROLEPLAYER_DOCUMENT_CONTEXT_PARITY_VERSION,
    status: issues.length ? 'blocked' : 'healthy',
    summary: {
      surfaceCount: normalizedSnapshots.length,
      comparedFieldCount: fields.length,
      requiredFieldCount: requiredFields.length,
      issueCount: issues.length,
      mismatchCount: issues.filter((issue) => issue.code === 'roleplayer_context_field_mismatch').length,
      missingRequiredCount: issues.filter((issue) => issue.code === 'roleplayer_context_field_missing').length,
    },
    snapshots: normalizedSnapshots,
    issues,
  }
}
