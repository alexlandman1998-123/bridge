// Pure development marketing normalizers; original declarations are unchanged.
import { normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { hydrateVisualMapMediaLibrary } from '../../core/developments/developmentVisualMap.js'

export const DEFAULT_DEVELOPMENT_SELLER_DETAILS = {
  mode: 'custom',
  entityType: 'company',
  legalName: '',
  tradingName: '',
  registrationNumber: '',
  vatNumber: '',
  registeredAddress: '',
  postalAddress: '',
  email: '',
  phone: '',
  vatTreatment: '',
  notes: '',
  signatories: [
    {
      fullName: '',
      role: '',
      idNumber: '',
      email: '',
      phone: '',
      signingCapacity: '',
    },
  ],
}

export const DEFAULT_DEVELOPMENT_PROFILE = {
  code: '',
  location: '',
  suburb: '',
  city: '',
  province: '',
  country: 'South Africa',
  address: '',
  formattedAddress: '',
  streetAddress: '',
  postalCode: '',
  latitude: null,
  longitude: null,
  googlePlaceId: '',
  description: '',
  status: 'active',
  developerCompany: '',
  launchDate: '',
  expectedCompletionDate: '',
  plans: [],
  sitePlans: [],
  imageLinks: [],
  supportingDocuments: [],
  sellerDetails: DEFAULT_DEVELOPMENT_SELLER_DETAILS,
  marketingContent: {
    listingOverview: {
      listingTitle: '',
      shortTitle: '',
      locationLabel: '',
      address: '',
      suburb: '',
      city: '',
      province: '',
      listingStatus: 'draft',
      listingDescription: '',
      shortDescription: '',
      seoTitle: '',
      seoMetaDescription: '',
    },
    floorplans: [],
    agencies: [],
    sellingPoints: {
      items: '',
    },
    keySellingPoints: {
      keyHighlights: '',
      lifestyleSellingPoints: '',
      buyerAppealNotes: '',
      nearbyAmenitiesSummary: '',
      securityEstateFeatures: '',
      whyThisDevelopment: '',
    },
    mediaLibrary: {
      coverImageUrl: '',
      heroImageUrl: '',
      galleryImageUrls: '',
      developmentLogoUrl: '',
      developmentLogoLightUrl: '',
      developmentLogoDarkUrl: '',
      primaryColour: '#073e32',
      accentColour: '#d0ab55',
      surfaceColour: '#f5f2eb',
      sitePlanUrl: '',
      sitePlanViewport: {},
      sitePlanNotShownUnitIds: [],
      masterplanUrl: '',
      floorplanUrls: '',
      videoUrl: '',
      virtualTourUrl: '',
    },
    downloads: {
      brochureUrl: '',
      pricingSheetUrl: '',
      specSheetUrl: '',
      salesPackUrl: '',
      investmentPackUrl: '',
      termsPdfUrl: '',
      applicationFormUrl: '',
    },
    externalLinks: {
      developmentLandingPageUrl: '',
      googleMapsUrl: '',
      externalWebsiteUrl: '',
      salesPortalUrl: '',
      whatsappEnquiryUrl: '',
      bookingViewingUrl: '',
    },
    listingConfiguration: {
      showOnListingWebsite: false,
      featuredDevelopment: false,
      displayOrder: '',
      listingSlug: '',
      ctaLabel: '',
      ctaUrl: '',
      marketingStatus: 'draft',
      publicVisibility: false,
    },
  },
}

export function normalizeEmailAddress(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized || ''
}

export function normalizeMarketingBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false
  }

  return fallback
}

export function firstDefinedMarketingValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

