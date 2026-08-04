import {
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'
import {
  OTP_FIELD_POLICIES,
  OTP_FIELD_REGISTRY_VERSION,
  buildOtpFieldRegistryAudit,
  getOtpFieldDefinition,
} from './otpFieldRegistry.js'
import {
  OTP_DATA_SOURCE_OWNERS,
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'
import {
  OTP_LEGAL_WORDING_DRAFT_STATUS_READY,
  OTP_LEGAL_WORDING_DRAFT_VERSION,
  buildOtpLegalWordingDraftReport,
  listOtpLegalWordingDraftSections,
} from './otpLegalWordingDraft.js'
import {
  OTP_TEMPLATE_SHELL_TARGET_VERSION,
  buildOtpTemplateShellTargetAudit,
  listOtpTemplateShellTargets,
} from './otpTemplateShellTarget.js'

export const OTP_FIELD_DATA_LOCK_VERSION = 'otp_field_data_lock_phase4_v1'
export const OTP_FIELD_DATA_LOCK_STATUS_READY = 'OTP_FIELD_DATA_LOCK_READY_FOR_TEMPLATE_PERSISTENCE'

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

function buildSourceOwnerLabelMap() {
  return new Map(OTP_DATA_SOURCE_OWNERS.map((owner) => [owner.key, owner.label]))
}

function tokenUsageRow({
  routeKey,
  source,
  sourceKey,
  sourceLabel,
  sourceOwners = [],
  token,
} = {}) {
  const definition = getOtpFieldDefinition(token)
  return {
    routeKey,
    token,
    source,
    sourceKey,
    sourceLabel,
    declaredSourceOwners: unique(sourceOwners.map(normalizeKey)),
    registryOwner: definition?.owner || '',
    policy: definition?.policy || '',
    variants: [...(definition?.variants || [])],
    sourcePaths: [...(definition?.sourcePaths || [])],
    renderable: definition?.renderable !== false,
  }
}

function getShellSections(routeKey = '') {
  return listOtpTemplateShellTargets()
    .find((target) => target.routeKey === routeKey)
    ?.shellSections || []
}

export function collectOtpFieldDataLockUsage({ routeKey = '' } = {}) {
  const normalizedRoute = normalizeOtpDocumentVariant(routeKey) || normalizeKey(routeKey)
  if (!normalizedRoute) return []

  const wordingUsages = listOtpLegalWordingDraftSections({ variant: normalizedRoute })
    .flatMap((section) => (section.placeholder_keys || []).map((token) => tokenUsageRow({
      routeKey: normalizedRoute,
      source: 'legal_wording_draft',
      sourceKey: section.section_key,
      sourceLabel: section.section_label,
      sourceOwners: section.source_owners || section.metadata_json?.source_owners || [],
      token,
    })))

  const shellUsages = getShellSections(normalizedRoute)
    .flatMap((section) => (section.placeholder_keys || []).map((token) => tokenUsageRow({
      routeKey: normalizedRoute,
      source: 'template_shell',
      sourceKey: section.metadata_json?.shell_slot_key || section.section_key,
      sourceLabel: section.section_label,
      sourceOwners: section.source_owners || [],
      token,
    })))

  return [...wordingUsages, ...shellUsages]
}

function sourceOwnerMismatches(usages = []) {
  return usages
    .filter((usage) => usage.registryOwner)
    .filter((usage) => usage.declaredSourceOwners.length > 0)
    .filter((usage) => !usage.declaredSourceOwners.includes(usage.registryOwner))
    .map((usage) => ({
      token: usage.token,
      routeKey: usage.routeKey,
      source: usage.source,
      sourceKey: usage.sourceKey,
      declaredSourceOwners: usage.declaredSourceOwners,
      registryOwner: usage.registryOwner,
    }))
}

function sourcePathGaps(tokens = []) {
  return tokens
    .map((token) => ({ token, definition: getOtpFieldDefinition(token) }))
    .filter(({ definition }) => definition)
    .filter(({ definition }) => definition.renderable !== false)
    .filter(({ definition }) => !definition.sourcePaths?.length)
    .map(({ token }) => token)
}

function policyGaps(tokens = []) {
  const allowedPolicies = new Set(Object.values(OTP_FIELD_POLICIES))
  return tokens
    .map((token) => ({ token, definition: getOtpFieldDefinition(token) }))
    .filter(({ definition }) => definition)
    .filter(({ definition }) => !allowedPolicies.has(definition.policy))
    .map(({ token }) => token)
}

function routeForbiddenTokens(routeKey = '', tokens = []) {
  return tokens
    .map((token) => ({ token, definition: getOtpFieldDefinition(token) }))
    .filter(({ definition }) => definition?.variants?.length && !definition.variants.includes(routeKey))
    .map(({ token, definition }) => ({
      token,
      routeKey,
      allowedVariants: [...definition.variants],
    }))
}

function ownerGaps(tokens = []) {
  const ownerKeys = new Set(OTP_DATA_SOURCE_OWNERS.map((owner) => owner.key))
  return tokens
    .map((token) => ({ token, definition: getOtpFieldDefinition(token) }))
    .filter(({ definition }) => definition && !ownerKeys.has(definition.owner))
    .map(({ token, definition }) => ({ token, owner: definition.owner }))
}

function buildOwnerBreakdown(tokens = []) {
  const labels = buildSourceOwnerLabelMap()
  const rows = new Map()
  for (const token of tokens) {
    const definition = getOtpFieldDefinition(token)
    if (!definition) continue
    const row = rows.get(definition.owner) || {
      owner: definition.owner,
      label: labels.get(definition.owner) || definition.owner,
      tokens: [],
    }
    row.tokens.push(token)
    rows.set(definition.owner, row)
  }
  return [...rows.values()]
    .map((row) => ({ ...row, tokens: unique(row.tokens).sort(), tokenCount: unique(row.tokens).length }))
    .sort((left, right) => left.owner.localeCompare(right.owner))
}

function requiredOwnerGaps(routeKey = '', tokens = []) {
  const routeDefinition = OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)
  const presentOwners = new Set(tokens.map((token) => getOtpFieldDefinition(token)?.owner).filter(Boolean))
  return [...(routeDefinition?.requiredSourceOwners || [])]
    .filter((owner) => !presentOwners.has(owner))
}

export function buildOtpFieldDataLockRoute({ routeKey = '' } = {}) {
  const normalizedRoute = normalizeOtpDocumentVariant(routeKey) || normalizeKey(routeKey)
  const routeDefinition = OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === normalizedRoute) || null
  const usages = collectOtpFieldDataLockUsage({ routeKey: normalizedRoute })
  const tokens = unique(usages.map((usage) => usage.token)).sort()
  const registryValidation = validateTemplateTokensAgainstRegistry({ packetType: 'otp', tokens })
  const unknownTokens = unique(tokens.filter((token) => !getOtpFieldDefinition(token))).sort()
  const lock = {
    routeKey: normalizedRoute,
    label: routeDefinition?.label || normalizedRoute,
    sectionUsageCount: usages.length,
    tokenCount: tokens.length,
    tokens,
    usages,
    registryValidation,
    ownerBreakdown: buildOwnerBreakdown(tokens),
    sourceOwnerMismatches: sourceOwnerMismatches(usages),
    sourcePathGaps: unique(sourcePathGaps(tokens)).sort(),
    policyGaps: unique(policyGaps(tokens)).sort(),
    routeForbiddenTokens: routeForbiddenTokens(normalizedRoute, tokens),
    ownerGaps: ownerGaps(tokens),
    requiredOwnerGaps: requiredOwnerGaps(normalizedRoute, tokens),
    unknownTokens,
  }
  const blockerCodes = [
    !routeDefinition ? 'OTP_FIELD_DATA_LOCK_UNKNOWN_ROUTE' : '',
    !tokens.length ? 'OTP_FIELD_DATA_LOCK_EMPTY_ROUTE_TOKEN_SET' : '',
    !registryValidation.isValid ? 'OTP_FIELD_DATA_LOCK_MERGE_REGISTRY_INVALID' : '',
    unknownTokens.length ? 'OTP_FIELD_DATA_LOCK_UNKNOWN_FIELD_DEFINITIONS' : '',
    lock.sourceOwnerMismatches.length ? 'OTP_FIELD_DATA_LOCK_SOURCE_OWNER_MISMATCHES' : '',
    lock.sourcePathGaps.length ? 'OTP_FIELD_DATA_LOCK_SOURCE_PATH_GAPS' : '',
    lock.policyGaps.length ? 'OTP_FIELD_DATA_LOCK_POLICY_GAPS' : '',
    lock.routeForbiddenTokens.length ? 'OTP_FIELD_DATA_LOCK_ROUTE_FORBIDDEN_TOKENS' : '',
    lock.ownerGaps.length ? 'OTP_FIELD_DATA_LOCK_OWNER_GAPS' : '',
    lock.requiredOwnerGaps.length ? 'OTP_FIELD_DATA_LOCK_REQUIRED_OWNER_GAPS' : '',
  ].filter(Boolean)

  return {
    ...lock,
    blockerCodes,
    status: blockerCodes.length ? 'OTP_FIELD_DATA_LOCK_ROUTE_REMEDIATION_REQUIRED' : OTP_FIELD_DATA_LOCK_STATUS_READY,
  }
}

