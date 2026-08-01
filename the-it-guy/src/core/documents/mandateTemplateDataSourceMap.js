import {
  getCanonicalMergeFieldDefinition,
  listCanonicalMergeFields,
  normalizeMergeFieldPayload,
  resolveCanonicalMergeFieldKey,
} from './mergeFieldRegistry.js'

export const MANDATE_TEMPLATE_DATA_SOURCE_MAP_VERSION = 'mandate_template_vnext_phase3_data_source_map_v1'

export const MANDATE_DATA_SOURCE_DOMAINS = [
  {
    id: 'company_settings',
    label: 'Company Settings',
    collectionSurface: 'Company Settings',
    description: 'Organisation legal identity, firm-level compliance numbers, branch metadata, and brand assets.',
  },
  {
    id: 'agent_profile',
    label: 'Agent Profile',
    collectionSurface: 'User / Agent Profile',
    description: 'Assigned agent identity, contact details, and individual FFC information.',
  },
  {
    id: 'seller_onboarding',
    label: 'Seller Onboarding',
    collectionSurface: 'Seller Onboarding',
    description: 'Seller legal identity, authority, contact details, and mandate preference answers.',
  },
  {
    id: 'property_profile',
    label: 'Property / Listing',
    collectionSurface: 'Seller Onboarding + Private Listing',
    description: 'Property address, title profile, listing facts, and display address details.',
  },
  {
    id: 'mandate_draft',
    label: 'Mandate Draft',
    collectionSurface: 'Mandate Setup',
    description: 'Mandate-specific commercial terms, dates, special conditions, and selected attorneys.',
  },
  {
    id: 'disclosure_artifact',
    label: 'Mandatory Disclosure',
    collectionSurface: 'Mandatory Disclosure Form',
    description: 'Prescribed disclosure form status, signed/locked date, annexure title, and summary comments.',
  },
  {
    id: 'legal_routing',
    label: 'Legal Routing',
    collectionSurface: 'Generated Legal Scenario',
    description: 'Computed clause-profile and scenario fields used to select conditional content.',
  },
  {
    id: 'signing_system',
    label: 'Signing System',
    collectionSurface: 'Signing Runtime',
    description: 'Signature placeholders, initials fields, and final signing timestamps.',
  },
  {
    id: 'document_runtime',
    label: 'Document Runtime',
    collectionSurface: 'Document Generator',
    description: 'Generated references, template version metadata, annexure labels, and platform defaults.',
  },
]

const DOMAIN_BY_ID = new Map(MANDATE_DATA_SOURCE_DOMAINS.map((domain) => [domain.id, domain]))

const MANDATE_VNEXT_READINESS_KEYS = new Set([
  'organisation_legal_name',
  'organisation_trading_name',
  'organisation_registration_number',
  'organisation_registered_address',
  'organisation_ffc_number',
  'agent_full_name',
  'agent_ffc_number',
  'mandatory_disclosure_status',
  'mandatory_disclosure_signed_at',
  'mandatory_disclosure_annexure',
])

const CONDITIONAL_FIELD_POLICIES = {
  seller_spouse_full_name: 'conditional_required',
  seller_spouse_id_number: 'conditional_required',
  seller_spouse_email: 'conditional_required',
  seller_spouse_consent_required: 'conditional_required',
  seller_company_registration_number: 'conditional_required',
  seller_representative_name: 'conditional_required',
  seller_representative_capacity: 'conditional_required',
  seller_resolution_date: 'conditional_required',
  seller_authority_basis: 'conditional_required',
  seller_trust_registration_number: 'conditional_required',
  seller_trustee_names: 'conditional_required',
  property_unit_number: 'conditional_required',
  property_section_number: 'conditional_required',
  property_complex_name: 'conditional_required',
  property_estate_name: 'conditional_required',
  sectional_title_number: 'conditional_required',
  mandate_commission_percent: 'conditional_required',
  mandate_commission_amount: 'conditional_required',
  transfer_attorney_company_name: 'optional_hide_when_empty',
  transfer_attorney_contact_person: 'optional_hide_when_empty',
  transfer_attorney_email: 'optional_hide_when_empty',
  transfer_attorney_phone: 'optional_hide_when_empty',
}

