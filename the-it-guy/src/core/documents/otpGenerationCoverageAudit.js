import {
  BUYER_BRANCHES,
  BUYER_FINANCE_BRANCHES,
  BUYER_ONBOARDING_FIELD_ALIASES,
  BUYER_ONBOARDING_FLOW_MATRIX,
  BUYER_PURCHASE_MODES,
} from '../../lib/buyerOnboardingFlowContract.js'
import { resolveCanonicalMergeFieldKey } from './mergeFieldRegistry.js'
import {
  OTP_DOCUMENT_VARIANTS,
  OTP_ROUTE_DIMENSIONS,
} from './otpRouteUniverse.js'

export const OTP_GENERATION_COVERAGE_AUDIT_VERSION = 'otp_generation_coverage_phase1b_v1'

export { OTP_DOCUMENT_VARIANTS, OTP_ROUTE_DIMENSIONS }

export const KINGSTONS_STANDARD_OTP_COVERAGE_ITEMS = Object.freeze([
  Object.freeze({
    key: 'buyer_identity_contact',
    group: 'Buyer parties',
    label: 'Buyer identity, contact, tax and domicilium details',
    buyerOnboardingFields: Object.freeze([
      'buyer.person.first_name',
      'buyer.person.last_name',
      'buyer.person.identity_number_or_passport_number',
      'buyer.person.tax_number',
      'buyer.person.email',
      'buyer.person.phone',
      'buyer.person.residential_address.line_1',
    ]),
    mergeFields: Object.freeze(['buyer_full_name', 'buyer_id_number', 'buyer_email', 'buyer_phone', 'buyer_domicilium_address']),
    sourceOwner: 'buyer_onboarding',
    recommendation: 'Keep in buyer onboarding and map cleanly to buyer party rows and domicilium.',
  }),
  Object.freeze({
    key: 'co_purchaser_details',
    group: 'Buyer parties',
    label: 'Second / multiple purchaser details',
    buyerOnboardingFields: Object.freeze([
      'buyer.co_purchasers',
      'buyer.co_purchasers[].first_name',
      'buyer.co_purchasers[].last_name',
      'buyer.co_purchasers[].identity_number_or_passport_number',
      'buyer.co_purchasers[].email',
      'buyer.co_purchasers[].ownership_share',
    ]),
    mergeFields: Object.freeze(['buyer_parties']),
    sourceOwner: 'buyer_onboarding',
    recommendation: 'Use repeatable purchaser records; OTP signatures and schedules must render all buyers, not only buyer 1/2.',
  }),
  Object.freeze({
    key: 'buyer_marital_status_regime',
    group: 'Buyer parties',
    label: 'Buyer marital status and regime',
    buyerOnboardingFields: Object.freeze([
      'buyer.person.marital_status',
      'buyer.person.marital_regime',
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.spouse_consent_required',
    ]),
    mergeFields: Object.freeze(['buyer_marital_status', 'buyer_spouse_full_name', 'buyer_spouse_id_number', 'buyer_spouse_consent_required']),
    sourceOwner: 'buyer_onboarding',
    forcedStatus: 'partial',
    gap: 'Current buyer flow handles in-community and ANC/accrual style paths, but the Kingston schedule calls out customary, Islamic and foreign-law marriage options explicitly.',
    recommendation: 'Replace the simplified marital-regime selector with a counsel-approved South African/foreign marriage regime list and route spouse consent from that answer.',
  }),
  Object.freeze({
    key: 'buyer_company_authority',
    group: 'Buyer parties',
    label: 'Company / CC purchaser authority',
    buyerOnboardingFields: Object.freeze([
      'buyer.company.name',
      'buyer.company.registration_number',
      'buyer.company.authorised_signatory.name',
      'buyer.company.authorised_signatory.capacity',
      'buyer.company.resolution_date',
      'buyer.company.authority_basis',
      'buyer.company.board_resolution_available',
    ]),
    mergeFields: Object.freeze(['buyer_company_registration_number', 'buyer_representative_name', 'buyer_representative_capacity', 'buyer_resolution_date', 'buyer_authority_basis']),
    sourceOwner: 'buyer_onboarding',
    recommendation: 'Keep company authority in buyer onboarding; vNext wording should require resolution evidence and signatory capacity.',
  }),
  Object.freeze({
    key: 'buyer_trust_authority',
    group: 'Buyer parties',
    label: 'Trust purchaser authority',
    buyerOnboardingFields: Object.freeze([
      'buyer.trust.name',
      'buyer.trust.registration_number',
      'buyer.trust.trustees',
      'buyer.trust.authorised_trustee.name',
      'buyer.trust.authorised_trustee.capacity',
      'buyer.trust.letters_of_authority_available',
      'buyer.trust.resolution_available',
    ]),
    mergeFields: Object.freeze(['buyer_trust_registration_number', 'buyer_trustee_names', 'buyer_representative_name', 'buyer_representative_capacity', 'buyer_authority_basis']),
    sourceOwner: 'buyer_onboarding',
    recommendation: 'Keep trust route in buyer onboarding; generation must know whether all trustees sign or an authorised trustee signs.',
  }),
  Object.freeze({
    key: 'foreign_purchaser',
    group: 'Buyer parties',
    label: 'Foreign purchaser facts',
    buyerOnboardingFields: Object.freeze([
      'buyer.person.passport_number',
      'buyer.person.nationality',
      'buyer.person.residency_status',
      'buyer.person.source_of_funds',
      'buyer.person.exchange_control_declaration',
    ]),
    mergeFields: Object.freeze(['buyer_id_number', 'buyer_entity_type']),
    sourceOwner: 'buyer_onboarding',
    forcedStatus: 'partial',
    gap: 'Foreign purchaser is detected, but OTP wording still needs a specific route for foreign-law marriage, exchange-control/source-of-funds handling and signatures.',
    recommendation: 'Keep foreign purchaser as its own route, not merely an individual with a passport number.',
  }),
  Object.freeze({
    key: 'purchase_price_deposit_cash',
    group: 'Commercial terms',
    label: 'Purchase price, deposit and cash contribution',
    buyerOnboardingFields: Object.freeze(['finance.purchase_price', 'finance.cash_amount', 'finance.cash_contribution_available', 'finance.deposit_source', 'finance.cash_contribution_source']),
    mergeFields: Object.freeze(['purchase_price', 'deposit_amount', 'cash_amount']),
    sourceOwner: 'buyer_onboarding_and_transaction',
    forcedStatus: 'partial',
    gap: 'Purchase price and cash amount are covered; deposit amount, deposit due period and amount-in-words should be treated as transaction/offer terms, not inferred from buyer onboarding.',
    recommendation: 'Collect deposit amount, deposit due period and amount-in-words in OTP commercial terms before generation.',
  }),
  Object.freeze({
    key: 'bond_finance',
    group: 'Finance',
    label: 'Bond finance route',
    buyerOnboardingFields: Object.freeze([
      'finance.bond_amount',
      'finance.buyer_banks',
      'finance.bond_preapproval_completed',
      'finance.bond_preapproval_document_available',
      'finance.credit_check_consent',
      'finance.bond_help_requested',
    ]),
    mergeFields: Object.freeze(['finance_type', 'bond_amount']),
    sourceOwner: 'buyer_onboarding',
    recommendation: 'Keep bond data in buyer onboarding; OTP wording should use it as a route and amount, not render bank/onboarding admin noise into the agreement.',
  }),
  Object.freeze({
    key: 'bond_employment_documents',
    group: 'Finance',
    label: 'Bond applicant employment and document checklist',
    buyerOnboardingFields: Object.freeze([
      'finance.employment_type',
      'finance.employer_name',
      'finance.job_title',
      'finance.gross_monthly_income',
      'finance.bank_statements_available',
    ]),
    mergeFields: Object.freeze([]),
    sourceOwner: 'buyer_onboarding',
    forcedStatus: 'partial',
    gap: 'Current finance fields are not clearly repeatable per applicant/co-purchaser, while the Kingston schedule separates applicant 1 and applicant 2.',
    recommendation: 'For bond deals, make employment/income capture applicant-aware and keep detailed bond documents in checklist/support workflow rather than core OTP legal text.',
  }),
  Object.freeze({
    key: 'purchaser_property_sale_suspensive_condition',
    group: 'Suspensive conditions',
    label: "Purchaser's existing property sale condition",
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze([]),
    sourceOwner: 'otp_terms_capture',
    forcedStatus: 'missing',
    gap: 'Kingston-style OTP has a separate condition for the buyer selling their own property, including property details, minimum sale price and fulfilment date.',
    recommendation: 'Add an OTP commercial-terms branch for subject-to-sale with property-to-sell details, minimum sale price and fulfilment deadline.',
  }),
  Object.freeze({
    key: 'other_suspensive_conditions',
    group: 'Suspensive conditions',
    label: 'Other suspensive conditions and fulfilment dates',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['suspensive_conditions']),
    sourceOwner: 'otp_terms_capture',
    forcedStatus: 'partial',
    gap: 'There is a generic suspensive text field, but no structured condition list with fulfilment dates.',
    recommendation: 'Use a repeatable OTP conditions model: condition text, responsible party, fulfilment date, waiver/lapse treatment.',
  }),
  Object.freeze({
    key: 'irrevocable_offer_and_guarantees',
    group: 'Commercial terms',
    label: 'Irrevocable offer date and guarantee delivery period',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze([]),
    sourceOwner: 'otp_terms_capture',
    forcedStatus: 'missing',
    gap: 'Current canonical fields do not expose irrevocable offer date or guarantee delivery period.',
    recommendation: 'Add structured OTP terms for irrevocable offer expiry and guarantee/cash delivery deadline.',
  }),
  Object.freeze({
    key: 'occupation_rental_terms',
    group: 'Occupation',
    label: 'Occupation, occupational rental and risk/benefit',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['occupation_date']),
    sourceOwner: 'otp_terms_capture',
    forcedStatus: 'partial',
    gap: 'Occupation date exists, but occupational rent amount, pre/post-registration occupation choice and risk/benefit treatment are not complete.',
    recommendation: 'Add structured occupation terms: occupation timing, rental amount, utility treatment, alteration restriction and risk/benefit rule.',
  }),
  Object.freeze({
    key: 'fixtures_fittings_inclusions_exclusions',
    group: 'Property terms',
    label: 'Fixtures, fittings, inclusions and exclusions',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze([]),
    sourceOwner: 'seller_property_or_otp_terms',
    forcedStatus: 'missing',
    gap: 'Current OTP registry has no structured inclusion/exclusion list comparable to the Kingston fixtures schedule.',
    recommendation: 'Add inclusion/exclusion capture from seller property facts or OTP terms, then render as a schedule/annexure.',
  }),
  Object.freeze({
    key: 'property_identity_title_hoa',
    group: 'Property',
    label: 'Property identity, title type, erf/sectional and HOA',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['property_address', 'erf_number', 'property_unit_number', 'property_section_number', 'sectional_title_number', 'property_estate_name']),
    sourceOwner: 'seller_property_listing_or_unit',
    forcedStatus: 'partial',
    gap: 'Merge fields exist, but this should not be buyer onboarding source data; resale and development paths need separate property source contracts.',
    recommendation: 'Source resale property facts from seller/listing/disclosure; source development facts from development/unit setup.',
  }),
  Object.freeze({
    key: 'seller_details_bond_rates',
    group: 'Seller and property admin',
    label: 'Seller details, existing bond, rates/taxes and levies',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['seller_full_name', 'seller_id_number']),
    sourceOwner: 'seller_onboarding',
    forcedStatus: 'partial',
    gap: 'Seller identity fields exist, but Kingston schedule also needs seller bond institution/account/outstanding balance and rates/levies account status.',
    recommendation: 'Keep these in seller onboarding/resale property readiness, not buyer onboarding.',
  }),
  Object.freeze({
    key: 'conveyancer_transfer_attorney',
    group: 'Transfer',
    label: 'Conveyancing attorney details',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['attorney_firm_name', 'conveyancer_name', 'conveyancer_email']),
    sourceOwner: 'transaction_assignment',
    recommendation: 'Use transaction/organisation attorney assignment as the source; buyer onboarding should not ask this.',
  }),
  Object.freeze({
    key: 'mandatory_disclosure_defects',
    group: 'Disclosure and warranties',
    label: 'Mandatory disclosure, defects and voetstoots/warranty route',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['mandatory_disclosure_status', 'mandatory_disclosure_annexure', 'mandatory_disclosure_comments']),
    sourceOwner: 'seller_onboarding_disclosure',
    forcedStatus: 'partial',
    gap: 'Disclosure annexure fields exist; fixtures/defect treatment and final disclosure evidence link still need a controlled OTP route.',
    recommendation: 'Attach disclosure evidence and render a short annexure/status reference; do not ask buyer onboarding to recreate seller disclosure facts.',
  }),
  Object.freeze({
    key: 'certificates_compliance_costs',
    group: 'Certificates and costs',
    label: 'Compliance certificates, rates/levies, transfer/bond costs',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['additional_costs_note']),
    sourceOwner: 'seller_property_or_otp_terms',
    forcedStatus: 'partial',
    gap: 'Current fields do not fully model electrical, electric fence, gas, occupancy/NHBRC, rates clearance, levies and transfer/bond cost responsibilities.',
    recommendation: 'Split resale compliance certificates from new-development certificates; keep buyer acknowledgement of costs as OTP terms/checklist evidence.',
  }),
  Object.freeze({
    key: 'new_development_terms',
    group: 'New development',
    label: 'New development unit, developer and construction certificate terms',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['developer_name', 'developer_company_registration', 'developer_representative', 'property_nhbrc_certificate_number', 'contractor_company_name', 'parking_bay', 'storeroom']),
    sourceOwner: 'development_unit_setup',
    forcedStatus: 'partial',
    gap: 'Development merge fields exist, but the legal wording should be a separate new-development OTP variant, not a resale clause patch.',
    recommendation: 'Create `new_development` as a first-class OTP variant with development/unit annexures, developer seller details and development-specific certificate clauses.',
  }),
  Object.freeze({
    key: 'agent_commission_ffc',
    group: 'Agency',
    label: 'Agent, agency, FFC and commission',
    buyerOnboardingFields: Object.freeze([]),
    mergeFields: Object.freeze(['agent_full_name', 'agent_ffc_number', 'organisation_name', 'gross_commission_percentage', 'gross_commission_amount']),
    sourceOwner: 'agency_transaction',
    recommendation: 'Source from agency/agent/transaction settings; never ask the buyer to supply agency commission or FFC facts.',
  }),
  Object.freeze({
    key: 'signature_execution_roles',
    group: 'Execution',
    label: 'Buyer, seller, spouse, representative, witness and agent signatures',
    buyerOnboardingFields: Object.freeze([
      'buyer.person.spouse_email',
      'buyer.company.authorised_signatory.email',
      'buyer.trust.authorised_trustee.email',
      'buyer.co_purchasers[].email',
    ]),
    mergeFields: Object.freeze(['buyer_signature', 'seller_signature', 'witness_signature', 'signed_date']),
    sourceOwner: 'signing_runtime',
    forcedStatus: 'partial',
    gap: 'Buyer signer data exists for main routes, but signer generation must be route-aware across spouses, co-purchasers, company representatives, trustees, sellers, witnesses and agent/principal.',
    recommendation: 'Derive signer roles from scenario profile, not from static buyer 1/buyer 2 placeholders.',
  }),
])

