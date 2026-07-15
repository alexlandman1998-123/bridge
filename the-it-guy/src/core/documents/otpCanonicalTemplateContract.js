export const OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION = 'kingstons_2026_otp_phase_1_v1'

export const OTP_CANONICAL_DOCUMENT_MODEL = Object.freeze({
  mode: 'single_master_document',
  sourceDocument: '2026 OTP - Cover Page.docx',
  jurisdiction: 'ZA',
  documentType: 'residential_offer_to_purchase',
  assemblyRule: 'populate_existing_document',
  partyClassificationRule: 'populate_fields_never_select_template',
  conditionalLegalTextRule: 'approved_clause_or_attorney_review_only',
})

export const OTP_FIXED_LEGAL_CORE = Object.freeze([
  { number: '3', key: 'definitions', label: 'Definitions' },
  { number: '4', key: 'interpretation', label: 'Interpretation' },
  { number: '5', key: 'sale', label: 'Sale' },
  { number: '6', key: 'acceptance', label: 'Acceptance' },
  { number: '7', key: 'purchase_price', label: 'Purchase Price' },
  { number: '8', key: 'property', label: 'The Property' },
  { number: '9', key: 'risk', label: 'Risk' },
  { number: '10', key: 'transfer', label: 'Transfer' },
  { number: '11', key: 'occupation', label: 'Occupation' },
  { number: '12', key: 'suspensive_conditions', label: 'Suspensive Conditions' },
  { number: '13', key: 'warranties', label: 'Warranties' },
  { number: '14', key: 'capacity_of_parties', label: 'Nominations and Capacity of Parties' },
  { number: '15', key: 'commission', label: 'Commission' },
  { number: '16', key: 'certificates', label: 'Certificates' },
  { number: '17', key: 'rates_taxes_consumption', label: 'Rates, Taxes and Consumption Charges' },
  { number: '18', key: 'breach', label: 'Breach' },
  { number: '19', key: 'cooling_off', label: 'Cooling Off' },
  { number: '20', key: 'domicilia', label: 'Domicilia and Notices' },
  { number: '21', key: 'jurisdiction', label: 'Consent to Jurisdiction' },
  { number: '22', key: 'purchaser_marital_status', label: 'Marital Status of Purchaser' },
  { number: '23', key: 'special_conditions_reference', label: 'Special Conditions' },
  { number: '24', key: 'costs', label: 'Costs' },
  { number: '25', key: 'sale_board', label: 'Sale Board' },
  { number: '26', key: 'whole_agreement', label: 'Whole Agreement' },
  { number: '27', key: 'non_variation', label: 'Non Variation' },
  { number: '28', key: 'non_waiver', label: 'Non Waiver' },
  { number: '29', key: 'severability', label: 'Severability' },
  { number: '30', key: 'applicable_law', label: 'Applicable Law' },
])

const COVERAGE_TYPES = Object.freeze([
  'mapped',
  'calculated',
  'agency_setting',
  'signing_preset',
  'approved_clause',
  'manual',
  'gap',
])

function field(key, section, label, coverage, sourcePaths = [], options = {}) {
  return Object.freeze({
    key,
    section,
    label,
    coverage,
    sourcePaths: Object.freeze(sourcePaths),
    required: Boolean(options.required),
    applicableWhen: options.applicableWhen || 'always',
    legalText: Boolean(options.legalText),
    notes: options.notes || '',
  })
}

