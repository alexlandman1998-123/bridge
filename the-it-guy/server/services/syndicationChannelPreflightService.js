import { buildSyndicationFacts } from '../../src/services/syndicationFactsService.js'
import { evaluateProperty24ListingCategoryContract } from '../property24/listingCategoryContract.js'
import { resolveSyndicationReviewRollout } from './syndicationReviewRolloutService.js'
import { evaluateListingPortalAddressProtection } from './listingPortalAddressProtectionService.js'
import { buildListingFeatureDeliveryReview } from './listingFeatureDeliveryReview.js'

export const SYNDICATION_CHANNEL_PREFLIGHT_VERSION = 'arch9_syndication_channel_preflight_v1'

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function listingData(listing = {}, publication = {}) {
  const propertyDetails = listing.propertyDetails || listing.property_details || {}
  const onboarding = listing.sellerOnboarding?.formData || listing.seller_onboarding?.form_data || {}
  return {
    title: firstText(listing.title, listing.listingTitle, publication.title, propertyDetails.headline),
    description: firstText(publication.description, listing.description, listing.listingDescription, onboarding.listingDescription, onboarding.propertyDescription),
    propertyType: firstText(propertyDetails.propertyType, listing.property_type, listing.propertyType, publication.property_type, publication.propertyType),
    propertyCategory: firstText(propertyDetails.propertyCategory, onboarding.propertyCategory, listing.property_category, listing.propertyCategory, publication.property_category, publication.propertyCategory),
    saleType: firstText(propertyDetails.saleType, onboarding.saleType),
    price: number(firstText(propertyDetails.price, onboarding.askingPrice, listing.asking_price, listing.askingPrice, publication.asking_price, publication.askingPrice)),
    bedrooms: number(firstText(propertyDetails.bedrooms, onboarding.bedrooms, publication.bedrooms, listing.bedrooms)),
    bathrooms: number(firstText(propertyDetails.bathrooms, onboarding.bathrooms, publication.bathrooms, listing.bathrooms)),
  }
}

function sharedDataBlockers(data, facts) {
  const blockers = []
  if (!data.title) blockers.push('listing_title_required')
  if (!data.description) blockers.push('listing_description_required')
  if (!data.propertyType && !facts.propertyCategory) blockers.push('property_type_required')
  if (facts.listingPurpose === 'Sale' && facts.pricePresentation !== 'Poa' && data.price <= 0) blockers.push('sale_price_required')
  if (facts.listingPurpose === 'Rental' && data.price <= 0) blockers.push('rental_price_required')
  if (facts.pricePresentation === 'OffersFrom') {
    if (facts.offersFromPrice === null || facts.offersFromPrice <= 0) blockers.push('offers_from_price_required')
    if (data.price > 0 && facts.offersFromPrice > data.price) blockers.push('offers_from_price_must_not_exceed_price')
  }
  return blockers
}

function privatePropertyPreflight({ data, facts, sharedBlockers, addressProtection }) {
  const blockers = [...sharedBlockers, ...(addressProtection.privateProperty.blockers || [])]
  const warnings = [...(addressProtection.privateProperty.warnings || [])]
  const propertyType = key(data.propertyType || facts.propertyCategory)
  const isResidential = !['land', 'farm', 'commercial', 'industrial', 'mixed_use'].includes(propertyType)

  if (isResidential && (!data.bedrooms || !data.bathrooms)) blockers.push('private_property_residential_bedrooms_and_bathrooms_required')
  if (propertyType === 'land' && !facts.landArea) blockers.push('private_property_land_area_required')
  if (propertyType === 'farm' && !facts.propertySubtype) blockers.push('private_property_farm_type_required')
  if (['commercial', 'industrial'].includes(propertyType) && !facts.propertySubtype) blockers.push('private_property_business_type_required')
  if (facts.listingPurpose === 'Rental' && facts.rentalPricePeriod === 'PerM2' && !['commercial', 'industrial', 'land', 'farm', 'mixed_use'].includes(propertyType)) {
    blockers.push('private_property_per_m2_rental_requires_specialist_category')
  }
  if (key(data.saleType) === 'auction' && !facts.mandateType) warnings.push('private_property_auction_details_are_checked_at_submission')

  return finishChannel({
    channel: 'private_property',
    blockers,
    warnings,
    mappedOutcome: {
      listingType: facts.listingPurpose === 'Rental' ? 'ToLet' : 'ForSale',
      propertyCategory: facts.propertyCategory || data.propertyType || null,
      pricePresentation: facts.listingPurpose === 'Sale' ? facts.pricePresentation : null,
      rentalPricePeriod: facts.listingPurpose === 'Rental' ? facts.rentalPricePeriod : null,
      availableFrom: facts.availableFrom,
      agents: 'resolved_server_side',
    },
  })
}