function text(value) {
  return String(value ?? '').trim()
}

function uniq(values = []) {
  return Array.from(new Set(values.map((value) => text(value)).filter(Boolean)))
}

function collectBuyerOnboardingFields(matrix = BUYER_ONBOARDING_FLOW_MATRIX) {
  const fields = []
  const visit = (value) => {
    if (!value) return
    if (Array.isArray(value)) {
      fields.push(...value)
      return
    }
    if (typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (['buyerFacingQuestions', 'requiredFields', 'optionalFields'].includes(key)) {
        visit(child)
      } else {
        visit(child)
      }
    }
  }
  visit(matrix)
  for (const aliases of Object.values(BUYER_ONBOARDING_FIELD_ALIASES || {})) fields.push(...aliases)
  return uniq(fields)
}

function hasField(fieldSet, field = '') {
  return fieldSet.has(text(field))
}

function buildCoverageItem(item = {}, fieldSet = new Set()) {
  const onboardingFields = [...(item.buyerOnboardingFields || [])]
  const mergeFields = [...(item.mergeFields || [])]
  const coveredOnboardingFields = onboardingFields.filter((field) => hasField(fieldSet, field))
  const knownMergeFields = mergeFields.filter((field) => resolveCanonicalMergeFieldKey(field, { packetType: 'otp' }))
  const onboardingCoverage = onboardingFields.length ? coveredOnboardingFields.length / onboardingFields.length : 0
  const mergeCoverage = mergeFields.length ? knownMergeFields.length / mergeFields.length : 0
  let status = 'missing'

  if (item.forcedStatus) {
    status = item.forcedStatus
  } else if (
    (onboardingFields.length === 0 || onboardingCoverage === 1) &&
    (mergeFields.length === 0 || mergeCoverage === 1)
  ) {
    status = 'covered'
  } else if (coveredOnboardingFields.length || knownMergeFields.length) {
    status = 'partial'
  }

  return {
    key: item.key,
    group: item.group,
    label: item.label,
    sourceOwner: item.sourceOwner,
    status,
    buyerOnboardingFields: onboardingFields,
    coveredBuyerOnboardingFields: coveredOnboardingFields,
    missingBuyerOnboardingFields: onboardingFields.filter((field) => !hasField(fieldSet, field)),
    mergeFields,
    knownMergeFields,
    missingMergeFields: mergeFields.filter((field) => !knownMergeFields.includes(field)),
    gap: item.gap || '',
    recommendation: item.recommendation,
  }
}

