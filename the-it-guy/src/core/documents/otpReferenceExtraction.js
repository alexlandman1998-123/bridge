export const OTP_REFERENCE_EXTRACTION_VERSION = 'otp_reference_extraction_phase1_v1'

export const OTP_RESALE_REFERENCE_SOURCE = Object.freeze({
  label: 'Kingstons 2026 resale OTP reference',
  path: '/Users/alexanderlandman/Downloads/2026 OTP - Cover Page.docx',
  sha256: 'a1f8f2e82611f44aead9b2f9ac6fdaa19c8577038b17ca1a6666f2cd4e9910cc',
  routeKey: 'resale_existing_property',
  renderedPageCount: 15,
  paragraphCount: 416,
  embeddedMediaCount: 3,
  footerTextSignal: 'KINGSTONS REAL ESTATE PTY LTD',
})

export const OTP_REFERENCE_BRANDING_REQUIREMENTS = Object.freeze([
  Object.freeze({
    key: 'logo_top_left',
    label: 'Logo top left',
    required: true,
    sourceSignal: 'Reference contains embedded logo/media assets and a strong first-page brand mark.',
    targetRule: 'Native PDF shell must render the organisation logo in the top-left brand region with an approved fallback.',
  }),
  Object.freeze({
    key: 'company_details_top_right',
    label: 'Company details top right',
    required: true,
    sourceSignal: 'Reference carries agency identity and contact facts in the front schedule.',
    targetRule: 'Native PDF shell must render organisation/agent/contact/document details in the top-right region.',
  }),
  Object.freeze({
    key: 'agency_name_footer_left',
    label: 'Agency name bottom left',
    required: true,
    sourceSignal: 'Reference footer includes agency name.',
    targetRule: 'Native PDF shell must render agency/trading name in the bottom-left footer region.',
  }),
  Object.freeze({
    key: 'page_number_footer_middle',
    label: 'Page number bottom middle',
    required: true,
    sourceSignal: 'Reference renders page numbering in the footer area.',
    targetRule: 'Native PDF shell must render page number and total-page context in the bottom-middle footer region.',
  }),
  Object.freeze({
    key: 'website_footer_right',
    label: 'Website bottom right',
    required: true,
    sourceSignal: 'Reference establishes a branded footer treatment.',
    targetRule: 'Native PDF shell must render organisation website in the bottom-right footer region.',
  }),
])

export const OTP_RESALE_REFERENCE_TOC = Object.freeze([
  Object.freeze({ number: 1, key: 'schedule_1', title: 'Schedule 1', category: 'schedule' }),
  Object.freeze({ number: 2, key: 'schedule_2', title: 'Schedule 2', category: 'schedule' }),
  Object.freeze({ number: 3, key: 'definitions', title: 'Definitions', category: 'legal_clause' }),
  Object.freeze({ number: 4, key: 'interpretations', title: 'Interpretations', category: 'legal_clause' }),
  Object.freeze({ number: 5, key: 'sale', title: 'Sale', category: 'legal_clause' }),
  Object.freeze({ number: 6, key: 'acceptance', title: 'Acceptance', category: 'legal_clause' }),
  Object.freeze({ number: 7, key: 'purchase_price', title: 'Purchase Price', category: 'legal_clause' }),
  Object.freeze({ number: 8, key: 'the_property', title: 'The Property', category: 'legal_clause' }),
  Object.freeze({ number: 9, key: 'risk', title: 'Risk', category: 'legal_clause' }),
  Object.freeze({ number: 10, key: 'transfer', title: 'Transfer', category: 'legal_clause' }),
  Object.freeze({ number: 11, key: 'occupation', title: 'Occupation', category: 'legal_clause' }),
  Object.freeze({ number: 12, key: 'suspensive_conditions', title: 'Suspensive Conditions', category: 'legal_clause' }),
  Object.freeze({ number: 13, key: 'warranties', title: 'Warranties', category: 'legal_clause' }),
  Object.freeze({ number: 14, key: 'nomination_capacity_parties', title: 'Nomination and Capacity of Parties', category: 'legal_clause' }),
  Object.freeze({ number: 15, key: 'commission', title: 'Commission', category: 'legal_clause' }),
  Object.freeze({ number: 16, key: 'certificates', title: 'Certificates', category: 'legal_clause' }),
  Object.freeze({ number: 17, key: 'rates_taxes_consumption_charges', title: 'Rates, Taxes and Consumption Charges', category: 'legal_clause' }),
  Object.freeze({ number: 18, key: 'breach', title: 'Breach', category: 'legal_clause' }),
  Object.freeze({ number: 19, key: 'cooling_off', title: 'Cooling Off', category: 'legal_clause' }),
  Object.freeze({ number: 20, key: 'domicilium_notices', title: 'Domiciliary / Notices', category: 'legal_clause' }),
  Object.freeze({ number: 21, key: 'consent_to_jurisdiction', title: 'Consent to Jurisdiction', category: 'legal_clause' }),
  Object.freeze({ number: 22, key: 'marital_status_purchaser', title: 'Marital Status of Purchaser', category: 'legal_clause' }),
  Object.freeze({ number: 23, key: 'special_conditions', title: 'Special Conditions', category: 'legal_clause' }),
  Object.freeze({ number: 24, key: 'costs', title: 'Costs', category: 'legal_clause' }),
  Object.freeze({ number: 25, key: 'sale_board', title: 'Sale Board', category: 'legal_clause' }),
  Object.freeze({ number: 26, key: 'whole_agreement', title: 'Whole Agreement', category: 'legal_clause' }),
  Object.freeze({ number: 27, key: 'non_variation', title: 'Non Variation', category: 'legal_clause' }),
  Object.freeze({ number: 28, key: 'non_waiver', title: 'Non Waiver', category: 'legal_clause' }),
  Object.freeze({ number: 29, key: 'severability', title: 'Severability', category: 'legal_clause' }),
  Object.freeze({ number: 30, key: 'applicable_law', title: 'Applicable Law', category: 'legal_clause' }),
])