export const OTP_CANONICAL_FIELD_INVENTORY = Object.freeze([
  field('cover.property_address', 'cover', 'Property address', 'mapped', ['property.physical_address', 'listing.address'], { required: true }),
  field('cover.agent_name', 'cover', 'Agent name', 'mapped', ['transaction.assigned_agent.name', 'agent.full_name'], { required: true }),

  field('purchaser_1.full_name', 'schedule_1.purchasers', 'Purchaser 1 name and surname / legal name', 'mapped', ['buyer.person.full_name', 'buyer.entity.legal_name'], { required: true }),
  field('purchaser_1.identity_or_registration_number', 'schedule_1.purchasers', 'Purchaser 1 ID or registration number', 'mapped', ['buyer.person.identity_number_or_passport_number', 'buyer.entity.registration_number'], { required: true }),
  field('purchaser_1.current_address', 'schedule_1.purchasers', 'Purchaser 1 current address', 'mapped', ['buyer.person.residential_address', 'buyer.entity.registered_address'], { required: true }),
  field('purchaser_1.income_tax_number', 'schedule_1.purchasers', 'Purchaser 1 income tax number', 'mapped', ['buyer.person.tax_number', 'buyer.entity.tax_number']),
  field('purchaser_1.vat_number', 'schedule_1.purchasers', 'Purchaser 1 VAT number', 'mapped', ['buyer.person.vat_number', 'buyer.entity.vat_number'], { applicableWhen: 'purchaser_is_vat_registered' }),
  field('purchaser_2.full_name', 'schedule_1.purchasers', 'Purchaser 2 name and surname / legal name', 'mapped', ['buyer.co_purchasers[0].full_name'], { applicableWhen: 'second_purchaser_exists' }),
  field('purchaser_2.identity_or_registration_number', 'schedule_1.purchasers', 'Purchaser 2 ID or registration number', 'mapped', ['buyer.co_purchasers[0].identity_number_or_passport_number'], { applicableWhen: 'second_purchaser_exists' }),
  field('purchaser_2.current_address', 'schedule_1.purchasers', 'Purchaser 2 current address', 'mapped', ['buyer.co_purchasers[0].residential_address'], { applicableWhen: 'second_purchaser_exists' }),
  field('purchaser_2.income_tax_number', 'schedule_1.purchasers', 'Purchaser 2 income tax number', 'gap', [], { applicableWhen: 'second_purchaser_exists', notes: 'Add a co-purchaser tax-number question.' }),
  field('purchaser_2.vat_number', 'schedule_1.purchasers', 'Purchaser 2 VAT number', 'gap', [], { applicableWhen: 'second_purchaser_is_vat_registered', notes: 'Add a co-purchaser VAT-number question.' }),
  field('purchaser.marital_status', 'schedule_1.purchasers', 'Purchaser marital status', 'mapped', ['buyer.person.marital_status', 'buyer.person.marital_regime'], { applicableWhen: 'purchaser_is_natural_person' }),

  field('property.physical_address', 'schedule_1.property', 'Property physical address', 'mapped', ['property.physical_address', 'listing.address'], { required: true }),
  field('property.erf_number', 'schedule_1.property', 'Erf number', 'mapped', ['property.erf_number', 'listing.erf_number'], { required: true }),
  field('property.township', 'schedule_1.property', 'Township', 'mapped', ['property.township', 'listing.township'], { required: true }),
  field('property.hoa_name', 'schedule_1.property', 'Homeowners association name', 'mapped', ['property.estate_or_hoa_name', 'listing.complex_name'], { applicableWhen: 'property_in_estate_or_hoa' }),

  field('offer.purchase_price', 'schedule_1.offer', 'Purchase price', 'mapped', ['transaction.purchase_price', 'transaction.sales_price'], { required: true }),
  field('offer.purchase_price_words', 'schedule_1.offer', 'Purchase price in words', 'calculated', ['offer.purchase_price'], { required: true }),
  field('offer.deposit_amount', 'schedule_1.offer', 'Deposit due in seven days', 'mapped', ['transaction.deposit_amount']),
  field('offer.cash_contribution', 'schedule_1.offer', 'Cash contribution', 'mapped', ['transaction.cash_amount']),
  field('offer.cash_fulfilment_date', 'schedule_1.offer', 'Cash contribution fulfilment date', 'gap', [], { applicableWhen: 'cash_contribution_greater_than_zero', notes: 'Add a cash-contribution fulfilment date question.' }),
  field('offer.cash_from_sale_proceeds', 'schedule_1.offer', 'Cash from proceeds of sale', 'mapped', ['transaction.cash_from_sale_proceeds'], { applicableWhen: 'linked_property_sale' }),
  field('offer.bond_finance_amount', 'schedule_1.suspensive_conditions', 'Bond finance amount', 'mapped', ['transaction.bond_amount'], { applicableWhen: 'finance_type_is_bond_or_combination' }),
  field('offer.linked_property_sale_amount', 'schedule_1.suspensive_conditions', 'Linked property sale amount', 'mapped', ['transaction.linked_sale_amount'], { applicableWhen: 'linked_property_sale' }),
  field('offer.linked_property_minimum_price', 'schedule_1.suspensive_conditions', 'Linked property minimum purchase price', 'mapped', ['transaction.linked_sale_minimum_price'], { applicableWhen: 'linked_property_sale' }),
  field('linked_property.physical_address', 'schedule_1.linked_property', 'Linked property physical address', 'mapped', ['transaction.linked_property.address'], { applicableWhen: 'linked_property_sale' }),
  field('linked_property.erf_number', 'schedule_1.linked_property', 'Linked property erf number', 'mapped', ['transaction.linked_property.erf_number'], { applicableWhen: 'linked_property_sale' }),
  field('linked_property.registered_owner', 'schedule_1.linked_property', 'Linked property registered owner', 'mapped', ['transaction.linked_property.registered_owner'], { applicableWhen: 'linked_property_sale' }),
  field('linked_property.bond_details', 'schedule_1.linked_property', 'Linked property bond details', 'mapped', ['transaction.linked_property.bond_details'], { applicableWhen: 'linked_property_sale' }),
  field('conditions.other_suspensive_conditions', 'schedule_1.conditions', 'Other suspensive conditions', 'approved_clause', ['transaction.approved_suspensive_conditions'], { legalText: true, applicableWhen: 'approved_condition_selected', notes: 'Only approved wording or attorney-reviewed free text may be inserted.' }),
  field('conditions.other_suspensive_fulfilment_date', 'schedule_1.conditions', 'Other suspensive-condition fulfilment date', 'mapped', ['transaction.suspensive_condition_fulfilment_date'], { applicableWhen: 'other_suspensive_condition_exists' }),
  field('offer.irrevocable_offer_date', 'schedule_1.offer', 'Irrevocable offer date', 'mapped', ['transaction.irrevocable_offer_date']),
  field('occupation.after_registration', 'schedule_1.occupation', 'Occupation 48 hours after registration', 'calculated', ['transaction.occupation_date', 'transaction.expected_transfer_date'], { required: true }),
  field('occupation.date', 'schedule_1.occupation', 'Occupation date', 'mapped', ['transaction.occupation_date'], { applicableWhen: 'occupation_not_48_hours_after_registration' }),
  field('occupation.occupational_rental', 'schedule_1.occupation', 'Occupational rental amount', 'mapped', ['transaction.occupational_rent'], { applicableWhen: 'occupation_before_or_after_transfer' }),
  field('offer.guarantee_delivery_period', 'schedule_1.offer', 'Guarantee delivery period', 'gap', [], { notes: 'Add a guarantee-delivery date or period question.' }),
  field('fixtures.standard_selection', 'schedule_1.fixtures', 'Standard fixtures and fittings selection', 'manual', ['transaction.fixtures_selection'], { notes: 'Digitise the existing include/delete selection without changing its legal wording.' }),
  field('fixtures.additional_inclusions', 'schedule_1.fixtures', 'Additional fixtures included', 'mapped', ['transaction.fixture_inclusions']),
  field('fixtures.exclusions', 'schedule_1.fixtures', 'Fixtures excluded', 'mapped', ['transaction.fixture_exclusions']),
  field('conditions.special_conditions', 'schedule_1.conditions', 'Special conditions', 'approved_clause', ['transaction.approved_special_conditions'], { legalText: true, applicableWhen: 'approved_condition_selected', notes: 'Only approved wording or attorney-reviewed free text may be inserted.' }),

  field('agency.name', 'schedule_1.agent', 'Agency name', 'agency_setting', ['organisation.legal_name'], { required: true }),
  field('agency.ffc_number', 'schedule_1.agent', 'Agency Fidelity Fund Certificate number', 'agency_setting', ['organisation.ffc_number'], { required: true }),
  field('agent.name', 'schedule_1.agent', 'Individual representative', 'mapped', ['transaction.assigned_agent.name'], { required: true }),
  field('agent.ffc_number', 'schedule_1.agent', 'Agent Fidelity Fund Certificate number', 'mapped', ['transaction.assigned_agent.ffc_number'], { required: true }),
  field('principal.name', 'schedule_1.agent', 'Principal agent name', 'agency_setting', ['organisation.principal_agent.name'], { required: true }),
  field('principal.ffc_number', 'schedule_1.agent', 'Principal agent Fidelity Fund Certificate number', 'agency_setting', ['organisation.principal_agent.ffc_number'], { required: true }),
  field('agency.physical_address', 'schedule_1.agent', 'Agency physical address', 'agency_setting', ['organisation.physical_address'], { required: true }),
  field('agency.postal_address', 'schedule_1.agent', 'Agency postal address', 'agency_setting', ['organisation.postal_address']),
  field('agency.vat_number', 'schedule_1.agent', 'Agency VAT number', 'agency_setting', ['organisation.vat_number']),
  field('agency.phone', 'schedule_1.agent', 'Agency telephone number', 'agency_setting', ['organisation.phone'], { required: true }),
  field('agency.email', 'schedule_1.agent', 'Agency email address', 'agency_setting', ['organisation.email'], { required: true }),

  field('seller_1.full_name', 'schedule_1.sellers', 'Seller 1 name and surname / legal name', 'mapped', ['seller.owners[0].full_name', 'seller.entity.legal_name'], { required: true }),
  field('seller_1.identity_or_registration_number', 'schedule_1.sellers', 'Seller 1 ID or registration number', 'mapped', ['seller.owners[0].id_number', 'seller.entity.registration_number'], { required: true }),
  field('seller_1.current_address', 'schedule_1.sellers', 'Seller 1 current address', 'mapped', ['seller.owners[0].residential_address', 'seller.entity.registered_address'], { required: true }),
  field('seller_1.postal_address', 'schedule_1.sellers', 'Seller 1 postal address', 'mapped', ['seller.owners[0].postal_address', 'seller.entity.postal_address']),
  field('seller_1.vat_number', 'schedule_1.sellers', 'Seller 1 VAT number', 'mapped', ['seller.owners[0].vat_number', 'seller.entity.vat_number'], { applicableWhen: 'seller_is_vat_registered' }),
  field('seller_2.full_name', 'schedule_1.sellers', 'Seller 2 name and surname / legal name', 'mapped', ['seller.owners[1].full_name'], { applicableWhen: 'second_seller_exists' }),
  field('seller_2.identity_or_registration_number', 'schedule_1.sellers', 'Seller 2 ID or registration number', 'mapped', ['seller.owners[1].id_number'], { applicableWhen: 'second_seller_exists' }),
  field('seller_2.current_address', 'schedule_1.sellers', 'Seller 2 current address', 'mapped', ['seller.owners[1].residential_address'], { applicableWhen: 'second_seller_exists' }),
  field('seller_2.postal_address', 'schedule_1.sellers', 'Seller 2 postal address', 'gap', [], { applicableWhen: 'second_seller_exists', notes: 'Add a second-seller postal-address question.' }),
  field('seller_2.vat_number', 'schedule_1.sellers', 'Seller 2 VAT number', 'gap', [], { applicableWhen: 'second_seller_is_vat_registered', notes: 'Add a second-seller VAT-number question.' }),
  field('seller_bond.institution', 'schedule_1.seller_bond', 'Seller bond institution', 'mapped', ['seller.bond.institution']),
  field('seller_bond.account_number', 'schedule_1.seller_bond', 'Seller bond account number', 'mapped', ['seller.bond.account_number']),
  field('seller_bond.outstanding_amount', 'schedule_1.seller_bond', 'Outstanding seller bond amount', 'mapped', ['seller.bond.outstanding_amount']),
  field('seller_bond.accounts_up_to_date', 'schedule_1.seller_bond', 'Rates, taxes and bond up to date', 'mapped', ['seller.bond.accounts_up_to_date']),
  field('seller_bond.rates_account_number', 'schedule_1.seller_bond', 'Rates and taxes account number', 'mapped', ['seller.rates_account_number']),

  field('conveyancer.firm', 'schedule_1.conveyancer', 'Conveyancing firm', 'mapped', ['transaction.conveyancer.firm']),
  field('conveyancer.attorney', 'schedule_1.conveyancer', 'Conveyancing attorney', 'mapped', ['transaction.conveyancer.name']),
  field('conveyancer.physical_address', 'schedule_1.conveyancer', 'Conveyancer physical address', 'gap', [], { notes: 'Resolve from the assigned partner profile or collect it.' }),
  field('conveyancer.phone', 'schedule_1.conveyancer', 'Conveyancer telephone number', 'gap', [], { notes: 'Resolve from the assigned partner profile or collect it.' }),
  field('conveyancer.email', 'schedule_1.conveyancer', 'Conveyancer email address', 'mapped', ['transaction.conveyancer.email']),

  field('bond.purchaser_acknowledgement_initials', 'schedule_2.bond', 'Purchaser transfer and bond cost acknowledgement', 'signing_preset', ['signing.purchaser_initials']),
  field('bond.applicant_1_employment', 'schedule_2.bond', 'Applicant 1 employment details', 'mapped', ['buyer.finance.applicants[0].employment']),
  field('bond.applicant_2_employment', 'schedule_2.bond', 'Applicant 2 employment details', 'mapped', ['buyer.finance.applicants[1].employment'], { applicableWhen: 'second_purchaser_exists' }),
  field('bond.income_structure', 'schedule_2.bond', 'Applicable bond document income structure', 'calculated', ['buyer.finance.applicants[].income_structure'], { applicableWhen: 'finance_type_is_bond_or_combination' }),
  field('bond.origination_acknowledgement_initials', 'schedule_2.bond', 'Bond origination acknowledgement', 'signing_preset', ['signing.purchaser_initials'], { applicableWhen: 'finance_type_is_bond_or_combination' }),

  field('signing.purchaser_place_and_date', 'signatures', 'Purchaser signing place and date', 'signing_preset', ['signing.purchaser.place', 'signing.purchaser.date']),
  field('signing.seller_place_and_date', 'signatures', 'Seller signing place and date', 'signing_preset', ['signing.seller.place', 'signing.seller.date']),
  field('signing.agent_place_and_date', 'signatures', 'Agent signing place and date', 'signing_preset', ['signing.agent.place', 'signing.agent.date']),
  field('signing.parties_and_witnesses', 'signatures', 'Purchaser, seller, agent and witness signatures', 'signing_preset', ['signing.fields']),
  field('contact.purchasers', 'contact_form', 'Purchaser telephone and email details', 'mapped', ['buyer.person.phone', 'buyer.person.email', 'buyer.co_purchasers[].phone', 'buyer.co_purchasers[].email']),
  field('contact.sellers', 'contact_form', 'Seller telephone and email details', 'mapped', ['seller.owners[].phone', 'seller.owners[].email']),
  field('contact.agent', 'contact_form', 'Agent telephone and email details', 'mapped', ['transaction.assigned_agent.phone', 'transaction.assigned_agent.email']),
])

