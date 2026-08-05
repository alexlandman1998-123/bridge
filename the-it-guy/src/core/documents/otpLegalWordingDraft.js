import {
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'
import {
  getOtpFieldDefinition,
} from './otpFieldRegistry.js'
import {
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'
import {
  buildOtpTemplateRouteSplitAudit,
} from './otpTemplateRouteSplit.js'

export const OTP_LEGAL_WORDING_DRAFT_VERSION = 'otp_legal_wording_draft_phase3_v1'
export const OTP_LEGAL_WORDING_DRAFT_STATUS_READY = 'OTP_LEGAL_WORDING_DRAFT_READY_FOR_COUNSEL_REVIEW'

export const OTP_LEGAL_WORDING_DRAFT_ANCHORS = Object.freeze([
  Object.freeze({
    code: 'ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE',
    label: 'Alienation of Land Act 68 of 1981',
    sourceUrl: 'https://www.gov.za/sites/default/files/gcis_document/201503/act-68-1981.pdf',
    draftUse: 'Written sale-agreement formalities, party signature formalities and immovable-property sale framing.',
  }),
  Object.freeze({
    code: 'PROPERTY_PRACTITIONERS_ACT_DISCLOSURE',
    label: 'Property Practitioners Act 22 of 2019',
    sourceUrl: 'https://www.gov.za/sites/default/files/gcis_document/201910/42746gon1295.pdf',
    draftUse: 'Mandatory disclosure attachment and property-practitioner disclosure obligations.',
  }),
  Object.freeze({
    code: 'PROPERTY_PRACTITIONERS_REGULATION_36',
    label: 'Property Practitioners Regulations, Regulation 36',
    sourceUrl: 'https://www.gov.za/sites/default/files/gcis_document/202201/45735pr47.pdf',
    draftUse: 'Immovable property condition report, purchaser acknowledgement and disclosure-form format.',
  }),
  Object.freeze({
    code: 'ECTA_EXCLUDED_ALIENATION_OF_LAND',
    label: 'Electronic Communications and Transactions Act 25 of 2002',
    sourceUrl: 'https://www.gov.za/sites/default/files/gcis_document/201409/a25-02.pdf',
    draftUse: 'Electronic-signature exclusion risk for agreements for alienation of immovable property.',
  }),
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

function draftSection({
  sectionKey,
  sectionLabel,
  clauseFamily,
  sortOrder,
  variants = ['resale_existing_property', 'new_development'],
  legalText = '',
  anchorCodes = [],
  counselNotes = [],
  isRequired = true,
  sectionType = 'legal_text_draft',
} = {}) {
  const normalizedVariants = variants.map((variant) => normalizeOtpDocumentVariant(variant)).filter(Boolean)
  const placeholderKeys = unique(extractTokens(legalText))
  const sourceOwners = sourceOwnersForTokens(placeholderKeys)
  return Object.freeze({
    section_key: sectionKey,
    section_label: sectionLabel,
    section_type: sectionType,
    sort_order: sortOrder,
    variants: Object.freeze(normalizedVariants),
    clause_family: normalizeKey(clauseFamily),
    is_required: Boolean(isRequired),
    is_repeatable: false,
    condition_json: Object.freeze({}),
    placeholder_keys: Object.freeze(placeholderKeys),
    source_owners: Object.freeze(sourceOwners),
    anchor_codes: Object.freeze(anchorCodes),
    counsel_notes: Object.freeze(counselNotes),
    legal_text: normalizeText(legalText),
    metadata_json: Object.freeze({
      wording_version: OTP_LEGAL_WORDING_DRAFT_VERSION,
      draft_status: 'draft_for_counsel_review',
      legal_review_required: true,
      counsel_approval_required: true,
      render_validation_required: true,
      source_anchors: anchorCodes,
      source_owners: sourceOwners,
      variants: normalizedVariants,
    }),
  })
}

export const OTP_LEGAL_WORDING_DRAFT_SECTIONS = Object.freeze([
  draftSection({
    sectionKey: 'definitions_shared_v1',
    sectionLabel: 'Definitions',
    clauseFamily: 'definitions',
    sortOrder: 0,
    legalText: `DEFINITIONS

In this Offer to Purchase, unless the context indicates otherwise:

"Agreement" means this Offer to Purchase once accepted in writing by the Seller or Developer, together with all schedules, annexures and written amendments.
"Agent" means the property practitioner and/or agency recorded in this document.
"Business Day" means any day other than a Saturday, Sunday or official public holiday in the Republic of South Africa.
"Conveyancer" means the transfer attorney or conveyancer appointed to attend to transfer of the Property.
"Deposit" means the deposit recorded in this Agreement, payable to the nominated trust account recipient.
"Guarantees" means written guarantees acceptable to the Conveyancer for payment of the balance of the Purchase Price.
"Occupation Date" means the date on which the Purchaser is entitled or required to take occupation, if applicable.
"Property" means the immovable property, unit, section, exclusive-use area or development unit described in this Agreement.
"Purchase Price" means the total purchase consideration recorded in this Agreement.
"Purchaser" means the buyer or buyers recorded in this Agreement.
"Seller" means the owner, developer or other seller recorded for the applicable route.
"Suspensive Conditions" means conditions that must be fulfilled or waived before this Agreement becomes unconditional.
"VAT" means value-added tax under applicable South African tax legislation.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Counsel must confirm whether additional project/developer definitions are needed per development.'],
  }),
  draftSection({
    sectionKey: 'formalities_and_signature_v1',
    sectionLabel: 'Written Agreement and Signature Formalities',
    clauseFamily: 'offer_acceptance',
    sortOrder: 5,
    legalText: `WRITTEN AGREEMENT AND SIGNATURE FORMALITIES

This offer relates to the sale of immovable property and is intended to be reduced to writing and signed by the parties whose signatures are required for a valid and enforceable agreement.

No oral amendment, cancellation, waiver or extension of a material term is binding unless recorded in writing and signed by the party against whom it is to be enforced.

Where the transaction requires wet-ink signature or any other prescribed signature formality, the parties must comply with that formality. Any electronic signing workflow used by the platform is an administrative workflow only unless legal counsel has approved that workflow for this transaction type and route.

Signed Date: {{signed_date}}`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE', 'ECTA_EXCLUDED_ALIENATION_OF_LAND'],
    counselNotes: ['Counsel must confirm the exact signing workflow before this wording is approved for live generation.'],
  }),
  draftSection({
    sectionKey: 'resale_parties_capacity_v1',
    sectionLabel: 'Parties and Authority',
    clauseFamily: 'parties',
    sortOrder: 10,
    variants: ['resale_existing_property'],
    legalText: `PARTIES AND AUTHORITY

Purchaser: {{buyer_full_name}}
Purchaser ID / Registration: {{buyer_id_number}}
Purchaser Entity Type: {{buyer_entity_type}}
Purchaser Marital Status: {{buyer_marital_status}}
Purchaser Email: {{buyer_email}}
Purchaser Telephone: {{buyer_phone}}

Seller: {{seller_full_name}}
Seller ID / Registration: {{seller_id_number}}
Seller Entity Type: {{seller_entity_type}}
Seller Email: {{seller_email}}
Seller Telephone: {{seller_phone}}

Agency: {{organisation_trading_name}}
Agent: {{agent_full_name}}
Agent FFC Number: {{agent_ffc_number}}

Each party warrants, to the extent applicable, that the party has the required legal capacity, authority, consent, resolution or representative power to conclude and perform this Agreement.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Capacity clauses must be aligned to entity, marriage regime and authority packs before approval.'],
  }),
  draftSection({
    sectionKey: 'development_parties_capacity_v1',
    sectionLabel: 'Parties and Authority',
    clauseFamily: 'parties',
    sortOrder: 10,
    variants: ['new_development'],
    legalText: `PARTIES AND AUTHORITY

Purchaser: {{buyer_full_name}}
Purchaser ID / Registration: {{buyer_id_number}}
Purchaser Entity Type: {{buyer_entity_type}}
Purchaser Marital Status: {{buyer_marital_status}}
Purchaser Email: {{buyer_email}}
Purchaser Telephone: {{buyer_phone}}

Developer / Seller: {{developer_name}}
Developer Registration Number: {{developer_company_registration}}

Agency: {{organisation_trading_name}}
Agent: {{agent_full_name}}
Agent FFC Number: {{agent_ffc_number}}

The Developer warrants that the authorised signatory who signs this Agreement is authorised to bind the Developer for the development sale, subject to any suspensive conditions, development documents and approvals expressly recorded in this Agreement.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Developer authority wording must be checked against the developer mandate and project documents.'],
  }),
  draftSection({
    sectionKey: 'resale_property_v1',
    sectionLabel: 'Property',
    clauseFamily: 'property',
    sortOrder: 20,
    variants: ['resale_existing_property'],
    legalText: `PROPERTY

Property Address: {{property_address}}
Title Type: {{property_title_type}}

The Seller sells to the Purchaser, who purchases, the Property described above, together with fixtures and fittings expressly included in this Agreement and subject to the title conditions, servitudes, restrictions and other matters applicable to the Property.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
  }),
  draftSection({
    sectionKey: 'development_unit_v1',
    sectionLabel: 'Development Unit',
    clauseFamily: 'development_unit',
    sortOrder: 20,
    variants: ['new_development'],
    legalText: `DEVELOPMENT UNIT

Development: {{development_name}}
Section / Unit Number: {{property_unit_number}}
Sectional Plan Status: {{sectional_plan_status}}
Participation Quota: {{participation_quota}}
Parking Bay: {{parking_bay}}
Garage Allocation: {{garage_allocation}}

The Developer sells to the Purchaser, who purchases, the unit and appurtenant rights described above, subject to the development documents, sectional-plan status, body-corporate documents, approved plans, specifications, rules and annexures applicable to the Development.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Counsel must confirm project-specific wording for plans, specifications, exclusive-use rights, parking and sectional title timing.'],
  }),
  draftSection({
    sectionKey: 'purchase_price_deposit_v1',
    sectionLabel: 'Purchase Price, Deposit and Guarantees',
    clauseFamily: 'purchase_price',
    sortOrder: 30,
    legalText: `PURCHASE PRICE, DEPOSIT AND GUARANTEES

Purchase Price: {{purchase_price}}
Purchase Price in Words: {{purchase_price_words}}
Deposit: {{deposit_amount}}
Deposit Due Date: {{deposit_due_date}}
Trust Account Recipient: {{trust_account_recipient}}
Guarantee Delivery Deadline: {{guarantee_delivery_deadline}}
Guarantee Delivery Period: {{guarantee_delivery_period}}

The Purchaser must pay the Purchase Price in accordance with this Agreement. Any Deposit must be paid to the nominated trust account recipient and held or dealt with in accordance with the written instructions and trust-account obligations applicable to the transaction.

The Purchaser must deliver Guarantees for the balance of the Purchase Price by the Guarantee Delivery Deadline or within the Guarantee Delivery Period recorded above, unless otherwise agreed in writing.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
  }),
  draftSection({
    sectionKey: 'development_vat_v1',
    sectionLabel: 'VAT and Development Price Treatment',
    clauseFamily: 'purchase_price',
    sortOrder: 31,
    variants: ['new_development'],
    legalText: `VAT AND DEVELOPMENT PRICE TREATMENT

VAT-Inclusive Purchase Price: {{vat_inclusive_purchase_price}}

Unless this Agreement states otherwise, the purchase price for the new-development route is recorded on the VAT basis approved for the Development and transaction. The Developer remains responsible for the correct VAT treatment, invoicing and supporting tax treatment applicable to the sale.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Tax/VAT wording requires project accountant or tax counsel confirmation before publication.'],
  }),
  draftSection({
    sectionKey: 'finance_suspensive_conditions_v1',
    sectionLabel: 'Finance and Suspensive Conditions',
    clauseFamily: 'suspensive_conditions',
    sortOrder: 40,
    legalText: `FINANCE AND SUSPENSIVE CONDITIONS

Finance Type: {{finance_type}}
Bond Amount: {{bond_amount}}
Bond Approval Deadline: {{bond_approval_deadline}}
Cash Contribution: {{cash_amount}}
Cash Proof Deadline: {{cash_proof_deadline}}
Irrevocable Offer Expiry: {{irrevocable_offer_expiry}}
Structured Suspensive Conditions: {{structured_suspensive_conditions}}

If this offer is subject to finance approval, cash proof, sale of another property or any other Suspensive Condition, the condition must be fulfilled or waived in writing by the applicable deadline. If a Suspensive Condition is not fulfilled or waived by the applicable deadline, this Agreement lapses unless the parties agree otherwise in writing before lapse.

The Purchaser must take all reasonable steps required to apply for finance, provide supporting documents and keep the Agent, Seller, Developer and Conveyancer informed of progress where applicable.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
  }),
  draftSection({
    sectionKey: 'subject_to_sale_v1',
    sectionLabel: 'Subject-to-Sale Condition',
    clauseFamily: 'suspensive_conditions',
    sortOrder: 45,
    variants: ['resale_existing_property'],
    isRequired: false,
    legalText: `SUBJECT-TO-SALE CONDITION

Purchaser Property: {{subject_sale_property}}
Minimum Sale Price: {{subject_sale_minimum_price}}
Fulfilment Date: {{subject_sale_fulfilment_date}}

Where this condition applies, this Agreement is subject to the Purchaser concluding a binding sale agreement for the purchaser property by the Fulfilment Date and on terms that meet or exceed the Minimum Sale Price, unless the Seller agrees otherwise in writing.

This condition is included only when captured and approved for the resale route. It must not be inserted as free text without legal review.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Counsel must confirm whether bond, guarantee and purchaser-property transfer milestones must be added.'],
  }),
  draftSection({
    sectionKey: 'resale_occupation_risk_rent_v1',
    sectionLabel: 'Occupation, Risk and Occupational Rent',
    clauseFamily: 'occupation_rent',
    sortOrder: 50,
    variants: ['resale_existing_property'],
    legalText: `OCCUPATION, RISK AND OCCUPATIONAL RENT

Occupation Date: {{occupation_date}}
Occupational Rent Payable: {{occupational_rent_payable}}
Occupational Rent Amount: {{occupational_rent_amount}}

Occupation is given on the Occupation Date recorded above, unless transfer occurs first or the parties agree otherwise in writing. If occupation is given before registration of transfer, the Purchaser must pay occupational rent and charges recorded in this Agreement from the date of occupation until registration.

Risk, maintenance, insurance, utilities and municipal charges must be dealt with according to the occupation arrangement, transfer timeline and any special conditions recorded in this Agreement.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Risk-passing wording must be settled by counsel because agencies use different positions.'],
  }),
  draftSection({
    sectionKey: 'development_handover_snagging_v1',
    sectionLabel: 'Handover, Inspection and Snagging',
    clauseFamily: 'development_defects',
    sortOrder: 50,
    variants: ['new_development'],
    legalText: `HANDOVER, INSPECTION AND SNAGGING

Anticipated Occupation / Handover Date: {{occupation_date}}
Snagging Period: {{snagging_period_days}}
Contractor: {{contractor_company_name}}
NHBRC Certificate Number: {{property_nhbrc_certificate_number}}

The Purchaser must inspect the unit at handover and record snagging items within the Snagging Period. The Developer must attend to snagging items in accordance with the approved development documents, applicable construction warranties and any statutory or project-specific obligations recorded in the annexures.

Occupation, handover and completion dates are subject to the development programme, approvals, practical completion, occupational certificate requirements and any force-majeure or delay provisions approved for the Development.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Project-specific warranty, NHBRC and delay wording must be checked per development.'],
  }),
  draftSection({
    sectionKey: 'resale_disclosure_voetstoots_v1',
    sectionLabel: 'Mandatory Disclosure, Defects and Fixtures',
    clauseFamily: 'fixtures_defects_disclosure',
    sortOrder: 60,
    variants: ['resale_existing_property'],
    legalText: `MANDATORY DISCLOSURE, DEFECTS AND FIXTURES

Mandatory Disclosure Status: {{mandatory_disclosure_status}}
Disclosure Annexure: {{mandatory_disclosure_annexure}}
Disclosure Comments: {{mandatory_disclosure_comments}}
Fixtures Included: {{fixtures_included}}
Fixtures Excluded: {{fixtures_excluded}}
Compliance Certificate Schedule: {{compliance_certificate_schedule}}

The Seller's completed mandatory disclosure form, if applicable, must be provided to the Purchaser and attached as an annexure to this Agreement. The Purchaser acknowledges receipt of the disclosure information recorded above and acknowledges that professional expertise or technical skill may be required to identify defects or non-compliant aspects of the Property.

The disclosure information is made to the best of the Seller's knowledge and does not, by itself, constitute a warranty that no other defects or deficiencies exist. Subject to applicable law and any express warranties in this Agreement, the Property is sold in its condition as at the date of sale, together with the fixtures included and excluding the fixtures expressly excluded above.

The Seller must not knowingly conceal material defects. Any known defects, exclusions, compliance certificate obligations and agreed repairs must be recorded in this Agreement or in an attached annexure.`,
    anchorCodes: ['PROPERTY_PRACTITIONERS_ACT_DISCLOSURE', 'PROPERTY_PRACTITIONERS_REGULATION_36'],
    counselNotes: ['Counsel must approve the balance between disclosure, voetstoots/as-is wording, CPA risk and seller misrepresentation risk.'],
  }),
  draftSection({
    sectionKey: 'development_compliance_body_corporate_v1',
    sectionLabel: 'Development Compliance, Rules and Costs',
    clauseFamily: 'body_corporate',
    sortOrder: 60,
    variants: ['new_development'],
    legalText: `DEVELOPMENT COMPLIANCE, RULES AND COSTS

Body Corporate: {{body_corporate_name}}
Rules Annexure: {{body_corporate_rules_annexure}}
Estimated Levy: {{development_levy_estimate}}
Estimated Rates: {{development_rates_estimate}}
Utility Connection Charges: {{utility_connection_charges}}
Compliance Certificate Schedule: {{development_compliance_certificate_schedule}}

The Purchaser acknowledges that the unit is subject to the body-corporate rules, conduct rules, management rules, architectural guidelines, development specifications and annexures applicable to the Development.

Estimated levies, rates, utility deposits, connection charges and other development charges are estimates unless expressly stated as fixed. The Purchaser is responsible for the charges allocated to the Purchaser under the approved development documents and this Agreement.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Development-cost wording must be checked against each developer sale pack.'],
  }),
  draftSection({
    sectionKey: 'transfer_conveyancer_v1',
    sectionLabel: 'Transfer and Conveyancer',
    clauseFamily: 'transfer_conveyancer',
    sortOrder: 70,
    legalText: `TRANSFER AND CONVEYANCER

Transfer Attorney / Conveyancer: {{transfer_attorney_company_name}}
Trust Account Recipient: {{trust_account_recipient}}
Guarantee Delivery Deadline: {{guarantee_delivery_deadline}}
Guarantee Delivery Period: {{guarantee_delivery_period}}

The parties must sign all transfer documents and provide all information, FICA documents, tax details, consents and supporting documents reasonably required by the Conveyancer to give effect to this Agreement.

The Purchaser must pay transfer costs, bond registration costs, deposits, guarantees and other amounts for which the Purchaser is responsible by the dates required by the Conveyancer, unless this Agreement states otherwise.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
  }),
  draftSection({
    sectionKey: 'agency_commission_v1',
    sectionLabel: 'Agency Commission and FFC',
    clauseFamily: 'agency_commission',
    sortOrder: 75,
    legalText: `AGENCY COMMISSION AND FFC

Agency: {{organisation_trading_name}}
Agent: {{agent_full_name}}
Agent FFC Number: {{agent_ffc_number}}
Gross Commission Amount: {{gross_commission_amount}}

Commission is payable in accordance with the mandate, commission instruction or other written commission arrangement applicable to this transaction. The Agent and agency details recorded above must be current and must include the required Fidelity Fund certificate information before publication.`,
    anchorCodes: ['PROPERTY_PRACTITIONERS_ACT_DISCLOSURE'],
    counselNotes: ['Commission liability, trigger date and VAT treatment must be aligned with mandate wording.'],
  }),
  draftSection({
    sectionKey: 'special_conditions_annexures_v1',
    sectionLabel: 'Special Conditions and Annexures',
    clauseFamily: 'special_conditions',
    sortOrder: 80,
    isRequired: false,
    legalText: `SPECIAL CONDITIONS AND ANNEXURES

Special Conditions: {{special_conditions}}
Annexures: {{annexures_list}}

The special conditions and annexures recorded above form part of this Agreement. If there is a conflict between a typed special condition and standard wording, counsel must confirm the intended order of precedence before the template is approved for live use.

No special condition may be inserted from free text unless it has been reviewed and approved for the transaction route.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
  }),
  draftSection({
    sectionKey: 'popia_fica_records_v1',
    sectionLabel: 'POPIA, FICA and Transaction Records',
    clauseFamily: 'offer_acceptance',
    sortOrder: 90,
    legalText: `POPIA, FICA AND TRANSACTION RECORDS

Purchaser: {{buyer_full_name}}

The parties consent to the lawful collection, processing, storage and sharing of personal information reasonably required for offer administration, FICA verification, finance, transfer, compliance certificates, signing, transaction records, audit evidence and communication with appointed transaction participants.

Each party must provide accurate identity, authority, contact and compliance information reasonably required to progress the transaction. The Agent, Conveyancer and other authorised role players may request further supporting information where required by law or transaction process.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE'],
    counselNotes: ['Privacy wording must be reviewed against the platform privacy policy and operator/processors map.'],
  }),
  draftSection({
    sectionKey: 'resale_acceptance_signature_blocks_v1',
    sectionLabel: 'Acceptance and Signature Blocks',
    clauseFamily: 'signatures',
    sortOrder: 100,
    variants: ['resale_existing_property'],
    legalText: `ACCEPTANCE AND SIGNATURE BLOCKS

Purchaser Signature: {{buyer_signature}}
Seller Signature: {{seller_signature}}
Signed Date: {{signed_date}}

This resale offer becomes binding only when accepted and signed by the required Purchaser and Seller party or parties in accordance with the signature formalities applicable to the route and transaction. The signature block must be generated from the resale signing plan and must not display a developer signature for a resale route.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE', 'ECTA_EXCLUDED_ALIENATION_OF_LAND'],
    counselNotes: ['Route-specific signature blocks must be split before persistence so forbidden signature placeholders are not rendered on the wrong route.'],
  }),
  draftSection({
    sectionKey: 'development_acceptance_signature_blocks_v1',
    sectionLabel: 'Acceptance and Signature Blocks',
    clauseFamily: 'signatures',
    sortOrder: 100,
    variants: ['new_development'],
    legalText: `ACCEPTANCE AND SIGNATURE BLOCKS

Purchaser Signature: {{buyer_signature}}
Developer Signature: {{developer_signature}}
Signed Date: {{signed_date}}

This new-development offer becomes binding only when accepted and signed by the required Purchaser and Developer party or parties in accordance with the signature formalities applicable to the route and transaction. The signature block must be generated from the new-development signing plan and must not display a resale seller signature for a new-development route.`,
    anchorCodes: ['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE', 'ECTA_EXCLUDED_ALIENATION_OF_LAND'],
    counselNotes: ['Route-specific signature blocks must be split before persistence so forbidden signature placeholders are not rendered on the wrong route.'],
  }),
])

export function listOtpLegalWordingDraftSections({ variant = '' } = {}) {
  const normalizedVariant = normalizeOtpDocumentVariant(variant)
  return OTP_LEGAL_WORDING_DRAFT_SECTIONS
    .filter((section) => !normalizedVariant || section.variants.includes(normalizedVariant))
    .sort((left, right) => left.sort_order - right.sort_order || left.section_key.localeCompare(right.section_key))
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

function routeForbiddenTokens(routeKey = '', sections = []) {
  return sections.flatMap((section) => (
    (section.placeholder_keys || [])
      .map((token) => ({ token, sectionKey: section.section_key, definition: getOtpFieldDefinition(token) }))
      .filter(({ definition }) => definition?.variants?.length && !definition.variants.includes(routeKey))
      .map(({ token, sectionKey }) => ({ token, sectionKey, routeKey }))
  ))
}

function buildChecks({ routeAudits = [], anchors = [], routeSplitAudit = {} } = {}) {
  const checks = []
  const push = (pass, code, detail, severity = 'blocking') => checks.push({ code, pass: Boolean(pass), detail, severity })
  const anchorCodes = new Set(anchors.map((anchor) => anchor.code))
  const allSections = listOtpLegalWordingDraftSections()

  push(routeSplitAudit.status === 'OTP_TEMPLATE_ROUTE_SPLIT_READY_FOR_RUNTIME_WIRING', 'PHASE3_ROUTE_SPLIT_READY', 'Legal wording draft depends on the Phase 2 route split being ready.')
  push(routeAudits.length === 2, 'PHASE3_BOTH_ROUTES_DRAFTED', 'Legal wording draft includes resale and new-development route sets.')
  push(anchors.every((anchor) => normalizeText(anchor.sourceUrl).startsWith('https://www.gov.za/')), 'PHASE3_OFFICIAL_ANCHORS_CAPTURED', 'Draft source anchors are official South African government sources.')
  push(['ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE', 'PROPERTY_PRACTITIONERS_ACT_DISCLOSURE', 'PROPERTY_PRACTITIONERS_REGULATION_36', 'ECTA_EXCLUDED_ALIENATION_OF_LAND'].every((code) => anchorCodes.has(code)), 'PHASE3_CORE_LEGAL_ANCHORS_PRESENT', 'Draft includes ALA, PPA disclosure, Regulation 36 and ECTA exclusion anchors.')
  push(allSections.every((section) => section.metadata_json?.draft_status === 'draft_for_counsel_review' && section.metadata_json?.counsel_approval_required === true), 'PHASE3_COUNSEL_REVIEW_GATE_ON_EVERY_SECTION', 'Every wording section is explicitly draft-only and counsel-review gated.')
  push(routeAudits.every((audit) => audit.registryValidation.isValid && audit.registryValidation.unknown.length === 0 && audit.registryValidation.deprecated.length === 0), 'PHASE3_TOKENS_CANONICAL', 'Every wording draft token is canonical for OTP.')
  push(routeAudits.every((audit) => audit.routeForbiddenTokens.length === 0), 'PHASE3_NO_FORBIDDEN_ROUTE_TOKENS', 'Route drafts do not contain placeholders that belong only to the other route.')
  push(routeAudits.every((audit) => audit.anchorGaps.length === 0), 'PHASE3_ANCHORS_ON_EVERY_SECTION', 'Every wording section carries at least one legal source anchor.')
  push(routeAudits.find((audit) => audit.variant === 'resale_existing_property')?.sectionKeys.includes('resale_disclosure_voetstoots_v1'), 'PHASE3_RESALE_DISCLOSURE_WORDING_PRESENT', 'Resale draft includes mandatory disclosure, defects and fixtures wording.')
  push(routeAudits.find((audit) => audit.variant === 'new_development')?.sectionKeys.includes('development_handover_snagging_v1'), 'PHASE3_DEVELOPMENT_HANDOVER_WORDING_PRESENT', 'New-development draft includes handover, inspection and snagging wording.')
  push(routeAudits.every((audit) => audit.sectionKeys.includes('formalities_and_signature_v1')), 'PHASE3_FORMALITIES_WORDING_PRESENT', 'Both routes include written-agreement and signature-formality wording.')
  push(routeAudits.every((audit) => audit.sectionKeys.some((sectionKey) => sectionKey.endsWith('acceptance_signature_blocks_v1'))), 'PHASE3_SIGNATURE_ACCEPTANCE_WORDING_PRESENT', 'Both routes include acceptance and route-aware signature wording.', 'warning')

  return checks
}

export function buildOtpLegalWordingDraftReport({ generatedAt = new Date().toISOString() } = {}) {
  const routeSplitAudit = buildOtpTemplateRouteSplitAudit({ checkedAt: generatedAt })
  const routeAudits = OTP_DOCUMENT_VARIANTS.map((variant) => {
    const sections = listOtpLegalWordingDraftSections({ variant: variant.key })
    const tokens = unique(sections.flatMap((section) => section.placeholder_keys)).sort()
    return {
      variant: variant.key,
      label: variant.label,
      sectionCount: sections.length,
      sectionKeys: sections.map((section) => section.section_key),
      tokens,
      registryValidation: validateTemplateTokensAgainstRegistry({ packetType: 'otp', tokens }),
      routeForbiddenTokens: routeForbiddenTokens(variant.key, sections),
      anchorGaps: sections.filter((section) => !section.anchor_codes.length).map((section) => section.section_key),
      counselNoteCount: sections.reduce((count, section) => count + section.counsel_notes.length, 0),
    }
  })
  const checks = buildChecks({ routeAudits, anchors: OTP_LEGAL_WORDING_DRAFT_ANCHORS, routeSplitAudit })
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')

  return {
    version: OTP_LEGAL_WORDING_DRAFT_VERSION,
    generatedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_LEGAL_WORDING_DRAFT_REMEDIATION_REQUIRED' : OTP_LEGAL_WORDING_DRAFT_STATUS_READY,
    summary: {
      routeCount: routeAudits.length,
      sectionCount: OTP_LEGAL_WORDING_DRAFT_SECTIONS.length,
      anchorCount: OTP_LEGAL_WORDING_DRAFT_ANCHORS.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    anchors: OTP_LEGAL_WORDING_DRAFT_ANCHORS.map((anchor) => ({ ...anchor })),
    checks,
    blockers,
    warnings,
    routeAudits,
    sections: listOtpLegalWordingDraftSections(),
    routeSplitAudit: {
      status: routeSplitAudit.status,
      summary: routeSplitAudit.summary,
    },
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

export function formatOtpLegalWordingDraftMarkdown(report = buildOtpLegalWordingDraftReport()) {
  return [
    '# OTP Template vNext Phase 3 Legal Wording Draft',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Draft sections', report.summary.sectionCount],
        ['Official anchors', report.summary.anchorCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Route Drafts',
    '',
    table(
      ['Route', 'Sections', 'Tokens', 'Counsel Notes'],
      report.routeAudits.map((audit) => [
        audit.label,
        audit.sectionCount,
        audit.tokens.length,
        audit.counselNoteCount,
      ]),
    ),
    '',
    '## Legal Anchors',
    '',
    table(
      ['Code', 'Source', 'Draft Use'],
      report.anchors.map((anchor) => [anchor.code, anchor.label, anchor.draftUse]),
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 3 produces recommended draft wording only. It does not approve legal content, publish live templates, mutate Supabase, or authorise generation without counsel approval and rendered-output validation.',
    '',
  ].join('\n')
}
