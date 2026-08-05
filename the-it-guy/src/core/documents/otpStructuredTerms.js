import {
  getOtpFieldDefinition,
} from './otpFieldRegistry.js'
import {
  listOtpLegalContentTemplateSections,
} from './otpLegalContentTemplates.js'
import {
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'

export const OTP_STRUCTURED_TERMS_VERSION = 'otp_structured_terms_phase7_v1'
export const OTP_STRUCTURED_TERMS_RECORD_CONTRACT = 'otp_structured_terms_record_phase7_v1'

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

function cloneArray(value = []) {
  return Object.freeze([...(Array.isArray(value) ? value : [])])
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function termGroup({
  key,
  label,
  variants = ['resale_existing_property', 'new_development'],
  clauseFamily,
  fieldKeys = [],
  legalSectionKeys = [],
  structuredRecordType = 'field_value_record',
  required = true,
  allowedConditionTypes = [],
  renderPolicy = 'structured_record_only',
} = {}) {
  return Object.freeze({
    key,
    label,
    variants: cloneArray(variants.map(normalizeOtpDocumentVariant).filter(Boolean)),
    clauseFamily: normalizeKey(clauseFamily),
    fieldKeys: cloneArray(fieldKeys.map(normalizeKey)),
    legalSectionKeys: cloneArray(legalSectionKeys.map(normalizeKey)),
    structuredRecordType,
    required: Boolean(required),
    allowedConditionTypes: cloneArray(allowedConditionTypes.map(normalizeKey)),
    renderPolicy,
    recordContract: OTP_STRUCTURED_TERMS_RECORD_CONTRACT,
    freeTextFallbackAllowed: false,
  })
}

export const OTP_STRUCTURED_TERM_GROUPS = Object.freeze([
  termGroup({
    key: 'purchase_economics',
    label: 'Purchase economics',
    clauseFamily: 'purchase_price',
    legalSectionKeys: ['purchase_price'],
    fieldKeys: [
      'purchase_price',
      'purchase_price_words',
      'deposit_amount',
      'deposit_due_date',
      'trust_account_recipient',
    ],
  }),
  termGroup({
    key: 'finance_and_guarantees',
    label: 'Finance and guarantees',
    clauseFamily: 'suspensive_conditions',
    legalSectionKeys: ['finance_suspensive_conditions', 'transfer_conveyancer'],
    fieldKeys: [
      'finance_type',
      'bond_amount',
      'bond_approval_deadline',
      'cash_amount',
      'cash_proof_deadline',
      'guarantee_delivery_deadline',
      'guarantee_delivery_period',
    ],
  }),
  termGroup({
    key: 'structured_suspensive_conditions',
    label: 'Structured suspensive conditions',
    clauseFamily: 'suspensive_conditions',
    legalSectionKeys: ['finance_suspensive_conditions'],
    fieldKeys: ['structured_suspensive_conditions'],
    structuredRecordType: 'repeatable_condition_records',
    allowedConditionTypes: [
      'bond_approval',
      'cash_proof',
      'subject_to_sale',
      'development_document_approval',
      'counsel_approved_special_condition',
    ],
  }),
  termGroup({
    key: 'offer_validity',
    label: 'Offer validity',
    clauseFamily: 'offer_acceptance',
    legalSectionKeys: ['finance_suspensive_conditions'],
    fieldKeys: ['irrevocable_offer_expiry'],
  }),
  termGroup({
    key: 'transfer_conveyancer',
    label: 'Transfer conveyancer',
    clauseFamily: 'transfer_conveyancer',
    legalSectionKeys: ['transfer_conveyancer', 'buyer_cost_obligations'],
    fieldKeys: [
      'transfer_attorney_company_name',
      'transfer_attorney_contact_person',
      'transfer_attorney_email',
      'transfer_attorney_phone',
      'trust_account_recipient',
      'matter_attorney_cost_quote_status',
    ],
  }),
  termGroup({
    key: 'otp_commission_variation',
    label: 'OTP commission variation',
    clauseFamily: 'agency_commission',
    legalSectionKeys: ['otp_commission_variation'],
    fieldKeys: [
      'gross_commission_amount',
      'mandate_commission_snapshot',
      'otp_commission_proposal',
      'otp_commission_variation_status',
      'otp_commission_approval_reference',
    ],
    structuredRecordType: 'commission_variation_record',
  }),
  termGroup({
    key: 'buyer_cost_obligations',
    label: 'Buyer cost obligations',
    clauseFamily: 'costs',
    legalSectionKeys: ['buyer_cost_obligations'],
    fieldKeys: [
      'otp_buyer_cost_obligations',
      'otp_pending_cost_obligations',
      'matter_attorney_cost_quote_status',
    ],
    structuredRecordType: 'cost_obligation_records',
  }),
  termGroup({
    key: 'resale_subject_to_sale',
    label: 'Resale subject-to-sale terms',
    variants: ['resale_existing_property'],
    clauseFamily: 'suspensive_conditions',
    legalSectionKeys: ['subject_to_sale'],
    fieldKeys: [
      'subject_sale_property',
      'subject_sale_minimum_price',
      'subject_sale_fulfilment_date',
    ],
    required: false,
  }),
  termGroup({
    key: 'resale_occupation_rent',
    label: 'Resale occupation and occupational rent',
    variants: ['resale_existing_property'],
    clauseFamily: 'occupation_rent',
    legalSectionKeys: ['resale_occupation_rent'],
    fieldKeys: [
      'occupation_date',
      'occupational_rent_payable',
      'occupational_rent_amount',
    ],
  }),
  termGroup({
    key: 'resale_disclosure_fixtures',
    label: 'Resale disclosure and fixtures',
    variants: ['resale_existing_property'],
    clauseFamily: 'fixtures_defects_disclosure',
    legalSectionKeys: ['resale_disclosure_fixtures_compliance'],
    fieldKeys: [
      'mandatory_disclosure_status',
      'mandatory_disclosure_annexure',
      'mandatory_disclosure_comments',
      'fixtures_included',
      'fixtures_excluded',
      'compliance_certificate_schedule',
    ],
  }),
  termGroup({
    key: 'development_vat_pricing',
    label: 'New-development VAT pricing',
    variants: ['new_development'],
    clauseFamily: 'purchase_price',
    legalSectionKeys: ['development_vat_purchase_price'],
    fieldKeys: ['vat_inclusive_purchase_price'],
  }),
  termGroup({
    key: 'development_handover',
    label: 'New-development handover',
    variants: ['new_development'],
    clauseFamily: 'development_defects',
    legalSectionKeys: ['development_handover'],
    fieldKeys: [
      'occupation_date',
      'snagging_period_days',
      'contractor_company_name',
      'property_nhbrc_certificate_number',
    ],
  }),
  termGroup({
    key: 'development_levies_and_compliance',
    label: 'New-development levies and compliance',
    variants: ['new_development'],
    clauseFamily: 'body_corporate',
    legalSectionKeys: ['development_compliance_body_corporate'],
    fieldKeys: [
      'body_corporate_rules_annexure',
      'development_levy_estimate',
      'development_rates_estimate',
      'utility_connection_charges',
      'development_compliance_certificate_schedule',
    ],
  }),
])

function cloneGroup(group = {}) {
  return {
    ...group,
    variants: [...(group.variants || [])],
    fieldKeys: [...(group.fieldKeys || [])],
    legalSectionKeys: [...(group.legalSectionKeys || [])],
    allowedConditionTypes: [...(group.allowedConditionTypes || [])],
  }
}

export function listOtpStructuredTermGroups({ variant = '' } = {}) {
  const normalizedVariant = normalizeOtpDocumentVariant(variant)
  return OTP_STRUCTURED_TERM_GROUPS
    .filter((group) => !normalizedVariant || group.variants.includes(normalizedVariant))
    .map(cloneGroup)
}

function getPathValue(source = {}, path = '') {
  if (!path) return undefined
  if (Object.hasOwn(source, path)) return source[path]
  const parts = path.split('.').filter(Boolean)
  let cursor = source
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !Object.hasOwn(cursor, part)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

function firstStructuredValue(source = {}, sourcePaths = []) {
  for (const sourcePath of sourcePaths) {
    const value = getPathValue(source, sourcePath)
    if (value !== undefined && value !== null && normalizeText(value) !== '') {
      return { value, sourcePath }
    }
  }
  return { value: null, sourcePath: '' }
}

export function buildOtpStructuredTermsManifest({ variant = 'resale_existing_property' } = {}) {
  const documentVariant = normalizeOtpDocumentVariant(variant)
  const variantDefinition = OTP_DOCUMENT_VARIANTS.find((item) => item.key === documentVariant)
  const groups = listOtpStructuredTermGroups({ variant: documentVariant })
  const fieldDefinitions = groups.flatMap((group) => group.fieldKeys.map((fieldKey) => ({
    groupKey: group.key,
    fieldKey,
    definition: getOtpFieldDefinition(fieldKey),
  })))
  const sections = listOtpLegalContentTemplateSections({ variant: documentVariant })
  const sourceOwners = unique(fieldDefinitions.map((item) => item.definition?.owner))

  return {
    version: OTP_STRUCTURED_TERMS_VERSION,
    recordContract: OTP_STRUCTURED_TERMS_RECORD_CONTRACT,
    documentVariant,
    variantLabel: variantDefinition?.label || documentVariant,
    groupCount: groups.length,
    groups,
    fieldKeys: unique(fieldDefinitions.map((item) => item.fieldKey)),
    sourceOwners,
    sectionKeys: sections.map((section) => section.section_key),
    renderingBoundary: 'structured_terms_only_no_free_text_fallback',
  }
}

export function normalizeOtpStructuredTerms(source = {}, { variant = 'resale_existing_property' } = {}) {
  const manifest = buildOtpStructuredTermsManifest({ variant })
  const records = manifest.groups.flatMap((group) => group.fieldKeys.map((fieldKey) => {
    const definition = getOtpFieldDefinition(fieldKey)
    const resolved = firstStructuredValue(source, definition?.sourcePaths || [])
    return {
      contract: OTP_STRUCTURED_TERMS_RECORD_CONTRACT,
      variant: manifest.documentVariant,
      groupKey: group.key,
      groupLabel: group.label,
      fieldKey,
      label: definition?.label || fieldKey,
      owner: definition?.owner || '',
      policy: definition?.policy || '',
      sourcePath: resolved.sourcePath,
      value: resolved.value,
      missing: resolved.value === null,
      renderPolicy: group.renderPolicy,
      freeTextFallbackAllowed: false,
    }
  }))

  return {
    version: OTP_STRUCTURED_TERMS_VERSION,
    recordContract: OTP_STRUCTURED_TERMS_RECORD_CONTRACT,
    variant: manifest.documentVariant,
    records,
    missingRequiredRecords: records.filter((record) => record.missing && ['block_generation', 'conditional_required'].includes(record.policy)),
    mutatedData: false,
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

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function buildRouteAudit(variant) {
  const manifest = buildOtpStructuredTermsManifest({ variant })
  const sections = listOtpLegalContentTemplateSections({ variant })
  const sectionByKey = new Map(sections.map((section) => [section.section_key, section]))
  const fieldRegistryGaps = []
  const routeFieldGaps = []
  const sourcePathGaps = []
  const legalSectionGaps = []
  const freeTextFallbackRisks = []
  const buyerOwnedTermRisks = []

  for (const group of manifest.groups) {
    if (group.freeTextFallbackAllowed !== false || group.renderPolicy !== 'structured_record_only') freeTextFallbackRisks.push(group.key)
    for (const sectionKey of group.legalSectionKeys) {
      const section = sectionByKey.get(sectionKey)
      if (!section) {
        legalSectionGaps.push({ groupKey: group.key, sectionKey, reason: 'missing_section' })
        continue
      }
      const missingFields = group.fieldKeys.filter((fieldKey) => !section.placeholder_keys.includes(fieldKey))
      if (missingFields.length === group.fieldKeys.length) {
        legalSectionGaps.push({ groupKey: group.key, sectionKey, reason: 'no_group_fields_in_section', missingFields })
      }
    }
    for (const fieldKey of group.fieldKeys) {
      const definition = getOtpFieldDefinition(fieldKey)
      if (!definition) {
        fieldRegistryGaps.push({ groupKey: group.key, fieldKey })
        continue
      }
      if (!definition.variants.includes(manifest.documentVariant)) {
        routeFieldGaps.push({ groupKey: group.key, fieldKey, variants: definition.variants })
      }
      if (!definition.sourcePaths?.length) {
        sourcePathGaps.push({ groupKey: group.key, fieldKey })
      }
      if (definition.owner === 'buyer_onboarding') {
        buyerOwnedTermRisks.push({ groupKey: group.key, fieldKey })
      }
    }
  }

  return {
    variant: manifest.documentVariant,
    label: manifest.variantLabel,
    manifest,
    fieldRegistryGaps,
    routeFieldGaps,
    sourcePathGaps,
    legalSectionGaps,
    freeTextFallbackRisks,
    buyerOwnedTermRisks,
  }
}

export function buildOtpStructuredTermsAudit({ checkedAt = new Date().toISOString() } = {}) {
  const routeAudits = OTP_DOCUMENT_VARIANTS.map((variant) => buildRouteAudit(variant.key))
  const resaleManifest = routeAudits.find((audit) => audit.variant === 'resale_existing_property')?.manifest
  const developmentManifest = routeAudits.find((audit) => audit.variant === 'new_development')?.manifest
  const checks = []
  const fieldRegistryGaps = routeAudits.flatMap((audit) => audit.fieldRegistryGaps.map((gap) => ({ ...gap, variant: audit.variant })))
  const routeFieldGaps = routeAudits.flatMap((audit) => audit.routeFieldGaps.map((gap) => ({ ...gap, variant: audit.variant })))
  const sourcePathGaps = routeAudits.flatMap((audit) => audit.sourcePathGaps.map((gap) => ({ ...gap, variant: audit.variant })))
  const legalSectionGaps = routeAudits.flatMap((audit) => audit.legalSectionGaps.map((gap) => ({ ...gap, variant: audit.variant })))
  const freeTextFallbackRisks = routeAudits.flatMap((audit) => audit.freeTextFallbackRisks.map((groupKey) => ({ groupKey, variant: audit.variant })))
  const buyerOwnedTermRisks = routeAudits.flatMap((audit) => audit.buyerOwnedTermRisks.map((risk) => ({ ...risk, variant: audit.variant })))
  const conditionGroup = OTP_STRUCTURED_TERM_GROUPS.find((group) => group.key === 'structured_suspensive_conditions')

  addCheck(checks, routeAudits.length === 2, 'PHASE7_STRUCTURED_TERMS_BOTH_ROUTES_PRESENT', 'Structured terms resolve both resale and new-development routes.')
  addCheck(checks, Boolean(resaleManifest?.groups.some((group) => group.key === 'resale_occupation_rent')) && !resaleManifest?.groups.some((group) => group.key === 'development_handover'), 'PHASE7_RESALE_TERMS_STAY_RESALE_ONLY', 'Resale occupation, subject-to-sale and disclosure terms stay out of the development route.')
  addCheck(checks, Boolean(developmentManifest?.groups.some((group) => group.key === 'development_vat_pricing')) && !developmentManifest?.groups.some((group) => group.key === 'resale_occupation_rent'), 'PHASE7_DEVELOPMENT_TERMS_STAY_DEVELOPMENT_ONLY', 'Development VAT, handover and levy terms stay out of the resale route.')
  addCheck(checks, fieldRegistryGaps.length === 0, 'PHASE7_STRUCTURED_TERMS_IN_FIELD_REGISTRY', fieldRegistryGaps.length ? `Missing fields: ${fieldRegistryGaps.map((gap) => gap.fieldKey).join(', ')}` : 'Every structured term field is registered.')
  addCheck(checks, routeFieldGaps.length === 0, 'PHASE7_STRUCTURED_TERMS_ROUTE_ELIGIBLE', routeFieldGaps.length ? `Route gaps: ${routeFieldGaps.map((gap) => `${gap.variant}:${gap.fieldKey}`).join(', ')}` : 'Every structured term field is route eligible.')
  addCheck(checks, sourcePathGaps.length === 0, 'PHASE7_STRUCTURED_TERMS_HAVE_SOURCE_PATHS', sourcePathGaps.length ? `Missing source paths: ${sourcePathGaps.map((gap) => gap.fieldKey).join(', ')}` : 'Every structured term has a source path.')
  addCheck(checks, legalSectionGaps.length === 0, 'PHASE7_STRUCTURED_TERMS_BOUND_TO_LEGAL_SECTIONS', legalSectionGaps.length ? `Section gaps: ${legalSectionGaps.map((gap) => `${gap.variant}:${gap.groupKey}`).join(', ')}` : 'Every structured term group is bound to a route legal section.')
  addCheck(checks, freeTextFallbackRisks.length === 0, 'PHASE7_NO_FREE_TEXT_TERM_FALLBACKS', freeTextFallbackRisks.length ? `Free-text risks: ${freeTextFallbackRisks.map((risk) => `${risk.variant}:${risk.groupKey}`).join(', ')}` : 'Structured commercial terms do not allow free-text renderer fallbacks.')
  addCheck(checks, buyerOwnedTermRisks.length === 0, 'PHASE7_BUYER_ONBOARDING_NOT_TERMS_SOURCE', buyerOwnedTermRisks.length ? `Buyer-owned term risks: ${buyerOwnedTermRisks.map((risk) => risk.fieldKey).join(', ')}` : 'Buyer onboarding does not own structured OTP commercial terms.')
  addCheck(checks, conditionGroup?.structuredRecordType === 'repeatable_condition_records' && conditionGroup.allowedConditionTypes.includes('bond_approval') && conditionGroup.allowedConditionTypes.includes('subject_to_sale'), 'PHASE7_SUSPENSIVE_CONDITIONS_ARE_REPEATABLE_RECORDS', 'Suspensive conditions are repeatable structured records with approved condition types.')

  const blockers = checks.filter((check) => !check.pass)

  return {
    version: OTP_STRUCTURED_TERMS_VERSION,
    recordContract: OTP_STRUCTURED_TERMS_RECORD_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_STRUCTURED_TERMS_REMEDIATION_REQUIRED' : 'OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING',
    summary: {
      routeCount: routeAudits.length,
      groupCount: OTP_STRUCTURED_TERM_GROUPS.length,
      resaleGroupCount: resaleManifest?.groupCount || 0,
      developmentGroupCount: developmentManifest?.groupCount || 0,
      structuredFieldCount: unique(routeAudits.flatMap((audit) => audit.manifest.fieldKeys)).length,
      blockerCount: blockers.length,
    },
    checks,
    routeAudits,
    blockers,
    fieldRegistryGaps,
    routeFieldGaps,
    sourcePathGaps,
    legalSectionGaps,
    freeTextFallbackRisks,
    buyerOwnedTermRisks,
  }
}

export function formatOtpStructuredTermsAuditMarkdown(report = buildOtpStructuredTermsAudit()) {
  return [
    '# OTP Template vNext Phase 7 Structured Terms',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Record contract: ${report.recordContract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Structured term groups', report.summary.groupCount],
        ['Resale groups', report.summary.resaleGroupCount],
        ['New-development groups', report.summary.developmentGroupCount],
        ['Unique structured fields', report.summary.structuredFieldCount],
        ['Blockers', report.summary.blockerCount],
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
    '## Route Manifests',
    '',
    table(
      ['Route', 'Groups', 'Fields', 'Source Owners', 'Boundary'],
      report.routeAudits.map((audit) => [
        audit.label,
        audit.manifest.groups.map((group) => group.key).join(', '),
        audit.manifest.fieldKeys.join(', '),
        audit.manifest.sourceOwners.join(', '),
        audit.manifest.renderingBoundary,
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 7 locks structured OTP commercial terms and condition records. It does not render the final PDF, approve counsel wording, mutate source data, or replace the later renderer visual QA phase.',
    '',
  ].join('\n')
}
