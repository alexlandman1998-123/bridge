import {
  buildRentalCanonicalFacts,
  buildRentalCanonicalFactReadiness,
  buildRentalListingNotes,
  buildRentalListingTitle,
  buildRentalPublicationDraft,
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