function buildChecks({
  fieldRegistryAudit = {},
  legalWordingReport = {},
  shellTargetAudit = {},
  routeLocks = [],
} = {}) {
  const checks = []
  const push = (pass, code, detail, severity = 'blocking') => checks.push({ code, pass: Boolean(pass), detail, severity })
  const resaleLock = routeLocks.find((lock) => lock.routeKey === 'resale_existing_property')
  const developmentLock = routeLocks.find((lock) => lock.routeKey === 'new_development')
  const resaleTokens = new Set(resaleLock?.tokens || [])
  const developmentTokens = new Set(developmentLock?.tokens || [])

  push(fieldRegistryAudit.status === 'OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES', 'PHASE4_FIELD_REGISTRY_READY', 'Field/data lock depends on the existing OTP field registry audit passing.')
  push(legalWordingReport.status === OTP_LEGAL_WORDING_DRAFT_STATUS_READY, 'PHASE4_WORDING_DRAFT_READY', 'Field/data lock consumes the Phase 3 legal wording draft token surface.')
  push(shellTargetAudit.status === 'OTP_TEMPLATE_SHELL_TARGET_READY_FOR_PERSISTENCE', 'PHASE4_TEMPLATE_SHELL_READY', 'Field/data lock consumes the Phase 1 route shell placeholder surface.')
  push(routeLocks.length === 2, 'PHASE4_TWO_ROUTE_LOCKS', 'Exactly the resale and new-development OTP route token locks are generated.')
  push(routeLocks.every((lock) => lock.status === OTP_FIELD_DATA_LOCK_STATUS_READY), 'PHASE4_ROUTE_LOCKS_READY', 'Every route token set is canonical, route-allowed, source-owned, policy-bound and source-path bound.')
  push(Boolean(resaleLock && resaleTokens.has('seller_full_name') && resaleTokens.has('mandatory_disclosure_annexure') && resaleTokens.has('seller_signature')), 'PHASE4_RESALE_SELLER_DISCLOSURE_LOCKED', 'Resale OTP locks seller, disclosure and seller-signature fields.')
  push(Boolean(resaleLock && !resaleTokens.has('developer_name') && !resaleTokens.has('developer_signature')), 'PHASE4_RESALE_EXCLUDES_DEVELOPER_FIELDS', 'Resale OTP token surface excludes developer-only fields.')
  push(Boolean(developmentLock && developmentTokens.has('developer_name') && developmentTokens.has('development_name') && developmentTokens.has('vat_inclusive_purchase_price') && developmentTokens.has('developer_signature')), 'PHASE4_DEVELOPMENT_DEVELOPER_LOCKED', 'New-development OTP locks developer, development, VAT and developer-signature fields.')
  push(Boolean(developmentLock && !developmentTokens.has('seller_full_name') && !developmentTokens.has('seller_signature')), 'PHASE4_DEVELOPMENT_EXCLUDES_RESALE_SELLER_FIELDS', 'New-development OTP token surface excludes resale seller-only fields.')

  return checks
}

