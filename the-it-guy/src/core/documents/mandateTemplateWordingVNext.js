import {
  buildMandateTemplateBaselineAudit,
  normalizeMandateBaselineSection,
} from './mandateTemplateBaselineAudit.js'
import {
  buildMandateTemplateDataSourceReport,
} from './mandateTemplateDataSourceMap.js'
import {
  scanMandateTemplateSections,
} from './mandateTemplateContentScanner.js'
import {
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'

export const MANDATE_TEMPLATE_WORDING_VNEXT_VERSION = 'mandate_template_vnext_phase4_wording_v1'
export const MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT = 'mandate_template_pdf_layout_vnext_phase5_v1'

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

function cloneJson(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : {}
}

function visibilityCondition(field, operator = 'exists', value = '', label = '') {
  return {
    enabled: true,
    rule: {
      field,
      operator,
      ...(operator === 'exists' || operator === 'missing' ? {} : { value }),
    },
    ...(label ? { label } : {}),
  }
}

function visibilityAny(conditions = [], label = '') {
  return {
    enabled: true,
    any: conditions,
    ...(label ? { label } : {}),
  }
}

function metadata(extra = {}) {
  const nativePdfLayout = cloneJson(extra.native_pdf_layout || extra.nativePdfLayout)
  const metadataExtra = { ...extra }
  delete metadataExtra.native_pdf_layout
  delete metadataExtra.nativePdfLayout
  return {
    editable: true,
    wording_version: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
    blank_safe_rows: true,
    native_pdf_layout: {
      contract: MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT,
      keep_heading_with_body: true,
      avoid_orphan_heading: true,
      hide_empty_rows: true,
      ...nativePdfLayout,
    },
    ...metadataExtra,
  }
}

function section({
  sectionKey,
  sectionLabel,
  sectionType = 'legal_text',
  sortOrder,
  isRequired = true,
  conditionJson = {},
  placeholderKeys = [],
  legalText = '',
  metadataJson = {},
}) {
  return {
    section_key: sectionKey,
    section_label: sectionLabel,
    section_type: sectionType,
    sort_order: sortOrder,
    is_required: Boolean(isRequired),
    is_repeatable: false,
    condition_json: cloneJson(conditionJson),
    placeholder_keys: [...placeholderKeys],
    legal_text: normalizeText(legalText),
    metadata_json: metadata(metadataJson),
  }
}

export const MANDATE_TEMPLATE_WORDING_VNEXT_SECTIONS = Object.freeze([
  section({
    sectionKey: 'introduction_purpose',
    sectionLabel: 'Introduction and Purpose',
    sectionType: 'legal_text',
    sortOrder: 0,
    placeholderKeys: [
      'organisation_trading_name',
      'agent_full_name',
    ],
    legalText: `MANDATE AGREEMENT

The Seller appoints {{organisation_trading_name}} and {{agent_full_name}} to market the Property and introduce prospective purchasers, subject to this mandate, the completed mandatory disclosure form, and the Agency and Agent holding valid Fidelity Fund Certificates where required by law.

This Mandate Agreement records the parties, the Property, the mandate period, the authority granted, commission arrangements, disclosure status and any special conditions applicable to the marketing and sale of the Property. The completed mandatory disclosure form, where applicable, is incorporated as an annexure or supporting disclosure record.`,
  }),
  section({
    sectionKey: 'parties',
    sectionLabel: 'Parties',
    sectionType: 'dynamic_fields',
    sortOrder: 5,
    placeholderKeys: [
      'seller_full_name',
      'seller_id_number',
      'seller_email',
      'seller_phone',
      'seller_entity_type',
      'seller_domicilium_address',
      'organisation_trading_name',
      'organisation_legal_name',
      'organisation_registration_number',
      'organisation_registered_address',
      'organisation_ffc_number',
      'organisation_fsp_number',
      'agent_full_name',
      'agent_email',
      'agent_phone',
      'agent_ffc_number',
    ],
    legalText: `SELLER

Seller: {{seller_full_name}}
Identity / Registration Number: {{seller_id_number}}
Entity Type: {{seller_entity_type}}
Domicilium Address: {{seller_domicilium_address}}
Email: {{seller_email}}
Telephone: {{seller_phone}}

AGENCY AND AGENT

Trading Name: {{organisation_trading_name}}
Registered Legal Name: {{organisation_legal_name}}
Registration Number: {{organisation_registration_number}}
Registered Address: {{organisation_registered_address}}
Firm FFC Number: {{organisation_ffc_number}}
FSP Number: {{organisation_fsp_number}}
Agent: {{agent_full_name}}
Agent Email: {{agent_email}}
Agent Phone: {{agent_phone}}
Agent FFC Number: {{agent_ffc_number}}`,
  }),
  section({
    sectionKey: 'seller_individual_capacity_pack',
    sectionLabel: 'Seller Capacity',
    sectionType: 'legal_text',
    sortOrder: 20,
    isRequired: false,
    conditionJson: visibilityCondition('seller_entity_type', 'equals', 'individual', 'Only include for individual sellers'),
    placeholderKeys: ['seller_entity_type', 'seller_marital_status'],
    metadataJson: {
      conditional_pack: true,
      condition_rule_locked: true,
      hide_when_empty: true,
    },
    legalText: `SELLER CAPACITY

The Seller warrants that the recorded marital status is correct and that the Seller has full contractual capacity to grant this mandate.

Seller Marital Status: {{seller_marital_status}}`,
  }),
  section({
    sectionKey: 'seller_company_authority_pack',
    sectionLabel: 'Company Seller Authority',
    sectionType: 'legal_text',
    sortOrder: 21,
    isRequired: false,
    conditionJson: visibilityCondition('seller_entity_type', 'in', ['company', 'close_corporation'], 'Only include for company or close corporation sellers'),
    placeholderKeys: [
      'seller_entity_type',
      'seller_company_registration_number',
      'seller_representative_name',
      'seller_representative_capacity',
      'seller_resolution_date',
      'seller_authority_basis',
    ],
    metadataJson: {
      conditional_pack: true,
      condition_rule_locked: true,
      hide_when_empty: true,
    },
    legalText: `COMPANY SELLER AUTHORITY

Where the Seller is a company or close corporation, the signatory warrants that the Seller is duly authorised to grant this mandate and that the representative has authority to bind the Seller.

Registration Number: {{seller_company_registration_number}}
Representative: {{seller_representative_name}}
Capacity: {{seller_representative_capacity}}
Resolution Date: {{seller_resolution_date}}
Authority Basis: {{seller_authority_basis}}`,
  }),
  section({
    sectionKey: 'seller_trust_authority_pack',
    sectionLabel: 'Trust Seller Authority',
    sectionType: 'legal_text',
    sortOrder: 22,
    isRequired: false,
    conditionJson: visibilityCondition('seller_entity_type', 'equals', 'trust', 'Only include for trust sellers'),
    placeholderKeys: [
      'seller_entity_type',
      'seller_trust_registration_number',
      'seller_trustee_names',
      'seller_representative_name',
      'seller_representative_capacity',
      'seller_authority_basis',
    ],
    metadataJson: {
      conditional_pack: true,
      condition_rule_locked: true,
      hide_when_empty: true,
    },
    legalText: `TRUST SELLER AUTHORITY

Where the Seller is a trust, the trustees or authorised representative warrant that the trust is duly authorised to grant this mandate, that any required letters of authority are in place, and that the signatory may bind the trust.

Trust Registration Number: {{seller_trust_registration_number}}
Trustees: {{seller_trustee_names}}
Representative: {{seller_representative_name}}
Capacity: {{seller_representative_capacity}}
Authority Basis: {{seller_authority_basis}}`,
  }),
  section({
    sectionKey: 'seller_spouse_consent_pack',
    sectionLabel: 'Spouse Consent',
    sectionType: 'legal_text',
    sortOrder: 23,
    isRequired: false,
    conditionJson: visibilityCondition('seller_spouse_consent_required', 'equals', 'Yes', 'Only include when seller spouse consent is required'),
    placeholderKeys: [
      'seller_spouse_consent_required',
      'seller_spouse_full_name',
      'seller_spouse_id_number',
      'seller_spouse_email',
    ],
    metadataJson: {
      conditional_pack: true,
      condition_rule_locked: true,
      hide_when_empty: true,
    },
    legalText: `SPOUSE CONSENT

Where the Seller is married in community of property or spouse consent is otherwise required, the spouse recorded below consents to this mandate and will sign where required.

Spouse: {{seller_spouse_full_name}}
ID Number: {{seller_spouse_id_number}}
Email: {{seller_spouse_email}}`,
  }),
  section({
    sectionKey: 'property_details',
    sectionLabel: 'Property Details',
    sectionType: 'dynamic_fields',
    sortOrder: 35,
    placeholderKeys: [
      'property_address',
      'property_display_address',
      'property_suburb',
      'property_city',
      'property_type',
      'property_title_type',
    ],
    legalText: `PROPERTY

Address: {{property_address}}
Display Address: {{property_display_address}}
Suburb / City: {{property_suburb}} {{property_city}}
Property Type: {{property_type}}
Title Type: {{property_title_type}}`,
  }),
  section({
    sectionKey: 'property_full_title_pack',
    sectionLabel: 'Full Title Property Details',
    sectionType: 'legal_text',
    sortOrder: 40,
    isRequired: false,
    conditionJson: visibilityCondition('property_title_type', 'in', ['full_title', 'agricultural_holding'], 'Only include for full title properties'),
    placeholderKeys: ['property_title_type', 'erf_number', 'erf_size', 'floor_size', 'property_estate_name'],
    metadataJson: {
      conditional_pack: true,
      condition_rule_locked: true,
      hide_when_empty: true,
    },
    legalText: `FULL TITLE PROPERTY DETAILS

Where applicable, the full title property particulars below form part of the Property description.

Erf Number: {{erf_number}}
Erf Size: {{erf_size}}
Floor Size: {{floor_size}}
Estate / HOA: {{property_estate_name}}`,
  }),
  section({
    sectionKey: 'property_sectional_title_pack',
    sectionLabel: 'Sectional Title Property Details',
    sectionType: 'legal_text',
    sortOrder: 41,
    isRequired: false,
    conditionJson: visibilityCondition('property_title_type', 'in', ['sectional_title', 'share_block'], 'Only include for sectional title or share block properties'),
    placeholderKeys: [
      'property_title_type',
      'property_unit_number',
      'property_section_number',
      'sectional_title_number',
      'property_complex_name',
      'property_estate_name',
    ],
    metadataJson: {
      conditional_pack: true,
      condition_rule_locked: true,
      hide_when_empty: true,
    },
    legalText: `SECTIONAL TITLE PROPERTY DETAILS

Where applicable, the sectional title or share block particulars below form part of the Property description.

Unit Number: {{property_unit_number}}
Section Number: {{property_section_number}}
Sectional Title Number: {{sectional_title_number}}
Scheme / Complex: {{property_complex_name}}
Estate: {{property_estate_name}}`,
  }),
  section({
    sectionKey: 'mandate_terms',
    sectionLabel: 'Mandate Terms',
    sectionType: 'legal_text',
    sortOrder: 60,
    placeholderKeys: [
      'mandate_type',
      'mandate_start_date',
      'mandate_end_date',
    ],
    legalText: `MANDATE TERMS

Mandate Type: {{mandate_type}}
Start Date: {{mandate_start_date}}
End Date: {{mandate_end_date}}

The Seller authorises the Agency to market the Property, arrange viewings, introduce prospective purchasers, receive and present offers, and assist with transaction administration within the mandate period.`,
  }),
  section({
    sectionKey: 'commission_terms',
    sectionLabel: 'Commission Terms',
    sectionType: 'dynamic_fields',
    sortOrder: 61,
    placeholderKeys: [
      'asking_price',
      'commission_structure',
      'mandate_commission_percent',
      'mandate_commission_amount',
      'vat_handling',
    ],
    legalText: `COMMISSION

Asking Price: {{asking_price}}
Commission Structure: {{commission_structure}}
Commission Percentage: {{mandate_commission_percent}}
Commission Amount: {{mandate_commission_amount}}
VAT Treatment: {{vat_handling}}

Commission is earned where the Agency is the effective cause of a sale, where the Seller accepts an offer introduced by the Agency, or where commission is otherwise due under this mandate. Commission is payable on registration of transfer unless the parties record a different written payment trigger. VAT is dealt with according to the VAT treatment recorded above.

If a prospective purchaser introduced during the mandate concludes a sale within any agreed protection period, the commission provisions continue to apply to the extent permitted by law and the signed mandate terms.`,
  }),
  section({
    sectionKey: 'marketing_listing_terms',
    sectionLabel: 'Marketing and Listing Terms',
    sectionType: 'legal_text',
    sortOrder: 62,
    placeholderKeys: [],
    metadataJson: {
      native_pdf_layout: {
        avoid_page_break_inside: true,
      },
    },
    legalText: `MARKETING AND LISTING

The Agency may prepare marketing material, photograph or otherwise present the Property, publish the listing on approved channels, contact prospective purchasers, arrange viewings and conduct reasonable marketing activities for the Property.

The Seller will provide the Agency and prospective purchasers introduced by the Agency with reasonable access to the Property for valuation, photography, marketing, viewing and sale-related purposes, subject to reasonable notice, security arrangements and any lawful occupancy or tenant requirements.`,
  }),
  section({
    sectionKey: 'special_conditions',
    sectionLabel: 'Special Conditions',
    sectionType: 'legal_text',
    sortOrder: 80,
    isRequired: false,
    conditionJson: visibilityAny([
      visibilityCondition('special_conditions', 'exists'),
      visibilityCondition('annexures_list', 'exists'),
    ], 'Only include when special conditions or annexures are captured'),
    placeholderKeys: ['special_conditions', 'annexures_list'],
    metadataJson: {
      hide_when_empty: true,
      native_pdf_layout: {
        avoid_page_break_inside: true,
      },
    },
    legalText: `SPECIAL CONDITIONS

Special Conditions: {{special_conditions}}
Annexures: {{annexures_list}}`,
  }),
  section({
    sectionKey: 'general_terms',
    sectionLabel: 'General Legal Terms',
    sectionType: 'legal_text',
    sortOrder: 81,
    placeholderKeys: ['document_reference'],
    legalText: `GENERAL TERMS

This mandate is governed by South African law. The parties choose their recorded addresses as domicilium for notices unless changed in writing.

No amendment, cancellation or waiver is valid unless recorded in writing and accepted by the parties. If any provision is unenforceable, the remaining provisions continue to apply.

Document Reference: {{document_reference}}`,
  }),
  section({
    sectionKey: 'popia_fica',
    sectionLabel: 'POPIA and FICA',
    sectionType: 'legal_text',
    sortOrder: 82,
    placeholderKeys: ['seller_full_name'],
    legalText: `POPIA AND FICA

The Seller consents to the processing of personal information reasonably required for marketing, mandate administration, FICA verification, transaction communication, record keeping and related property services.

The Seller authorises lawful sharing of relevant information with conveyancers, bond originators, compliance providers, transaction service providers and prospective purchasers where reasonably required for the mandate or resulting transaction.`,
  }),
  section({
    sectionKey: 'signature_pages',
    sectionLabel: 'Signature Pages',
    sectionType: 'signature_zone',
    sortOrder: 100,
    placeholderKeys: [
      'seller_full_name',
      'seller_signature',
      'seller_initials',
      'signed_date',
      'witness_signature',
      'organisation_trading_name',
      'organisation_legal_name',
      'agent_full_name',
      'agent_ffc_number',
    ],
    metadataJson: {
      native_pdf_layout: {
        render_mode: 'signature_zone_only',
        suppress_section_body: true,
        preserve_authoritative_signing_fields: true,
        signature_layout_contract: 'arch9-mandate-branded-signature-layout-v1',
      },
      signing: {
        planned_fields: [
          { signer_role: 'agent', field_type: 'signature', required: true },
          { signer_role: 'seller', field_type: 'signature', required: true },
        ],
      },
    },
    legalText: `SIGNATURES

Seller: {{seller_full_name}}
Signature: {{seller_signature}}
Initials: {{seller_initials}}
Date: {{signed_date}}

Witness: {{witness_signature}}

Agency: {{organisation_trading_name}}
Registered Legal Name: {{organisation_legal_name}}
Agent: {{agent_full_name}}
Agent FFC Number: {{agent_ffc_number}}`,
  }),
])

export function listMandateTemplateWordingVNextSections() {
  return MANDATE_TEMPLATE_WORDING_VNEXT_SECTIONS.map((item) => ({
    ...item,
    condition_json: cloneJson(item.condition_json),
    placeholder_keys: [...item.placeholder_keys],
    metadata_json: cloneJson(item.metadata_json),
  }))
}

export function buildMandateTemplateWordingVNextSections({ existingSections = [] } = {}) {
  const existingByKey = new Map(
    (Array.isArray(existingSections) ? existingSections : [])
      .map((item, index) => normalizeMandateBaselineSection(item, index))
      .map((item) => [item.sectionKey, item]),
  )
  return listMandateTemplateWordingVNextSections().map((draft) => {
    const existing = existingByKey.get(normalizeKey(draft.section_key)) || {}
    return {
      ...draft,
      id: existing.id || draft.id || undefined,
      template_id: existing.templateId || draft.template_id,
      metadata_json: {
        ...cloneJson(existing.metadataJson),
        ...cloneJson(draft.metadata_json),
      },
    }
  })
}

function extractTemplateTokens(sections = []) {
  const tokens = new Set()
  for (const sectionRow of sections) {
    for (const token of sectionRow.placeholder_keys || []) {
      const normalized = normalizeKey(token)
      if (normalized) tokens.add(normalized)
    }
    for (const match of String(sectionRow.legal_text || '').matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
      const normalized = normalizeKey(match[1])
      if (normalized) tokens.add(normalized)
    }
  }
  return Array.from(tokens).sort()
}

function findHeadingIssues(sections = []) {
  return sections
    .map((sectionRow) => normalizeMandateBaselineSection(sectionRow))
    .filter((sectionRow) => /\b(pack|packet)\b/i.test(`${sectionRow.sectionLabel} ${sectionRow.renderedHeading}`))
    .map((sectionRow) => ({
      sectionKey: sectionRow.sectionKey,
      sectionLabel: sectionRow.sectionLabel,
      renderedHeading: sectionRow.renderedHeading,
    }))
}

function buildSummary({ baselineAudit = {}, registryValidation = {}, dataSourceReport = {}, contentScan = {}, headingIssues = [] } = {}) {
  const wordingGapCount = baselineAudit.wordingGaps?.length || 0
  const blankRenderRiskCount = baselineAudit.blankRenderRisks?.length || 0
  const unknownFieldCount = registryValidation.unknown?.length || 0
  const aliasFieldCount = registryValidation.deprecated?.length || 0
  const contentBlockerCount = contentScan.blockingCount || 0
  const dataSourceGapCount = dataSourceReport.summary?.readinessGaps?.length || 0

  return {
    sectionCount: baselineAudit.visualBaseline?.sectionCount || 0,
    signatureSectionCount: baselineAudit.visualBaseline?.signatureSectionCount || 0,
    wordingGapCount,
    headingIssueCount: headingIssues.length,
    blankRenderRiskCount,
    unknownFieldCount,
    aliasFieldCount,
    contentBlockerCount,
    dataSourceGapCount,
    status: (
      wordingGapCount ||
      headingIssues.length ||
      blankRenderRiskCount ||
      unknownFieldCount ||
      aliasFieldCount ||
      contentBlockerCount
    ) ? 'NEEDS_REVIEW' : 'WORDING_VNEXT_READY_FOR_COUNSEL_REVIEW',
  }
}

export function buildMandateTemplateWordingVNext({
  template = {},
  existingSections = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const sections = buildMandateTemplateWordingVNextSections({ existingSections })
  const tokens = extractTemplateTokens(sections)
  const registryValidation = validateTemplateTokensAgainstRegistry({
    tokens,
    packetType: 'mandate',
  })
  const baselineAudit = buildMandateTemplateBaselineAudit({
    template: {
      ...template,
      packet_type: 'mandate',
      template_key: template.template_key || template.templateKey || 'mandate_default_v1',
      version_tag: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
      metadata_json: {
        ...(template.metadata_json || template.metadataJson || {}),
        mandate_template_variant: 'default',
        wording_version: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
      },
    },
    sections,
    checkedAt: generatedAt,
  })
  const dataSourceReport = buildMandateTemplateDataSourceReport({
    fields: tokens,
    generatedAt,
  })
  const contentScan = scanMandateTemplateSections(sections, {
    routeKey: 'default',
  })
  const headingIssues = findHeadingIssues(sections)
  const summary = buildSummary({
    baselineAudit,
    registryValidation,
    dataSourceReport,
    contentScan,
    headingIssues,
  })

  return {
    version: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
    generatedAt,
    mutatedData: false,
    template: {
      templateKey: normalizeText(template.template_key || template.templateKey) || 'mandate_default_v1',
      packetType: 'mandate',
      versionTag: MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
    },
    sections,
    tokens,
    registryValidation,
    baselineAudit,
    dataSourceReport,
    contentScan,
    headingIssues,
    summary,
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

export function formatMandateTemplateWordingVNextMarkdown(report = buildMandateTemplateWordingVNext()) {
  const rows = report.sections.map((sectionRow) => ({
    key: sectionRow.section_key,
    label: sectionRow.section_label,
    type: sectionRow.section_type,
    order: sectionRow.sort_order,
    required: sectionRow.is_required ? 'yes' : 'no',
    conditional: Object.keys(sectionRow.condition_json || {}).length ? 'yes' : 'no',
    fields: (sectionRow.placeholder_keys || []).join(', '),
  }))

  return [
    '# Mandate Template vNext Phase 4 Wording',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.summary.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Sections', report.summary.sectionCount],
        ['Signature sections', report.summary.signatureSectionCount],
        ['Wording gaps', report.summary.wordingGapCount],
        ['Client-facing heading issues', report.summary.headingIssueCount],
        ['Blank render risks', report.summary.blankRenderRiskCount],
        ['Alias/non-canonical fields', report.summary.aliasFieldCount],
        ['Unknown fields', report.summary.unknownFieldCount],
        ['Content gate blockers', report.summary.contentBlockerCount],
      ],
    ),
    '',
    '## Section Plan',
    '',
    table(
      ['Order', 'Key', 'Client Heading', 'Type', 'Required', 'Conditional', 'Fields'],
      rows.map((row) => [row.order, row.key, row.label, row.type, row.required, row.conditional, row.fields]),
    ),
    '',
    '## Wording Notes',
    '',
    '- The appointment wording is now the opening paragraph and uses canonical organisation fields.',
    '- Mandatory disclosure status and annexure wording are included in the introduction.',
    '- FFC wording is included in the appointment clause and agent/firm FFC fields are preserved.',
    '- Commission wording now covers effective cause, transfer/payment timing, protection period and VAT treatment.',
    '- Internal section keys ending in `_pack` are preserved for routing, but client-facing labels and rendered headings do not use Pack or Packet language.',
    '- Optional sections use visibility conditions plus blank-safe metadata so empty rows/sections can be hidden without disturbing the PDF layout.',
    '',
    '## Counsel Review Boundary',
    '',
    'This Phase 4 artifact is wording-ready for counsel review. It is not a legal approval record and does not mutate the live template.',
    '',
  ].join('\n')
}
