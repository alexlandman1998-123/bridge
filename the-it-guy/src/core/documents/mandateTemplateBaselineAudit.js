import {
  getCanonicalMergeFieldDefinition,
  resolveCanonicalMergeFieldKey,
  suggestCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'

export const MANDATE_TEMPLATE_BASELINE_AUDIT_VERSION = 'mandate_template_vnext_phase1_baseline_audit_v1'

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

export function normalizeMandateBaselineSection(section = {}, index = 0) {
  const metadata = metadataOf(section)
  const legalText = text(section.legal_text ?? section.legalText ?? section.content ?? metadata.legal_text)
  const sectionKey = key(section.section_key || section.sectionKey || section.key || `section_${index + 1}`)
  const sectionLabel = text(section.section_label || section.sectionLabel || section.label || sectionKey || `Section ${index + 1}`)
  const sectionType = key(section.section_type || section.sectionType || section.type || 'legal_text') || 'legal_text'
  const placeholderKeys = uniq([
    ...array(section.placeholder_keys || section.placeholderKeys).map(key),
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
    hasCondition: hasCondition(section),
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
    .map((section, index) => normalizeMandateBaselineSection(section, index))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.sectionKey.localeCompare(right.sectionKey))
}

function headingRecommendation(section = {}) {
  const bySectionKey = {
    seller_individual_capacity_pack: 'Seller Capacity',
    seller_company_authority_pack: 'Company Seller Authority',
    seller_trust_authority_pack: 'Trust Seller Authority',
    seller_spouse_consent_pack: 'Spouse Consent',
    property_full_title_pack: 'Full Title Property Details',
    property_sectional_title_pack: 'Sectional Title Property Details',
  }
  if (bySectionKey[section.sectionKey]) return bySectionKey[section.sectionKey]

  const current = text(section.sectionLabel)
  const rendered = text(section.renderedHeading)
  const candidates = [
    [current, current.replace(/\s+Pack\b/gi, '')],
    [rendered, rendered.replace(/\s+PACK\b/gi, '')],
  ]
  const changed = candidates.find(([from, to]) => from && to && from !== to)
  if (!changed) return ''
  return changed[1]
    .replace(/^Seller Individual Capacity$/i, 'Seller Capacity')
    .replace(/^Seller Company Authority$/i, 'Company Seller Authority')
    .replace(/^Seller Trust Authority$/i, 'Trust Seller Authority')
    .replace(/^Property Full Title$/i, 'Full Title Property Details')
    .replace(/^Property Sectional Title$/i, 'Sectional Title Property Details')
}

function buildHeadingIssues(sections = []) {
  return sections
    .filter((section) => /\bpack\b/i.test(`${section.sectionLabel} ${section.renderedHeading}`))
    .map((section) => ({
      code: 'CLIENT_FACING_PACK_HEADING',
      sectionKey: section.sectionKey,
      sectionLabel: section.sectionLabel,
      renderedHeading: section.renderedHeading,
      recommendedHeading: headingRecommendation(section) || section.sectionLabel,
      severity: 'warning',
      detail: 'Client-facing headings should not expose internal packet/pack language.',
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
        detail: 'Optional section has placeholders and needs a hide-or-approved-empty-state rule.',
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
  const registry = validateTemplateTokensAgainstRegistry({ tokens, packetType: 'mandate' })
  const deprecatedByToken = new Map(registry.deprecated.map((row) => [row.token, row]))
  const unknownByToken = new Map(registry.unknown.map((row) => [row.token, row]))
  const fields = tokens.map((token) => {
    const canonicalKey = resolveCanonicalMergeFieldKey(token, { packetType: 'mandate' })
    const definition = canonicalKey ? getCanonicalMergeFieldDefinition(canonicalKey, { packetType: 'mandate' }) : null
    const unknown = unknownByToken.get(token)
    const deprecated = deprecatedByToken.get(token)
    return {
      token,
      canonicalKey: canonicalKey || null,
      status: unknown ? 'unknown' : deprecated ? 'alias_or_noncanonical' : 'canonical',
      category: definition?.category || null,
      required: Boolean(definition?.required),
      source: definition?.dataSource || null,
      suggested: unknown?.suggested || suggestCanonicalMergeFieldKey(token, { packetType: 'mandate' }) || null,
      sections: uniq(sectionByToken.get(token)),
    }
  })

  const tokensSet = new Set(tokens)
  const namingDecisions = []
  if (tokensSet.has('agency_legal_name') && tokensSet.has('organisation_name')) {
    namingDecisions.push({
      code: 'AGENCY_ORGANISATION_NAME_SPLIT',
      severity: 'decision',
      fields: ['agency_legal_name', 'organisation_name'],
      recommendation: 'Decide whether legal documents consume registered legal name, trading/display name, or both. Phase 2 should make this explicit and avoid mixed usage in one appointment clause.',
    })
  }
  if (!tokensSet.has('agency_registration_number')) {
    namingDecisions.push({
      code: 'AGENCY_REGISTRATION_FIELD_ABSENT',
      severity: 'watch',
      fields: ['agency_registration_number'],
      recommendation: 'Consider adding the agency/company registration number to the mandate data contract if counsel wants fuller party identification.',
    })
  }

  return {
    tokenCount: tokens.length,
    canonicalCount: fields.filter((field) => field.status === 'canonical').length,
    aliasCount: fields.filter((field) => field.status === 'alias_or_noncanonical').length,
    unknownCount: fields.filter((field) => field.status === 'unknown').length,
    fields,
    deprecated: registry.deprecated,
    unknown: registry.unknown,
    missingRequired: registry.missingRequired,
    namingDecisions,
  }
}

function includesAny(haystack = '', phrases = []) {
  const source = lower(haystack)
  return phrases.some((phrase) => source.includes(lower(phrase)))
}

function buildWordingGaps(sections = []) {
  const allText = sections.map((section) => section.legalText).join('\n\n')
  const gaps = []
  if (!includesAny(allText, ['mandatory disclosure', 'disclosure form'])) {
    gaps.push({
      code: 'MANDATORY_DISCLOSURE_CLAUSE_MISSING',
      severity: 'blocking_for_vnext',
      recommendation: 'Add a required mandate disclosure clause before the mandate can be accepted/sent.',
    })
  }
  if (!includesAny(allText, ['fidelity fund certificate', 'valid ffc', 'valid fidelity'])) {
    gaps.push({
      code: 'FFC_VALIDITY_WORDING_MISSING',
      severity: 'blocking_for_vnext',
      recommendation: 'Opening appointment wording should state that the Agency and Agent hold valid FFCs where required by law.',
    })
  }
  if (!includesAny(allText, ['effective cause', 'protection period', 'registration of transfer', 'vat included', 'vat excluded'])) {
    gaps.push({
      code: 'COMMISSION_TRIGGER_AND_VAT_TOO_LIGHT',
      severity: 'blocking_for_vnext',
      recommendation: 'Tighten commission around effective cause/protection period, payment trigger, and VAT treatment.',
    })
  }
  if (!includesAny(allText, ['letters of authority', 'resolution', 'trustees', 'representative capacity'])) {
    gaps.push({
      code: 'AUTHORITY_EVIDENCE_NEEDS_TIGHTENING',
      severity: 'warning',
      recommendation: 'Keep conditional authority packs, but make the normal wording require proof of authority where seller is not a natural person acting personally.',
    })
  }
  if (!includesAny(allText, ['conveyancer', 'bond originator', 'compliance provider', 'service provider'])) {
    gaps.push({
      code: 'POPIA_SHARING_RECIPIENTS_TOO_NARROW',
      severity: 'warning',
      recommendation: 'Expand POPIA/FICA wording to cover lawful sharing with conveyancers, bond originators, compliance providers and transaction service providers.',
    })
  }
  return gaps
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
      'Use this section sequence as the Phase 1 baseline before vNext wording changes.',
      'Keep signature section count and signer-role geometry stable unless layout regression tests are updated.',
      'New disclosure and appointment wording should be compact enough to preserve the current polished PDF rhythm.',
    ],
  }
}

function buildRecommendedActions({ wordingGaps = [], headingIssues = [], blankRenderRisks = [], mergeFieldAudit = {} } = {}) {
  const actions = []
  if (wordingGaps.some((gap) => gap.code === 'MANDATORY_DISCLOSURE_CLAUSE_MISSING')) {
    actions.push({
      phase: 2,
      priority: 'P0',
      action: 'Add required Mandatory Disclosure clause and acceptance gate.',
    })
  }
  if (wordingGaps.some((gap) => gap.code === 'FFC_VALIDITY_WORDING_MISSING')) {
    actions.push({
      phase: 2,
      priority: 'P0',
      action: 'Move the appointment wording into the introduction and include valid FFC wording.',
    })
  }
  if (mergeFieldAudit.namingDecisions?.length || mergeFieldAudit.aliasCount || mergeFieldAudit.unknownCount) {
    actions.push({
      phase: 2,
      priority: 'P0',
      action: 'Resolve merge-field naming decisions and alias/deprecated usage before editing template text.',
    })
  }
  if (headingIssues.length) {
    actions.push({
      phase: 4,
      priority: 'P1',
      action: 'Rename client-facing Pack headings while preserving internal section keys.',
    })
  }
  if (blankRenderRisks.length) {
    actions.push({
      phase: 5,
      priority: 'P1',
      action: 'Add hide-empty-row/section rendering rules and approved empty-state wording.',
    })
  }
  if (wordingGaps.some((gap) => gap.code === 'COMMISSION_TRIGGER_AND_VAT_TOO_LIGHT')) {
    actions.push({
      phase: 4,
      priority: 'P1',
      action: 'Tighten commission trigger, payment timing, protection period and VAT wording.',
    })
  }
  return actions
}

export function buildMandateTemplateBaselineAudit({ template = {}, sections = [], checkedAt = new Date().toISOString() } = {}) {
  const normalizedSections = normalizeSections(template, sections)
  const mergeFieldAudit = buildMergeFieldAudit(normalizedSections)
  const headingIssues = buildHeadingIssues(normalizedSections)
  const blankRenderRisks = buildBlankRenderRisks(normalizedSections)
  const wordingGaps = buildWordingGaps(normalizedSections)
  const visualBaseline = buildVisualBaseline(normalizedSections, template)
  const recommendedActions = buildRecommendedActions({
    wordingGaps,
    headingIssues,
    blankRenderRisks,
    mergeFieldAudit,
  })

  return {
    version: MANDATE_TEMPLATE_BASELINE_AUDIT_VERSION,
    status: wordingGaps.some((gap) => gap.severity === 'blocking_for_vnext') ? 'V_NEXT_REMEDIATION_REQUIRED' : 'BASELINE_CAPTURED',
    mutatedData: false,
    checkedAt,
    template: {
      id: text(template.id) || null,
      templateKey: text(template.template_key || template.templateKey) || null,
      label: text(template.template_label || template.templateLabel) || null,
      packetType: text(template.packet_type || template.packetType) || 'mandate',
      status: text(template.status) || null,
      isActive: template.is_active === true || template.isActive === true,
      isDefault: template.is_default === true || template.isDefault === true,
      versionTag: text(template.version_tag || template.versionTag) || null,
      metadata: metadataOf(template),
    },
    visualBaseline,
    sectionInventory: buildSectionInventory(normalizedSections),
    mergeFieldAudit,
    headingIssues,
    blankRenderRisks,
    wordingGaps,
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

export function formatMandateTemplateBaselineAuditMarkdown(audit = {}) {
  const lines = []
  lines.push('# Mandate Template vNext Phase 1 Baseline Audit')
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
  if (audit.mergeFieldAudit?.namingDecisions?.length) {
    lines.push('')
    lines.push('### Naming Decisions')
    lines.push('')
    lines.push(table(
      ['Code', 'Fields', 'Recommendation'],
      audit.mergeFieldAudit.namingDecisions.map((item) => [
        item.code,
        (item.fields || []).join(', '),
        item.recommendation,
      ]),
    ))
  }
  lines.push('')
  lines.push('## Wording Gaps')
  lines.push('')
  lines.push(table(
    ['Code', 'Severity', 'Recommendation'],
    (audit.wordingGaps || []).map((gap) => [gap.code, gap.severity, gap.recommendation]),
  ))
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