export function buildOtpFieldDataLockAudit({ generatedAt = new Date().toISOString() } = {}) {
  const fieldRegistryAudit = buildOtpFieldRegistryAudit({ checkedAt: generatedAt })
  const legalWordingReport = buildOtpLegalWordingDraftReport({ generatedAt })
  const shellTargetAudit = buildOtpTemplateShellTargetAudit({ checkedAt: generatedAt })
  const routeLocks = OTP_DOCUMENT_VARIANTS
    .map((variant) => buildOtpFieldDataLockRoute({ routeKey: variant.key }))
  const checks = buildChecks({ fieldRegistryAudit, legalWordingReport, shellTargetAudit, routeLocks })
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')

  return {
    version: OTP_FIELD_DATA_LOCK_VERSION,
    generatedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_FIELD_DATA_LOCK_REMEDIATION_REQUIRED' : OTP_FIELD_DATA_LOCK_STATUS_READY,
    summary: {
      routeCount: routeLocks.length,
      totalTokenCount: unique(routeLocks.flatMap((lock) => lock.tokens)).length,
      totalUsageCount: routeLocks.reduce((count, lock) => count + lock.sectionUsageCount, 0),
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    dependencies: {
      fieldRegistryVersion: OTP_FIELD_REGISTRY_VERSION,
      fieldRegistryStatus: fieldRegistryAudit.status,
      legalWordingVersion: OTP_LEGAL_WORDING_DRAFT_VERSION,
      legalWordingStatus: legalWordingReport.status,
      templateShellVersion: OTP_TEMPLATE_SHELL_TARGET_VERSION,
      templateShellStatus: shellTargetAudit.status,
    },
    checks,
    blockers,
    warnings,
    routeLocks,
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

export function formatOtpFieldDataLockMarkdown(report = buildOtpFieldDataLockAudit()) {
  return [
    '# OTP Template vNext Phase 4 Field and Data Lock',
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
        ['Unique tokens', report.summary.totalTokenCount],
        ['Token usages', report.summary.totalUsageCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Dependencies',
    '',
    table(
      ['Layer', 'Version', 'Status'],
      [
        ['Field registry', report.dependencies.fieldRegistryVersion, report.dependencies.fieldRegistryStatus],
        ['Legal wording draft', report.dependencies.legalWordingVersion, report.dependencies.legalWordingStatus],
        ['Template shell', report.dependencies.templateShellVersion, report.dependencies.templateShellStatus],
      ],
    ),
    '',
    '## Route Locks',
    '',
    table(
      ['Route', 'Tokens', 'Usages', 'Owners', 'Blockers'],
      report.routeLocks.map((lock) => [
        lock.routeKey,
        lock.tokenCount,
        lock.sectionUsageCount,
        lock.ownerBreakdown.map((owner) => `${owner.owner} (${owner.tokenCount})`).join(', '),
        lock.blockerCodes.join(', ') || 'none',
      ]),
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
    'Phase 4 locks field ownership, route eligibility, policies and source paths for the OTP vNext template surface. It does not mutate Supabase, persist templates, approve legal wording, render PDFs, or enforce runtime generation.',
    '',
  ].join('\n')
}