function groupCounts(items = []) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1
    return counts
  }, {})
}

function buildRecommendedDecisions(items = []) {
  return [
    {
      key: 'two_primary_otp_variants',
      priority: 'P0',
      decision: 'Create two primary OTP document variants: existing/resale property and new development.',
      reason: 'The Kingston resale template and our development unit data need different clause families; trying to hide/show everything in one master template will become brittle.',
    },
    {
      key: 'shared_route_packs',
      priority: 'P0',
      decision: 'Keep buyer/seller/property/finance route packs shared across both variants.',
      reason: 'Company, trust, individual, spouse consent, full-title/sectional and cash/bond/hybrid logic still applies to both variants.',
    },
    {
      key: 'buyer_onboarding_scope',
      priority: 'P0',
      decision: 'Buyer onboarding should collect buyer identity/capacity, finance readiness and buyer-side conditions only.',
      reason: 'Seller disclosure, seller bond/rates, property title facts, conveyancer assignment, agent/FFC and commission belong to seller/property/transaction/organisation sources.',
    },
    {
      key: 'commercial_terms_capture',
      priority: 'P0',
      decision: 'Add an OTP commercial terms capture step before generation.',
      reason: 'Deposit timing, guarantee period, irrevocable offer date, occupation/rent, subject-to-sale and special suspensive dates are offer terms, not stable buyer profile facts.',
    },
    {
      key: 'marital_regime_expansion',
      priority: 'P1',
      decision: 'Expand marital-regime options beyond the current simplified branches.',
      reason: 'The Kingston schedule explicitly distinguishes customary, Islamic and foreign-law marriage paths.',
    },
    {
      key: 'applicant_aware_bond_capture',
      priority: 'P1',
      decision: 'Make bond employment/income capture applicant-aware when there are co-purchasers or spouse/joint bond applicants.',
      reason: 'The standard OTP schedule separates applicant 1 and applicant 2 bond facts.',
    },
  ].filter(Boolean)
}

