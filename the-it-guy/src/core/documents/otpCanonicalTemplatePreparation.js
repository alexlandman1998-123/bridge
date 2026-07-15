import {
  OTP_CANONICAL_FIELD_INVENTORY,
  OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
} from './otpCanonicalTemplateContract.js'

export const OTP_CANONICAL_TEMPLATE_ASSET_VERSION = 'kingstons_2026_otp_docx_v1'
export const OTP_CANONICAL_RUNTIME_BINDING_VERSION = 'kingstons_2026_otp_runtime_v1'

export const OTP_CANONICAL_FORMATTING_RULES = Object.freeze({
  text: Object.freeze({ kind: 'text', trim: true, empty: '' }),
  multilineText: Object.freeze({ kind: 'multiline_text', trim: true, preserveLineBreaks: true, empty: '' }),
  currency: Object.freeze({ kind: 'currency', currency: 'ZAR', decimalPlaces: 2, thousandsSeparator: ' ', symbol: 'R', empty: '' }),
  dateLong: Object.freeze({ kind: 'date', pattern: 'D MMMM YYYY', locale: 'en-ZA', empty: '' }),
  yearSuffix: Object.freeze({ kind: 'date_component', pattern: 'YY', locale: 'en-ZA', empty: '' }),
  selectionMark: Object.freeze({ kind: 'selection_mark', selected: 'X', unselected: '', empty: '' }),
  legalText: Object.freeze({ kind: 'multiline_text', trim: true, preserveLineBreaks: true, empty: '' }),
})

const CURRENCY_FIELDS = new Set([
  'offer.purchase_price',
  'offer.deposit_amount',
  'offer.cash_contribution',
  'offer.cash_from_sale_proceeds',
  'offer.bond_finance_amount',
  'offer.linked_property_sale_amount',
  'offer.linked_property_minimum_price',
  'occupation.occupational_rental',
  'seller_bond.outstanding_amount',
])

const DATE_FIELDS = new Set([
  'offer.cash_fulfilment_date',
  'conditions.other_suspensive_fulfilment_date',
  'offer.irrevocable_offer_date',
  'occupation.date',
])

const SELECTION_FIELDS = new Set([
  'purchaser.marital_status',
  'occupation.after_registration',
  'bond.income_structure',
])

const MULTILINE_FIELDS = new Set([
  'fixtures.additional_inclusions',
  'fixtures.exclusions',
])

function outputFormatFor(field) {
  if (field.legalText) return OTP_CANONICAL_FORMATTING_RULES.legalText
  if (CURRENCY_FIELDS.has(field.key)) return OTP_CANONICAL_FORMATTING_RULES.currency
  if (DATE_FIELDS.has(field.key)) return OTP_CANONICAL_FORMATTING_RULES.dateLong
  if (SELECTION_FIELDS.has(field.key)) return OTP_CANONICAL_FORMATTING_RULES.selectionMark
  if (field.key.endsWith('_place_and_date')) {
    return Object.freeze({
      kind: 'signing_date_parts',
      day: 'D',
      month: 'MMMM',
      year: OTP_CANONICAL_FORMATTING_RULES.yearSuffix.pattern,
      locale: 'en-ZA',
      empty: '',
    })
  }
  if (MULTILINE_FIELDS.has(field.key)) return OTP_CANONICAL_FORMATTING_RULES.multilineText
  return OTP_CANONICAL_FORMATTING_RULES.text
}

function cell(fieldKey, token, tableIndex, rowIndex, gridColumn, sample, mode = 'set') {
  return Object.freeze({
    fieldKey,
    token,
    locator: Object.freeze({ type: 'table_cell', tableIndex, rowIndex, gridColumn }),
    mode,
    sample,
  })
}

function paragraph(fieldKey, token, labelText, sample) {
  return Object.freeze({
    fieldKey,
    token,
    locator: Object.freeze({ type: 'paragraph_text_append', labelText }),
    mode: 'append',
    sample,
  })
}

