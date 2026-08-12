import { buildDirectListingIntakePayload } from './directListingIntakeModel.js'
import {
  buildSellerPortalFormDataFromDirectListing,
  hasDirectListingPortalIntake,
} from './directListingSellerPortalBridge.js'
import { buildDirectListingOperationalSummary } from './directListingOperationalSummary.js'

export const DIRECT_LISTING_RELEASE_PHASES = [
  { phase: 1, key: 'intake_model', label: 'Canonical intake model' },
  { phase: 2, key: 'quick_add_capture', label: 'Quick Add capture UI' },
  { phase: 3, key: 'persistence', label: 'Direct listing persistence' },
  { phase: 4, key: 'requirement_sync', label: 'Seller requirement sync' },
  { phase: 5, key: 'seller_portal_invite', label: 'Seller Portal invitation' },
  { phase: 6, key: 'seller_portal_mapping', label: 'Seller Portal reads direct intake' },
  { phase: 7, key: 'operational_audit', label: 'Listing detail operational audit' },
  { phase: 8, key: 'release_readiness', label: 'Global and Kingstons release gate' },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
}

function isKingstonsListing(listing = {}) {
  const profile = firstObject(listing.sellerProcessProfile, listing.seller_process_profile)
  const organisationText = [
    listing.organisationName,
    listing.organisation_name,
    listing.agencyOrganisation,
    listing.agency_organisation,
    listing.agencyName,
    listing.agency_name,
    listing.workspaceName,
    listing.workspace_name,
    listing.companyName,
    listing.company_name,
  ].map(normalizeText).join(' ').toLowerCase()
  return Boolean(
    profile.isKingstons ||
      profile.key === 'kingstons' ||
      listing.isKingstons ||
      listing.kingstonsSellerProcess ||
      organisationText.includes('kingstons'),
  )
}

function buildFactReadiness(payload = {}) {
  const facts = payload.sellerCanonicalFacts || {}
  const seller = facts.seller || {}
  const legalType = normalizeKey(seller.legal_type || seller.sellerLegalType || facts.sellerLegalType)
  return {
    sellerName: Boolean(facts.sellerName || facts.name || seller.fullName || seller.companyName || seller.trustName),
    sellerEmail: Boolean(facts.sellerEmail || facts.email || seller.sellerEmail || seller.email),
    sellerPhone: Boolean(facts.sellerPhone || facts.phone || seller.sellerPhone || seller.phone),
    sellerLegalType: Boolean(legalType),
    companyDirectors: legalType !== 'company' || Boolean(seller.company?.directors?.length || seller.companyDirectors?.length),
    trustTrustees: legalType !== 'trust' || Boolean(seller.trust?.trustees?.length || seller.trustees?.length),
    multipleOwners: legalType !== 'multiple_owners' || Boolean(seller.owners?.length || seller.multipleOwners?.length),
    foreignOwnerCountry: legalType !== 'foreign_individual' || Boolean(seller.foreignOwnerCountry || seller.foreign?.country),
    propertyAddress: Boolean(facts.propertyAddress || facts.formattedAddress || facts.property?.propertyAddress || facts.property?.address),
    propertyStructureType: Boolean(facts.propertyStructureType || facts.property_structure_type || facts.property?.property_structure_type),
    complianceDeclarations: Boolean(facts.complianceDeclarations || facts.compliance_declarations),
  }
}