export function normalizeMarketingFloorplanValue(input = {}, index = 1) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const text = (...values) => normalizeTextValue(firstDefinedMarketingValue(...values))

  return {
    id: text(source.id, source.floorplanId, source.floorplan_id, source.unitTypeId, source.unit_type_id),
    name: text(source.name, source.title, source.unitType, source.unit_type) || `Option ${index}`,
    erfSize: text(source.erfSize, source.erf_size),
    floorSize: text(source.floorSize, source.floor_size),
    bedrooms: text(source.bedrooms),
    bathrooms: text(source.bathrooms),
    garage: text(source.garage, source.parking, source.parkingCount, source.parking_count),
    pool: text(source.pool),
    price: text(source.price),
    priceFrom: text(source.priceFrom, source.price_from, source.minPrice, source.min_price, source.price),
    priceTo: text(source.priceTo, source.price_to, source.maxPrice, source.max_price, source.price),
    description: text(source.description, source.notes),
    imageUrls: text(source.imageUrls, source.image_urls, source.imageUrl, source.image_url),
    floorplanUrls: text(
      source.floorplanUrls,
      source.floorplan_urls,
      source.floorplanUrl,
      source.floorplan_url,
      source.planUrl,
      source.plan_url,
    ),
    videoUrl: text(source.videoUrl, source.video_url),
    virtualTourUrl: text(source.virtualTourUrl, source.virtual_tour_url),
    documentUrls: text(source.documentUrls, source.document_urls, source.documentUrl, source.document_url),
    keyFeatures: text(source.keyFeatures, source.key_features, source.features),
    marketingHighlights: text(source.marketingHighlights, source.marketing_highlights, source.highlights),
    ctaLabel: text(source.ctaLabel, source.cta_label),
    secondaryCtaLabel: text(source.secondaryCtaLabel, source.secondary_cta_label),
    ctaUrl: text(source.ctaUrl, source.cta_url),
    seoTitle: text(source.seoTitle, source.seo_title),
    seoDescription: text(source.seoDescription, source.seo_description, source.seoMetaDescription, source.seo_meta_description),
    listingSlug: text(source.listingSlug, source.listing_slug),
    listingStatus: text(source.listingStatus, source.listing_status, source.status) || 'draft',
    ratesAndTaxes: text(source.ratesAndTaxes, source.rates_and_taxes),
    levies: text(source.levies),
    noTransferDuty: normalizeMarketingBoolean(
      firstDefinedMarketingValue(source.noTransferDuty, source.no_transfer_duty),
      false,
    ),
    customisationOptions: normalizeMarketingBoolean(
      firstDefinedMarketingValue(source.customisationOptions, source.customisation_options),
      false,
    ),
  }
}

export function normalizeMarketingAgencyValue(input = {}, index = 1) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const text = (...values) => normalizeTextValue(firstDefinedMarketingValue(...values))

  return {
    id: text(source.id),
    name: text(source.name),
    contactName: text(source.contactName, source.contact_name),
    contactEmail: normalizeEmailAddress(text(source.contactEmail, source.contact_email, source.email)),
    contactPhone: text(source.contactPhone, source.contact_phone, source.phone),
    notes: text(source.notes),
    isPreferred: normalizeMarketingBoolean(
      firstDefinedMarketingValue(source.isPreferred, source.is_preferred),
      index === 1,
    ),
  }
}