export const OTP_CANONICAL_DOCX_SLOTS = Object.freeze([
  paragraph('cover.property_address', 'cover_property_address', 'ADDRESS:', '14 Example Avenue, Northmead, Benoni'),
  paragraph('cover.agent_name', 'cover_agent_name', 'AGENT NAME:', 'Alyssa Macdonald'),

  cell('purchaser_1.full_name', 'purchaser_1_full_name', 0, 0, 1, 'Alexander Example'),
  cell('purchaser_1.identity_or_registration_number', 'purchaser_1_identity_number', 0, 1, 1, '9001015009087'),
  cell('purchaser_1.current_address', 'purchaser_1_current_address', 0, 2, 1, '10 Sample Street, Benoni'),
  cell('purchaser_1.income_tax_number', 'purchaser_1_income_tax_number', 0, 3, 1, '0123456789'),
  cell('purchaser_1.vat_number', 'purchaser_1_vat_number', 0, 4, 1, ''),
  cell('purchaser_2.full_name', 'purchaser_2_full_name', 1, 0, 1, 'Jordan Example'),
  cell('purchaser_2.identity_or_registration_number', 'purchaser_2_identity_number', 1, 1, 1, '9202025009088'),
  cell('purchaser_2.current_address', 'purchaser_2_current_address', 1, 2, 1, '10 Sample Street, Benoni'),
  cell('purchaser_2.income_tax_number', 'purchaser_2_income_tax_number', 1, 3, 1, '0987654321'),
  cell('purchaser_2.vat_number', 'purchaser_2_vat_number', 1, 4, 1, ''),
  cell('purchaser.marital_status', 'marital_anc_mark', 2, 1, 0, '', 'set'),
  cell('purchaser.marital_status', 'marital_community_mark', 2, 1, 1, 'X', 'set'),
  cell('purchaser.marital_status', 'marital_customary_mark', 2, 1, 2, '', 'set'),
  cell('purchaser.marital_status', 'marital_islamic_mark', 2, 1, 3, '', 'set'),
  cell('purchaser.marital_status', 'marital_unmarried_mark', 2, 1, 4, '', 'set'),
  cell('purchaser.marital_status', 'marital_foreign_law_mark', 2, 1, 5, '', 'set'),

  cell('property.physical_address', 'property_physical_address', 3, 0, 1, '14 Example Avenue, Northmead, Benoni'),
  cell('property.erf_number', 'property_erf_number', 3, 1, 1, 'Erf 1234'),
  cell('property.township', 'property_township', 3, 2, 1, 'Northmead Township'),
  cell('property.hoa_name', 'property_hoa_name', 4, 0, 1, 'Example Estate HOA'),

  cell('offer.purchase_price', 'offer_purchase_price', 5, 0, 1, '2 500 000.00', 'append'),
  cell('offer.purchase_price_words', 'offer_purchase_price_words', 5, 1, 1, 'Two million five hundred thousand rand'),
  cell('offer.deposit_amount', 'offer_deposit_amount', 5, 2, 1, '100 000.00'),
  cell('offer.cash_contribution', 'offer_cash_contribution', 5, 3, 1, '400 000.00'),
  cell('offer.cash_fulfilment_date', 'offer_cash_fulfilment_date', 5, 3, 3, '31 July 2026'),
  cell('offer.cash_from_sale_proceeds', 'offer_cash_from_sale_proceeds', 5, 4, 1, '250 000.00'),
  cell('offer.bond_finance_amount', 'offer_bond_finance_amount', 6, 0, 1, '2 000 000.00', 'append'),
  cell('offer.linked_property_sale_amount', 'offer_linked_property_sale_amount', 6, 1, 1, '500 000.00', 'append'),
  cell('offer.linked_property_minimum_price', 'offer_linked_property_minimum_price', 6, 2, 1, '1 500 000.00', 'append'),
  cell('linked_property.physical_address', 'linked_property_physical_address', 7, 0, 1, '20 Existing Property Road, Benoni'),
  cell('linked_property.erf_number', 'linked_property_erf_number', 7, 1, 1, 'Erf 5678'),
  cell('linked_property.registered_owner', 'linked_property_registered_owner', 7, 2, 1, 'Alexander Example'),
  cell('linked_property.bond_details', 'linked_property_bond_details', 7, 3, 1, 'Example Bank, account ending 1234'),
  cell('conditions.other_suspensive_conditions', 'other_suspensive_conditions', 8, 1, 0, 'Subject to an approved inspection condition.'),
  cell('conditions.other_suspensive_fulfilment_date', 'other_suspensive_fulfilment_date', 8, 1, 3, '15 August 2026'),
  cell('offer.irrevocable_offer_date', 'offer_irrevocable_date', 8, 6, 4, '20 July 2026'),
  cell('occupation.after_registration', 'occupation_after_registration_yes_mark', 8, 7, 4, '', 'append'),
  cell('occupation.after_registration', 'occupation_after_registration_no_mark', 8, 7, 6, 'X', 'append'),
  cell('occupation.date', 'occupation_date', 8, 8, 4, '1 September 2026'),
  cell('occupation.occupational_rental', 'occupation_occupational_rental', 8, 8, 4, 'R 12 500.00', 'append'),
  cell('offer.guarantee_delivery_period', 'offer_guarantee_delivery_period', 8, 9, 4, '14 days after fulfilment'),
  cell('fixtures.additional_inclusions', 'fixtures_additional_inclusions', 10, 0, 0, 'Freestanding dishwasher and entrance mirror'),
  cell('fixtures.exclusions', 'fixtures_exclusions', 11, 0, 0, 'Seller’s freestanding refrigerator'),
  cell('conditions.special_conditions', 'special_conditions', 12, 0, 0, 'Seller to repair the pool pump before transfer.'),

  cell('agency.name', 'agency_name', 13, 1, 1, 'Kingstons Real Estate'),
  cell('agency.ffc_number', 'agency_ffc_number', 13, 1, 2, '202614013910000'),
  cell('agent.name', 'agent_name', 13, 2, 1, 'Alyssa Macdonald'),
  cell('agent.ffc_number', 'agent_ffc_number', 13, 2, 2, '202577711630000'),
  cell('principal.name', 'principal_name', 13, 3, 1, 'David Helena'),
  cell('principal.ffc_number', 'principal_ffc_number', 13, 3, 2, '202523021540000'),
  cell('agency.physical_address', 'agency_physical_address', 14, 0, 1, 'Corner 14th Avenue and Dalrymple Street, Northmead, Benoni, 1501'),
  cell('agency.postal_address', 'agency_postal_address', 14, 1, 1, 'PO Box 6224, Dunswart, 1508'),
  cell('agency.vat_number', 'agency_vat_number', 14, 2, 1, '4350267052'),
  cell('agency.phone', 'agency_phone', 14, 3, 1, '010 020 2431'),
  cell('agency.email', 'agency_email', 14, 4, 1, 'offers@example.co.za'),

  cell('seller_1.full_name', 'seller_1_full_name', 15, 0, 1, 'Taylor Seller'),
  cell('seller_1.identity_or_registration_number', 'seller_1_identity_number', 15, 1, 1, '8001015009089'),
  cell('seller_1.current_address', 'seller_1_current_address', 15, 2, 1, '14 Example Avenue, Northmead, Benoni'),
  cell('seller_1.postal_address', 'seller_1_postal_address', 15, 3, 1, 'PO Box 100, Benoni, 1500'),
  cell('seller_1.vat_number', 'seller_1_vat_number', 15, 4, 1, ''),
  cell('seller_2.full_name', 'seller_2_full_name', 16, 0, 1, 'Morgan Seller'),
  cell('seller_2.identity_or_registration_number', 'seller_2_identity_number', 16, 1, 1, '8202025009080'),
  cell('seller_2.current_address', 'seller_2_current_address', 16, 2, 1, '14 Example Avenue, Northmead, Benoni'),
  cell('seller_2.postal_address', 'seller_2_postal_address', 16, 3, 1, 'PO Box 100, Benoni, 1500'),
  cell('seller_2.vat_number', 'seller_2_vat_number', 16, 4, 1, ''),
  cell('seller_bond.institution', 'seller_bond_institution', 17, 0, 1, 'Example Bank'),
  cell('seller_bond.account_number', 'seller_bond_account_number', 17, 1, 1, '1234567890'),
  cell('seller_bond.outstanding_amount', 'seller_bond_outstanding_amount', 17, 2, 1, 'R 850 000.00'),
  cell('seller_bond.accounts_up_to_date', 'seller_bond_accounts_up_to_date', 17, 3, 1, 'YES'),
  cell('seller_bond.rates_account_number', 'seller_rates_account_number', 17, 4, 1, 'RATES-12345'),
  cell('conveyancer.firm', 'conveyancer_firm', 18, 0, 1, 'Example Conveyancers Inc.'),
  cell('conveyancer.attorney', 'conveyancer_attorney', 18, 1, 1, 'Sam Attorney'),
  cell('conveyancer.physical_address', 'conveyancer_physical_address', 18, 2, 1, '1 Legal Street, Johannesburg'),
  cell('conveyancer.phone', 'conveyancer_phone', 18, 3, 1, '011 555 0100'),
  cell('conveyancer.email', 'conveyancer_email', 18, 4, 1, 'transfers@example.co.za'),

  cell('bond.applicant_1_employment', 'bond_applicant_1_full_time_mark', 20, 1, 1, 'X', 'append'),
  cell('bond.applicant_1_employment', 'bond_applicant_1_self_employed_mark', 20, 1, 2, '', 'append'),
  cell('bond.applicant_1_employment', 'bond_applicant_1_employer', 20, 2, 1, 'Example Employer (Pty) Ltd'),
  cell('bond.applicant_1_employment', 'bond_applicant_1_employment_period', 20, 3, 1, '5 years'),
  cell('bond.applicant_1_employment', 'bond_applicant_1_occupation', 20, 4, 1, 'Director'),
  cell('bond.applicant_1_employment', 'bond_applicant_1_gross_income', 20, 5, 1, 'R 85 000.00'),
  cell('bond.applicant_1_employment', 'bond_applicant_1_spouse_income', 20, 6, 1, 'R 60 000.00'),
  cell('bond.applicant_1_employment', 'bond_applicant_1_bank', 20, 7, 1, 'Example Bank'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_full_time_mark', 20, 1, 3, 'X', 'append'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_self_employed_mark', 20, 1, 4, '', 'append'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_employer', 20, 2, 3, 'Second Employer CC'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_employment_period', 20, 3, 3, '3 years'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_occupation', 20, 4, 3, 'Consultant'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_gross_income', 20, 5, 3, 'R 60 000.00'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_spouse_income', 20, 6, 3, 'R 85 000.00'),
  cell('bond.applicant_2_employment', 'bond_applicant_2_bank', 20, 7, 3, 'Example Bank'),
  cell('bond.income_structure', 'bond_regular_salary_mark', 21, 0, 1, 'X'),
  cell('bond.income_structure', 'bond_variable_income_mark', 21, 0, 3, ''),
  cell('bond.income_structure', 'bond_self_employed_mark', 21, 0, 6, ''),

  cell('signing.purchaser_place_and_date', 'purchaser_signing_place', 23, 0, 1, 'Benoni'),
  cell('signing.purchaser_place_and_date', 'purchaser_signing_day', 23, 0, 3, '15'),
  cell('signing.purchaser_place_and_date', 'purchaser_signing_month', 23, 0, 5, 'July'),
  cell('signing.purchaser_place_and_date', 'purchaser_signing_year_suffix', 23, 0, 7, '26'),
  cell('signing.seller_place_and_date', 'seller_signing_place', 27, 0, 1, 'Benoni'),
  cell('signing.seller_place_and_date', 'seller_signing_day', 27, 0, 3, '15'),
  cell('signing.seller_place_and_date', 'seller_signing_month', 27, 0, 5, 'July'),
  cell('signing.seller_place_and_date', 'seller_signing_year_suffix', 27, 0, 7, '26'),
  cell('signing.agent_place_and_date', 'agent_signing_place', 31, 0, 1, 'Benoni'),
  cell('signing.agent_place_and_date', 'agent_signing_day', 31, 0, 3, '15'),
  cell('signing.agent_place_and_date', 'agent_signing_month', 31, 0, 5, 'July'),
  cell('signing.agent_place_and_date', 'agent_signing_year_suffix', 31, 0, 7, '26'),

  cell('contact.purchasers', 'purchaser_1_phone', 34, 0, 1, '082 555 0101'),
  cell('contact.purchasers', 'purchaser_1_email', 34, 1, 1, 'alex@example.com'),
  cell('contact.purchasers', 'purchaser_2_phone', 35, 0, 1, '082 555 0102'),
  cell('contact.purchasers', 'purchaser_2_email', 35, 1, 1, 'jordan@example.com'),
  cell('contact.sellers', 'seller_1_phone', 36, 0, 1, '082 555 0201'),
  cell('contact.sellers', 'seller_1_email', 36, 1, 1, 'taylor@example.com'),
  cell('contact.sellers', 'seller_2_phone', 37, 0, 1, '082 555 0202'),
  cell('contact.sellers', 'seller_2_email', 37, 1, 1, 'morgan@example.com'),
  cell('contact.agent', 'agent_phone', 38, 0, 1, '082 555 0301'),
  cell('contact.agent', 'agent_email', 38, 1, 1, 'agent@example.co.za'),
])

export function buildOtpCanonicalTemplateManifest() {
  const slotsByField = new Map()
  OTP_CANONICAL_DOCX_SLOTS.forEach((slot) => {
    const slots = slotsByField.get(slot.fieldKey) || []
    slots.push(slot)
    slotsByField.set(slot.fieldKey, slots)
  })

  const fields = OTP_CANONICAL_FIELD_INVENTORY.map((field) => {
    const slots = slotsByField.get(field.key) || []
    let bindingMode = 'docxtemplater'
    if (!slots.length && field.coverage === 'signing_preset') bindingMode = 'signing_overlay'
    else if (!slots.length && field.coverage === 'manual') bindingMode = 'retained_manual'
    else if (!slots.length && field.coverage === 'gap') bindingMode = 'onboarding_gap'
    else if (field.coverage === 'gap') bindingMode = 'docxtemplater_pending_source'
    else if (field.coverage === 'signing_preset') bindingMode = 'docxtemplater_and_signing'

    return {
      ...field,
      bindingMode,
      outputFormat: outputFormatFor(field),
      emptyValuePolicy: 'blank_preserve_layout',
      slots: slots.map((slot) => ({
        token: slot.token,
        locator: slot.locator,
        mode: slot.mode,
        sample: slot.sample,
      })),
    }
  })

  return {
    schemaVersion: OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
    canonicalContractVersion: OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
    sourceDocument: '2026 OTP - Cover Page.docx',
    sourceSha256: 'a1f8f2e82611f44aead9b2f9ac6fdaa19c8577038b17ca1a6666f2cd4e9910cc',
    templateEngine: 'docxtemplater_single_brace',
    editablePackageParts: ['word/document.xml'],
    preserveOnlyPackageParts: 'all_other_parts',
    emptyValuePolicy: 'blank_preserve_layout',
    formattingRules: OTP_CANONICAL_FORMATTING_RULES,
    fields,
  }
}

export function validateOtpCanonicalTemplateManifest(manifest = buildOtpCanonicalTemplateManifest()) {
  const errors = []
  const inventoryKeys = new Set(OTP_CANONICAL_FIELD_INVENTORY.map((field) => field.key))
  const manifestKeys = new Set((manifest.fields || []).map((field) => field.key))
  inventoryKeys.forEach((key) => {
    if (!manifestKeys.has(key)) errors.push(`Canonical field ${key} is missing from the DOCX manifest.`)
  })
  manifestKeys.forEach((key) => {
    if (!inventoryKeys.has(key)) errors.push(`DOCX manifest contains unknown canonical field ${key}.`)
  })
  ;(manifest.fields || []).forEach((field) => {
    if (!field.bindingMode) errors.push(`Canonical field ${field.key} has no binding mode.`)
    if (!field.outputFormat?.kind) errors.push(`Canonical field ${field.key} has no output format.`)
    if (field.emptyValuePolicy !== 'blank_preserve_layout') errors.push(`Canonical field ${field.key} has no deterministic empty-value policy.`)
    if (field.bindingMode.startsWith('docxtemplater') && !field.slots.length) {
      errors.push(`Canonical field ${field.key} requires at least one DOCX slot.`)
    }
  })
  const tokens = (manifest.fields || []).flatMap((field) => field.slots.map((slot) => slot.token))
  if (tokens.some((token) => !/^[a-z][a-z0-9_]*$/.test(token))) errors.push('All DOCX tokens must use stable snake_case keys.')
  return { valid: errors.length === 0, errors, tokenCount: tokens.length }
}