const CATEGORY_DEFAULTS = {
  'Seller Details': {
    domain: 'seller_onboarding',
    primarySourcePaths: ['onboardingSubmission.*', 'mandateDraft.seller*'],
    fallbackSourcePaths: ['lead.seller*', 'contact.*'],
    ownerNotes: 'Seller onboarding should own this field; mandate draft may override during document setup.',
  },
  'Property Details': {
    domain: 'property_profile',
    primarySourcePaths: ['onboardingSubmission.property*', 'privateListing.*'],
    fallbackSourcePaths: ['lead.property*', 'transaction.property*'],
    ownerNotes: 'Seller onboarding captures the facts; private listing/property profile should be the durable source.',
  },
  'Transaction Terms': {
    domain: 'mandate_draft',
    primarySourcePaths: ['mandateDraft.*', 'onboardingSubmission.*'],
    fallbackSourcePaths: ['lead.*', 'transaction.*'],
    ownerNotes: 'Mandate-specific free text should be confirmed in the mandate setup flow before rendering.',
  },
  'Agent / Agency': {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.*', 'agency.*'],
    fallbackSourcePaths: ['lead.agency*'],
    ownerNotes: 'Organisation identity belongs in company settings so all packets inherit the same legal identity.',
  },
  'Mandate Terms': {
    domain: 'mandate_draft',
    primarySourcePaths: ['mandateDraft.*', 'onboardingSubmission.*'],
    fallbackSourcePaths: ['privateListing.*', 'lead.*'],
    ownerNotes: 'Mandate setup is the confirmation layer after seller onboarding.',
  },
  Commission: {
    domain: 'mandate_draft',
    primarySourcePaths: ['mandateDraft.*', 'onboardingSubmission.commission*'],
    fallbackSourcePaths: ['agency.defaultCommission*', 'organisation.defaultCommission*', 'lead.commission*'],
    ownerNotes: 'Commission defaults may come from company settings, but the mandate draft should store the accepted terms.',
  },
  Signing: {
    domain: 'signing_system',
    primarySourcePaths: ['documentSigningFields.*', 'documentPacketSigners.*'],
    fallbackSourcePaths: [],
    missingPolicy: 'runtime_generated',
    ownerNotes: 'Generated by the signing placement layer, not collected as text input.',
  },
  Branding: {
    domain: 'company_settings',
    primarySourcePaths: ['organisationBranding.*', 'agency.branding.*'],
    fallbackSourcePaths: ['platformDefaults.*'],
    missingPolicy: 'optional_hide_when_empty',
    ownerNotes: 'Organisation branding is optional for legal enforceability but should hydrate from company settings.',
  },
  'Document Metadata': {
    domain: 'document_runtime',
    primarySourcePaths: ['documentPacket.*', 'documentPacketVersion.*', 'documentTemplate.*'],
    fallbackSourcePaths: ['transaction.*', 'platformDefaults.*'],
    missingPolicy: 'runtime_generated',
    ownerNotes: 'Generated by the document runtime when a packet/version is created.',
  },
  'Legal Routing': {
    domain: 'legal_routing',
    primarySourcePaths: ['mandateScenarioProfile.*', 'scenarioProfile.*'],
    fallbackSourcePaths: ['computed from seller/property/finance profiles'],
    missingPolicy: 'runtime_generated',
    ownerNotes: 'Computed from canonical party/property facts; it should not be directly typed by users.',
  },
}