export const OTP_VARIABLE_LEGAL_TEXT_FIELDS = Object.freeze(
  OTP_CANONICAL_FIELD_INVENTORY.filter((entry) => entry.legalText).map((entry) => entry.key),
)

export const OTP_ONBOARDING_GAPS = Object.freeze(
  OTP_CANONICAL_FIELD_INVENTORY
    .filter((entry) => entry.coverage === 'gap')
    .map((entry) => Object.freeze({
      key: entry.key,
      label: entry.label,
      applicableWhen: entry.applicableWhen,
      recommendation: entry.notes,
    })),
)

export function validateOtpCanonicalTemplateContract() {
  const errors = []
  const keys = new Set()

  OTP_CANONICAL_FIELD_INVENTORY.forEach((entry) => {
    if (!entry.key) errors.push('Every OTP field requires a key.')
    if (keys.has(entry.key)) errors.push(`Duplicate OTP field key: ${entry.key}.`)
    keys.add(entry.key)
    if (!entry.section) errors.push(`OTP field ${entry.key} requires a document section.`)
    if (!COVERAGE_TYPES.includes(entry.coverage)) errors.push(`OTP field ${entry.key} has unsupported coverage ${entry.coverage}.`)
    if (!entry.sourcePaths.length && entry.coverage !== 'gap') errors.push(`OTP field ${entry.key} requires a source path or explicit gap coverage.`)
    if (entry.legalText && entry.coverage !== 'approved_clause') errors.push(`Variable legal text ${entry.key} must use approved-clause coverage.`)
  })

  if (OTP_CANONICAL_DOCUMENT_MODEL.mode !== 'single_master_document') {
    errors.push('The canonical OTP must use one master document.')
  }
  if (OTP_VARIABLE_LEGAL_TEXT_FIELDS.length !== 2) {
    errors.push('The canonical OTP must expose only other suspensive conditions and special conditions as variable legal text.')
  }

  return { valid: errors.length === 0, errors }
}

export function buildOtpCanonicalPhaseOneReport() {
  const coverage = Object.fromEntries(COVERAGE_TYPES.map((key) => [key, 0]))
  const sections = {}
  OTP_CANONICAL_FIELD_INVENTORY.forEach((entry) => {
    coverage[entry.coverage] += 1
    sections[entry.section] = (sections[entry.section] || 0) + 1
  })
  const validation = validateOtpCanonicalTemplateContract()

  return {
    schemaVersion: OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
    documentModel: OTP_CANONICAL_DOCUMENT_MODEL,
    summary: {
      fixedLegalClauseCount: OTP_FIXED_LEGAL_CORE.length,
      fieldCount: OTP_CANONICAL_FIELD_INVENTORY.length,
      variableLegalTextFieldCount: OTP_VARIABLE_LEGAL_TEXT_FIELDS.length,
      onboardingGapCount: OTP_ONBOARDING_GAPS.length,
      coverage,
      sections,
    },
    variableLegalTextFields: OTP_VARIABLE_LEGAL_TEXT_FIELDS,
    onboardingGaps: OTP_ONBOARDING_GAPS,
    validation,
  }
}