export function normalizeMarketingContent(value) {
  let source = value

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch {
      source = {}
    }
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    source = {}
  }

  const defaults = DEFAULT_DEVELOPMENT_PROFILE.marketingContent
  const listingOverviewSource =
    source.listingOverview && typeof source.listingOverview === 'object' && !Array.isArray(source.listingOverview)
      ? source.listingOverview
      : source.listing_overview && typeof source.listing_overview === 'object' && !Array.isArray(source.listing_overview)
        ? source.listing_overview
      : {}
  const keySellingPointsSource =
    source.keySellingPoints && typeof source.keySellingPoints === 'object' && !Array.isArray(source.keySellingPoints)
      ? source.keySellingPoints
      : source.key_selling_points &&
          typeof source.key_selling_points === 'object' &&
          !Array.isArray(source.key_selling_points)
        ? source.key_selling_points
      : {}
  const sellingPointsSource =
    source.sellingPoints && typeof source.sellingPoints === 'object' && !Array.isArray(source.sellingPoints)
      ? source.sellingPoints
      : source.selling_points && typeof source.selling_points === 'object' && !Array.isArray(source.selling_points)
        ? source.selling_points
        : {}
  const mediaLibrarySource =
    source.mediaLibrary && typeof source.mediaLibrary === 'object' && !Array.isArray(source.mediaLibrary)
      ? source.mediaLibrary
      : source.media_library && typeof source.media_library === 'object' && !Array.isArray(source.media_library)
        ? source.media_library
      : {}
  const downloadsSource =
    source.downloads && typeof source.downloads === 'object' && !Array.isArray(source.downloads) ? source.downloads : {}
  const externalLinksSource =
    source.externalLinks && typeof source.externalLinks === 'object' && !Array.isArray(source.externalLinks)
      ? source.externalLinks
      : source.external_links && typeof source.external_links === 'object' && !Array.isArray(source.external_links)
        ? source.external_links
      : {}
  const listingConfigurationSource =
    source.listingConfiguration &&
    typeof source.listingConfiguration === 'object' &&
    !Array.isArray(source.listingConfiguration)
      ? source.listingConfiguration
      : source.listing_configuration &&
          typeof source.listing_configuration === 'object' &&
          !Array.isArray(source.listing_configuration)
        ? source.listing_configuration
      : {}
  const floorplansSource = Array.isArray(source.floorplans)
    ? source.floorplans
    : Array.isArray(source.unitTypes)
      ? source.unitTypes
      : Array.isArray(source.unit_types)
        ? source.unit_types
        : []
  const agenciesSource = Array.isArray(source.agencies)
    ? source.agencies
    : Array.isArray(source.agencyDirectory?.agencies)
      ? source.agencyDirectory.agencies
      : Array.isArray(source.agency_directory?.agencies)
        ? source.agency_directory.agencies
        : []

  return {
    listingOverview: {
      developmentType: normalizeTextValue(listingOverviewSource.developmentType),
      listingTitle: normalizeTextValue(
        listingOverviewSource.listingTitle ?? source.listing_title ?? defaults.listingOverview.listingTitle,
      ),
      shortTitle: normalizeTextValue(
        listingOverviewSource.shortTitle ?? source.short_title ?? defaults.listingOverview.shortTitle,
      ),
      locationLabel: normalizeTextValue(
        listingOverviewSource.locationLabel ?? source.location_label ?? defaults.listingOverview.locationLabel,
      ),
      address: normalizeTextValue(listingOverviewSource.address ?? defaults.listingOverview.address),
      suburb: normalizeTextValue(listingOverviewSource.suburb ?? defaults.listingOverview.suburb),
      city: normalizeTextValue(listingOverviewSource.city ?? defaults.listingOverview.city),
      province: normalizeTextValue(listingOverviewSource.province ?? defaults.listingOverview.province),
      listingStatus: normalizeTextValue(
        listingOverviewSource.listingStatus ?? source.listing_status ?? defaults.listingOverview.listingStatus,
      ),
      listingDescription: normalizeTextValue(
        listingOverviewSource.listingDescription ??
          source.listing_description ??
          defaults.listingOverview.listingDescription,
      ),
      shortDescription: normalizeTextValue(
        listingOverviewSource.shortDescription ?? source.short_description ?? defaults.listingOverview.shortDescription,
      ),
      seoTitle: normalizeTextValue(
        listingOverviewSource.seoTitle ?? source.seo_title ?? defaults.listingOverview.seoTitle,
      ),
      seoMetaDescription: normalizeTextValue(
        listingOverviewSource.seoMetaDescription ??
          source.seo_meta_description ??
          defaults.listingOverview.seoMetaDescription,
      ),
    },
    floorplans: floorplansSource.map((item, index) => normalizeMarketingFloorplanValue(item, index + 1)),
    agencies: agenciesSource.map((item, index) => normalizeMarketingAgencyValue(item, index + 1)),
    sellingPoints: {
      items: normalizeTextValue(
        sellingPointsSource.items ?? source.selling_points_items ?? defaults.sellingPoints?.items ?? '',
      ),
    },
    keySellingPoints: {
      keyHighlights: normalizeTextValue(
        keySellingPointsSource.keyHighlights ??
          keySellingPointsSource.key_highlights ??
          defaults.keySellingPoints.keyHighlights,
      ),
      lifestyleSellingPoints: normalizeTextValue(
        keySellingPointsSource.lifestyleSellingPoints ??
          keySellingPointsSource.lifestyle_selling_points ??
          defaults.keySellingPoints.lifestyleSellingPoints,
      ),
      buyerAppealNotes: normalizeTextValue(
        keySellingPointsSource.buyerAppealNotes ??
          keySellingPointsSource.buyer_appeal_notes ??
          defaults.keySellingPoints.buyerAppealNotes,
      ),
      nearbyAmenitiesSummary: normalizeTextValue(
        keySellingPointsSource.nearbyAmenitiesSummary ??
          keySellingPointsSource.nearby_amenities_summary ??
          defaults.keySellingPoints.nearbyAmenitiesSummary,
      ),
      securityEstateFeatures: normalizeTextValue(
        keySellingPointsSource.securityEstateFeatures ??
          keySellingPointsSource.security_estate_features ??
          defaults.keySellingPoints.securityEstateFeatures,
      ),
      whyThisDevelopment: normalizeTextValue(
        keySellingPointsSource.whyThisDevelopment ??
          keySellingPointsSource.why_this_development ??
          defaults.keySellingPoints.whyThisDevelopment,
      ),
    },
    mediaLibrary: hydrateVisualMapMediaLibrary({
      coverImageUrl: normalizeTextValue(
        mediaLibrarySource.coverImageUrl ?? mediaLibrarySource.cover_image_url ?? defaults.mediaLibrary.coverImageUrl,
      ),
      heroImageUrl: normalizeTextValue(
        mediaLibrarySource.heroImageUrl ?? mediaLibrarySource.hero_image_url ?? defaults.mediaLibrary.heroImageUrl,
      ),
      galleryImageUrls: normalizeTextValue(
        mediaLibrarySource.galleryImageUrls ??
          mediaLibrarySource.gallery_image_urls ??
          defaults.mediaLibrary.galleryImageUrls,
      ),
      developmentLogoUrl: normalizeTextValue(
        mediaLibrarySource.developmentLogoUrl ??
          mediaLibrarySource.development_logo_url ??
          defaults.mediaLibrary.developmentLogoUrl,
      ),
      developmentLogoLightUrl: normalizeTextValue(
        mediaLibrarySource.developmentLogoLightUrl ??
          mediaLibrarySource.development_logo_light_url ??
          defaults.mediaLibrary.developmentLogoLightUrl,
      ),
      developmentLogoDarkUrl: normalizeTextValue(
        mediaLibrarySource.developmentLogoDarkUrl ??
          mediaLibrarySource.development_logo_dark_url ??
          defaults.mediaLibrary.developmentLogoDarkUrl,
      ),
      primaryColour: normalizeTextValue(
        mediaLibrarySource.primaryColour ?? mediaLibrarySource.primary_colour ?? defaults.mediaLibrary.primaryColour,
      ),
      accentColour: normalizeTextValue(
        mediaLibrarySource.accentColour ?? mediaLibrarySource.accent_colour ?? defaults.mediaLibrary.accentColour,
      ),
      surfaceColour: normalizeTextValue(
        mediaLibrarySource.surfaceColour ?? mediaLibrarySource.surface_colour ?? defaults.mediaLibrary.surfaceColour,
      ),
      sitePlanUrl: normalizeTextValue(
        mediaLibrarySource.sitePlanUrl ?? mediaLibrarySource.site_plan_url ?? defaults.mediaLibrary.sitePlanUrl,
      ),
      sitePlanMap:
        mediaLibrarySource.sitePlanMap && typeof mediaLibrarySource.sitePlanMap === 'object' && !Array.isArray(mediaLibrarySource.sitePlanMap)
          ? mediaLibrarySource.sitePlanMap
          : defaults.mediaLibrary.sitePlanMap || {},
      sitePlanViewport:
        mediaLibrarySource.sitePlanViewport && typeof mediaLibrarySource.sitePlanViewport === 'object' && !Array.isArray(mediaLibrarySource.sitePlanViewport)
          ? mediaLibrarySource.sitePlanViewport
          : defaults.mediaLibrary.sitePlanViewport,
      sitePlanNotShownUnitIds: Array.isArray(mediaLibrarySource.sitePlanNotShownUnitIds)
        ? mediaLibrarySource.sitePlanNotShownUnitIds.map((id) => String(id || '').trim()).filter(Boolean)
        : defaults.mediaLibrary.sitePlanNotShownUnitIds,
      visualMap: mediaLibrarySource.visualMap || mediaLibrarySource.visual_map || null,
      masterplanUrl: normalizeTextValue(
        mediaLibrarySource.masterplanUrl ?? mediaLibrarySource.masterplan_url ?? defaults.mediaLibrary.masterplanUrl,
      ),
      floorplanUrls: normalizeTextValue(
        mediaLibrarySource.floorplanUrls ?? mediaLibrarySource.floorplan_urls ?? defaults.mediaLibrary.floorplanUrls,
      ),
      videoUrl: normalizeTextValue(mediaLibrarySource.videoUrl ?? mediaLibrarySource.video_url ?? defaults.mediaLibrary.videoUrl),
      virtualTourUrl: normalizeTextValue(
        mediaLibrarySource.virtualTourUrl ??
          mediaLibrarySource.virtual_tour_url ??
          defaults.mediaLibrary.virtualTourUrl,
      ),
    }),
    downloads: {
      brochureUrl: normalizeTextValue(downloadsSource.brochureUrl ?? defaults.downloads.brochureUrl),
      pricingSheetUrl: normalizeTextValue(downloadsSource.pricingSheetUrl ?? defaults.downloads.pricingSheetUrl),
      specSheetUrl: normalizeTextValue(downloadsSource.specSheetUrl ?? defaults.downloads.specSheetUrl),
      salesPackUrl: normalizeTextValue(downloadsSource.salesPackUrl ?? defaults.downloads.salesPackUrl),
      investmentPackUrl: normalizeTextValue(downloadsSource.investmentPackUrl ?? defaults.downloads.investmentPackUrl),
      termsPdfUrl: normalizeTextValue(downloadsSource.termsPdfUrl ?? defaults.downloads.termsPdfUrl),
      applicationFormUrl: normalizeTextValue(
        downloadsSource.applicationFormUrl ?? defaults.downloads.applicationFormUrl,
      ),
    },
    externalLinks: {
      developmentLandingPageUrl: normalizeTextValue(
        externalLinksSource.developmentLandingPageUrl ?? defaults.externalLinks.developmentLandingPageUrl,
      ),
      googleMapsUrl: normalizeTextValue(externalLinksSource.googleMapsUrl ?? defaults.externalLinks.googleMapsUrl),
      externalWebsiteUrl: normalizeTextValue(
        externalLinksSource.externalWebsiteUrl ?? defaults.externalLinks.externalWebsiteUrl,
      ),
      salesPortalUrl: normalizeTextValue(externalLinksSource.salesPortalUrl ?? defaults.externalLinks.salesPortalUrl),
      whatsappEnquiryUrl: normalizeTextValue(
        externalLinksSource.whatsappEnquiryUrl ?? defaults.externalLinks.whatsappEnquiryUrl,
      ),
      bookingViewingUrl: normalizeTextValue(
        externalLinksSource.bookingViewingUrl ?? defaults.externalLinks.bookingViewingUrl,
      ),
    },
    listingConfiguration: {
      showOnListingWebsite: normalizeMarketingBoolean(
        listingConfigurationSource.showOnListingWebsite,
        defaults.listingConfiguration.showOnListingWebsite,
      ),
      featuredDevelopment: normalizeMarketingBoolean(
        listingConfigurationSource.featuredDevelopment,
        defaults.listingConfiguration.featuredDevelopment,
      ),
      displayOrder: normalizeTextValue(
        listingConfigurationSource.displayOrder ?? defaults.listingConfiguration.displayOrder,
      ),
      listingSlug: normalizeTextValue(
        listingConfigurationSource.listingSlug ?? defaults.listingConfiguration.listingSlug,
      ),
      ctaLabel: normalizeTextValue(listingConfigurationSource.ctaLabel ?? defaults.listingConfiguration.ctaLabel),
      ctaUrl: normalizeTextValue(listingConfigurationSource.ctaUrl ?? defaults.listingConfiguration.ctaUrl),
      marketingStatus: normalizeTextValue(
        listingConfigurationSource.marketingStatus ?? defaults.listingConfiguration.marketingStatus,
      ),
      publicVisibility: normalizeMarketingBoolean(
        listingConfigurationSource.publicVisibility,
        defaults.listingConfiguration.publicVisibility,
      ),
    },
  }
}