const FIELD_SOURCE_OVERRIDES = {
  seller_full_name: {
    primarySourcePaths: [
      'mandateDraft.sellerFullName',
      'onboardingSubmission.sellerFullName',
      'onboardingSubmission.firstName + onboardingSubmission.lastName',
    ],
    fallbackSourcePaths: ['contact.name', 'lead.name', 'lead.sellerName + lead.sellerSurname'],
  },
  seller_id_number: {
    primarySourcePaths: [
      'mandateDraft.sellerIdNumber',
      'onboardingSubmission.idNumber',
      'onboardingSubmission.companyRegistrationNumber',
      'onboardingSubmission.trustRegistrationNumber',
    ],
    fallbackSourcePaths: ['lead.sellerIdNumber'],
  },
  seller_email: {
    primarySourcePaths: ['mandateDraft.sellerEmail', 'onboardingSubmission.email'],
    fallbackSourcePaths: ['contact.email', 'lead.sellerEmail', 'lead.email'],
  },
  seller_phone: {
    primarySourcePaths: ['mandateDraft.sellerPhone', 'onboardingSubmission.phone'],
    fallbackSourcePaths: ['contact.phone', 'lead.sellerPhone', 'lead.phone'],
  },
  seller_entity_type: {
    primarySourcePaths: ['mandateDraft.sellerEntityType', 'onboardingSubmission.ownershipType'],
    fallbackSourcePaths: ['lead.sellerType'],
  },
  seller_marital_status: {
    primarySourcePaths: ['mandateDraft.sellerMaritalStatus', 'onboardingSubmission.maritalStatus'],
    fallbackSourcePaths: ['derived from onboardingSubmission.ownershipType when explicit marital status is absent'],
  },
  seller_domicilium_address: {
    primarySourcePaths: [
      'mandateDraft.sellerDomiciliumAddress',
      'onboardingSubmission.domiciliumAddress',
      'onboardingSubmission.residentialAddress',
      'onboardingSubmission.physicalAddress',
    ],
    fallbackSourcePaths: ['contact.address', 'lead.address'],
  },
  property_address: {
    primarySourcePaths: [
      'mandateDraft.propertyAddress',
      'onboardingSubmission.propertyAddress',
      'onboardingSubmission.propertyAddressDetails',
      'privateListing.propertyAddress',
    ],
    fallbackSourcePaths: ['lead.propertyAddress', 'lead.sellerPropertyAddress', 'transaction.property_address_line_1'],
  },
  property_display_address: {
    primarySourcePaths: ['computed from property_unit_number + property_complex_name + property_estate_name + property_address'],
    fallbackSourcePaths: ['property_address'],
  },
  property_title_type: {
    primarySourcePaths: ['mandateDraft.propertyTitleType', 'onboardingSubmission.property_title_type'],
    fallbackSourcePaths: ['privateListing.propertyTitleType', 'lead.propertyTitleType', 'transaction.property_title_type'],
  },
  erf_number: {
    primarySourcePaths: ['mandateDraft.erfNumber', 'onboardingSubmission.erfNumber'],
    fallbackSourcePaths: ['privateListing.erfNumber', 'lead.erfNumber', 'transaction.erf_number'],
  },
  special_conditions: {
    domain: 'mandate_draft',
    primarySourcePaths: ['mandateDraft.specialConditions'],
    fallbackSourcePaths: ['onboardingSubmission.specialConditions', 'onboardingSubmission.additionalConditions', 'lead.specialConditions'],
    missingPolicy: 'optional_hide_when_empty',
  },
  agent_full_name: {
    domain: 'agent_profile',
    primarySourcePaths: ['agent.fullName', 'agent.name'],
    fallbackSourcePaths: ['lead.assignedAgentName'],
  },
  agent_email: {
    domain: 'agent_profile',
    primarySourcePaths: ['agent.email'],
    fallbackSourcePaths: ['lead.assignedAgentEmail'],
  },
  agent_phone: {
    domain: 'agent_profile',
    primarySourcePaths: ['agent.phone'],
    fallbackSourcePaths: ['lead.assignedAgentPhone'],
  },
  agent_ffc_number: {
    domain: 'agent_profile',
    primarySourcePaths: ['agent.ffcNumber', 'agent.fidelityFundCertificateNumber'],
    fallbackSourcePaths: ['lead.agentFfcNumber'],
  },
  organisation_trading_name: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.tradingName', 'organisation.displayName', 'agency.tradingName'],
    fallbackSourcePaths: ['organisation.name', 'agency.name', 'lead.agencyName'],
  },
  organisation_legal_name: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.legalName', 'organisation.legal_name', 'agency.legalName', 'agency.legal_name'],
    fallbackSourcePaths: ['agency.name', 'organisation.name', 'lead.agencyName'],
  },
  organisation_registration_number: {
    domain: 'company_settings',
    primarySourcePaths: [
      'organisation.registrationNumber',
      'organisation.registration_number',
      'organisation.companyRegistrationNumber',
      'agency.registrationNumber',
      'agency.companyRegistrationNumber',
    ],
    fallbackSourcePaths: ['agency.agencyRegistrationNumber'],
  },
  organisation_vat_number: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.vatNumber', 'organisation.vat_number', 'agency.vatNumber', 'agency.vat_number'],
    fallbackSourcePaths: [],
    missingPolicy: 'optional_hide_when_empty',
  },
  organisation_registered_address: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.registeredAddress', 'organisation.address', 'organisation.physicalAddress', 'agency.address'],
    fallbackSourcePaths: ['agency.agencyAddress'],
  },
  branch_name: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.branchName', 'agency.branchName'],
    fallbackSourcePaths: ['lead.branchName'],
    missingPolicy: 'optional_hide_when_empty',
  },
  organisation_fsp_number: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.fspNumber', 'organisation.metadata.fspNumber', 'agency.fspNumber', 'agency.metadata.fspNumber'],
    fallbackSourcePaths: [],
    missingPolicy: 'optional_hide_when_empty',
  },
  organisation_ffc_number: {
    domain: 'company_settings',
    primarySourcePaths: [
      'organisation.ffcNumber',
      'organisation.fidelityFundCertificateNumber',
      'organisation.metadata.ffcNumber',
      'agency.ffcNumber',
      'agency.fidelityFundCertificateNumber',
      'agency.metadata.ffcNumber',
    ],
    fallbackSourcePaths: [],
  },
  mandate_introduction_purpose: {
    primarySourcePaths: ['mandateDraft.introductionPurpose'],
    fallbackSourcePaths: ['legal default wording from mandateDataMapper'],
  },
  mandatory_disclosure_status: {
    domain: 'disclosure_artifact',
    primarySourcePaths: ['onboardingSubmission.propertyDisclosure.status', 'propertyDisclosureAnnexure.status'],
    fallbackSourcePaths: ['onboardingSubmission.disclosure.status', 'legacy property_disclosure_status alias'],
  },
  mandatory_disclosure_signed_at: {
    domain: 'disclosure_artifact',
    primarySourcePaths: ['onboardingSubmission.propertyDisclosure.lockedAt', 'propertyDisclosureAnnexure.lockedAt'],
    fallbackSourcePaths: ['onboardingSubmission.propertyDisclosure.signedAt', 'legacy property_disclosure_locked_at alias'],
  },
  mandatory_disclosure_annexure: {
    domain: 'disclosure_artifact',
    primarySourcePaths: ['propertyDisclosureAnnexure.title'],
    fallbackSourcePaths: ['mandateDraft.annexuresList', 'onboardingSubmission.annexuresList', 'legacy property_disclosure_annexure alias'],
  },
  mandatory_disclosure_comments: {
    domain: 'disclosure_artifact',
    primarySourcePaths: ['propertyDisclosureAnnexure.comments', 'onboardingSubmission.propertyDisclosure.comments'],
    fallbackSourcePaths: ['legacy property_disclosure_comments alias'],
    missingPolicy: 'optional_hide_when_empty',
  },
  mandate_type: {
    primarySourcePaths: ['mandateDraft.mandateType', 'mandateDraft.type'],
    fallbackSourcePaths: ['onboardingSubmission.mandateType', 'privateListing.mandateType', 'agency.defaultMandateType'],
  },
  mandate_start_date: {
    primarySourcePaths: ['mandateDraft.mandateStartDate', 'mandateDraft.startDate'],
    fallbackSourcePaths: ['onboardingSubmission.mandateStartDate', 'lead.mandateStartDate', 'mapper default current date'],
  },
  mandate_end_date: {
    primarySourcePaths: ['mandateDraft.mandateEndDate', 'mandateDraft.expiryDate'],
    fallbackSourcePaths: ['onboardingSubmission.mandateEndDate', 'lead.mandateEndDate', 'mapper default current date + 90 days'],
  },
  mandate_authority_granted: {
    primarySourcePaths: ['mandateDraft.authorityGranted'],
    fallbackSourcePaths: ['onboardingSubmission.authorityGranted', 'lead.authorityGranted', 'legal default wording from mandateDataMapper'],
  },
  mandate_marketing_permissions: {
    primarySourcePaths: ['mandateDraft.marketingPermissions'],
    fallbackSourcePaths: ['onboardingSubmission.marketingPermissions', 'onboardingSubmission.marketingAuthorisations', 'lead.marketingPermissions'],
    missingPolicy: 'optional_hide_when_empty',
  },
  mandate_access_instructions: {
    primarySourcePaths: ['mandateDraft.accessInstructions'],
    fallbackSourcePaths: ['onboardingSubmission.accessInstructions', 'lead.accessInstructions'],
    missingPolicy: 'optional_hide_when_empty',
  },
  annexures_list: {
    domain: 'document_runtime',
    primarySourcePaths: ['mandateDraft.annexuresList', 'onboardingSubmission.annexuresList'],
    fallbackSourcePaths: ['propertyDisclosureAnnexure.title'],
    missingPolicy: 'optional_hide_when_empty',
  },
  commission_structure: {
    primarySourcePaths: ['mandateDraft.commissionStructure'],
    fallbackSourcePaths: ['onboardingSubmission.commissionStructure', 'agency.defaultCommissionStructure', 'organisation.defaultCommissionStructure'],
  },
  mandate_commission_percent: {
    primarySourcePaths: ['mandateDraft.commissionPercent'],
    fallbackSourcePaths: ['onboardingSubmission.commissionPercentage', 'lead.commissionPercent', 'agency.defaultCommissionPercentage'],
  },
  mandate_commission_amount: {
    primarySourcePaths: ['mandateDraft.commissionAmount'],
    fallbackSourcePaths: ['onboardingSubmission.commissionAmount', 'lead.commissionAmount', 'agency.defaultCommissionAmount'],
  },
  vat_handling: {
    primarySourcePaths: ['mandateDraft.vatHandling'],
    fallbackSourcePaths: ['onboardingSubmission.vatHandling', 'agency.vatHandling', 'organisation.vatHandling'],
  },
  asking_price: {
    primarySourcePaths: ['mandateDraft.askingPrice', 'mandateDraft.marketingPrice'],
    fallbackSourcePaths: ['onboardingSubmission.askingPrice', 'privateListing.askingPrice', 'lead.estimatedValue', 'transaction.purchase_price'],
  },
  signed_date: {
    domain: 'signing_system',
    primarySourcePaths: ['documentPacketSigners.signed_at', 'signingCompletion.completedAt'],
    fallbackSourcePaths: ['documentPacketVersion.generated_at'],
    missingPolicy: 'runtime_generated',
  },
  organisation_logo_url: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.logoLightUrl', 'organisation.logo_url', 'agency.logoLightUrl', 'agency.logoUrl'],
    fallbackSourcePaths: ['organisationBranding.logo_light_url'],
    missingPolicy: 'optional_hide_when_empty',
  },
  organisation_logo_dark_url: {
    domain: 'company_settings',
    primarySourcePaths: ['organisation.logoDarkUrl', 'agency.logoDarkUrl'],
    fallbackSourcePaths: ['organisation.logoLightUrl', 'organisation.logo_url'],
    missingPolicy: 'optional_hide_when_empty',
  },
  bridge_legal_name: {
    domain: 'document_runtime',
    primarySourcePaths: ['platformDefaults.bridgeLegalName'],
    fallbackSourcePaths: ['Arch9 Legal static default'],
    missingPolicy: 'runtime_generated',
  },
  bridge_legal_logo_light_url: {
    domain: 'document_runtime',
    primarySourcePaths: ['platformDefaults.bridgeLegalLogoLightUrl'],
    fallbackSourcePaths: ['public/favicon-light.svg'],
    missingPolicy: 'runtime_generated',
  },
  bridge_legal_logo_dark_url: {
    domain: 'document_runtime',
    primarySourcePaths: ['platformDefaults.bridgeLegalLogoDarkUrl'],
    fallbackSourcePaths: ['public/favicon-dark.svg'],
    missingPolicy: 'runtime_generated',
  },
}

