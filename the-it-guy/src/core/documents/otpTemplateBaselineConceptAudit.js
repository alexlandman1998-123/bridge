import {
  getCanonicalMergeFieldDefinition,
  resolveCanonicalMergeFieldKey,
  suggestCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'

export const OTP_TEMPLATE_BASELINE_CONCEPT_AUDIT_VERSION = 'otp_template_vnext_phase1_baseline_concept_audit_v1'

export const OTP_BASELINE_CONCEPT_REQUIREMENTS = Object.freeze([
  {
    key: 'offer_acceptance_framework',
    label: 'Offer, acceptance and deed-of-sale framework',
    required: true,
    phrases: ['offer to purchase', 'accepted by the seller', 'deed of sale', 'one agreement'],
    tokens: [],
    recommendation: 'Make the opening wording clearly explain that the OTP becomes a deed of sale once accepted in writing, and that schedules, standard terms, special conditions and annexures form one agreement.',
  },
  {
    key: 'party_capacity_authority',
    label: 'Buyer and seller capacity / authority',
    required: true,
    phrases: ['authority', 'resolution', 'trustee', 'representative capacity', 'spouse consent'],
    tokens: [
      'buyer_representative_name',
      'buyer_representative_capacity',
      'seller_representative_name',
      'seller_representative_capacity',
    ],
    recommendation: 'Keep conditional company, trust and spouse-consent routes, but ensure the legal text requires authority evidence instead of simply rendering empty factual rows.',
  },
  {
    key: 'property_identification',
    label: 'Property identification',
    required: true,
    phrases: ['erf', 'sectional title', 'unit', 'property address', 'exclusive use'],
    tokens: ['property_address', 'property_unit_number', 'erf_number', 'property_section_number', 'sectional_title_number'],
    recommendation: 'Confirm whether OTP vNext needs separate full-title and sectional-title property sections, rather than a single generic property block.',
  },
  {
    key: 'purchase_economics',
    label: 'Purchase economics',
    required: true,
    phrases: ['purchase price', 'deposit', 'balance', 'guarantee'],
    tokens: ['purchase_price', 'deposit_amount', 'bond_amount', 'cash_amount'],
    recommendation: 'Separate fixed payment wording from factual commercial values: purchase price, deposit, bond/cash split, guarantees and payment deadlines.',
  },
  {
    key: 'finance_suspensive_conditions',
    label: 'Finance and suspensive conditions',
    required: true,
    phrases: ['bond approval', 'suspensive condition', 'cash sale', 'guarantee'],
    tokens: ['finance_type', 'bond_amount', 'cash_amount', 'suspensive_conditions'],
    recommendation: 'Model bond, cash and hybrid finance as routes; only special finance wording should remain editable/free-text.',
  },
  {
    key: 'occupation_occupational_rent',
    label: 'Occupation and occupational rent',
    required: true,
    phrases: ['occupation', 'occupational rent', 'possession', 'risk and benefit'],
    tokens: ['occupation_date'],
    recommendation: 'Add a controlled occupation clause with occupation date, occupational rent and risk/benefit treatment where applicable.',
  },
  {
    key: 'transfer_conveyancer',
    label: 'Transfer and conveyancer',
    required: true,
    phrases: ['transfer', 'conveyancer', 'transfer attorney', 'registration of transfer'],
    tokens: ['transfer_date', 'attorney_firm_name', 'conveyancer_name', 'conveyancer_email'],
    recommendation: 'Confirm transfer attorney nomination, transfer timing and buyer cooperation obligations in the OTP wording.',
  },
  {
    key: 'mandatory_disclosure_annexure',
    label: 'Mandatory disclosure annexure',
    required: true,
    phrases: ['mandatory disclosure', 'disclosure form', 'annexure'],
    tokens: ['mandatory_disclosure_status', 'mandatory_disclosure_annexure'],
    recommendation: 'Carry the signed mandatory disclosure form into the OTP as an annexure/status reference without making blank merge fields visible.',
  },
  {
    key: 'fixtures_fittings_defects',
    label: 'Fixtures, fittings and defects',
    required: true,
    phrases: ['fixtures', 'fittings', 'defects', 'voetstoots', 'as is'],
    tokens: [],
    recommendation: 'Decide whether fixtures/fittings and defect disclosure are standard text, annexure-driven, or special-condition driven.',
  },
  {
    key: 'compliance_costs_risk',
    label: 'Compliance certificates, costs and risk',
    required: true,
    phrases: ['electrical compliance', 'compliance certificate', 'rates clearance', 'levies', 'transfer costs'],
    tokens: ['additional_costs_note'],
    recommendation: 'Add controlled wording for compliance certificates, rates/levies, transfer costs and risk allocation.',
  },
  {
    key: 'special_conditions_annexures',
    label: 'Special conditions and annexures',
    required: true,
    phrases: ['special conditions', 'annexure', 'annexures'],
    tokens: ['special_conditions', 'annexures_list'],
    recommendation: 'Keep special conditions, but require an approved empty-state or hide the section when no special conditions are captured.',
  },
  {
    key: 'signature_execution',
    label: 'Signature and execution',
    required: true,
    phrases: ['signature', 'signed', 'capacity', 'date'],
    tokens: ['buyer_full_name', 'seller_full_name'],
    recommendation: 'Preserve the current signing layout while ensuring all required buyer, seller, spouse and representative signature roles are route-aware.',
  },
])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function key(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function uniq(values = []) {
  return Array.from(new Set(values.map((value) => text(value)).filter(Boolean)))
}

function firstNonEmptyLine(value = '') {
  return text(value).split(/\r?\n/).map((line) => text(line)).find(Boolean) || ''
}

function extractTokens(value = '') {
  return [...String(value || '').matchAll(/{{\s*([^{}]+?)\s*}}/g)]
    .map((match) => key(match[1]))
    .filter(Boolean)
}

function metadataOf(value = {}) {
  return record(value.metadata_json || value.metadataJson || value.metadata)
}

function conditionOf(section = {}) {
  return record(section.condition_json || section.conditionJson || section.visibilityRules || metadataOf(section).condition_json)
}

function hasCondition(section = {}) {
  const condition = conditionOf(section)
  if (!Object.keys(condition).length) return false
  if (text(condition.field || condition.key || condition.path)) return true
  const rule = record(condition.rule)
  return Boolean(text(rule.field || rule.key || rule.path) || Array.isArray(condition.all) || Array.isArray(condition.any))
}

export function normalizeOtpBaselineSection(section = {}, index = 0) {
  const metadata = metadataOf(section)
  const legalText = text(section.legal_text ?? section.legalText ?? section.content ?? metadata.legal_text)
  const sectionKey = key(section.section_key || section.sectionKey || section.key || `section_${index + 1}`)
  const sectionLabel = text(section.section_label || section.sectionLabel || section.label || sectionKey || `Section ${index + 1}`)
  const sectionType = key(section.section_type || section.sectionType || section.type || 'legal_text') || 'legal_text'
  const placeholderKeys = uniq([
    ...array(section.placeholder_keys || section.placeholderKeys).map(key),
    ...array(section.placeholders).map((item) => Array.isArray(item) ? key(item[0]) : key(item)),
    ...extractTokens(legalText),
  ])
  const sortOrder = Number.isFinite(Number(section.sort_order ?? section.sortOrder))
    ? Number(section.sort_order ?? section.sortOrder)
    : index
  const renderedHeading = firstNonEmptyLine(legalText) || sectionLabel

  return {
    id: text(section.id) || null,
    sectionKey,
    sectionLabel,
    renderedHeading,
    sectionType,
    sortOrder,
    isRequired: section.is_required === undefined ? Boolean(section.required) : Boolean(section.is_required),
    isRepeatable: Boolean(section.is_repeatable || section.isRepeatable),
    conditionJson: conditionOf(section),
    hasCondition: hasCondition(section) || typeof section.condition === 'function',
    placeholderKeys,
    legalText,
    lineCount: legalText ? legalText.split(/\r?\n/).length : 0,
    wordCount: legalText ? legalText.split(/\s+/).filter(Boolean).length : 0,
    metadataJson: metadata,
  }
}

function normalizeSections(template = {}, sections = []) {
  const source = array(sections).length ? sections : array(template.sections)
  return source
    .map((section, index) => normalizeOtpBaselineSection(section, index))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.sectionKey.localeCompare(right.sectionKey))
}

function buildHeadingIssues(sections = []) {
  const internalPattern = /\b(packet|pack)\b/i
  const hasTechnicalRouteHeading = (section = {}) => (
    /(^|_)entity_clause(_|$)/i.test(section.sectionKey) ||
    /\bclause\b/i.test(`${section.sectionLabel} ${section.renderedHeading}`)
  )
  return sections
    .filter((section) => internalPattern.test(`${section.sectionLabel} ${section.renderedHeading}`) || hasTechnicalRouteHeading(section))
    .map((section) => ({
      code: internalPattern.test(`${section.sectionLabel} ${section.renderedHeading}`)
        ? 'CLIENT_FACING_PACKET_OR_PACK_HEADING'
        : 'TECHNICAL_ROUTE_HEADING',
      sectionKey: section.sectionKey,
      sectionLabel: section.sectionLabel,
      renderedHeading: section.renderedHeading,
      recommendedHeading: section.sectionLabel
        .replace(/\s+(Packet|Pack|Clause)\b/gi, '')
        .replace(/^Entity\s+/i, '')
        .trim() || section.sectionLabel,
      severity: 'warning',
      detail: 'Client-facing OTP headings should describe the legal/commercial topic, not internal routing mechanics.',
    }))
}

function buildBlankRenderRisks(sections = []) {
  const risks = []
  for (const section of sections) {
    const lines = section.legalText.split(/\r?\n/).map((line) => text(line)).filter(Boolean)
    const placeholderOnlyLines = lines.filter((line) => /^{{\s*[^{}]+?\s*}}$/.test(line))
    const labelPlaceholderLines = lines.filter((line) => /:\s*{{\s*[^{}]+?\s*}}\s*$/.test(line))
    const blankSafeSection = Boolean(
      section.hasCondition ||
        section.metadataJson?.hide_when_empty ||
        section.metadataJson?.hideWhenEmpty ||
        section.metadataJson?.blank_safe ||
        section.metadataJson?.blankSafe,
    )
    const blankSafeRows = Boolean(
      section.metadataJson?.hide_empty_rows ||
        section.metadataJson?.hideEmptyRows ||
        section.metadataJson?.blank_safe_rows ||
        section.metadataJson?.blankSafeRows,
    )
    if (!section.isRequired && section.placeholderKeys.length && !blankSafeSection) {
      risks.push({
        code: 'OPTIONAL_SECTION_CAN_RENDER_EMPTY',
        sectionKey: section.sectionKey,
        sectionLabel: section.sectionLabel,
        severity: 'warning',
        detail: 'Optional OTP section has placeholders and needs a hide-or-approved-empty-state rule.',
        placeholders: section.placeholderKeys,
      })
    }
    if (placeholderOnlyLines.length) {
      risks.push({
        code: 'PLACEHOLDER_ONLY_LINE',
        sectionKey: section.sectionKey,
        sectionLabel: section.sectionLabel,
        severity: 'warning',
        detail: 'Placeholder-only lines can become blank legal whitespace when optional values are missing.',
        examples: placeholderOnlyLines.slice(0, 3),
      })
    }
    if (labelPlaceholderLines.length >= 3 && !section.hasCondition && !blankSafeRows) {
      risks.push({
        code: 'UNCONDITIONED_FIELD_BLOCK',
        sectionKey: section.sectionKey,
        sectionLabel: section.sectionLabel,
        severity: 'watch',
        detail: 'Unconditioned labelled fields should hide missing optional rows or block when legally required.',
        examples: labelPlaceholderLines.slice(0, 3),
      })
    }
  }
  return risks
}

function buildMergeFieldAudit(sections = []) {
  const sectionByToken = new Map()
  for (const section of sections) {
    for (const token of section.placeholderKeys) {
      const rows = sectionByToken.get(token) || []
      rows.push(section.sectionKey)
      sectionByToken.set(token, rows)
    }
  }

  const tokens = [...sectionByToken.keys()].sort()
  const registry = validateTemplateTokensAgainstRegistry({ tokens, packetType: 'otp' })
  const deprecatedByToken = new Map(registry.deprecated.map((row) => [row.token, row]))
  const unknownByToken = new Map(registry.unknown.map((row) => [row.token, row]))
  const fields = tokens.map((token) => {
    const canonicalKey = resolveCanonicalMergeFieldKey(token, { packetType: 'otp' })
    const definition = canonicalKey ? getCanonicalMergeFieldDefinition(canonicalKey, { packetType: 'otp' }) : null
    const unknown = unknownByToken.get(token)
    const deprecated = deprecatedByToken.get(token)
    return {
      token,
      canonicalKey: canonicalKey || null,
      status: unknown ? 'unknown' : deprecated ? 'alias_or_noncanonical' : 'canonical',
      category: definition?.category || null,
      required: Boolean(definition?.required),
      source: definition?.dataSource || null,
      suggested: unknown?.suggested || suggestCanonicalMergeFieldKey(token, { packetType: 'otp' }) || null,
      sections: uniq(sectionByToken.get(token)),
    }
  })

  const tokensSet = new Set(tokens)
  const minimisationCandidates = [
    {
      code: 'ROUTE_FLAGS_SHOULD_NOT_RENDER_AS_FACTS',
      fields: ['finance_type', 'buyer_spouse_consent_required', 'seller_spouse_consent_required'].filter((field) => tokensSet.has(field)),
      recommendation: 'Use these to choose clauses/routes; avoid printing them as bare factual rows unless counsel wants them visible.',
    },
    {
      code: 'FREE_TEXT_BLOCKS_NEED_APPROVED_EMPTY_STATE',
      fields: ['special_conditions', 'suspensive_conditions', 'annexures_list'].filter((field) => tokensSet.has(field)),
      recommendation: 'Keep only genuinely deal-specific text as merge data; standard legal paragraphs should be fixed template wording.',
    },
    {
      code: 'DISCLOSURE_FIELDS_SHOULD_BE_ANNEXURE_REFERENCES',
      fields: ['mandatory_disclosure_status', 'mandatory_disclosure_annexure', 'mandatory_disclosure_comments'].filter((field) => tokensSet.has(field)),
      recommendation: 'Use disclosure values as annexure/status references; the actual disclosure form should remain an attached evidence artifact.',
    },
  ].filter((item) => item.fields.length)

  return {
    tokenCount: tokens.length,
    canonicalCount: fields.filter((field) => field.status === 'canonical').length,
    aliasCount: fields.filter((field) => field.status === 'alias_or_noncanonical').length,
    unknownCount: fields.filter((field) => field.status === 'unknown').length,
    fields,
    deprecated: registry.deprecated,
    unknown: registry.unknown,
    missingRequired: registry.missingRequired,
    minimisationCandidates,
  }
}

function includesAny(haystack = '', phrases = []) {
  const source = lower(haystack)
  return phrases.some((phrase) => source.includes(lower(phrase)))
}

function buildConceptAudit(sections = []) {
  const allText = sections.map((section) => `${section.sectionLabel}\n${section.legalText}`).join('\n\n')
  const tokenSet = new Set(sections.flatMap((section) => section.placeholderKeys))
  const concepts = OTP_BASELINE_CONCEPT_REQUIREMENTS.map((concept) => {
    const matchedPhrases = concept.phrases.filter((phrase) => includesAny(allText, [phrase]))
    const matchedTokens = concept.tokens.filter((token) => tokenSet.has(token))
    const phraseCovered = concept.phrases.length === 0 || matchedPhrases.length > 0
    const tokenCovered = concept.tokens.length === 0 || matchedTokens.length > 0
    const routeCovered = phraseCovered && tokenCovered
    const partial = matchedPhrases.length > 0 || matchedTokens.length > 0
    return {
      key: concept.key,
      label: concept.label,
      required: concept.required,
      status: routeCovered ? 'covered' : partial ? 'partial' : 'missing',
      matchedPhrases,
      matchedTokens,
      missingTokens: concept.tokens.filter((token) => !tokenSet.has(token)),
      recommendation: concept.recommendation,
    }
  })

  return {
    conceptCount: concepts.length,
    coveredCount: concepts.filter((concept) => concept.status === 'covered').length,
    partialCount: concepts.filter((concept) => concept.status === 'partial').length,
    missingCount: concepts.filter((concept) => concept.status === 'missing').length,
    concepts,
  }
}

function buildSectionInventory(sections = []) {
  return sections.map((section) => ({
    sortOrder: section.sortOrder,
    sectionKey: section.sectionKey,
    sectionLabel: section.sectionLabel,
    renderedHeading: section.renderedHeading,
    sectionType: section.sectionType,
    required: section.isRequired,
    conditional: section.hasCondition,
    placeholderCount: section.placeholderKeys.length,
    wordCount: section.wordCount,
  }))
}

function buildVisualBaseline(sections = [], template = {}) {
  const signatureSections = sections.filter((section) => section.sectionType === 'signature_zone' || /signature/i.test(section.sectionKey))
  return {
    templateId: text(template.id) || null,
    templateKey: text(template.template_key || template.templateKey) || null,
    versionTag: text(template.version_tag || template.versionTag) || null,
    sectionCount: sections.length,
    requiredSectionCount: sections.filter((section) => section.isRequired).length,
    conditionalSectionCount: sections.filter((section) => section.hasCondition).length,
    signatureSectionCount: signatureSections.length,
    totalWordCount: sections.reduce((sum, section) => sum + section.wordCount, 0),
    sectionSequence: sections.map((section) => section.sectionKey),
    layoutPreservationNotes: [
      'Use this OTP section sequence as the Phase 1 baseline before vNext wording changes.',
      'Preserve the existing top-left logo, top-right organisation/contact detail block and footer treatment during wording changes.',
      'Keep signature geometry stable; route-aware extra signers should be added through signing layout rules, not ad hoc PDF spacing.',
      'Tighten wording in compact sections so the current polished PDF rhythm is preserved and improved rather than reset.',
    ],
  }
}

function buildRecommendedActions({ conceptAudit = {}, headingIssues = [], blankRenderRisks = [], mergeFieldAudit = {} } = {}) {
  const actions = []
  const conceptByKey = new Map((conceptAudit.concepts || []).map((concept) => [concept.key, concept]))
  for (const conceptKey of ['offer_acceptance_framework', 'purchase_economics', 'finance_suspensive_conditions', 'mandatory_disclosure_annexure']) {
    const concept = conceptByKey.get(conceptKey)
    if (concept && concept.status !== 'covered') {
      actions.push({
        phase: 4,
        priority: 'P0',
        action: concept.recommendation,
      })
    }
  }
  if (mergeFieldAudit.aliasCount || mergeFieldAudit.unknownCount || mergeFieldAudit.minimisationCandidates?.length) {
    actions.push({
      phase: 2,
      priority: 'P0',
      action: 'Normalise OTP merge fields and remove clause text from data fields before vNext wording is drafted.',
    })
  }
  if (headingIssues.length) {
    actions.push({
      phase: 4,
      priority: 'P1',
      action: 'Rename technical OTP headings while preserving internal section keys and routing rules.',
    })
  }
  if (blankRenderRisks.length) {
    actions.push({
      phase: 5,
      priority: 'P1',
      action: 'Add hide-empty-row/section rendering rules and approved empty-state wording for optional OTP sections.',
    })
  }
  for (const concept of conceptAudit.concepts || []) {
    if (concept.required && concept.status === 'missing' && !actions.some((item) => item.action === concept.recommendation)) {
      actions.push({
        phase: 4,
        priority: 'P1',
        action: concept.recommendation,
      })
    }
  }
  return actions
}

export function buildOtpTemplateBaselineConceptAudit({ template = {}, sections = [], checkedAt = new Date().toISOString() } = {}) {
  const normalizedSections = normalizeSections(template, sections)
  const mergeFieldAudit = buildMergeFieldAudit(normalizedSections)
  const headingIssues = buildHeadingIssues(normalizedSections)
  const blankRenderRisks = buildBlankRenderRisks(normalizedSections)
  const conceptAudit = buildConceptAudit(normalizedSections)
  const visualBaseline = buildVisualBaseline(normalizedSections, template)
  const recommendedActions = buildRecommendedActions({
    conceptAudit,
    headingIssues,
    blankRenderRisks,
    mergeFieldAudit,
  })
  const remediationRequired = conceptAudit.concepts.some((concept) => concept.required && concept.status !== 'covered') ||
    mergeFieldAudit.unknownCount > 0 ||
    headingIssues.length > 0 ||
    blankRenderRisks.length > 0

  return {
    version: OTP_TEMPLATE_BASELINE_CONCEPT_AUDIT_VERSION,
    status: remediationRequired ? 'OTP_VNEXT_CONCEPT_REMEDIATION_REQUIRED' : 'OTP_BASELINE_CONCEPT_AUDIT_READY',
    mutatedData: false,
    checkedAt,
    template: {
      id: text(template.id) || null,
      templateKey: text(template.template_key || template.templateKey) || null,
      label: text(template.template_label || template.templateLabel) || null,
      packetType: text(template.packet_type || template.packetType) || 'otp',
      status: text(template.status) || null,
      isActive: template.is_active === true || template.isActive === true,
      isDefault: template.is_default === true || template.isDefault === true,
      versionTag: text(template.version_tag || template.versionTag) || null,
      metadata: metadataOf(template),
    },
    visualBaseline,
    sectionInventory: buildSectionInventory(normalizedSections),
    mergeFieldAudit,
    conceptAudit,
    headingIssues,
    blankRenderRisks,
    recommendedActions,
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

function yesNo(value) {
  return value ? 'yes' : 'no'
}

export function formatOtpTemplateBaselineConceptAuditMarkdown(audit = {}) {
  const lines = []
  lines.push('# OTP Template vNext Phase 1 Baseline + Concept Audit')
  lines.push('')
  lines.push(`Generated: ${text(audit.checkedAt)}`)
  lines.push(`Status: ${text(audit.status)}`)
  lines.push(`Mutated data: ${audit.mutatedData === false ? 'false' : 'unknown'}`)
  lines.push('')
  lines.push('## Template')
  lines.push('')
  lines.push(table(
    ['Field', 'Value'],
    [
      ['Template ID', audit.template?.id || ''],
      ['Template key', audit.template?.templateKey || ''],
      ['Label', audit.template?.label || ''],
      ['Status', audit.template?.status || ''],
      ['Active/default', `${yesNo(audit.template?.isActive)} / ${yesNo(audit.template?.isDefault)}`],
      ['Version tag', audit.template?.versionTag || ''],
    ],
  ))
  lines.push('')
  lines.push('## Visual Baseline')
  lines.push('')
  lines.push(table(
    ['Metric', 'Value'],
    [
      ['Sections', audit.visualBaseline?.sectionCount],
      ['Required sections', audit.visualBaseline?.requiredSectionCount],
      ['Conditional sections', audit.visualBaseline?.conditionalSectionCount],
      ['Signature sections', audit.visualBaseline?.signatureSectionCount],
      ['Total wording word count', audit.visualBaseline?.totalWordCount],
    ],
  ))
  lines.push('')
  lines.push('Section sequence:')
  lines.push('')
  lines.push((audit.visualBaseline?.sectionSequence || []).map((item, index) => `${index + 1}. ${item}`).join('\n'))
  lines.push('')
  lines.push('Layout preservation notes:')
  lines.push('')
  lines.push((audit.visualBaseline?.layoutPreservationNotes || []).map((item) => `- ${item}`).join('\n'))
  lines.push('')
  lines.push('## Section Inventory')
  lines.push('')
  lines.push(table(
    ['Order', 'Key', 'Label', 'Rendered heading', 'Type', 'Required', 'Conditional', 'Fields', 'Words'],
    (audit.sectionInventory || []).map((section) => [
      section.sortOrder,
      section.sectionKey,
      section.sectionLabel,
      section.renderedHeading,
      section.sectionType,
      yesNo(section.required),
      yesNo(section.conditional),
      section.placeholderCount,
      section.wordCount,
    ]),
  ))
  lines.push('')
  lines.push('## Concept Coverage')
  lines.push('')
  lines.push(`Total: ${audit.conceptAudit?.conceptCount || 0}; covered: ${audit.conceptAudit?.coveredCount || 0}; partial: ${audit.conceptAudit?.partialCount || 0}; missing: ${audit.conceptAudit?.missingCount || 0}`)
  lines.push('')
  lines.push(table(
    ['Concept', 'Status', 'Matched fields', 'Recommendation'],
    (audit.conceptAudit?.concepts || []).map((concept) => [
      concept.label,
      concept.status,
      (concept.matchedTokens || []).join(', '),
      concept.recommendation,
    ]),
  ))
  lines.push('')
  lines.push('## Merge Fields')
  lines.push('')
  lines.push(`Total: ${audit.mergeFieldAudit?.tokenCount || 0}; canonical: ${audit.mergeFieldAudit?.canonicalCount || 0}; alias/non-canonical: ${audit.mergeFieldAudit?.aliasCount || 0}; unknown: ${audit.mergeFieldAudit?.unknownCount || 0}`)
  lines.push('')
  lines.push(table(
    ['Token', 'Canonical', 'Status', 'Source', 'Sections'],
    (audit.mergeFieldAudit?.fields || []).map((field) => [
      field.token,
      field.canonicalKey || field.suggested || '',
      field.status,
      field.source || '',
      (field.sections || []).join(', '),
    ]),
  ))
  if (audit.mergeFieldAudit?.minimisationCandidates?.length) {
    lines.push('')
    lines.push('### Merge-Field Minimisation')
    lines.push('')
    lines.push(table(
      ['Code', 'Fields', 'Recommendation'],
      audit.mergeFieldAudit.minimisationCandidates.map((item) => [
        item.code,
        (item.fields || []).join(', '),
        item.recommendation,
      ]),
    ))
  }
  lines.push('')
  lines.push('## Heading Issues')
  lines.push('')
  lines.push(table(
    ['Code', 'Section', 'Current', 'Recommended'],
    (audit.headingIssues || []).map((issue) => [
      issue.code,
      issue.sectionKey,
      issue.sectionLabel,
      issue.recommendedHeading,
    ]),
  ))
  lines.push('')
  lines.push('## Blank / Irrelevant Render Risks')
  lines.push('')
  lines.push(table(
    ['Code', 'Section', 'Severity', 'Detail'],
    (audit.blankRenderRisks || []).map((risk) => [
      risk.code,
      risk.sectionKey,
      risk.severity,
      risk.detail,
    ]),
  ))
  lines.push('')
  lines.push('## Recommended Next Actions')
  lines.push('')
  lines.push(table(
    ['Phase', 'Priority', 'Action'],
    (audit.recommendedActions || []).map((item) => [item.phase, item.priority, item.action]),
  ))
  lines.push('')
  return `${lines.join('\n')}\n`
}