export function buildDirectListingReleaseScenarioListing({
  scenario = 'global_individual',
  form = {},
  listing = {},
} = {}) {
  const payload = buildDirectListingIntakePayload(form, {
    capturedBy: listing.capturedBy || `${scenario}_agent`,
    capturedAt: listing.capturedAt || '2026-08-12T10:00:00.000Z',
  })
  const sellerName = [
    payload.sellerOnboardingFormData?.sellerFirstName || payload.sellerOnboardingFormData?.sellerName,
    payload.sellerOnboardingFormData?.sellerSurname,
  ].filter(Boolean).join(' ').trim() || payload.sellerCanonicalFacts?.sellerName || 'Seller'
  const inviteRequested = payload.sellerPortalInvite?.requested === true
  return {
    id: `direct_${scenario}`,
    listingTitle: form.listingTitle || payload.listing?.propertyAddress || `${scenario} listing`,
    organisationName: listing.organisationName || (scenario.includes('kingstons') ? 'Kingstons Real Estate' : 'Global Realty'),
    sellerProcessProfile: scenario.includes('kingstons') ? { isKingstons: true, key: 'kingstons' } : listing.sellerProcessProfile,
    seller: {
      name: sellerName,
      email: payload.sellerPortalInvite?.destinationEmail,
      phone: payload.sellerPortalInvite?.destinationPhone,
    },
    propertyStructureType: payload.listing?.propertyStructureType,
    formattedAddress: payload.listing?.formattedAddress,
    directListingIntake: payload,
    sellerCanonicalFacts: payload.sellerCanonicalFacts,
    sellerCanonicalFactReadiness: buildFactReadiness(payload),
    complianceDeclarations: payload.complianceDeclarations,
    sellerOnboarding: {
      status: 'not_started',
      token: inviteRequested ? `seller-${scenario}-token` : '',
      formData: payload.sellerOnboardingFormData,
      sellerPortalInvite: inviteRequested
        ? {
            requested: true,
            status: 'prepared_local',
            link: `https://app.example.test/seller/onboarding/seller-${scenario}-token`,
          }
        : { requested: false, status: 'not_requested' },
    },
    ...listing,
  }
}

export function buildDirectListingReleaseReadinessScenarios() {
  return [
    buildDirectListingReleaseScenarioListing({
      scenario: 'global_company_sectional',
      form: {
        sellerType: 'company',
        sellerName: 'Casey',
        sellerSurname: 'Contact',
        sellerEmail: 'casey@example.com',
        sellerPhone: '+27 82 111 2222',
        companyName: 'Global Listing Holdings',
        companyRegistrationNumber: '2026/123456/07',
        companyDirectors: [{ fullName: 'Dina Director', email: 'dina@example.com' }],
        propertyAddress: '12 Global Scheme Road',
        propertyStructureType: 'sectional_title',
        propertyType: 'apartment',
        unitNumber: '17',
        complexName: 'Global Scheme',
        hasSignedMandate: true,
        mandateType: 'dual',
        hasSignedPropertyConditionDisclosure: false,
        hasSignedFicaForm: true,
        sellerPortalInviteRequested: true,
      },
    }),
    buildDirectListingReleaseScenarioListing({
      scenario: 'global_trust',
      form: {
        sellerType: 'trust',
        sellerName: 'Theo',
        sellerSurname: 'Trustee',
        sellerEmail: 'trust@example.com',
        sellerPhone: '+27 82 111 3333',
        trustName: 'Global Listing Trust',
        trustees: [{ fullName: 'Tina Trustee', email: 'tina@example.com' }],
        propertyAddress: '21 Trust Street',
        propertyStructureType: 'full_title',
        hasSignedMandate: false,
        hasSignedPropertyConditionDisclosure: false,
        hasSignedFicaForm: false,
      },
    }),
    buildDirectListingReleaseScenarioListing({
      scenario: 'global_foreign_individual',
      form: {
        sellerType: 'foreign_individual',
        sellerName: 'Franco',
        sellerSurname: 'Foreign',
        sellerEmail: 'foreign@example.com',
        sellerPhone: '+44 20 0000 0000',
        foreignOwnerCountry: 'United Kingdom',
        foreignPassportNumber: 'GB123456',
        propertyAddress: '8 International Avenue',
        propertyStructureType: 'full_title',
        hasSignedMandate: true,
        hasSignedPropertyConditionDisclosure: true,
        hasSignedFicaForm: false,
      },
    }),
    buildDirectListingReleaseScenarioListing({
      scenario: 'kingstons_company_sectional',
      form: {
        sellerType: 'company',
        sellerName: 'Kelly',
        sellerSurname: 'Kingstons',
        sellerEmail: 'kingstons@example.com',
        sellerPhone: '+27 82 111 4444',
        companyName: 'Kingstons Listing Holdings',
        companyRegistrationNumber: '2026/654321/07',
        companyDirectors: [{ fullName: 'Karl Director', email: 'karl@example.com' }],
        propertyAddress: '44 Kingstons Scheme Road',
        propertyStructureType: 'sectional_title',
        propertyType: 'apartment',
        unitNumber: '4',
        complexName: 'Kingstons Scheme',
        hasSignedMandate: true,
        mandateType: 'sole',
        hasSignedPropertyConditionDisclosure: true,
        hasSignedFicaForm: true,
        sellerPortalInviteRequested: true,
      },
    }),
  ]
}

