import { buildSellerMandateTermsFormPatch } from './sellerMandateCapture.js'
import { resolveSellerBondStatus } from './sellerBondStatus.js'
import {
  buildListingSellerProfileCapturePayload,
  createListingSellerProfileBuilderDraft,
  resolveListingSellerProfileBranch,
  validateListingSellerProfileBuilderDraft,
} from './listingSellerProfileBuilderModel.js'
import { buildSellerProfileCanonicalPayload } from './sellerProfileCaptureModel.js'
import { validateSellerOnboardingFacts } from '../services/documents/sellerOnboardingFactTransformer.js'
import { resolveSellerLeadOwnershipRoute } from './sellerLeadOwnershipSetupModel.js'
import { getSellerFicaOnboardingMissing } from './sellerFicaOnboardingFields.js'

function text(value = '') {
  return String(value ?? '').trim()
}

function isAffirmative(value) {
  return value === true || ['accepted', 'yes', 'true', '1'].includes(text(value).toLowerCase())
}

function editValue(value, field = '') {
  if (Array.isArray(value)) return value.map((entry) => editValue(entry))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, editValue(value[key], key)]))
  }
  if (typeof value === 'boolean') return value
  const normalized = text(value)
  return /email$/i.test(field) ? normalized.toLowerCase() : normalized
}

// Compare the editable draft, not regenerated aliases, canonical metadata or
// saved timestamps. Keep explicit zero/false values and deliberate clears.
export function getSellerLeadProfileEditChanges(before = {}, after = {}, fields = null) {
  const keys = fields || [...new Set([...Object.keys(before), ...Object.keys(after)])]
  return keys.filter((key) => JSON.stringify(editValue(before[key], key)) !== JSON.stringify(editValue(after[key], key)))
}

/**
 * Adapts the seller-lead agent editor to the same capture payload used by the
 * listing-side Seller Profile Builder. The lead UI may remain compact, but its
 * manual entries now have the same explicit source marker and canonical facts.
 */