export function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTextValue(item)).filter(Boolean)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeTextValue(item)).filter(Boolean)
      }
    } catch {
      // Keep compatibility with plain text values.
    }
  }

  return []
}

export function normalizeDevelopmentProfile(rawProfile = {}) {
  return {
    revision: Number.isSafeInteger(rawProfile.revision) ? rawProfile.revision : null,
    code: normalizeTextValue(rawProfile.code),
    location: normalizeTextValue(rawProfile.location),
    suburb: normalizeTextValue(rawProfile.suburb),
    city: normalizeTextValue(rawProfile.city),
    province: normalizeTextValue(rawProfile.province),
    country: normalizeTextValue(rawProfile.country) || DEFAULT_DEVELOPMENT_PROFILE.country,
    address: normalizeTextValue(rawProfile.address),
    formattedAddress: normalizeTextValue(rawProfile.formattedAddress || rawProfile.formatted_address),
    streetAddress: normalizeTextValue(rawProfile.streetAddress || rawProfile.street_address || rawProfile.address),
    postalCode: normalizeTextValue(rawProfile.postalCode || rawProfile.postal_code),
    latitude: normalizeOptionalNumber(rawProfile.latitude),
    longitude: normalizeOptionalNumber(rawProfile.longitude),
    googlePlaceId: normalizeTextValue(rawProfile.googlePlaceId || rawProfile.google_place_id || rawProfile.placeId),
    description: normalizeTextValue(rawProfile.description),
    status: normalizeTextValue(rawProfile.status) || DEFAULT_DEVELOPMENT_PROFILE.status,
    developerCompany: normalizeTextValue(rawProfile.developerCompany || rawProfile.developer_company),
    launchDate: normalizeTextValue(rawProfile.launchDate || rawProfile.launch_date),
    expectedCompletionDate: normalizeTextValue(
      rawProfile.expectedCompletionDate || rawProfile.expected_completion_date,
    ),
    plans: normalizeListValue(rawProfile.plans),
    sitePlans: normalizeListValue(rawProfile.sitePlans || rawProfile.site_plans),
    imageLinks: normalizeListValue(rawProfile.imageLinks || rawProfile.image_links),
    supportingDocuments: normalizeListValue(rawProfile.supportingDocuments || rawProfile.supporting_documents),
    sellerDetails: normalizeDevelopmentSellerDetails(rawProfile.sellerDetails || rawProfile.seller_details),
    marketingContent: normalizeMarketingContent(rawProfile.marketingContent ?? rawProfile.marketing_content),
  }
}

