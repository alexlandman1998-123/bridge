import {
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'
import {
  getOtpFieldDefinition,
} from './otpFieldRegistry.js'

export const OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION = 'otp_new_development_legal_content_phase5_v1'
export const OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_STATUS_READY = 'OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW'
export const OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY = 'new_development'

export const OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE = Object.freeze({
  label: 'Samlin/Junoah Agreement of Sale reference',
  path: '/Users/alexanderlandman/Desktop/Samlin/Junoah Sales/Templates/AGREEMENT OF SALE - final.doc',
  sha256: '62d6776d8689ea6fd62cfba6963e1d6acb9586633f3e1abfb8ef57e478f48654',
  routeKey: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY,
  sourceFormat: 'doc',
  sourceFileKind: 'Composite Document File V2',
  sourcePageCount: 23,
  sourceWordCount: 6001,
  sourceCharacterCount: 34212,
  extractedTextLineCount: 761,
  projectSignal: 'JUNOAH ESTATE',
  sellerSignal: 'JUANFANY CC',
  contractorSignal: 'SAMLIN CONSTRUCTION CC',
  conveyancerSignal: 'TUCKERS INCORPORATED',
})

export const OTP_NEW_DEVELOPMENT_REFERENCE_TOPICS = Object.freeze([
  'front_schedule_parties',
  'sectional_title_property',
  'vat_inclusive_purchase_price',
  'mortgage_finance',
  'utility_connection_charges',
  'conveyancers_and_trust_investment',
  'building_contractor_nhbrc',
  'recordal_and_interpretation',
  'sale',
  'transfer_delivery_mortgage_bond',
  'occupation_before_transfer',
  'rectification_of_defects',
  'body_corporate_before_transfer',
  'selling_agent_commission',
  'jurisdiction_costs',
  'joint_and_several_liability',
  'company_to_be_formed',
  'company_close_corporation_trust',
  'breach',
  'notice_address',
  'general_conditions',
  'offer_acceptance',
  'direct_marketing_cpa',
  'consumer_protection_acknowledgement',
  'nhbrc_certificate',
  'marketing_and_annexures',
  'multi_party_signatures',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function cloneJson(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : {}
}

function cloneArray(value = []) {
  return [...(Array.isArray(value) ? value : [])]
}

function extractTokens(text = '') {
  return Array.from(String(text || '').matchAll(/{{\s*([^{}]+?)\s*}}/g))
    .map((match) => normalizeKey(match[1]))
    .filter(Boolean)
}

function sourceOwnersForTokens(tokens = []) {
  return unique(tokens.map((token) => getOtpFieldDefinition(token)?.owner).filter(Boolean))
}

function paragraph(lines = []) {
  return lines.map((line) => normalizeText(line)).filter(Boolean).join('\n\n')
}

function developmentSection({
  order,
  key,
  title,
  clauseFamily,
  legalText,
  placeholderKeys = [],
  counselNotes = [],
  isRequired = true,
  referenceSignals = [],
} = {}) {
  const tokens = unique([...placeholderKeys.map(normalizeKey), ...extractTokens(legalText)])
  const sourceOwners = sourceOwnersForTokens(tokens)
  return Object.freeze({
    section_key: `development_${String(order).padStart(2, '0')}_${normalizeKey(key)}`,
    reference_topic_key: normalizeKey(key),
    section_label: title,
    section_type: 'new_development_legal_content',
    sort_order: order * 10,
    route_key: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY,
    variants: Object.freeze([OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY]),
    clause_family: normalizeKey(clauseFamily || key),
    is_required: Boolean(isRequired),
    is_repeatable: false,
    condition_json: Object.freeze({}),
    placeholder_keys: Object.freeze(tokens),
    source_owners: Object.freeze(sourceOwners),
    reference_signals: Object.freeze(referenceSignals),
    counsel_notes: Object.freeze(counselNotes),
    legal_text: normalizeText(legalText),
    metadata_json: Object.freeze({
      content_version: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION,
      draft_status: 'draft_for_counsel_review',
      route_key: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY,
      reference_source_path: OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.path,
      reference_source_sha256: OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.sha256,
      reference_topic_key: normalizeKey(key),
      legal_review_required: true,
      counsel_approval_required: true,
      source_owners: sourceOwners,
      copied_from_reference_verbatim: false,
    }),
  })
}

export const OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_SECTIONS = Object.freeze([
  developmentSection({
    order: 1,
    key: 'front_schedule_parties',
    title: 'Parties, Representatives and Capacity',
    clauseFamily: 'parties',
    referenceSignals: ['seller Juanfany CC', 'purchaser schedule', 'contractor Samlin Construction CC'],
    placeholderKeys: [
      'developer_name',
      'developer_company_registration',
      'developer_representative',
      'buyer_full_name',
      'buyer_id_number',
      'buyer_entity_type',
      'buyer_representative_name',
      'buyer_representative_capacity',
      'contractor_company_name',
      'contractor_registration_number',
    ],
    legalText: paragraph([
      'Seller / Developer: {{developer_name}}, registration number {{developer_company_registration}}, represented by {{developer_representative}} or another duly authorised signatory.',
      'Purchaser: {{buyer_full_name}}, identity or registration number {{buyer_id_number}}, entity type {{buyer_entity_type}}. If represented, {{buyer_representative_name}} signs in the capacity {{buyer_representative_capacity}} and must provide the required authority documents.',
      'Building Contractor: {{contractor_company_name}}, registration number {{contractor_registration_number}}, engaged for the construction of the units in the development.',
    ]),
    counselNotes: ['Confirm whether the platform should label the seller as Seller, Developer, or Seller/Developer for each project.'],
  }),
  developmentSection({
    order: 2,
    key: 'sectional_title_property',
    title: 'Sectional Title Property Sold',
    clauseFamily: 'development_unit',
    referenceSignals: ['section in Junoah Estate', 'sectional title scheme', 'parking bay / double garage'],
    placeholderKeys: [
      'development_name',
      'property_unit_number',
      'sectional_plan_status',
      'participation_quota',
      'parking_bay',
      'garage_allocation',
    ],
    legalText: paragraph([
      'The Property sold is the section or unit recorded as {{property_unit_number}} in the sectional title scheme known as {{development_name}}, together with the undivided share in the common property allocated to that section.',
      'Sectional Plan Status: {{sectional_plan_status}}. Participation Quota: {{participation_quota}}. Parking Bay: {{parking_bay}}. Garage Allocation: {{garage_allocation}}.',
      'The wording must support development units whose sectional plan may still be draft, pending approval, approved, or awaiting opening of the sectional title register.',
    ]),
  }),
  developmentSection({
    order: 3,
    key: 'vat_inclusive_purchase_price',
    title: 'VAT-Inclusive Purchase Price and Deposits',
    clauseFamily: 'purchase_price',
    referenceSignals: ['purchase price inclusive of VAT at 15%', 'security deposit', 'additional deposit'],
    placeholderKeys: [
      'vat_inclusive_purchase_price',
      'purchase_price',
      'purchase_price_words',
      'deposit_amount',
      'deposit_due_date',
      'trust_account_recipient',
    ],
    legalText: paragraph([
      'VAT-Inclusive Purchase Price: {{vat_inclusive_purchase_price}}. Purchase Price: {{purchase_price}} ({{purchase_price_words}}).',
      'The security deposit and any additional deposit, including {{deposit_amount}} due by {{deposit_due_date}}, must be paid to {{trust_account_recipient}} or the verified trust account nominated by the conveyancers.',
      'The development route must treat the purchase price as VAT-inclusive where the project setup records that basis, and must not reuse resale transfer-duty wording without review.',
    ]),
    counselNotes: ['VAT percentage and tax treatment must be project-configurable and approved by tax/legal review.'],
  }),
  developmentSection({
    order: 4,
    key: 'mortgage_finance',
    title: 'Mortgage Finance',
    clauseFamily: 'suspensive_conditions',
    referenceSignals: ['bond must be granted within 30 days', 'seller may approve extension'],
    placeholderKeys: [
      'bond_amount',
      'bond_approval_deadline',
      'finance_type',
      'cash_amount',
      'guarantee_delivery_deadline',
      'structured_suspensive_conditions',
    ],
    legalText: paragraph([
      'Finance Type: {{finance_type}}. Mortgage Loan / Bond Amount: {{bond_amount}}. Bond approval deadline: {{bond_approval_deadline}}.',
      'The agreement is subject to the Purchaser procuring the required mortgage finance by the captured deadline or by such extended date as the Seller/Developer approves in writing.',
      'If the approved loan is less than the required amount, the Purchaser must secure the shortfall by cash payment, guarantee or other approved security recorded as {{cash_amount}} and {{guarantee_delivery_deadline}}.',
      'Additional finance or project-specific suspensive conditions must render from approved structured records: {{structured_suspensive_conditions}}.',
    ]),
  }),
  developmentSection({
    order: 6,
    key: 'conveyancers_and_trust_investment',
    title: 'Conveyancers, Trust Investment and Payment References',
    clauseFamily: 'transfer_conveyancer',
    referenceSignals: ['Tuckers Incorporated', 'trust account', 'instruction to invest'],
    placeholderKeys: [
      'transfer_attorney_company_name',
      'transfer_attorney_contact_person',
      'transfer_attorney_email',
      'transfer_attorney_phone',
      'trust_account_recipient',
    ],
    legalText: paragraph([
      'Conveyancers: {{transfer_attorney_company_name}}. Contact: {{transfer_attorney_contact_person}}, {{transfer_attorney_email}}, {{transfer_attorney_phone}}.',
      'All amounts paid on account of the Purchase Price must be paid to the verified conveyancing trust account for {{trust_account_recipient}} and may be invested in an interest-bearing account where the required investment authority is captured.',
      'Deposit references, FICA documents and proof of payment must be supplied to the conveyancers so funds can be allocated to the correct unit and transaction.',
    ]),
  }),
  developmentSection({
    order: 5,
    key: 'utility_connection_charges',
    title: 'Additional Costs, Utility Connections, Levies and Rates',
    clauseFamily: 'costs',
    referenceSignals: ['electrical deposit', 'water and sewerage connection', 'estimated levy', 'estimated rates', 'gas bottle'],
    placeholderKeys: [
      'utility_connection_charges',
      'development_levy_estimate',
      'development_rates_estimate',
      'development_name',
    ],
    legalText: paragraph([
      'Utility connection charges: {{utility_connection_charges}}. Estimated levy: {{development_levy_estimate}}. Estimated assessment rates: {{development_rates_estimate}}.',
      'The Purchaser is responsible for project-specific electrical, water, sewerage, meter, connection, deposit, gas-bottle or similar charges allocated to the Purchaser under the approved development schedule.',
      'The Purchaser becomes responsible for levies to the Body Corporate and municipal rates from registration of transfer of the unit in {{development_name}}, with exact amounts confirmed after registration where estimates are used.',
    ]),
    counselNotes: ['Separate electrical, water and gas fields may be added in a later data phase if the UI captures them individually.'],
  }),
  developmentSection({
    order: 7,
    key: 'building_contractor_nhbrc',
    title: 'Building Contractor and NHBRC Enrolment',
    clauseFamily: 'compliance_certificates',
    referenceSignals: ['building contractor shall effect building', 'NHBRC Number'],
    placeholderKeys: [
      'contractor_company_name',
      'contractor_registration_number',
      'property_nhbrc_certificate_number',
      'development_name',
    ],
    legalText: paragraph([
      '{{contractor_company_name}}, registration number {{contractor_registration_number}}, is recorded as the building contractor for the units in {{development_name}}.',
      'NHBRC Certificate / Enrolment Number: {{property_nhbrc_certificate_number}}.',
      'The building works must be constructed within the regulations and requirements of the National Home Builders Registration Council and the approved project documents.',
    ]),
  }),
  developmentSection({
    order: 8,
    key: 'recordal_and_interpretation',
    title: 'Recordal, Interpretation and Definitions',
    clauseFamily: 'development_unit',
    referenceSignals: ['seller intends establishing sectional title scheme', 'Act definitions', 'Schedule and Annexures'],
    placeholderKeys: [
      'development_name',
      'sectional_plan_status',
      'body_corporate_name',
      'body_corporate_rules_annexure',
    ],
    legalText: paragraph([
      'The Seller/Developer records that it intends establishing the residential sectional title scheme known as {{development_name}} and that the Purchaser purchases a unit, an undivided share in common property and any allocated parking or garage rights.',
      'The Agreement includes the schedule, standard conditions, annexures, plans, rules and project documents. Defined terms must include the Act, Agreement, Architect, Body Corporate, Buildings, Common Property, Conveyancers, Consumer Protection Act, Development, Delivery, Land, Mortgage Loan, Occupation Date, Parking Bay, Participation Quota, Property, Purchase Price, Rules, Sectional Plan, Section and Unit.',
      'The sectional plan status {{sectional_plan_status}}, body-corporate identity {{body_corporate_name}} and rules annexure {{body_corporate_rules_annexure}} must drive route-specific wording.',
    ]),
  }),
  developmentSection({
    order: 9,
    key: 'sale',
    title: 'Sale',
    clauseFamily: 'offer_acceptance',
    referenceSignals: ['seller sells to purchaser property subject to conditions'],
    placeholderKeys: ['developer_name', 'buyer_full_name', 'development_name', 'property_unit_number'],
    legalText: paragraph([
      '{{developer_name}} sells to {{buyer_full_name}}, who purchases, the unit {{property_unit_number}} in {{development_name}} subject to the standard conditions, schedule, annexures and project documents.',
      'This section is new-development-only and must not be used for an existing-property resale route.',
    ]),
  }),
  developmentSection({
    order: 10,
    key: 'transfer_delivery_mortgage_bond',
    title: 'Transfer, Delivery and Mortgage Bond',
    clauseFamily: 'transfer_conveyancer',
    referenceSignals: ['transfer after sectional title register opened', 'simultaneous transfers', 'bond costs'],
    placeholderKeys: [
      'sectional_plan_status',
      'purchase_price',
      'transfer_attorney_company_name',
      'bond_amount',
      'property_unit_number',
    ],
    legalText: paragraph([
      'Delivery and transfer may not pass until the Purchase Price {{purchase_price}} and all other amounts due by the Purchaser have been paid or secured to the satisfaction of {{transfer_attorney_company_name}}.',
      'Transfer must occur as soon as practically possible after the purchase price is secured and the sectional title register is opened or otherwise ready according to {{sectional_plan_status}}.',
      'Where a mortgage bond of {{bond_amount}} is required, the Purchaser must sign bond and transfer documents and provide information within the required period. Lodgement may occur simultaneously with other development transfers and remains subject to conveyancer timing for the development.',
    ]),
  }),
  developmentSection({
    order: 11,
    key: 'occupation_before_transfer',
    title: 'Occupation Before Transfer',
    clauseFamily: 'occupation_rent',
    referenceSignals: ['occupation date when property ready', 'occupier obligations before transfer'],
    placeholderKeys: ['occupation_date', 'development_name', 'property_unit_number'],
    legalText: paragraph([
      'Occupation Date: {{occupation_date}}, being the date certified by the Seller/Developer or authorised representative that the unit {{property_unit_number}} is ready for possession and beneficial occupation.',
      'From occupation until transfer, the Purchaser must keep the unit in good repair, allow reasonable inspection access, pay consumption charges, comply with development rules and not alter, redecorate, sell, transfer or cede rights without the required written consent.',
      'Occupation before transfer does not create a tenancy unless expressly agreed in writing and approved for the route.',
    ]),
  }),
  developmentSection({
    order: 12,
    key: 'rectification_of_defects',
    title: 'Inspection, Snagging and Rectification of Defects',
    clauseFamily: 'development_defects',
    referenceSignals: ['14 days from readiness notice', '30 days after occupation', 'architect certificate', 'final snag sign-off'],
    placeholderKeys: [
      'snagging_period_days',
      'occupation_date',
      'contractor_company_name',
      'property_nhbrc_certificate_number',
    ],
    legalText: paragraph([
      'Snagging Period: {{snagging_period_days}} days, unless the project schedule records another approved period. Occupation Date: {{occupation_date}}.',
      'The Purchaser must inspect the unit and notify the Seller/Developer in writing of defects within the approved inspection period. Reasonable repairs for defects in faulty materials or workmanship must be attended to within the approved remedial period, subject to project documents and NHBRC requirements.',
      'The Purchaser must allow access to {{contractor_company_name}}, the Seller/Developer, workmen and authorised professionals to attend to repairs. A final snag inspection and sign-off must be completed before registration where required.',
      'NHBRC certificate/enrolment: {{property_nhbrc_certificate_number}}.',
    ]),
    counselNotes: ['Final timing, architect certificate and excluded-defect language must be settled for each development.'],
  }),
  developmentSection({
    order: 13,
    key: 'body_corporate_before_transfer',
    title: 'Body Corporate, Rules and Pre-Transfer Restrictions',
    clauseFamily: 'body_corporate',
    referenceSignals: ['body corporate established on first transfer', 'rules bind purchaser', 'additional rules before register'],
    placeholderKeys: [
      'body_corporate_name',
      'body_corporate_rules_annexure',
      'development_levy_estimate',
      'development_rates_estimate',
      'participation_quota',
    ],
    legalText: paragraph([
      'Body Corporate: {{body_corporate_name}}. Rules Annexure: {{body_corporate_rules_annexure}}. Participation Quota: {{participation_quota}}.',
      'The Body Corporate is established on registration of the first transfer as provided in the applicable sectional-title legislation. The Purchaser becomes a member on becoming registered owner and remains bound by the conduct and management rules while owner.',
      'Estimated levy {{development_levy_estimate}} and estimated rates {{development_rates_estimate}} are payable from the date and on the basis recorded in the development schedule.',
      'The Seller/Developer may impose or amend rules before the opening of the sectional title register or future phases where permitted by the project documents and law.',
    ]),
  }),
  developmentSection({
    order: 14,
    key: 'selling_agent_commission',
    title: 'Selling Agent and Commission',
    clauseFamily: 'agency_commission',
    referenceSignals: ['seller pays selling agent commission', 'agent introduction warranty', 'commission on purchaser breach'],
    placeholderKeys: [
      'organisation_trading_name',
      'agent_full_name',
      'agent_ffc_number',
      'gross_commission_amount',
    ],
    legalText: paragraph([
      'Agency: {{organisation_trading_name}}. Selling Agent: {{agent_full_name}}. Agent FFC Number: {{agent_ffc_number}}. Gross commission amount: {{gross_commission_amount}}.',
      'The Seller/Developer is responsible for the selling-agent commission on the basis agreed with the Selling Agent, subject to mandate and project instructions.',
      'The Purchaser warrants that no agent other than the recorded Selling Agent introduced the Purchaser to the Property and may be liable for commission consequences if the Agreement is cancelled due to Purchaser breach.',
    ]),
    counselNotes: ['Commission payer, breach consequences and project-retained units must align to mandate/project instructions.'],
  }),
  developmentSection({
    order: 15,
    key: 'jurisdiction_costs',
    title: 'Jurisdiction and Costs',
    clauseFamily: 'jurisdiction',
    placeholderKeys: ['buyer_full_name'],
    legalText: paragraph([
      'The Purchaser {{buyer_full_name}} consents to the jurisdiction of a competent Magistrates Court to the extent permitted by law, without limiting the Seller/Developer right to institute proceedings in another court of competent jurisdiction.',
      'If legal proceedings or attorney instructions are required because of Purchaser default, recoverable legal costs, VAT, collection costs and related charges must follow the approved project wording and applicable law.',
    ]),
    counselNotes: ['Jurisdiction and attorney-own-client cost wording must be checked for current enforceability.'],
  }),
  developmentSection({
    order: 16,
    key: 'joint_and_several_liability',
    title: 'Joint and Several Liability',
    clauseFamily: 'parties',
    placeholderKeys: ['buyer_full_name'],
    legalText: paragraph([
      'Where more than one person signs as Purchaser, each Purchaser is jointly and severally liable with the other Purchasers for all Purchaser obligations under the Agreement.',
      'The generated agreement must preserve this rule where {{buyer_full_name}} represents multiple purchasers or where the buyer record contains multiple signing parties.',
    ]),
  }),
  developmentSection({
    order: 17,
    key: 'company_to_be_formed',
    title: 'Company to be Formed',
    clauseFamily: 'capacity_authority',
    placeholderKeys: [
      'buyer_representative_name',
      'buyer_representative_capacity',
      'buyer_full_name',
    ],
    legalText: paragraph([
      'If the signatory signs for a company to be formed, {{buyer_representative_name}} signing as {{buyer_representative_capacity}} remains personally bound as surety and co-principal debtor until the company is formed, adopts the Agreement and delivers the required corporate documents within the approved period.',
      'If the company is not formed or does not ratify the Agreement and provide required documentation, the signatory may remain personally liable as if contracting in a personal capacity.',
    ]),
    counselNotes: ['Suretyship and company-to-be-formed provisions require explicit signature and counsel-approved wording.'],
  }),
  developmentSection({
    order: 18,
    key: 'company_close_corporation_trust',
    title: 'Company, Close Corporation or Trust Authority',
    clauseFamily: 'capacity_authority',
    placeholderKeys: [
      'buyer_entity_type',
      'buyer_representative_name',
      'buyer_representative_capacity',
    ],
    legalText: paragraph([
      'If the Purchaser is a company, close corporation or trust, the person signing warrants that they are duly authorised to bind that entity and must provide the required resolutions, trust authority or equivalent documents.',
      'Buyer entity type: {{buyer_entity_type}}. Representative: {{buyer_representative_name}}. Capacity: {{buyer_representative_capacity}}.',
      'The final wording must preserve any suretyship/co-principal debtor language only where the signing workflow and legal review support it.',
    ]),
  }),
  developmentSection({
    order: 19,
    key: 'breach',
    title: 'Breach',
    clauseFamily: 'breach',
    placeholderKeys: ['purchase_price', 'occupation_date', 'gross_commission_amount'],
    legalText: paragraph([
      'If the Purchaser fails to pay any amount, provide required guarantees, sign required documents, or breaches any other material term and fails to remedy after the approved notice period, the Seller/Developer may cancel, retain monies pending determination of damages, or claim immediate performance and payment of outstanding obligations.',
      'If breach occurs after lodgement, the notice period may be shortened where the approved project wording and law permit it.',
      'If the Purchaser disputes cancellation or remains in occupation after cancellation, the Purchaser must continue paying amounts due from {{occupation_date}} without creating a tenancy. Commission consequences must align to {{gross_commission_amount}} and the approved commission clause.',
    ]),
    counselNotes: ['Notice period and post-lodgement shortened notice must be legally approved before launch.'],
  }),
  developmentSection({
    order: 20,
    key: 'notice_address',
    title: 'Notice Address and Domicilium',
    clauseFamily: 'domicilium_notices',
    placeholderKeys: [
      'buyer_domicilium_address',
      'buyer_email',
      'developer_contact_email',
      'occupation_date',
    ],
    legalText: paragraph([
      'The parties choose the physical, postal, email and telefax addresses captured in the schedule as their domicilium and notice addresses for the Agreement.',
      'Purchaser address: {{buyer_domicilium_address}}. Purchaser email: {{buyer_email}}. Seller/Developer email: {{developer_contact_email}}.',
      'A party may change its notice address by written notice, effective after the approved notice period. From {{occupation_date}}, the Purchaser may be deemed to have changed domicilium to the unit where the final project wording says so.',
    ]),
    counselNotes: ['Electronic notice deeming and post-occupation domicilium must be reviewed.'],
  }),
  developmentSection({
    order: 21,
    key: 'general_conditions',
    title: 'General Conditions, Whole Agreement and Variation',
    clauseFamily: 'whole_agreement',
    legalText: paragraph([
      'The Agreement is the entire agreement between the parties, and no conditions, warranties, representations or stipulations are binding unless set out in the Agreement or approved written annexures.',
      'No variation is effective unless reduced to writing and signed by the parties. No indulgence, extension of time or failure to enforce a right operates as a waiver or novation.',
      'Each party must sign all documents reasonably required to give effect to transfer, bond registration, transfer duty declarations, powers of attorney, affidavits and related transaction documents.',
    ]),
  }),
  developmentSection({
    order: 22,
    key: 'offer_acceptance',
    title: 'Offer Acceptance',
    clauseFamily: 'offer_acceptance',
    placeholderKeys: ['irrevocable_offer_expiry', 'developer_signature'],
    legalText: paragraph([
      'Once signed by the Purchaser and delivered to the Seller/Developer, the offer remains open for acceptance by Seller/Developer signature until {{irrevocable_offer_expiry}} or the approved project acceptance period.',
      'Acceptance requires the route-aware Seller/Developer signature field {{developer_signature}} and any additional required authority or project approval.',
    ]),
  }),
  developmentSection({
    order: 23,
    key: 'direct_marketing_cpa',
    title: 'Direct Marketing and CPA Cooling-Off',
    clauseFamily: 'cooling_off',
    placeholderKeys: ['buyer_full_name'],
    legalText: paragraph([
      'If {{buyer_full_name}} concluded the Agreement as a result of direct marketing, the Purchaser must be informed of any cooling-off rights under the Consumer Protection Act and any related statutory notice requirements.',
      'The direct-marketing status must be captured explicitly and must not be assumed from ordinary agency introduction or platform communication.',
    ]),
    counselNotes: ['Direct-marketing yes/no capture should become a structured field before publication.'],
  }),
  developmentSection({
    order: 24,
    key: 'consumer_protection_acknowledgement',
    title: 'Consumer Protection Acknowledgement',
    clauseFamily: 'consumer_protection',
    placeholderKeys: ['buyer_full_name'],
    legalText: paragraph([
      'The Purchaser {{buyer_full_name}} acknowledges that the Agreement may contain provisions limiting Seller/Developer risk or liability, allocating risk to the Purchaser, requiring indemnities, or recording factual acknowledgements.',
      'The signing flow must provide the Purchaser sufficient opportunity to read and understand those provisions before signature, including the Consumer Protection Act risk-allocation acknowledgement, without treating this engineering content as legal approval.',
    ]),
    counselNotes: ['This acknowledgement should be reviewed against CPA and project-specific risk allocation.'],
  }),
  developmentSection({
    order: 25,
    key: 'nhbrc_certificate',
    title: 'NHBRC Certificate and Warranty Fund',
    clauseFamily: 'development_defects',
    referenceSignals: ['3 months non-compliance', '12 months roof leaks', '5 years major structural defects'],
    placeholderKeys: [
      'property_nhbrc_certificate_number',
      'contractor_company_name',
      'snagging_period_days',
    ],
    legalText: paragraph([
      'NHBRC Certificate / Enrolment Number: {{property_nhbrc_certificate_number}}. Contractor: {{contractor_company_name}}.',
      'The NHBRC warranty wording must deal with applicable periods for non-compliance or deviation from plans/specifications, roof leaks attributable to workmanship/design/materials, and major structural defects caused by non-compliance with technical building standards.',
      'Items excluded from the NHBRC warranty, including maintenance items and excluded temporary, mechanical, appliance or alteration items, must be communicated through the approved project wording and annexures.',
      'The snagging period captured as {{snagging_period_days}} must not be confused with statutory or NHBRC warranty periods.',
    ]),
    counselNotes: ['Use current NHBRC wording and project enrolment documents before publishing.'],
  }),
  developmentSection({
    order: 26,
    key: 'marketing_and_annexures',
    title: 'Marketing, Service Providers and Annexures',
    clauseFamily: 'annexures',
    placeholderKeys: [
      'annexures_list',
      'body_corporate_rules_annexure',
      'development_name',
    ],
    legalText: paragraph([
      'Annexures: {{annexures_list}}. Body-corporate rules annexure: {{body_corporate_rules_annexure}}.',
      'Development annexures may include sectional plans, FICA documentation, investment instructions, fibre supplier applications, service-provider information, plans, rules, specifications and NHBRC/project documents.',
      'The Seller/Developer may continue marketing {{development_name}} until transfer of the final unit where the approved project wording permits continued marketing.',
    ]),
  }),
  developmentSection({
    order: 27,
    key: 'multi_party_signatures',
    title: 'Purchaser, Seller/Developer, Agent and Contractor Signatures',
    clauseFamily: 'signatures',
    referenceSignals: ['purchaser signature', 'seller signature', 'selling agent signature', 'contractor signature'],
    placeholderKeys: [
      'buyer_signature',
      'developer_signature',
      'agent_signature',
      'contractor_signature',
      'signed_date',
    ],
    legalText: paragraph([
      'Purchaser Signature: {{buyer_signature}}. Seller/Developer Signature: {{developer_signature}}. Selling Agent Signature: {{agent_signature}}. Contractor Signature: {{contractor_signature}}. Signed Date: {{signed_date}}.',
      'The new-development signing plan must support the additional contractor and selling-agent acknowledgement roles reflected in the Samlin/Junoah agreement where required by project setup.',
      'This signature section must not render a resale seller signature field for the new-development route.',
    ]),
    counselNotes: ['Phase 8/Signature layout must decide whether agent and contractor signatures are required signers or acknowledgements.'],
  }),
])

export function listOtpNewDevelopmentLegalContentSections() {
  return OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_SECTIONS
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((section) => ({
      ...section,
      variants: cloneArray(section.variants),
      condition_json: cloneJson(section.condition_json),
      placeholder_keys: cloneArray(section.placeholder_keys),
      source_owners: cloneArray(section.source_owners),
      reference_signals: cloneArray(section.reference_signals),
      counsel_notes: cloneArray(section.counsel_notes),
      metadata_json: cloneJson(section.metadata_json),
    }))
}

function routeForbiddenTokens(sections = []) {
  return sections.flatMap((section) => (
    (section.placeholder_keys || [])
      .map((token) => ({ token, sectionKey: section.section_key, definition: getOtpFieldDefinition(token) }))
      .filter(({ token, definition }) => (
        /^seller_|^mandatory_disclosure|^fixtures_|^subject_sale_|^rates_and_taxes|^homeowners_association/.test(token) ||
        (definition?.variants?.length && !definition.variants.includes(OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY))
      ))
      .map(({ token, sectionKey }) => ({ token, sectionKey, routeKey: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY }))
  ))
}

function buildChecks({
  sections = [],
  registryValidation = {},
  routeForbiddenTokenRows = [],
  fieldRegistryGaps = [],
  metadataGaps = [],
  sourceOwnerGaps = [],
  contentDepthGaps = [],
} = {}) {
  const checks = []
  const push = (pass, code, detail, severity = 'blocking') => checks.push({ code, pass: Boolean(pass), detail, severity })
  const topicKeys = new Set(sections.map((section) => section.reference_topic_key))

  push(sections.length === 27, 'PHASE5_DEVELOPMENT_27_LEGAL_SECTIONS_PRESENT', 'New-development content covers the schedule and standard-condition topics extracted from the Samlin/Junoah agreement.')
  push(OTP_NEW_DEVELOPMENT_REFERENCE_TOPICS.every((topic) => topicKeys.has(topic)), 'PHASE5_DEVELOPMENT_REFERENCE_TOPICS_COVERED', 'Every extracted development reference topic is represented.')
  push(sections.every((section) => section.route_key === OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY && section.variants.length === 1 && section.variants[0] === OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY), 'PHASE5_DEVELOPMENT_ROUTE_ONLY', 'Phase 5 content is scoped to the new-development route only.')
  push(registryValidation.isValid && registryValidation.unknown?.length === 0 && registryValidation.deprecated?.length === 0, 'PHASE5_DEVELOPMENT_TOKENS_CANONICAL', 'Every new-development legal-content token is canonical for OTP.')
  push(fieldRegistryGaps.length === 0, 'PHASE5_DEVELOPMENT_TOKENS_IN_FIELD_REGISTRY', 'Every new-development legal-content token exists in the OTP field registry.')
  push(routeForbiddenTokenRows.length === 0, 'PHASE5_DEVELOPMENT_EXCLUDES_RESALE_TOKENS', 'New-development legal content excludes resale-only seller, disclosure, fixtures and subject-sale token families.')
  push(metadataGaps.length === 0, 'PHASE5_DEVELOPMENT_REFERENCE_METADATA_LOCKED', 'Every section carries reference hash, topic key, legal-review and counsel-review metadata.')
  push(sourceOwnerGaps.length === 0, 'PHASE5_DEVELOPMENT_SOURCE_OWNERS_DECLARED', 'Every placeholder token has its source owner declared on the section.')
  push(contentDepthGaps.length === 0, 'PHASE5_DEVELOPMENT_CONTENT_DEPTH_PRESENT', 'Every development legal section has substantive counsel-review wording.')
  push(topicKeys.has('building_contractor_nhbrc') && topicKeys.has('nhbrc_certificate'), 'PHASE5_DEVELOPMENT_NHBRC_COVERED', 'Building contractor and NHBRC warranty topics are represented.')
  push(topicKeys.has('body_corporate_before_transfer'), 'PHASE5_DEVELOPMENT_BODY_CORPORATE_COVERED', 'Body corporate, rules and pre-transfer restrictions are represented.')
  push(topicKeys.has('rectification_of_defects'), 'PHASE5_DEVELOPMENT_SNAGGING_DEFECTS_COVERED', 'Inspection, snagging and rectification of defects are represented.')
  push(topicKeys.has('direct_marketing_cpa') && topicKeys.has('consumer_protection_acknowledgement'), 'PHASE5_DEVELOPMENT_CPA_COVERED', 'Direct marketing and Consumer Protection Act acknowledgement wording are represented.')
  push(topicKeys.has('multi_party_signatures'), 'PHASE5_DEVELOPMENT_MULTI_PARTY_SIGNATURES_COVERED', 'Purchaser, Seller/Developer, Agent and Contractor signature roles are represented.')
  push(sections.every((section) => section.metadata_json?.copied_from_reference_verbatim === false), 'PHASE5_DEVELOPMENT_NOT_VERBATIM_REFERENCE_COPY', 'The engineering content contract records paraphrased counsel-review wording rather than verbatim reference copying.', 'warning')

  return checks
}

export function buildOtpNewDevelopmentLegalContentReport({ generatedAt = new Date().toISOString() } = {}) {
  const sections = listOtpNewDevelopmentLegalContentSections()
  const tokens = unique(sections.flatMap((section) => section.placeholder_keys)).sort()
  const registryValidation = validateTemplateTokensAgainstRegistry({ packetType: 'otp', tokens })
  const fieldRegistryGaps = tokens.filter((token) => !getOtpFieldDefinition(token))
  const routeForbiddenTokenRows = routeForbiddenTokens(sections)
  const metadataGaps = sections
    .filter((section) => (
      section.metadata_json?.content_version !== OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION ||
      section.metadata_json?.reference_source_sha256 !== OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.sha256 ||
      section.metadata_json?.reference_topic_key !== section.reference_topic_key ||
      section.metadata_json?.legal_review_required !== true ||
      section.metadata_json?.counsel_approval_required !== true
    ))
    .map((section) => section.section_key)
  const sourceOwnerGaps = sections.flatMap((section) => (
    section.placeholder_keys
      .map((token) => ({ token, sectionKey: section.section_key, owner: getOtpFieldDefinition(token)?.owner }))
      .filter(({ owner }) => owner && !section.source_owners.includes(owner))
  ))
  const contentDepthGaps = sections
    .filter((section) => section.legal_text.length < 160 || !/[.!?]$/.test(section.legal_text))
    .map((section) => section.section_key)
  const checks = buildChecks({
    sections,
    registryValidation,
    routeForbiddenTokenRows,
    fieldRegistryGaps,
    metadataGaps,
    sourceOwnerGaps,
    contentDepthGaps,
  })
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')

  return {
    version: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION,
    generatedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_REMEDIATION_REQUIRED' : OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_STATUS_READY,
    routeKey: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY,
    referenceSource: { ...OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE },
    summary: {
      sectionCount: sections.length,
      referenceTopicCount: OTP_NEW_DEVELOPMENT_REFERENCE_TOPICS.length,
      tokenCount: tokens.length,
      sourceOwnerCount: unique(sections.flatMap((section) => section.source_owners)).length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    checks,
    blockers,
    warnings,
    registryValidation,
    fieldRegistryGaps,
    routeForbiddenTokens: routeForbiddenTokenRows,
    metadataGaps,
    sourceOwnerGaps,
    contentDepthGaps,
    tokens,
    sections,
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpNewDevelopmentLegalContentMarkdown(report = buildOtpNewDevelopmentLegalContentReport()) {
  return [
    '# OTP Template vNext Phase 5 New Development Legal Content',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Route: ${report.routeKey}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Reference topics', report.summary.referenceTopicCount],
        ['New-development legal sections', report.summary.sectionCount],
        ['Tokens', report.summary.tokenCount],
        ['Source owner groups', report.summary.sourceOwnerCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Sections',
    '',
    table(
      ['Order', 'Reference Topic', 'Section Key', 'Tokens', 'Owners'],
      report.sections.map((section) => [
        section.sort_order,
        section.reference_topic_key,
        section.section_key,
        section.placeholder_keys.join(', '),
        section.source_owners.join(', '),
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 5 creates new-development-only counsel-review legal content from the Samlin/Junoah agreement. It does not approve legal wording, publish live templates, mutate Supabase, replace the resale content contract, or bypass branded PDF/render/signature validation.',
    '',
  ].join('\n')
}