function evaluateDirectListingReleaseRow(listing = {}) {
  const summary = buildDirectListingOperationalSummary(listing)
  const portalFormData = buildSellerPortalFormDataFromDirectListing(listing)
  const intake = firstObject(listing.directListingIntake, listing.direct_listing_intake)
  const declarations = firstObject(
    portalFormData.directListingComplianceDeclarations,
    listing.complianceDeclarations,
    listing.compliance_declarations,
    intake.complianceDeclarations,
  )
  const kingstons = isKingstonsListing(listing)
  const uploadFree = Boolean(
    intake.uploadsRequired === false &&
      intake.evidenceRequired === false &&
      declarations.uploadsRequired === false &&
      declarations.evidenceRequired === false &&
      portalFormData.directListingUploadsRequired === false &&
      summary.uploadsRequired === false,
  )
  const portalReady = Boolean(
    hasDirectListingPortalIntake(listing) &&
      portalFormData.ownerEntityType &&
      portalFormData.ownerStructureType &&
      portalFormData.propertyStructureType &&
      portalFormData.email,
  )
  const operationalAuditReady = Boolean(summary.hasIntake && summary.declarationOnly && summary.uploadsRequired === false)
  const blockers = [
    !summary.hasIntake && 'Direct listing intake not detected',
    !uploadFree && 'Direct listing requires uploads or evidence',
    !portalReady && 'Seller Portal mapping incomplete',
    !operationalAuditReady && 'Operational audit summary incomplete',
    kingstons && !uploadFree && 'Kingstons direct listing would be upload-gated',
  ].filter(Boolean)

  return {
    listingId: listing.id || '',
    title: listing.listingTitle || listing.title || listing.formattedAddress || 'Direct listing',
    kingstons,
    ready: blockers.length === 0,
    uploadFree,
    portalReady,
    operationalAuditReady,
    declarationOnly: summary.declarationOnly === true,
    sellerType: summary.sellerType,
    propertyStructureType: summary.propertyStructureType,
    portalInviteStatus: summary.portalInvite?.status || 'not_requested',
    attentionItems: summary.attentionItems || [],
    blockers,
  }
}

export function buildDirectListingReleaseReadinessReport({ listings = null } = {}) {
  const rows = (Array.isArray(listings) && listings.length ? listings : buildDirectListingReleaseReadinessScenarios())
    .map((listing) => evaluateDirectListingReleaseRow(listing))
  const blockers = rows.flatMap((row) => row.blockers.map((blocker) => ({
    listingId: row.listingId,
    title: row.title,
    blocker,
  })))
  const kingstonsRows = rows.filter((row) => row.kingstons)
  return {
    ready: blockers.length === 0,
    phase: 8,
    phaseKey: 'release_readiness',
    phases: DIRECT_LISTING_RELEASE_PHASES,
    counts: {
      scenarios: rows.length,
      ready: rows.filter((row) => row.ready).length,
      blocked: rows.filter((row) => !row.ready).length,
      kingstons: kingstonsRows.length,
      uploadFree: rows.filter((row) => row.uploadFree).length,
      portalReady: rows.filter((row) => row.portalReady).length,
      operationalAuditReady: rows.filter((row) => row.operationalAuditReady).length,
    },
    rows,
    blockers,
    globalContract: {
      directListingWithoutLeadProcess: rows.every((row) => row.ready || row.blockers.every((blocker) => !blocker.includes('lead'))),
      declarationOnly: rows.every((row) => row.declarationOnly),
      uploadsRequired: false,
      sellerPortalReadsDirectFormat: rows.every((row) => row.portalReady),
      kingstonsSafe: kingstonsRows.every((row) => row.ready && row.uploadFree),
    },
  }
}

export default {
  DIRECT_LISTING_RELEASE_PHASES,
  buildDirectListingReleaseReadinessReport,
  buildDirectListingReleaseReadinessScenarios,
  buildDirectListingReleaseScenarioListing,
}