function normalizeText(value) {
  return String(value || '').trim()
}

function mergeArrays(...arrays) {
  const seen = new Set()
  const output = []
  for (const value of arrays.flat()) {
    const text = normalizeText(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    output.push(text)
  }
  return output
}

function getDomain(domainId) {
  return DOMAIN_BY_ID.get(domainId) || DOMAIN_BY_ID.get('document_runtime')
}

function inferMissingPolicy(definition, override = {}, categoryDefaults = {}) {
  if (override.missingPolicy) return override.missingPolicy
  if (categoryDefaults.missingPolicy) return categoryDefaults.missingPolicy
  if (CONDITIONAL_FIELD_POLICIES[definition.key]) return CONDITIONAL_FIELD_POLICIES[definition.key]
  if (definition.required) return 'block_generation'
  if (MANDATE_VNEXT_READINESS_KEYS.has(definition.key)) return 'vnext_readiness_gap'
  return 'optional_hide_when_empty'
}

function buildMappingFromDefinition(definition) {
  const categoryDefaults = CATEGORY_DEFAULTS[definition.category] || CATEGORY_DEFAULTS['Document Metadata']
  const override = FIELD_SOURCE_OVERRIDES[definition.key] || {}
  const domain = getDomain(override.domain || categoryDefaults.domain)
  const missingPolicy = inferMissingPolicy(definition, override, categoryDefaults)
  return {
    key: definition.key,
    label: definition.label,
    category: definition.category,
    aliases: definition.aliases || [],
    packetTypes: definition.packetTypes || [],
    registryRequired: Boolean(definition.required),
    vNextReadinessCritical: MANDATE_VNEXT_READINESS_KEYS.has(definition.key),
    sourceDomain: domain.id,
    sourceLabel: domain.label,
    collectionSurface: domain.collectionSurface,
    primarySourcePaths: mergeArrays(override.primarySourcePaths || categoryDefaults.primarySourcePaths || []),
    fallbackSourcePaths: mergeArrays(override.fallbackSourcePaths || categoryDefaults.fallbackSourcePaths || []),
    missingPolicy,
    ownerNotes: override.ownerNotes || categoryDefaults.ownerNotes || domain.description,
    validationRule: definition.validationRule || '',
    sampleValue: definition.sampleValue || '',
    registryDataSource: definition.dataSource || '',
  }
}

export function getMandateTemplateDataSourceMapping(rawKey = '') {
  const canonicalKey = resolveCanonicalMergeFieldKey(rawKey, { packetType: 'mandate' })
  if (!canonicalKey) return null
  const definition = getCanonicalMergeFieldDefinition(canonicalKey, { packetType: 'mandate' })
  if (!definition) return null
  return buildMappingFromDefinition(definition)
}

export function listMandateTemplateDataSourceMappings({ fields = null } = {}) {
  const allowed = Array.isArray(fields) && fields.length
    ? new Set(fields.map((field) => resolveCanonicalMergeFieldKey(field, { packetType: 'mandate' })).filter(Boolean))
    : null

  return listCanonicalMergeFields({ packetType: 'mandate' })
    .filter((definition) => !allowed || allowed.has(definition.key))
    .map((definition) => buildMappingFromDefinition(definition))
}

export function buildMandateTemplateDataSourceReport({
  placeholders = {},
  fields = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalizedPayload = normalizeMergeFieldPayload(placeholders, {
    packetType: 'mandate',
    includeAliasKeys: true,
  }).payload
  const mappings = listMandateTemplateDataSourceMappings({ fields }).map((mapping) => {
    const resolvedValue = normalizedPayload?.[mapping.key] ?? null
    const hasValue = Boolean(normalizeText(resolvedValue))
    const status = hasValue
      ? 'filled'
      : mapping.missingPolicy === 'block_generation'
        ? 'missing_required'
        : mapping.missingPolicy === 'vnext_readiness_gap'
          ? 'missing_vnext_required'
          : mapping.missingPolicy === 'conditional_required'
            ? 'conditional'
            : mapping.missingPolicy === 'runtime_generated'
              ? 'runtime_generated'
              : 'optional'
    return {
      ...mapping,
      resolvedValue,
      hasValue,
      status,
    }
  })

  const summary = mappings.reduce((accumulator, mapping) => {
    accumulator.total += 1
    accumulator.byStatus[mapping.status] = (accumulator.byStatus[mapping.status] || 0) + 1
    accumulator.byDomain[mapping.sourceDomain] = (accumulator.byDomain[mapping.sourceDomain] || 0) + 1
    if (mapping.registryRequired) accumulator.registryRequired += 1
    if (mapping.vNextReadinessCritical) accumulator.vNextReadinessCritical += 1
    if (!mapping.hasValue && ['missing_required', 'missing_vnext_required'].includes(mapping.status)) {
      accumulator.readinessGaps.push({
        key: mapping.key,
        label: mapping.label,
        status: mapping.status,
        sourceLabel: mapping.sourceLabel,
        collectionSurface: mapping.collectionSurface,
        missingPolicy: mapping.missingPolicy,
      })
    }
    return accumulator
  }, {
    total: 0,
    registryRequired: 0,
    vNextReadinessCritical: 0,
    byStatus: {},
    byDomain: {},
    readinessGaps: [],
  })

  return {
    version: MANDATE_TEMPLATE_DATA_SOURCE_MAP_VERSION,
    generatedAt,
    packetType: 'mandate',
    domains: MANDATE_DATA_SOURCE_DOMAINS,
    summary,
    mappings,
  }
}

function formatMarkdownTable(rows = [], columns = []) {
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`
  const separator = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${columns.map((column) => normalizeText(column.value(row)).replace(/\|/g, '\\|')).join(' | ')} |`)
  return [header, separator, ...body].join('\n')
}

export function formatMandateTemplateDataSourceMapMarkdown(report = buildMandateTemplateDataSourceReport()) {
  const byDomainRows = report.domains.map((domain) => ({
    ...domain,
    count: report.summary.byDomain[domain.id] || 0,
  })).filter((domain) => domain.count > 0)

  const fieldRows = report.mappings.map((mapping) => ({
    ...mapping,
    primary: mapping.primarySourcePaths.slice(0, 3).join('; '),
    fallback: mapping.fallbackSourcePaths.slice(0, 2).join('; '),
  }))

  return [
    '# Mandate Template vNext Phase 3 Data Source Map',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Version: ${report.version}`,
    '',
    '## Summary',
    '',
    `Total mandate fields: ${report.summary.total}`,
    '',
    `Registry-required fields: ${report.summary.registryRequired}`,
    '',
    `vNext readiness-critical fields: ${report.summary.vNextReadinessCritical}`,
    '',
    formatMarkdownTable(Object.entries(report.summary.byStatus).map(([status, count]) => ({ status, count })), [
      { label: 'Status', value: (row) => row.status },
      { label: 'Count', value: (row) => row.count },
    ]),
    '',
    '## Source Domains',
    '',
    formatMarkdownTable(byDomainRows, [
      { label: 'Owner', value: (row) => row.label },
      { label: 'Collection Surface', value: (row) => row.collectionSurface },
      { label: 'Fields', value: (row) => row.count },
      { label: 'Purpose', value: (row) => row.description },
    ]),
    '',
    '## Readiness Gaps',
    '',
    report.summary.readinessGaps.length
      ? formatMarkdownTable(report.summary.readinessGaps, [
        { label: 'Field', value: (row) => row.key },
        { label: 'Owner', value: (row) => row.sourceLabel },
        { label: 'Surface', value: (row) => row.collectionSurface },
        { label: 'Status', value: (row) => row.status },
      ])
      : 'No blocking or vNext readiness gaps in the supplied placeholder payload.',
    '',
    '## Field Map',
    '',
    formatMarkdownTable(fieldRows, [
      { label: 'Field', value: (row) => row.key },
      { label: 'Owner', value: (row) => row.sourceLabel },
      { label: 'Surface', value: (row) => row.collectionSurface },
      { label: 'Policy', value: (row) => row.missingPolicy },
      { label: 'Value Status', value: (row) => row.status },
      { label: 'Primary Paths', value: (row) => row.primary },
      { label: 'Fallback Paths', value: (row) => row.fallback },
    ]),
    '',
    '## Downstream Contract',
    '',
    '- Company Settings owns organisation legal identity, registration, registered address, firm FFC/FSP, and organisation branding.',
    '- Agent Profile owns the assigned agent identity and individual FFC details.',
    '- Seller Onboarding owns seller identity, marital/authority answers, and property facts before the mandate setup confirmation step.',
    '- Mandate Setup owns commercial terms, commission, mandate dates, attorney selection, and special conditions.',
    '- Mandatory Disclosure owns the prescribed disclosure status and annexure metadata; legacy `property_disclosure_*` fields resolve to canonical `mandatory_disclosure_*` fields.',
    '- Signing and Document Runtime fields are generated by the packet renderer/signing runtime and should not be collected as ordinary onboarding inputs.',
    '',
  ].join('\n')
}