export const OTP_RESALE_REFERENCE_SCHEDULES = Object.freeze([
  Object.freeze({
    key: 'schedule_1',
    title: 'Schedule 1',
    purpose: 'Commercial and party fact capture for the resale OTP.',
    subsections: Object.freeze([
      'purchaser_details',
      'property',
      'homeowners_association',
      'offer',
      'suspensive_conditions',
      'property_to_be_sold',
      'occupation_and_occupational_rental',
      'guarantee_delivery_period',
      'fixtures_and_fittings',
      'special_conditions',
      'agent',
      'seller',
      'seller_bond_details',
      'conveyancing_attorneys',
    ]),
  }),
  Object.freeze({
    key: 'schedule_2',
    title: 'Schedule 2',
    purpose: 'Purchaser acknowledgement and bond-origination fact capture.',
    subsections: Object.freeze([
      'purchaser_acknowledgement',
      'employment_details',
      'bond_documents_required',
      'bond_origination_acknowledgement',
    ]),
  }),
])

export const OTP_RESALE_REFERENCE_FIELD_FAMILIES = Object.freeze([
  Object.freeze({
    key: 'purchaser_identity_capacity',
    owner: 'buyer_onboarding',
    fields: Object.freeze(['name', 'id_number', 'current_address', 'income_tax_number', 'vat_number', 'marital_status']),
  }),
  Object.freeze({
    key: 'property_identity',
    owner: 'listing_property_record',
    fields: Object.freeze(['physical_address', 'erf_number', 'township', 'homeowners_association']),
  }),
  Object.freeze({
    key: 'commercial_offer_terms',
    owner: 'transaction_offer_terms',
    fields: Object.freeze(['purchase_price', 'deposit', 'cash_contribution', 'fulfilment_date', 'irrevocable_offer_date']),
  }),
  Object.freeze({
    key: 'structured_suspensive_conditions',
    owner: 'transaction_offer_terms',
    fields: Object.freeze(['bond_finance_amount', 'subject_sale_minimum_price', 'other_condition', 'fulfilment_date']),
  }),
  Object.freeze({
    key: 'occupation_rental_guarantees',
    owner: 'transaction_offer_terms',
    fields: Object.freeze(['occupation_after_registration', 'occupational_rental_from', 'occupational_rental_amount', 'guarantee_delivery_period']),
  }),
  Object.freeze({
    key: 'fixtures_fittings',
    owner: 'seller_onboarding',
    fields: Object.freeze(['included_fixtures', 'excluded_fixtures', 'fixture_schedule']),
  }),
  Object.freeze({
    key: 'agent_agency_commission',
    owner: 'organisation_agent_settings',
    fields: Object.freeze(['agency_name', 'agency_ffc', 'agent_name', 'agent_ffc', 'commission']),
  }),
  Object.freeze({
    key: 'seller_identity_admin',
    owner: 'seller_onboarding',
    fields: Object.freeze(['seller_name', 'seller_id_number', 'seller_address', 'seller_vat_number', 'seller_bond_details', 'rates_taxes_status']),
  }),
  Object.freeze({
    key: 'conveyancing_attorneys',
    owner: 'conveyancer_transfer_assignment',
    fields: Object.freeze(['firm', 'attorney', 'physical_address', 'telephone_number', 'email_address']),
  }),
  Object.freeze({
    key: 'bond_originator_documents',
    owner: 'buyer_onboarding',
    fields: Object.freeze(['employment_type', 'employer', 'occupation', 'income', 'banking_institution', 'required_documents']),
  }),
])

export const OTP_RESALE_REFERENCE_EXTRACTION_GUARDRAILS = Object.freeze([
  'Do not treat the reference DOCX as a runtime renderer.',
  'Do not copy unapproved long-form legal wording into live templates from this extraction step.',
  'Use the extraction as the resale structure, field and shell standard for later counsel-approved native PDF templates.',
  'Keep new-development extraction separate; resale reference content must not become the development default.',
])

function cloneArray(value = []) {
  return [...(Array.isArray(value) ? value : [])]
}

function cloneTocItem(item = {}) {
  return { ...item }
}