export function buildSellerLeadManualCapturePayload({ form = {}, listing = {}, legacyFormData = {} } = {}) {
  const source = { ...legacyFormData, ...form }
  const branch = resolveSellerLeadOwnershipRoute(source)
  const draft = {
    branch,
    primaryContactName: text(source.primaryContactName || source.contactName),
    otherEntityName: text(source.otherEntityName),
    otherEntityRegistrationNumber: text(source.otherEntityRegistrationNumber),
    otherAuthorityDetails: text(source.otherAuthorityDetails),
    sellerFirstName: text(source.firstName || source.sellerFirstName),
    sellerSurname: text(source.lastName || source.sellerSurname),
    email: text(source.email ?? source.sellerEmail).toLowerCase(),
    phone: text(source.phone ?? source.sellerPhone ?? source.mobile),
    idNumber: text(source.idNumber || source.sellerIdNumber),
    residentialAddress: text(source.residentialAddress || source.residentialStreet),
    maritalStatus: text(source.maritalStatus || source.maritalRegime),
    spouseName: text(source.spouseName),
    spouseEmail: text(source.spouseEmail),
    spouseIdNumber: text(source.spouseIdNumber),
    multipleOwners: Array.isArray(source.multipleOwners) ? source.multipleOwners : [],
    companyAuthorityBasis: text(source.companyAuthorityBasis),
    companyResolutionDate: text(source.companyResolutionDate),
    trustAuthorityBasis: text(source.trustAuthorityBasis),
    executorAuthorityDetails: text(source.executorAuthorityDetails),
    powerOfAttorneyAuthorityDetails: text(source.powerOfAttorneyAuthorityDetails),
    companyName: text(source.companyName),
    companyRegistrationNumber: text(source.companyRegistrationNumber),
    companyRegisteredAddress: text(source.companyRegisteredAddress),
    companyDirectors: Array.isArray(source.companyDirectors) ? source.companyDirectors : [],
    authorisedSignatoryName: text(source.authorisedSignatoryName),
    authorisedSignatoryCapacity: text(source.authorisedSignatoryCapacity),
    authorisedSignatoryEmail: text(source.authorisedSignatoryEmail).toLowerCase(),
    authorisedSignatoryIdNumber: text(source.authorisedSignatoryIdNumber),
    authorisedSignatoryNationality: text(source.authorisedSignatoryNationality),
    authorisedSignatoryAddress: text(source.authorisedSignatoryAddress),
    authorisedSignatoryPhone: text(source.authorisedSignatoryPhone),
    trustName: text(source.trustName),
    trustRegistrationNumber: text(source.trustRegistrationNumber),
    trustRegisteredAddress: text(source.trustRegisteredAddress),
    trustees: Array.isArray(source.trustees) ? source.trustees : [],
    authorisedTrusteeName: text(source.authorisedTrusteeName),
    authorisedTrusteeCapacity: text(source.authorisedTrusteeCapacity),
    authorisedTrusteeEmail: text(source.authorisedTrusteeEmail).toLowerCase(),
    authorisedTrusteeIdNumber: text(source.authorisedTrusteeIdNumber),
    authorisedTrusteeNationality: text(source.authorisedTrusteeNationality),
    authorisedTrusteeAddress: text(source.authorisedTrusteeAddress),
    authorisedTrusteePhone: text(source.authorisedTrusteePhone),
    deceasedEstateName: text(source.deceasedEstateName),
    estateReferenceNumber: text(source.estateReferenceNumber || source.estateReference),
    executorName: text(source.executorName),
    executorEmail: text(source.executorEmail).toLowerCase(),
    powerOfAttorneyPrincipalName: text(source.powerOfAttorneyPrincipalName),
    powerOfAttorneyPrincipalIdNumber: text(source.powerOfAttorneyPrincipalIdNumber),
    powerOfAttorneyName: text(source.powerOfAttorneyName),
    powerOfAttorneyEmail: text(source.powerOfAttorneyEmail).toLowerCase(),
    foreignOwnerCountry: text(source.foreignOwnerCountry),
    foreignPassportNumber: text(source.foreignPassportNumber),
    foreignRegistrationNumber: text(source.foreignRegistrationNumber),
    foreignResidencyStatus: text(source.foreignResidencyStatus),
    propertyAddress: text(source.propertyAddress || source.formattedAddress),
    propertyStructureType: text(source.ownershipScheme || source.propertyStructureType),
    propertyCategory: text(source.propertyCategory),
    bondStatus: resolveSellerBondStatus(form.bondStatus, form.bondExists, form.existingBond, legacyFormData.bondStatus, legacyFormData.bondExists, legacyFormData.existingBond),
    bondHolder: text(source.mortgageBank || source.bondHolder),
    ratesTaxes: text(source.ratesAndTaxes ?? source.ratesTaxes),
    levies: text(source.levies),
    askingPrice: text(source.askingPrice),
    mandateType: text(source.mandateType),
    otherAgencyName: text(source.otherAgencyName),
    popiConsent: text(source.popiConsent),
    ...buildSellerMandateTermsFormPatch(source),
  }

  return {
    draft,
    ...buildListingSellerProfileCapturePayload(draft, listing, { draft: true }),
  }
}

const EXTRA_ONBOARDING_FIELDS = [
  'dateOfBirth', 'nationality', 'incomeTaxNumber', 'saResident',
  'propertySuburb', 'propertyCity', 'propertyProvince', 'propertyPostalCode',
  'companyResolutionDate', 'companyAuthorityBasis', 'trustAuthorityBasis',
  'executorAuthorityDetails', 'powerOfAttorneyAuthorityDetails', 'otherAuthorityDetails',
  'leaseExpiryDate', 'otherAgencyName',
  'occupation', 'sourceOfFunds', 'politicallyExposedPerson', 'politicallyExposedDetails',
  'authorisedSignatoryIdNumber', 'authorisedSignatoryNationality',
  'authorisedTrusteeIdNumber', 'authorisedTrusteeNationality', 'trustBeneficiaryClass',
]