function property24Preflight({ listing, publication, data, facts, sharedBlockers, addressProtection }) {
  const categoryContract = evaluateProperty24ListingCategoryContract({
    listing: {
      ...listing,
      property_category: facts.propertyCategory || data.propertyCategory || listing.property_category,
      property_type: data.propertyType || listing.property_type,
    },
    publication,
    listingType: facts.listingPurpose,
  })
  const blockers = [...sharedBlockers, ...categoryContract.blockers]
  const warnings = [...(addressProtection.property24.warnings || [])]

  if (facts.listingPurpose === 'Sale' && ['Negotiable', 'OffersFrom'].includes(facts.pricePresentation)) {
    blockers.push('property24_price_presentation_not_verified')
  }
  if (['auction', 'tender'].includes(key(data.saleType))) blockers.push('property24_sales_method_not_verified')
  if (categoryContract.category === 'residential' && (!data.bedrooms || !data.bathrooms)) {
    warnings.push('property24_residential_bedrooms_and_bathrooms_should_be_completed_before_submission')
  }

  return finishChannel({
    channel: 'property24',
    blockers,
    warnings,
    mappedOutcome: {
      listingType: facts.listingPurpose,
      category: categoryContract.category,
      pricePresentation: facts.pricePresentation === 'Poa' ? 'Poa' : 'Standard',
      rentalPricePeriod: facts.listingPurpose === 'Rental' ? facts.rentalPricePeriod : null,
      requiresMappedPrimaryAgent: true,
      requiresMappedSuburbAndPropertyType: true,
      requiresExactCurrentSuburbLookup: addressProtection.property24.requiresExactCurrentLookup,
      requiresFutureExpiryDate: true,
    },
    contract: categoryContract,
  })
}

function finishChannel({ channel, blockers = [], warnings = [], mappedOutcome = {}, contract = null }) {
  const uniqueBlockers = [...new Set(blockers.filter(Boolean))]
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))]
  return {
    channel,
    status: uniqueBlockers.length ? 'blocked' : uniqueWarnings.length ? 'ready_with_warnings' : 'ready',
    dataReady: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    mappedOutcome,
    contract,
    serverConfigurationCheckedAtSubmission: true,
  }
}

async function fetchOptionalSingle(client, table, column, value) {
  const result = await client.from(table).select('*').eq(column, value).maybeSingle()
  if (result.error?.code === '42P01') return null
  if (result.error) throw result.error
  return result.data || null
}

export async function fetchSyndicationChannelPreflightInput({ client, listingId = '' } = {}) {
  const normalizedListingId = text(listingId)
  if (!client) throw new Error('Supabase client is required.')
  if (!normalizedListingId) throw new Error('Listing id is required.')

  const listingResult = await client.from('private_listings').select('*').eq('id', normalizedListingId).maybeSingle()
  if (listingResult.error) throw listingResult.error
  if (!listingResult.data) {
    const error = new Error('Listing not found.')
    error.status = 404
    error.code = 'listing_not_found'
    throw error
  }

  const [publication, onboarding, privatePropertySync] = await Promise.all([
    fetchOptionalSingle(client, 'listing_publication_data', 'listing_id', normalizedListingId),
    fetchOptionalSingle(client, 'private_listing_seller_onboarding', 'private_listing_id', normalizedListingId),
    fetchOptionalSingle(client, 'private_property_listing_syncs', 'private_listing_id', normalizedListingId),
  ])

  return {
    listing: {
      ...listingResult.data,
      sellerOnboarding: onboarding ? { formData: onboarding.form_data || {} } : undefined,
      privatePropertySync: privatePropertySync || undefined,
    },
    publication: publication || {},
  }
}

/**
 * A deterministic, side-effect-free summary for the publish-review UI.
 * Actual portal calls keep their current server-side checks; this response
 * cannot authorise or bypass a publish request on its own.
 */
export function buildSyndicationChannelPreflight({
  listing = {},
  publication = {},
  facts = {},
  organisationId = '',
  env = {},
} = {}) {
  const normalizedFacts = buildSyndicationFacts({ listing, publication, facts })
  const data = listingData(listing, publication)
  const sharedBlockers = sharedDataBlockers(data, normalizedFacts)
  const addressProtection = evaluateListingPortalAddressProtection({
    listing,
    publication,
    existingPrivatePropertySync: listing.privatePropertySync || listing.private_property_sync || {},
  })
  const privatePropertyBase = privatePropertyPreflight({ data, facts: normalizedFacts, sharedBlockers, addressProtection })
  const property24Base = property24Preflight({ listing, publication, data, facts: normalizedFacts, sharedBlockers, addressProtection })
  const featureDelivery = buildListingFeatureDeliveryReview({
    listing,
    publication,
    property24Category: property24Base.contract?.category || '',
  })
  const channelFeatures = (channel) => featureDelivery.facts.map((item) => ({
    key: item.key, label: item.label, value: item.value, ...item[channel],
  }))
  const privateProperty = { ...privatePropertyBase, featureDelivery: channelFeatures('privateProperty') }
  const property24 = { ...property24Base, featureDelivery: channelFeatures('property24') }
  const channels = { privateProperty, property24 }
  const readyChannels = Object.values(channels).filter((channel) => channel.dataReady).map((channel) => channel.channel)
  const rollout = resolveSyndicationReviewRollout({
    env,
    organisationId,
    listingCategory: normalizedFacts.propertyCategory || data.propertyCategory || data.propertyType,
  })

  return {
    version: SYNDICATION_CHANNEL_PREFLIGHT_VERSION,
    listingId: text(listing.id) || null,
    rollout,
    facts: normalizedFacts,
    addressProtection,
    shared: {
      dataReady: sharedBlockers.length === 0,
      blockers: sharedBlockers,
    },
    channels,
    overall: {
      status: readyChannels.length === Object.keys(channels).length
        ? 'ready'
        : readyChannels.length
          ? 'partially_ready'
          : 'blocked',
      readyChannels,
      legacyPublishPathPreserved: true,
    },
  }
}