export function buildOtpGenerationCoverageAudit({ checkedAt = new Date().toISOString() } = {}) {
  const buyerOnboardingFields = collectBuyerOnboardingFields()
  const fieldSet = new Set(buyerOnboardingFields)
  const coverageItems = KINGSTONS_STANDARD_OTP_COVERAGE_ITEMS.map((item) => buildCoverageItem(item, fieldSet))
  const statusCounts = groupCounts(coverageItems)
  const missingOrPartial = coverageItems.filter((item) => ['missing', 'partial'].includes(item.status))

  return {
    version: OTP_GENERATION_COVERAGE_AUDIT_VERSION,
    checkedAt,
    mutatedData: false,
    status: missingOrPartial.length ? 'OTP_GENERATION_COVERAGE_REMEDIATION_REQUIRED' : 'OTP_GENERATION_COVERAGE_READY',
    referenceTemplate: {
      label: 'Kingstons 2026 OTP reference template',
      path: '/Users/alexanderlandman/Downloads/2026 OTP - Cover Page.docx',
      treatment: 'Used as a standard OTP concept reference; no wording copied into generated templates.',
    },
    routeDimensions: OTP_ROUTE_DIMENSIONS,
    documentVariants: OTP_DOCUMENT_VARIANTS,
    buyerOnboarding: {
      version: 'buyer_onboarding_flow_v2',
      branchCount: BUYER_BRANCHES.length,
      purchaseModeCount: BUYER_PURCHASE_MODES.length,
      financeBranchCount: BUYER_FINANCE_BRANCHES.length,
      capturedFieldCount: buyerOnboardingFields.length,
      branches: [...BUYER_BRANCHES],
      purchaseModes: [...BUYER_PURCHASE_MODES],
      financeBranches: [...BUYER_FINANCE_BRANCHES],
    },
    coverageSummary: {
      itemCount: coverageItems.length,
      covered: statusCounts.covered || 0,
      partial: statusCounts.partial || 0,
      missing: statusCounts.missing || 0,
    },
    coverageItems,
    recommendedDecisions: buildRecommendedDecisions(coverageItems),
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => text(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpGenerationCoverageAuditMarkdown(audit = buildOtpGenerationCoverageAudit()) {
  const lines = []
  lines.push('# OTP vNext Phase 1B Generation Coverage Audit')
  lines.push('')
  lines.push(`Generated: ${text(audit.checkedAt)}`)
  lines.push(`Status: ${text(audit.status)}`)
  lines.push(`Mutated data: ${audit.mutatedData === false ? 'false' : 'unknown'}`)
  lines.push('')
  lines.push('## Reference')
  lines.push('')
  lines.push(table(
    ['Field', 'Value'],
    [
      ['Template', audit.referenceTemplate?.label || ''],
      ['Path', audit.referenceTemplate?.path || ''],
      ['Treatment', audit.referenceTemplate?.treatment || ''],
    ],
  ))
  lines.push('')
  lines.push('## Recommendation')
  lines.push('')
  lines.push(table(
    ['Variant', 'Route dimensions', 'Recommendation'],
    (audit.documentVariants || []).map((variant) => [
      variant.label,
      (variant.routeDimensions || []).join(', '),
      variant.recommendation,
    ]),
  ))
  lines.push('')
  lines.push('## Route Universe')
  lines.push('')
  lines.push(table(
    ['Dimension', 'Possibilities'],
    Object.entries(audit.routeDimensions || {}).map(([dimension, values]) => [
      dimension,
      (values || []).join(', '),
    ]),
  ))
  lines.push('')
  lines.push('## Buyer Onboarding Baseline')
  lines.push('')
  lines.push(table(
    ['Metric', 'Value'],
    [
      ['Version', audit.buyerOnboarding?.version || ''],
      ['Buyer branches', `${audit.buyerOnboarding?.branchCount || 0}: ${(audit.buyerOnboarding?.branches || []).join(', ')}`],
      ['Purchase modes', `${audit.buyerOnboarding?.purchaseModeCount || 0}: ${(audit.buyerOnboarding?.purchaseModes || []).join(', ')}`],
      ['Finance branches', `${audit.buyerOnboarding?.financeBranchCount || 0}: ${(audit.buyerOnboarding?.financeBranches || []).join(', ')}`],
      ['Known onboarding fields', audit.buyerOnboarding?.capturedFieldCount || 0],
    ],
  ))
  lines.push('')
  lines.push('## Coverage Summary')
  lines.push('')
  lines.push(table(
    ['Items', 'Covered', 'Partial', 'Missing'],
    [[
      audit.coverageSummary?.itemCount || 0,
      audit.coverageSummary?.covered || 0,
      audit.coverageSummary?.partial || 0,
      audit.coverageSummary?.missing || 0,
    ]],
  ))
  lines.push('')
  lines.push('## Coverage Matrix')
  lines.push('')
  lines.push(table(
    ['Group', 'Item', 'Source owner', 'Status', 'Gap / recommendation'],
    (audit.coverageItems || []).map((item) => [
      item.group,
      item.label,
      item.sourceOwner,
      item.status,
      item.gap || item.recommendation,
    ]),
  ))
  lines.push('')
  lines.push('## Buyer-Onboarding Field Gaps')
  lines.push('')
  lines.push(table(
    ['Item', 'Missing buyer fields', 'Missing merge fields'],
    (audit.coverageItems || [])
      .filter((item) => item.missingBuyerOnboardingFields?.length || item.missingMergeFields?.length)
      .map((item) => [
        item.label,
        (item.missingBuyerOnboardingFields || []).join(', '),
        (item.missingMergeFields || []).join(', '),
      ]),
  ))
  lines.push('')
  lines.push('## Decisions')
  lines.push('')
  lines.push(table(
    ['Priority', 'Decision', 'Reason'],
    (audit.recommendedDecisions || []).map((item) => [
      item.priority,
      item.decision,
      item.reason,
    ]),
  ))
  lines.push('')
  return `${lines.join('\n')}\n`
}