export function getDevelopmentProfileCoverImage(profile = {}) {
  const mediaLibrary = profile?.marketingContent?.mediaLibrary || profile?.marketingContent?.media_library || {}
  const galleryImages = normalizeListValue(mediaLibrary.galleryImageUrls || mediaLibrary.gallery_image_urls)
  const candidates = [
    mediaLibrary.heroImageUrl,
    mediaLibrary.hero_image_url,
    mediaLibrary.coverImageUrl,
    mediaLibrary.cover_image_url,
    ...galleryImages,
    ...(profile.imageLinks || []),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    if (candidate && typeof candidate === 'object') {
      const url = normalizeTextValue(candidate.url || candidate.src || candidate.imageUrl || candidate.image_url)
      if (url) return url
    }
  }

  return ''
}

export function normalizeDevelopmentSellerDetails(rawSellerDetails = {}) {
  const source = rawSellerDetails && typeof rawSellerDetails === 'object' ? rawSellerDetails : {}
  const rawSignatories = Array.isArray(
    source.signatories || source.authorisedSignatories || source.authorizedSignatories,
  )
    ? source.signatories || source.authorisedSignatories || source.authorizedSignatories
    : []
  const fallbackSignatory =
    source.signatory && typeof source.signatory === 'object'
      ? source.signatory
      : rawSignatories[0] || DEFAULT_DEVELOPMENT_SELLER_DETAILS.signatories[0]
  const signatories = (rawSignatories.length ? rawSignatories : [fallbackSignatory]).map((item = {}) => ({
    fullName: normalizeTextValue(item.fullName || item.full_name || item.name),
    role: normalizeTextValue(item.role || item.title),
    idNumber: normalizeTextValue(item.idNumber || item.id_number || item.identityNumber || item.identity_number),
    email: normalizeEmailAddress(item.email),
    phone: normalizeTextValue(item.phone || item.mobile),
    signingCapacity: normalizeTextValue(item.signingCapacity || item.signing_capacity || item.capacity),
  }))

  return {
    mode: normalizeTextValue(source.mode) || DEFAULT_DEVELOPMENT_SELLER_DETAILS.mode,
    entityType:
      normalizeTextValue(source.entityType || source.entity_type) || DEFAULT_DEVELOPMENT_SELLER_DETAILS.entityType,
    legalName: normalizeTextValue(source.legalName || source.legal_name || source.name),
    tradingName: normalizeTextValue(source.tradingName || source.trading_name),
    registrationNumber: normalizeTextValue(source.registrationNumber || source.registration_number),
    vatNumber: normalizeTextValue(source.vatNumber || source.vat_number),
    registeredAddress: normalizeTextValue(source.registeredAddress || source.registered_address || source.address),
    postalAddress: normalizeTextValue(source.postalAddress || source.postal_address),
    email: normalizeEmailAddress(source.email),
    phone: normalizeTextValue(source.phone || source.mobile),
    vatTreatment: normalizeTextValue(source.vatTreatment || source.vat_treatment),
    notes: normalizeTextValue(source.notes),
    signatories: signatories.length ? signatories : [{ ...DEFAULT_DEVELOPMENT_SELLER_DETAILS.signatories[0] }],
  }
}
