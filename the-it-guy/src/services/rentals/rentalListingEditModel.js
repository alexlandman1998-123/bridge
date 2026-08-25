import {
  buildRentalCanonicalFacts,
  buildRentalCanonicalFactReadiness,
  buildRentalListingNotes,
  buildRentalListingTitle,
  buildRentalPublicationDraft,
  RENTAL_AMENITY_OPTIONS,
  RENTAL_FEATURE_OPTIONS,
  RENTAL_LISTING_INITIAL_FORM,
  validateRentalListingDraftForm,
} from './rentalListingDraftModel.js'
import { buildRentalListingIndexRow } from './rentalListingIndexModel.js'

export const RENTAL_LISTING_EDIT_VERSION = 'arch9_rental_listing_edit_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function formValue(value) {
  return value === null || value === undefined ? '' : String(value)
}

export function buildRentalListingEditForm(listing = {}) {
  const row = buildRentalListingIndexRow(listing)
  const raw = row.raw || listing
  const facts = raw.sellerCanonicalFacts && typeof raw.sellerCanonicalFacts === 'object' ? raw.sellerCanonicalFacts : {}
  const rentalInfo = facts.rentalInfo && typeof facts.rentalInfo === 'object' ? facts.rentalInfo : {}
  const propertyProfile = facts.propertyProfile && typeof facts.propertyProfile === 'object' ? facts.propertyProfile : {}
  const publication =
    raw.listingPublicationData && typeof raw.listingPublicationData === 'object'
      ? raw.listingPublicationData
      : raw.publicationData && typeof raw.publicationData === 'object'
        ? raw.publicationData
        : {}
  const listingMedia = Array.isArray(raw.listingMedia) ? raw.listingMedia : Array.isArray(raw.media) ? raw.media : []
  const galleryImages = listingMedia
    .filter((item) => String(item?.media_type || item?.mediaType || '').trim().toLowerCase() === 'image')
    .map((item, index) => ({
      id: String(item.id || item.path || item.file_url || item.fileUrl || `gallery-${index + 1}`),
      name: String(item.caption || item.name || `Image ${index + 1}`),
      url: String(item.file_url || item.fileUrl || item.url || '').trim(),
      path: String(item.path || '').trim(),
      bucket: String(item.bucket || '').trim(),
      signedUrl: String(item.signed_url || item.signedUrl || '').trim(),
      publicUrl: String(item.public_url || item.publicUrl || '').trim(),
      contentType: String(item.content_type || item.contentType || '').trim(),
      size: Number(item.size || 0) || 0,
    }))
  const storedCoverImage = listingMedia.find((item) => Boolean(item?.is_cover || item?.isCover))
  const coverImageId = String(
    galleryImages.find((item) => item.id && String(item.id) === String(storedCoverImage?.id || storedCoverImage?.path || storedCoverImage?.file_url || storedCoverImage?.fileUrl))?.id ||
      galleryImages.find((item) => item.id && String(item.id) === String(publication.coverImageId || publication.cover_image_id))?.id ||
      galleryImages[0]?.id ||
      '',
  ).trim()

  return {
    ...RENTAL_LISTING_INITIAL_FORM,
    title: normalizeText(row.title === 'Rental listing' ? '' : row.title),
    landlordName: normalizeText(row.landlordName),
    landlordEmail: normalizeText(row.landlordEmail),
    landlordPhone: normalizeText(row.landlordPhone),
    landlordType: normalizeText(facts.landlordType || facts.landlord_type || raw.sellerType || raw.seller_type) || RENTAL_LISTING_INITIAL_FORM.landlordType,
    propertyAddress: normalizeText(row.address),
    suburb: normalizeText(row.suburb),
    city: normalizeText(row.city),
    province: normalizeText(row.province),
    propertyType: normalizeText(row.propertyType) || RENTAL_LISTING_INITIAL_FORM.propertyType,
    bedrooms: formValue(row.bedrooms),
    bathrooms: formValue(row.bathrooms),
    parkingBays: formValue(row.parkingBays),
    floorSize: formValue(publication.floorSize || publication.floor_size || propertyProfile.floorSize || propertyProfile.floor_size),
    erfSize: formValue(publication.erfSize || publication.erf_size || propertyProfile.erfSize || propertyProfile.erf_size),
    monthlyRent: formValue(row.monthlyRent),
    depositAmount: formValue(row.depositAmount),
    availableFrom: normalizeText(row.availableFrom),
    leasePeriodMonths: formValue(row.leasePeriodMonths || RENTAL_LISTING_INITIAL_FORM.leasePeriodMonths),
    furnishedStatus: normalizeText(row.furnishedStatus) || RENTAL_LISTING_INITIAL_FORM.furnishedStatus,
    petsPolicy: normalizeText(row.petsPolicy) || RENTAL_LISTING_INITIAL_FORM.petsPolicy,
    utilitiesPolicy: normalizeText(row.utilitiesPolicy) || RENTAL_LISTING_INITIAL_FORM.utilitiesPolicy,
    inspectionStatus: normalizeText(row.inspectionStatus) || RENTAL_LISTING_INITIAL_FORM.inspectionStatus,
    inspectionNotes: normalizeText(rentalInfo.inspectionNotes || rentalInfo.inspection_notes),
    mandateType: normalizeText(rentalInfo.mandateType || rentalInfo.mandate_type || raw.mandateType || raw.mandate_type) || 'rental',
    mandateStatus: normalizeText(row.mandateStatus) || RENTAL_LISTING_INITIAL_FORM.mandateStatus,
    marketingApprovalStatus: normalizeText(row.marketingApprovalStatus) || RENTAL_LISTING_INITIAL_FORM.marketingApprovalStatus,
    description: normalizeText(raw.description || raw.listingPreviewDescription || raw.listing_preview_description),
    selectedFeatures: Array.isArray(propertyProfile.selectedFeatures)
      ? propertyProfile.selectedFeatures
      : Array.isArray(publication.features)
        ? publication.features.filter((item) => RENTAL_FEATURE_OPTIONS.includes(String(item || '').trim()))
        : [],
    amenities: Array.isArray(propertyProfile.amenities)
      ? propertyProfile.amenities
      : Array.isArray(publication.amenities)
        ? publication.amenities.filter((item) => RENTAL_AMENITY_OPTIONS.includes(String(item || '').trim()))
        : [],
    galleryImages,
    coverImageId,
    internalNotes: normalizeText(raw.internalNotes || raw.internal_notes || raw.internalListingNotes || raw.internal_listing_notes),
  }
}