function cloneSchedule(schedule = {}) {
  return {
    ...schedule,
    subsections: cloneArray(schedule.subsections),
  }
}

function cloneFieldFamily(family = {}) {
  return {
    ...family,
    fields: cloneArray(family.fields),
  }
}

function cloneBrandingRequirement(requirement = {}) {
  return { ...requirement }
}

function buildCheck(code, pass, detail, severity = 'blocking') {
  return { code, pass: Boolean(pass), severity, detail }
}

export function listOtpResaleReferenceToc() {
  return OTP_RESALE_REFERENCE_TOC.map(cloneTocItem)
}

export function listOtpResaleReferenceLegalSections() {
  return listOtpResaleReferenceToc().filter((item) => item.category === 'legal_clause')
}

export function listOtpReferenceBrandingRequirements() {
  return OTP_REFERENCE_BRANDING_REQUIREMENTS.map(cloneBrandingRequirement)
}

export function listOtpResaleReferenceSchedules() {
  return OTP_RESALE_REFERENCE_SCHEDULES.map(cloneSchedule)
}

export function listOtpResaleReferenceFieldFamilies() {
  return OTP_RESALE_REFERENCE_FIELD_FAMILIES.map(cloneFieldFamily)
}

export function buildOtpReferenceExtractionReport({ checkedAt = new Date().toISOString() } = {}) {
  const toc = listOtpResaleReferenceToc()
  const legalSections = listOtpResaleReferenceLegalSections()
  const schedules = listOtpResaleReferenceSchedules()
  const brandingRequirements = listOtpReferenceBrandingRequirements()
  const fieldFamilies = listOtpResaleReferenceFieldFamilies()
  const legalSectionNumbers = legalSections.map((section) => section.number)
  const expectedLegalSectionNumbers = Array.from({ length: 28 }, (_, index) => index + 3)
  const checks = [
    buildCheck('PHASE1_REFERENCE_SOURCE_HASH_CAPTURED', Boolean(OTP_RESALE_REFERENCE_SOURCE.sha256), 'Reference DOCX SHA-256 is captured for traceability.'),
    buildCheck('PHASE1_REFERENCE_RENDERED_PAGE_COUNT_CAPTURED', OTP_RESALE_REFERENCE_SOURCE.renderedPageCount === 15, 'Reference renders as a 15-page resale OTP.'),
    buildCheck('PHASE1_REFERENCE_MEDIA_CAPTURED', OTP_RESALE_REFERENCE_SOURCE.embeddedMediaCount >= 1, 'Reference contains embedded branding/media assets.'),
    buildCheck('PHASE1_REFERENCE_FOOTER_SIGNAL_CAPTURED', /KINGSTONS REAL ESTATE/i.test(OTP_RESALE_REFERENCE_SOURCE.footerTextSignal), 'Reference footer agency signal is captured.'),
    buildCheck('PHASE1_REFERENCE_TOC_30_SECTIONS', toc.length === 30, 'Reference table of contents has 30 numbered entries.'),
    buildCheck('PHASE1_REFERENCE_LEGAL_SECTIONS_3_TO_30', expectedLegalSectionNumbers.every((number) => legalSectionNumbers.includes(number)), 'Reference legal section map covers sections 3 through 30.'),
    buildCheck('PHASE1_REFERENCE_SCHEDULES_CAPTURED', schedules.length === 2 && schedules.every((schedule) => schedule.subsections.length > 0), 'Reference schedules and schedule subsections are captured.'),
    buildCheck('PHASE1_REFERENCE_BRANDING_REQUIREMENTS_CAPTURED', brandingRequirements.length === 5 && brandingRequirements.every((item) => item.required), 'Reference-derived target branding requirements are captured.'),
    buildCheck('PHASE1_REFERENCE_FIELD_FAMILIES_CAPTURED', fieldFamilies.length >= 10 && fieldFamilies.every((family) => family.owner && family.fields.length), 'Reference field families are mapped to source owners.'),
    buildCheck('PHASE1_REFERENCE_EXTRACTION_IS_RESALE_ONLY', OTP_RESALE_REFERENCE_SOURCE.routeKey === 'resale_existing_property', 'This extraction is scoped to the resale route only.'),
  ]
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')

  return {
    version: OTP_REFERENCE_EXTRACTION_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_REFERENCE_EXTRACTION_REMEDIATION_REQUIRED' : 'OTP_REFERENCE_EXTRACTION_READY_FOR_PHASE2',
    source: { ...OTP_RESALE_REFERENCE_SOURCE },
    summary: {
      tocSectionCount: toc.length,
      legalSectionCount: legalSections.length,
      scheduleCount: schedules.length,
      brandingRequirementCount: brandingRequirements.length,
      fieldFamilyCount: fieldFamilies.length,
      blockerCount: blockers.length,
    },
    brandingRequirements,
    schedules,
    tableOfContents: toc,
    legalSections,
    fieldFamilies,
    guardrails: cloneArray(OTP_RESALE_REFERENCE_EXTRACTION_GUARDRAILS),
    checks,
    blockers,
  }
}