export function createSellerLeadAgentOnboardingDraft({ lead = {}, contact = {}, listing = {}, formData = {} } = {}) {
  const branch = resolveListingSellerProfileBranch(formData, listing)
  const naturalPerson = !branch || ['individual', 'married', 'foreign_individual'].includes(branch)
  const source = {
    ...formData,
    primaryContactName: text(formData.primaryContactName ?? formData.contactName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')),
    sellerFirstName: text(formData.sellerFirstName || formData.firstName || contact.firstName || (naturalPerson ? lead.sellerName : '')),
    sellerSurname: text(formData.sellerSurname || formData.lastName || contact.lastName || (naturalPerson ? lead.sellerSurname : '')),
    email: text(formData.email ?? formData.sellerEmail ?? contact.email ?? lead.sellerEmail),
    phone: text(formData.phone ?? formData.sellerPhone ?? contact.phone ?? lead.sellerPhone),
    residentialAddress: text(formData.residentialAddress || formData.residentialStreet || formData.streetAddress),
    propertyAddress: text(formData.propertyAddress || lead.sellerPropertyAddress || lead.formattedAddress || listing.formattedAddress),
  }
  const draft = createListingSellerProfileBuilderDraft({
    ...listing,
    sellerOnboarding: { ...(listing.sellerOnboarding || {}), formData: source, form_data: source },
    sellerOnboardingFormData: source,
    seller_onboarding_form_data: source,
  })
  for (const field of EXTRA_ONBOARDING_FIELDS) draft[field] = text(formData[field] ?? listing[field] ?? draft[field])
  draft.incomeTaxNumber = text(formData.incomeTaxNumber || formData.sellerTaxNumber || formData.taxNumber)
  draft.saResident = text(formData.saResident || formData.taxResident)
  draft.propertySuburb = text(formData.propertySuburb || formData.suburb || listing.suburb)
  draft.propertyCity = text(formData.propertyCity || formData.city || listing.city)
  draft.propertyProvince = text(formData.propertyProvince || formData.province || listing.province)
  draft.leaseExists = isAffirmative(formData.leaseExists)
  draft.popiConsentAccepted = isAffirmative(formData.popiConsentAccepted || formData.popi_consent_accepted || formData.popiConsent)
  return draft
}

export function buildSellerLeadAgentOnboardingSubmission({ draft = {}, listing = {}, existingFormData = {} } = {}) {
  const errors = validateListingSellerProfileBuilderDraft(draft)
  errors.push(...getSellerFicaOnboardingMissing(draft))
  if (!draft.popiConsentAccepted) errors.push('Confirm that the seller gave POPI consent before submitting.')
  const { formPatch } = buildListingSellerProfileCapturePayload(draft, listing, { draft: false })
  const formData = {
    ...existingFormData,
    ...formPatch,
    ...Object.fromEntries(EXTRA_ONBOARDING_FIELDS.map((field) => [field, draft[field] || ''])),
    residentialAddress: text(draft.residentialAddress),
    residentialStreet: text(draft.residentialAddress),
    suburb: text(draft.propertySuburb),
    city: text(draft.propertyCity),
    province: text(draft.propertyProvince),
    postalCode: text(draft.propertyPostalCode),
    alternativeNumber: text(draft.alternativeContact),
    income_tax_number: text(draft.incomeTaxNumber),
    sellerTaxNumber: text(draft.incomeTaxNumber),
    taxNumber: text(draft.incomeTaxNumber),
    sa_resident: text(draft.saResident),
    popiConsent: draft.popiConsentAccepted ? 'Accepted' : '',
    popiConsentAccepted: Boolean(draft.popiConsentAccepted),
    popiConsentAcceptedAt: draft.popiConsentAccepted
      ? text(existingFormData.popiConsentAcceptedAt) || new Date().toISOString()
      : '',
    sellerOwnershipRoute: text(draft.branch),
    ownershipRouteConfirmed: true,
    leaseExists: Boolean(draft.leaseExists),
    leaseExpiryDate: text(draft.leaseExpiryDate),
  }
  const canonicalPayload = buildSellerProfileCanonicalPayload(formData, listing, {
    source: 'seller_onboarding_submit',
    draft: false,
  })
  if (canonicalPayload.canonicalSellerFacts) {
    const factValidation = validateSellerOnboardingFacts(canonicalPayload.canonicalSellerFacts, { draft: false })
    errors.push(...factValidation.required.map((issue) => issue.message))
  }
  return {
    formData: { ...formData, ...canonicalPayload },
    errors: [...new Set(errors)],
  }
}

export function buildSellerLeadSigningPackTermsPatch(terms = {}) {
  return buildSellerMandateTermsFormPatch(terms)
}

export default {
  buildSellerLeadManualCapturePayload,
  createSellerLeadAgentOnboardingDraft,
  buildSellerLeadAgentOnboardingSubmission,
  buildSellerLeadSigningPackTermsPatch,
}
