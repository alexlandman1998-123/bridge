import {
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'
import {
  getOtpFieldDefinition,
} from './otpFieldRegistry.js'
import {
  OTP_LEGAL_WORDING_DRAFT_ANCHORS,
} from './otpLegalWordingDraft.js'
import {
  OTP_RESALE_REFERENCE_SOURCE,
  listOtpResaleReferenceLegalSections,
} from './otpReferenceExtraction.js'

export const OTP_RESALE_LEGAL_CONTENT_VERSION = 'otp_resale_legal_content_phase4_v1'
export const OTP_RESALE_LEGAL_CONTENT_STATUS_READY = 'OTP_RESALE_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW'
export const OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY = 'resale_existing_property'

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

function resaleSection({
  number,
  key,
  title,
  clauseFamily,
  legalText,
  placeholderKeys = [],
  anchorCodes = ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
  counselNotes = [],
  isRequired = true,
} = {}) {
  const tokens = unique([...placeholderKeys.map(normalizeKey), ...extractTokens(legalText)])
  const sourceOwners = sourceOwnersForTokens(tokens)
  return Object.freeze({
    section_key: `resale_${number}_${normalizeKey(key)}`,
    reference_section_number: number,
    reference_section_key: normalizeKey(key),
    section_label: title,
    section_type: 'resale_legal_content',
    sort_order: number * 10,
    route_key: OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY,
    variants: Object.freeze([OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY]),
    clause_family: normalizeKey(clauseFamily || key),
    is_required: Boolean(isRequired),
    is_repeatable: false,
    condition_json: Object.freeze({}),
    placeholder_keys: Object.freeze(tokens),
    source_owners: Object.freeze(sourceOwners),
    anchor_codes: Object.freeze(anchorCodes),
    counsel_notes: Object.freeze(counselNotes),
    legal_text: normalizeText(legalText),
    metadata_json: Object.freeze({
      content_version: OTP_RESALE_LEGAL_CONTENT_VERSION,
      draft_status: 'draft_for_counsel_review',
      route_key: OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY,
      reference_source_path: OTP_RESALE_REFERENCE_SOURCE.path,
      reference_source_sha256: OTP_RESALE_REFERENCE_SOURCE.sha256,
      reference_section_number: number,
      reference_section_key: normalizeKey(key),
      legal_review_required: true,
      counsel_approval_required: true,
      source_owners: sourceOwners,
      source_anchors: anchorCodes,
      copied_from_reference_verbatim: false,
    }),
  })
}

export const OTP_RESALE_LEGAL_CONTENT_SECTIONS = Object.freeze([
  resaleSection({
    number: 3,
    key: 'definitions',
    title: 'Definitions',
    clauseFamily: 'definitions',
    legalText: paragraph([
      'The resale OTP must define the core commercial and legal terms used throughout the agreement, including Agreement, Agent, Agent Commission, Conveyancing Attorneys, CPA, Deposit, FICA, Fixtures, Guarantee Delivery Period, Homeowners Association, Occupation Date, Occupational Rental, Property, Purchase Price, Purchaser, Seller, Special Conditions, Suspensive Conditions and VAT.',
      'The defined terms must align to Schedule 1 and Schedule 2 so that party, property, finance, fixture, conveyancing and compliance references resolve to the captured resale fields and not to new-development setup fields.',
    ]),
    counselNotes: ['Counsel must settle the final defined-term wording against the approved resale schedule labels.'],
  }),
  resaleSection({
    number: 4,
    key: 'interpretations',
    title: 'Interpretations',
    clauseFamily: 'interpretations',
    legalText: paragraph([
      'Unless the context requires otherwise, words importing one gender include every gender, words importing natural persons include juristic persons, and words in the singular include the plural.',
      'Schedules, annexures and addenda form part of the Agreement. References to laws include amendments and replacements. If a due date falls on a non-business day, performance must occur on the next business day.',
      'Headings are for convenience only, defined terms keep their defined meanings throughout the Agreement, words prevail over figures where there is conflict, and the Agreement must not be interpreted against a party merely because that party prepared it.',
    ]),
  }),
  resaleSection({
    number: 5,
    key: 'sale',
    title: 'Sale',
    clauseFamily: 'offer_acceptance',
    placeholderKeys: ['seller_full_name', 'buyer_full_name', 'property_address'],
    legalText: paragraph([
      'The Seller, {{seller_full_name}}, sells to the Purchaser, {{buyer_full_name}}, who purchases the resale Property at {{property_address}} on the terms and conditions recorded in this Agreement.',
      'This section is resale-only and must not be used for a developer sale or development-unit sale.',
    ]),
  }),
  resaleSection({
    number: 6,
    key: 'acceptance',
    title: 'Acceptance',
    clauseFamily: 'offer_acceptance',
    placeholderKeys: ['irrevocable_offer_expiry', 'seller_signature'],
    legalText: paragraph([
      'This offer becomes a final and binding resale agreement only when accepted by the Seller in writing and signed by the required parties.',
      'If an irrevocable offer expiry is recorded as {{irrevocable_offer_expiry}}, the offer remains open until that deadline and lapses thereafter unless accepted in accordance with the Agreement.',
      'If no irrevocable expiry is captured, the Purchaser may withdraw the offer before Seller acceptance by delivering written notice to the Seller using the approved notice address or electronic address captured for the resale route.',
    ]),
  }),
  resaleSection({
    number: 7,
    key: 'purchase_price',
    title: 'Purchase Price',
    clauseFamily: 'purchase_price',
    placeholderKeys: [
      'purchase_price',
      'purchase_price_words',
      'deposit_amount',
      'deposit_due_date',
      'trust_account_recipient',
      'guarantee_delivery_deadline',
      'guarantee_delivery_period',
      'cash_amount',
      'seller_vat_number',
    ],
    legalText: paragraph([
      'Purchase Price: {{purchase_price}} ({{purchase_price_words}}). Deposit: {{deposit_amount}}, due by {{deposit_due_date}}.',
      'The Deposit must be paid to {{trust_account_recipient}} and held in trust or dealt with as required by the conveyancing and trust-account rules applicable to the transaction.',
      'The balance of the Purchase Price must be secured by acceptable guarantees delivered by {{guarantee_delivery_deadline}} or within {{guarantee_delivery_period}}, or paid in cash where cash payment of {{cash_amount}} is captured and approved.',
      'If VAT is payable on the resale instead of transfer duty, the Seller VAT number {{seller_vat_number}} and VAT treatment must be reviewed before publication.',
    ]),
    counselNotes: ['VAT, transfer-duty and trust-interest treatment must be approved before this wording becomes live.'],
  }),
  resaleSection({
    number: 8,
    key: 'the_property',
    title: 'The Property',
    clauseFamily: 'property',
    placeholderKeys: [
      'property_address',
      'erf_number',
      'property_township',
      'homeowners_association_name',
      'fixtures_included',
      'fixtures_excluded',
    ],
    legalText: paragraph([
      'The Property is the existing immovable property at {{property_address}}, erf {{erf_number}}, township {{property_township}}, together with permanent fixtures and fittings included in the sale.',
      'Homeowners Association: {{homeowners_association_name}}. Fixtures included: {{fixtures_included}}. Fixtures excluded: {{fixtures_excluded}}.',
      'The Seller warrants, subject to counsel-approved qualifications, that fixtures and fittings included in the sale will be paid for by transfer unless expressly recorded otherwise.',
    ]),
  }),
  resaleSection({
    number: 9,
    key: 'risk',
    title: 'Risk',
    clauseFamily: 'occupation_rent',
    placeholderKeys: ['occupation_date', 'property_address'],
    legalText: paragraph([
      'Risk, benefits, maintenance responsibility and occupation-linked charges for {{property_address}} pass according to the earlier of the Occupation Date, {{occupation_date}}, or registration of transfer, unless special conditions record a different approved risk arrangement.',
      'The content must remain aligned to the occupation, utilities and transfer clauses so risk does not pass inconsistently across the resale OTP.',
    ]),
    counselNotes: ['Risk-passing timing varies by agency policy; counsel must approve the final position.'],
  }),
  resaleSection({
    number: 10,
    key: 'transfer',
    title: 'Transfer',
    clauseFamily: 'transfer_conveyancer',
    placeholderKeys: [
      'transfer_attorney_company_name',
      'transfer_attorney_contact_person',
      'transfer_attorney_email',
      'transfer_attorney_phone',
      'trust_account_recipient',
    ],
    legalText: paragraph([
      'Transfer will be attended to by {{transfer_attorney_company_name}}. Contact: {{transfer_attorney_contact_person}}, {{transfer_attorney_email}}, {{transfer_attorney_phone}}.',
      'The Purchaser must pay transfer costs, bond costs, transfer duty or related costs on demand where payable, and the parties must sign transfer documents and provide FICA, tax and authority documents when called for by the conveyancer.',
      'Trust-account payments must be made only to {{trust_account_recipient}} or another verified trust account approved through the conveyancing workflow.',
    ]),
  }),
  resaleSection({
    number: 11,
    key: 'occupation',
    title: 'Occupation',
    clauseFamily: 'occupation_rent',
    placeholderKeys: [
      'occupation_date',
      'occupational_rent_payable',
      'occupational_rent_amount',
      'deposit_amount',
      'guarantee_delivery_period',
    ],
    legalText: paragraph([
      'Occupation is given on {{occupation_date}} if the captured conditions for occupation have been met, including payment of the Deposit, delivery of guarantees or cash security where applicable, signature of called-for documents, and no unresolved breach by the Purchaser.',
      'Occupational rent payable: {{occupational_rent_payable}}. Occupational rental amount: {{occupational_rent_amount}} per month, adjusted pro rata for incomplete months where required.',
      'If occupation is given before registration, no tenancy is created unless expressly agreed in writing, and the Purchaser may not alter or add to the Property before transfer without written consent.',
    ]),
  }),
  resaleSection({
    number: 12,
    key: 'suspensive_conditions',
    title: 'Suspensive Conditions',
    clauseFamily: 'suspensive_conditions',
    placeholderKeys: [
      'finance_type',
      'bond_amount',
      'bond_approval_deadline',
      'cash_amount',
      'cash_proof_deadline',
      'subject_sale_property',
      'subject_sale_minimum_price',
      'subject_sale_fulfilment_date',
      'structured_suspensive_conditions',
    ],
    legalText: paragraph([
      'Finance Type: {{finance_type}}. Bond Amount: {{bond_amount}}. Bond approval deadline: {{bond_approval_deadline}}. Cash contribution: {{cash_amount}}. Cash proof deadline: {{cash_proof_deadline}}.',
      'Where the offer is subject to finance, cash proof, sale of another property or another captured condition, the condition must be fulfilled or waived in writing by the applicable deadline, failing which the Agreement lapses unless extended or varied in writing before lapse.',
      'Subject-sale property: {{subject_sale_property}}. Minimum sale price: {{subject_sale_minimum_price}}. Fulfilment date: {{subject_sale_fulfilment_date}}.',
      'Structured suspensive conditions must render from approved condition records: {{structured_suspensive_conditions}}.',
    ]),
    counselNotes: ['Bond-extension authority and subject-sale chain wording must be checked before launch.'],
  }),
  resaleSection({
    number: 13,
    key: 'warranties',
    title: 'Warranties',
    clauseFamily: 'fixtures_defects_disclosure',
    placeholderKeys: [
      'mandatory_disclosure_status',
      'mandatory_disclosure_annexure',
      'mandatory_disclosure_comments',
      'seller_rates_taxes_up_to_date',
    ],
    anchorCodes: ['PROPERTY_PRACTITIONERS_ACT_DISCLOSURE', 'PROPERTY_PRACTITIONERS_REGULATION_36'],
    legalText: paragraph([
      'Mandatory Disclosure Status: {{mandatory_disclosure_status}}. Disclosure Annexure: {{mandatory_disclosure_annexure}}. Disclosure Comments: {{mandatory_disclosure_comments}}.',
      'Subject to applicable law, express written warranties and the approved disclosure wording, the Property is sold in its existing condition and the Purchaser acknowledges inspection of the Property.',
      'The Seller must not knowingly conceal material defects and warrants only those items expressly stated in the Agreement, including the rates and taxes status captured as {{seller_rates_taxes_up_to_date}} where applicable.',
    ]),
    counselNotes: ['The final balance between voetstoots, disclosure, CPA and misrepresentation risk must be settled by counsel.'],
  }),
  resaleSection({
    number: 14,
    key: 'nomination_capacity_parties',
    title: 'Nomination and Capacity of Parties',
    clauseFamily: 'parties',
    placeholderKeys: [
      'buyer_full_name',
      'buyer_entity_type',
      'buyer_marital_status',
      'buyer_marital_regime',
      'buyer_representative_name',
      'buyer_representative_capacity',
    ],
    legalText: paragraph([
      'Purchaser: {{buyer_full_name}}. Entity type: {{buyer_entity_type}}. Marital status: {{buyer_marital_status}}. Marital regime: {{buyer_marital_regime}}.',
      'If the Purchaser signs through a representative, trustee, nominee, company, close corporation or trust structure, the representative {{buyer_representative_name}} signs in the capacity {{buyer_representative_capacity}} and must provide the required authority, resolution or ratification documents.',
      'The Purchaser undertakes to provide FICA and authority documents required under Schedule 2 and warrants that the captured information is true and complete.',
    ]),
  }),
  resaleSection({
    number: 15,
    key: 'commission',
    title: 'Commission',
    clauseFamily: 'agency_commission',
    placeholderKeys: [
      'organisation_trading_name',
      'agent_full_name',
      'agent_ffc_number',
      'gross_commission_amount',
    ],
    anchorCodes: ['PROPERTY_PRACTITIONERS_ACT_DISCLOSURE'],
    legalText: paragraph([
      'Agency: {{organisation_trading_name}}. Agent: {{agent_full_name}}. Agent FFC Number: {{agent_ffc_number}}. Gross commission amount: {{gross_commission_amount}}.',
      'Commission is earned and payable according to the approved mandate or commission instruction once the Agreement has been signed and all suspensive conditions have been fulfilled or waived, subject to the final counsel-approved trigger wording.',
      'The Purchaser warrants that the agent recorded above introduced the Purchaser to the Property and indemnity wording must be reviewed where competing-agent risk exists.',
    ]),
    counselNotes: ['Commission trigger, payer, VAT and cancellation consequences must align with the mandate template.'],
  }),
  resaleSection({
    number: 16,
    key: 'certificates',
    title: 'Certificates',
    clauseFamily: 'compliance_certificates',
    placeholderKeys: ['compliance_certificate_schedule', 'property_address'],
    legalText: paragraph([
      'Compliance Certificate Schedule: {{compliance_certificate_schedule}}.',
      'The Seller must provide, at the required time and cost allocation recorded in the Agreement, the electrical, electric fence, gas, occupation or other statutory certificates applicable to {{property_address}}.',
      'Where a certificate inspection identifies a defect for which the Seller is responsible under applicable legislation or the Agreement, the Seller must attend to the required remedial work so that the certificate can be issued.',
    ]),
    counselNotes: ['Certificate responsibility must be checked against provincial, municipal and property-specific requirements.'],
  }),
  resaleSection({
    number: 17,
    key: 'rates_taxes_consumption_charges',
    title: 'Rates, Taxes and Consumption Charges',
    clauseFamily: 'rates_taxes_consumption_charges',
    placeholderKeys: [
      'seller_rates_taxes_up_to_date',
      'rates_and_taxes_account_number',
      'seller_bond_institution',
      'seller_bond_account_number',
      'seller_outstanding_bond_amount',
      'occupation_date',
    ],
    legalText: paragraph([
      'Rates and taxes account: {{rates_and_taxes_account_number}}. Rates and taxes status: {{seller_rates_taxes_up_to_date}}.',
      'The Seller remains responsible for arrear levies, municipal rates, taxes and consumption charges due before registration of transfer, subject to any occupation-linked apportionment in the Agreement.',
      'If occupation occurs before transfer, the Purchaser is responsible for consumption charges from {{occupation_date}} until registration, unless special conditions state otherwise.',
      'Seller bond details for clearance administration: {{seller_bond_institution}}, account {{seller_bond_account_number}}, outstanding amount {{seller_outstanding_bond_amount}}.',
    ]),
  }),
  resaleSection({
    number: 18,
    key: 'breach',
    title: 'Breach',
    clauseFamily: 'breach',
    placeholderKeys: ['purchase_price', 'gross_commission_amount'],
    legalText: paragraph([
      'If the Purchaser breaches a material obligation and fails to remedy the breach after written notice, the Seller may cancel and claim damages or pursue payment of the Purchase Price, {{purchase_price}}, and related damages.',
      'If the Seller breaches a material obligation and fails to remedy the breach after written notice, the Purchaser may seek specific performance, cancellation where available, damages and interest.',
      'Commission consequences on cancellation or breach must align to the approved commission clause and gross commission amount {{gross_commission_amount}}.',
    ]),
    counselNotes: ['Notice period, cancellation consequences and liquidated-damages language require counsel approval.'],
  }),
  resaleSection({
    number: 19,
    key: 'cooling_off',
    title: 'Cooling Off',
    clauseFamily: 'cooling_off',
    placeholderKeys: ['buyer_full_name', 'purchase_price', 'property_address'],
    legalText: paragraph([
      'Where the Alienation of Land Act cooling-off provisions apply to the Purchaser {{buyer_full_name}}, the Purchaser must receive the required notice of the right to revoke the offer or terminate the resulting sale agreement within the prescribed period.',
      'Cooling-off applicability depends on purchaser status, property type, Purchase Price {{purchase_price}} and the statutory threshold. The final wording must render only when the route and transaction facts support it.',
      'The notice must identify the offer or Agreement for {{property_address}}, be unconditional, and be delivered through an approved notice method.',
    ]),
    counselNotes: ['The statutory threshold and applicability rules must be checked before live generation.'],
  }),
  resaleSection({
    number: 20,
    key: 'domicilium_notices',
    title: 'Domicilium and Notices',
    clauseFamily: 'domicilium_notices',
    placeholderKeys: [
      'buyer_domicilium_address',
      'seller_domicilium_address',
      'buyer_email',
      'seller_email',
    ],
    legalText: paragraph([
      'Purchaser domicilium address: {{buyer_domicilium_address}}. Seller domicilium address: {{seller_domicilium_address}}.',
      'The parties choose the captured addresses for service of process and delivery of notices under the Agreement, including statutory notices where permitted.',
      'Electronic notices may be sent to {{buyer_email}} and {{seller_email}} where the Agreement and applicable law permit that delivery method. A change of domicilium must be made by written notice and must nominate a physical address in the Republic of South Africa.',
    ]),
    counselNotes: ['Electronic notice deeming provisions must be reviewed for the final signing workflow.'],
  }),
  resaleSection({
    number: 21,
    key: 'consent_to_jurisdiction',
    title: 'Consent to Jurisdiction',
    clauseFamily: 'jurisdiction',
    placeholderKeys: ['property_address'],
    legalText: paragraph([
      'Either party may institute proceedings in a competent Magistrates Court despite the amount claimed or relief sought exceeding that court threshold, to the extent permitted by law.',
      'If a party is a foreign party, the party consents to the jurisdiction of the High Court with jurisdiction over the area where the Property, {{property_address}}, is located.',
    ]),
    counselNotes: ['Jurisdiction wording must be checked for enforceability and current court terminology.'],
  }),
  resaleSection({
    number: 22,
    key: 'marital_status_purchaser',
    title: 'Marital Status of Purchaser',
    clauseFamily: 'parties',
    placeholderKeys: [
      'buyer_full_name',
      'buyer_marital_status',
      'buyer_marital_regime',
      'buyer_spouse_full_name',
      'buyer_spouse_consent_required',
    ],
    legalText: paragraph([
      'The Purchaser {{buyer_full_name}} warrants that the marital status and matrimonial-property facts captured in Schedule 1 are true and complete.',
      'Marital status: {{buyer_marital_status}}. Marital regime: {{buyer_marital_regime}}. Spouse: {{buyer_spouse_full_name}}. Spouse consent required: {{buyer_spouse_consent_required}}.',
      'Where spouse consent or additional authority is required, the required signature or written consent must be obtained before the Agreement is treated as complete.',
    ]),
  }),
  resaleSection({
    number: 23,
    key: 'special_conditions',
    title: 'Special Conditions',
    clauseFamily: 'special_conditions',
    placeholderKeys: ['special_conditions', 'structured_suspensive_conditions'],
    legalText: paragraph([
      'Special Conditions: {{special_conditions}}.',
      'Unless a special condition expressly states that it is suspensive or resolutive, it must not be treated as suspensive or resolutive merely because it appears in the special-condition schedule.',
      'Any special condition or other condition must be reduced to writing, signed where required, and approved for the resale route. Structured suspensive conditions remain controlled by the approved condition records: {{structured_suspensive_conditions}}.',
    ]),
    counselNotes: ['Free-text special conditions must be reviewed before insertion into a generated OTP.'],
  }),
  resaleSection({
    number: 24,
    key: 'costs',
    title: 'Costs',
    clauseFamily: 'costs',
    placeholderKeys: ['transfer_attorney_company_name', 'purchase_price'],
    legalText: paragraph([
      'A party that breaches the Agreement and causes legal action may be liable for legal costs on the attorney-and-client or other approved scale, including collection, tracing and counsel costs where recoverable.',
      'Where a party is obliged to perform an act or pay an amount and fails to do so, the other party may, without being obliged to, attend to that act or payment and recover the cost on demand if the Agreement permits it.',
      'Transfer and transaction costs called for by {{transfer_attorney_company_name}} must be paid as required to progress transfer of the Property sold for {{purchase_price}}.',
    ]),
    counselNotes: ['Cost scale and recovery wording must be approved for current enforceability.'],
  }),
  resaleSection({
    number: 25,
    key: 'sale_board',
    title: 'Sale Board',
    clauseFamily: 'agency_commission',
    placeholderKeys: ['agent_full_name', 'property_address'],
    anchorCodes: ['PROPERTY_PRACTITIONERS_ACT_DISCLOSURE'],
    legalText: paragraph([
      'The parties consent to the Agent, {{agent_full_name}}, placing a sold board or notice at {{property_address}} from acceptance of the offer until the approved post-transfer period, subject to estate, homeowners-association, municipal or body rules that apply to the Property.',
      'This wording is resale marketing-administration content only and must not override a property-owner, complex or municipal signage restriction.',
    ]),
  }),
  resaleSection({
    number: 26,
    key: 'whole_agreement',
    title: 'Whole Agreement',
    clauseFamily: 'whole_agreement',
    legalText: paragraph([
      'This Agreement, together with its schedules, annexures, addenda and approved written amendments, constitutes the whole agreement between the parties regarding the resale transaction.',
      'No prior statement, representation, undertaking or negotiation has contractual effect unless incorporated into the Agreement in writing.',
    ]),
  }),
  resaleSection({
    number: 27,
    key: 'non_variation',
    title: 'Non Variation',
    clauseFamily: 'non_variation',
    placeholderKeys: ['seller_full_name', 'buyer_full_name'],
    legalText: paragraph([
      'No amendment, alteration, deletion, addition, renewal, extension, cancellation or consensual variation of the Agreement is effective unless reduced to writing and signed by the party or parties against whom it is to be enforced.',
      'The resale parties, {{seller_full_name}} and {{buyer_full_name}}, must use the approved written amendment process for any material variation.',
    ]),
  }),
  resaleSection({
    number: 28,
    key: 'non_waiver',
    title: 'Non Waiver',
    clauseFamily: 'non_waiver',
    legalText: paragraph([
      'No latitude, indulgence, relaxation, extension of time or failure to enforce a right prejudices the rights of the party granting it, operates as a waiver, or creates an expectation that further latitude or extensions will be granted.',
      'Any waiver must be express, written and limited to the instance for which it is given.',
    ]),
  }),
  resaleSection({
    number: 29,
    key: 'severability',
    title: 'Severability',
    clauseFamily: 'severability',
    legalText: paragraph([
      'Each provision of the Agreement is separate and distinct. If any provision is illegal, invalid, prohibited or unenforceable, it is ineffective only to the extent of that issue.',
      'The remaining provisions continue in full force and effect as far as legally possible.',
    ]),
  }),
  resaleSection({
    number: 30,
    key: 'applicable_law',
    title: 'Applicable Law',
    clauseFamily: 'applicable_law',
    legalText: paragraph([
      'The Agreement is governed by and must be interpreted in accordance with the laws of the Republic of South Africa.',
      'This resale legal-content contract does not create a new-development OTP and does not authorise publication without counsel approval and rendered-output validation.',
    ]),
  }),
])

export function listOtpResaleLegalContentSections() {
  return OTP_RESALE_LEGAL_CONTENT_SECTIONS
    .slice()
    .sort((left, right) => left.reference_section_number - right.reference_section_number)
    .map((section) => ({
      ...section,
      variants: cloneArray(section.variants),
      condition_json: cloneJson(section.condition_json),
      placeholder_keys: cloneArray(section.placeholder_keys),
      source_owners: cloneArray(section.source_owners),
      anchor_codes: cloneArray(section.anchor_codes),
      counsel_notes: cloneArray(section.counsel_notes),
      metadata_json: cloneJson(section.metadata_json),
    }))
}

function routeForbiddenTokens(sections = []) {
  return sections.flatMap((section) => (
    (section.placeholder_keys || [])
      .map((token) => ({ token, sectionKey: section.section_key, definition: getOtpFieldDefinition(token) }))
      .filter(({ token, definition }) => (
        /^developer_|^development_|^body_corporate|^contractor_|^sectional_plan|^snagging_|^participation_quota|^parking_bay|^garage_allocation/.test(token) ||
        (definition?.variants?.length && !definition.variants.includes(OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY))
      ))
      .map(({ token, sectionKey }) => ({ token, sectionKey, routeKey: OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY }))
  ))
}

function buildChecks({
  sections = [],
  referenceSections = [],
  registryValidation = {},
  routeForbiddenTokenRows = [],
  fieldRegistryGaps = [],
  metadataGaps = [],
  sourceOwnerGaps = [],
  contentDepthGaps = [],
} = {}) {
  const checks = []
  const push = (pass, code, detail, severity = 'blocking') => checks.push({ code, pass: Boolean(pass), detail, severity })
  const sectionNumbers = new Set(sections.map((section) => section.reference_section_number))
  const referenceNumbers = referenceSections.map((section) => section.number)
  const referenceKeys = new Set(referenceSections.map((section) => section.key))
  const sectionKeys = new Set(sections.map((section) => section.reference_section_key))

  push(sections.length === 28, 'PHASE4_RESALE_28_LEGAL_SECTIONS_PRESENT', 'Resale content includes all 28 legal sections from reference sections 3 through 30.')
  push(referenceNumbers.every((number) => sectionNumbers.has(number)), 'PHASE4_RESALE_REFERENCE_NUMBERS_COVERED', 'Every reference legal section number is represented.')
  push([...referenceKeys].every((key) => sectionKeys.has(key)), 'PHASE4_RESALE_REFERENCE_KEYS_COVERED', 'Every reference legal section key is represented.')
  push(sections.every((section) => section.route_key === OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY && section.variants.length === 1 && section.variants[0] === OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY), 'PHASE4_RESALE_ROUTE_ONLY', 'Phase 4 content is scoped to the resale route only.')
  push(registryValidation.isValid && registryValidation.unknown?.length === 0 && registryValidation.deprecated?.length === 0, 'PHASE4_RESALE_TOKENS_CANONICAL', 'Every resale legal-content token is canonical for OTP.')
  push(fieldRegistryGaps.length === 0, 'PHASE4_RESALE_TOKENS_IN_FIELD_REGISTRY', 'Every resale legal-content token exists in the OTP field registry.')
  push(routeForbiddenTokenRows.length === 0, 'PHASE4_RESALE_EXCLUDES_DEVELOPMENT_TOKENS', 'Resale legal content excludes developer and new-development token families.')
  push(metadataGaps.length === 0, 'PHASE4_RESALE_REFERENCE_METADATA_LOCKED', 'Every section carries reference hash, section number, legal-review and counsel-review metadata.')
  push(sourceOwnerGaps.length === 0, 'PHASE4_RESALE_SOURCE_OWNERS_DECLARED', 'Every placeholder token has its source owner declared on the section.')
  push(contentDepthGaps.length === 0, 'PHASE4_RESALE_CONTENT_DEPTH_PRESENT', 'Every resale legal section has substantive counsel-review wording.')
  push(sections.some((section) => section.reference_section_key === 'rates_taxes_consumption_charges' && section.placeholder_keys.includes('seller_bond_institution')), 'PHASE4_RESALE_SELLER_ADMIN_COVERED', 'Rates, taxes, seller bond and consumption-charge administration are represented.')
  push(sections.some((section) => section.reference_section_key === 'domicilium_notices' && section.placeholder_keys.includes('buyer_domicilium_address') && section.placeholder_keys.includes('seller_domicilium_address')), 'PHASE4_RESALE_DOMICILIUM_COVERED', 'Domicilium and notice addresses are represented.')
  push(sections.some((section) => section.reference_section_key === 'marital_status_purchaser' && section.placeholder_keys.includes('buyer_marital_regime')), 'PHASE4_RESALE_MARITAL_STATUS_COVERED', 'Purchaser marital status and regime are represented.')
  push(sections.some((section) => section.reference_section_key === 'commission' && section.placeholder_keys.includes('agent_ffc_number')), 'PHASE4_RESALE_AGENT_COMMISSION_COVERED', 'Agency, agent FFC and commission content are represented.')
  push(sections.every((section) => section.metadata_json?.copied_from_reference_verbatim === false), 'PHASE4_RESALE_NOT_VERBATIM_REFERENCE_COPY', 'The engineering content contract records paraphrased counsel-review wording rather than verbatim reference copying.', 'warning')

  return checks
}

export function buildOtpResaleLegalContentReport({ generatedAt = new Date().toISOString() } = {}) {
  const sections = listOtpResaleLegalContentSections()
  const referenceSections = listOtpResaleReferenceLegalSections()
  const tokens = unique(sections.flatMap((section) => section.placeholder_keys)).sort()
  const registryValidation = validateTemplateTokensAgainstRegistry({ packetType: 'otp', tokens })
  const fieldRegistryGaps = tokens.filter((token) => !getOtpFieldDefinition(token))
  const routeForbiddenTokenRows = routeForbiddenTokens(sections)
  const metadataGaps = sections
    .filter((section) => (
      section.metadata_json?.content_version !== OTP_RESALE_LEGAL_CONTENT_VERSION ||
      section.metadata_json?.reference_source_sha256 !== OTP_RESALE_REFERENCE_SOURCE.sha256 ||
      section.metadata_json?.reference_section_number !== section.reference_section_number ||
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
    referenceSections,
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
    version: OTP_RESALE_LEGAL_CONTENT_VERSION,
    generatedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_RESALE_LEGAL_CONTENT_REMEDIATION_REQUIRED' : OTP_RESALE_LEGAL_CONTENT_STATUS_READY,
    routeKey: OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY,
    referenceSource: { ...OTP_RESALE_REFERENCE_SOURCE },
    summary: {
      sectionCount: sections.length,
      referenceSectionCount: referenceSections.length,
      tokenCount: tokens.length,
      sourceOwnerCount: unique(sections.flatMap((section) => section.source_owners)).length,
      anchorCount: OTP_LEGAL_WORDING_DRAFT_ANCHORS.length,
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

export function formatOtpResaleLegalContentMarkdown(report = buildOtpResaleLegalContentReport()) {
  return [
    '# OTP Template vNext Phase 4 Resale Legal Content',
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
        ['Reference legal sections', report.summary.referenceSectionCount],
        ['Resale legal sections', report.summary.sectionCount],
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
      ['No.', 'Reference', 'Section Key', 'Tokens', 'Owners'],
      report.sections.map((section) => [
        section.reference_section_number,
        section.reference_section_key,
        section.section_key,
        section.placeholder_keys.join(', '),
        section.source_owners.join(', '),
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 4 creates resale-only counsel-review legal content for sections 3-30. It does not approve legal wording, publish live templates, mutate Supabase, create the new-development legal content, or bypass branded PDF/render verification.',
    '',
  ].join('\n')
}