export function validateRentalListingEditForm(form = {}, context = {}) {
  return validateRentalListingDraftForm(form, context)
}

export function buildRentalListingUpdatePayload(form = {}) {
  const title = buildRentalListingTitle(form)
  const canonicalFacts = buildRentalCanonicalFacts(form)
  return {
    title,
    propertyType: normalizeText(form.propertyType),
    listingCategory: 'rental',
    askingPrice: canonicalFacts.rentalInfo.monthlyRent,
    estimatedValue: canonicalFacts.rentalInfo.monthlyRent,
    addressLine1: normalizeText(form.propertyAddress),
    formattedAddress: normalizeText(form.propertyAddress),
    streetAddress: normalizeText(form.propertyAddress),
    suburb: normalizeText(form.suburb),
    city: normalizeText(form.city),
    province: normalizeText(form.province),
    country: 'South Africa',
    description: normalizeText(form.description),
    internalListingNotes: buildRentalListingNotes(form),
    listingPreviewDescription: normalizeText(form.description) || buildRentalListingNotes(form),
    sellerType: normalizeText(form.landlordType) || 'individual',
    mandateType: normalizeText(form.mandateType) || 'rental',
    mandateStatus: normalizeText(form.mandateStatus) || 'not_started',
    sellerCanonicalFacts: canonicalFacts,
    sellerCanonicalFactReadiness: buildRentalCanonicalFactReadiness(form),
    sellerCanonicalFactsUpdatedAt: new Date().toISOString(),
  }
}

export function buildRentalListingEditPublicationDraft(form = {}) {
  return buildRentalPublicationDraft(form)
}
