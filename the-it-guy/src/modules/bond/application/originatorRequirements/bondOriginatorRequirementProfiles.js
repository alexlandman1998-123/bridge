import {
  BOND_APPLICATION_DOCUMENT_CANONICAL_TYPES,
  BOND_APPLICATION_DOCUMENT_PARTICIPANT_ROLES,
  BOND_APPLICATION_DOCUMENT_RULES,
  BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
  BOND_APPLICATION_DOCUMENT_SATISFACTION_MODES,
  BOND_APPLICATION_DOCUMENT_TIMING,
} from '../documents/bondApplicationDocumentRules.js'

export const BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION = 'phase-2-v1'
export const BOND_ORIGINATOR_SA_BASELINE_PROFILE_VERSION = 'za-baseline-2026-08-v1'

export const BOND_ORIGINATOR_SA_BASELINE_PROFILE = Object.freeze({
  key: 'za_baseline',
  version: BOND_ORIGINATOR_SA_BASELINE_PROFILE_VERSION,
  jurisdiction: 'ZA',
  effectiveFrom: '2026-08-28',
  ruleSetVersion: BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
  status: 'active',
})

export const BOND_ORIGINATOR_REQUIREMENT_PROFILE_REGISTRY = Object.freeze([])

const TIMING_STRENGTH = Object.freeze({
  [BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature]: 3,
  [BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeBankSubmission]: 2,
  [BOND_APPLICATION_DOCUMENT_TIMING.requestedAfterOriginatorReview]: 1,
})

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstPresent(...values) {
  return values.find((value) => String(value ?? '').trim().length > 0) ?? null
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]))
  }
  return value
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key])
      return result
    }, {})
  }
  return value
}

function profileFingerprint(value) {
  const input = JSON.stringify(canonicalize(value))
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION}:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function parseDate(value) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function profileIsEffective(profile = {}, asOf = new Date().toISOString()) {
  const asOfTimestamp = parseDate(asOf)
  const fromTimestamp = parseDate(profile.effectiveFrom)
  const toTimestamp = parseDate(profile.effectiveTo)
  if (profile.status && profile.status !== 'active') return false
  if (asOfTimestamp === null) return false
  if (fromTimestamp !== null && asOfTimestamp < fromTimestamp) return false
  if (toTimestamp !== null && asOfTimestamp > toTimestamp) return false
  return true
}

export function resolveBondOriginatorIdentity({ portal = {}, originator = null } = {}) {
  const transaction = portal?.transaction || {}
  const assigned = originator || portal?.assignedBondOriginator || portal?.assigned_bond_originator || {}
  const id = firstPresent(
    assigned?.id,
    assigned?.organisationId,
    assigned?.organisation_id,
    transaction?.bond_originator_id,
    transaction?.assigned_bond_originator_id,
  )
  const name = firstPresent(
    assigned?.name,
    assigned?.contactPerson,
    assigned?.contact_person,
    transaction?.bond_originator,
    transaction?.assigned_bond_originator_name,
  )
  const company = firstPresent(
    assigned?.companyName,
    assigned?.company_name,
    assigned?.organisationName,
    assigned?.organisation_name,
    transaction?.bond_originator_company,
    transaction?.assigned_bond_originator_company,
    name,
  )
  const email = firstPresent(
    assigned?.email,
    transaction?.assigned_bond_originator_email,
    transaction?.bond_originator_email,
  )
  const explicitProfileKey = firstPresent(
    assigned?.requirementProfileKey,
    assigned?.requirement_profile_key,
    transaction?.bond_originator_requirement_profile_key,
    transaction?.bondOriginatorRequirementProfileKey,
  )
  const keys = unique([
    normalizeKey(id),
    normalizeKey(name),
    normalizeKey(company),
    normalizeKey(email),
    normalizeKey(explicitProfileKey),
  ])
  return {
    assigned: keys.length > 0,
    id,
    name,
    company,
    email,
    explicitProfileKey: normalizeKey(explicitProfileKey),
    keys,
  }
}

function normalizeRegistry(registry = BOND_ORIGINATOR_REQUIREMENT_PROFILE_REGISTRY) {
  if (Array.isArray(registry)) return registry.filter(Boolean)
  if (registry && typeof registry === 'object') return Object.values(registry).filter(Boolean)
  return []
}

function validateProfileMetadata(profile = {}) {
  const diagnostics = []
  if (!normalizeKey(profile.key)) diagnostics.push({ code: 'profile_key_required' })
  if (!String(profile.version || '').trim()) diagnostics.push({ code: 'profile_version_required' })
  if (profile.jurisdiction && profile.jurisdiction !== 'ZA') {
    diagnostics.push({ code: 'unsupported_profile_jurisdiction', value: profile.jurisdiction })
  }
  if (profile.effectiveFrom && parseDate(profile.effectiveFrom) === null) {
    diagnostics.push({ code: 'invalid_profile_effective_from', value: profile.effectiveFrom })
  }
  if (profile.effectiveTo && parseDate(profile.effectiveTo) === null) {
    diagnostics.push({ code: 'invalid_profile_effective_to', value: profile.effectiveTo })
  }
  return diagnostics
}

function findProfile(identity, registry, asOf) {
  return normalizeRegistry(registry).find((profile) => {
    if (!profileIsEffective(profile, asOf)) return false
    const profileKeys = unique([
      normalizeKey(profile.key),
      ...(Array.isArray(profile.originatorKeys) ? profile.originatorKeys.map(normalizeKey) : []),
    ])
    if (identity.explicitProfileKey) return profileKeys.includes(identity.explicitProfileKey)
    return profileKeys.some((key) => identity.keys.includes(key))
  }) || null
}

export function resolveBondOriginatorRequirementProfile({
  portal = {},
  originator = null,
  profile = null,
  registry = BOND_ORIGINATOR_REQUIREMENT_PROFILE_REGISTRY,
  asOf = new Date().toISOString(),
  requireOriginatorProfile = false,
} = {}) {
  const identity = resolveBondOriginatorIdentity({ portal, originator })
  const matchedProfile = profile || findProfile(identity, registry, asOf)
  const diagnostics = matchedProfile ? validateProfileMetadata(matchedProfile) : []
  const profileEffective = matchedProfile ? profileIsEffective(matchedProfile, asOf) : false
  if (matchedProfile && !profileEffective) diagnostics.push({ code: 'profile_not_effective', profileKey: matchedProfile.key || '' })
  const validProfile = matchedProfile && diagnostics.length === 0 ? cloneValue(matchedProfile) : null
  const reviewTasks = []
  const blockingIssues = []

  if (identity.assigned && !validProfile) {
    reviewTasks.push({
      code: 'originator_profile_not_certified',
      originator: identity.company || identity.name || identity.email || 'Assigned originator',
      message: 'The South African baseline is active; certify this originator overlay before claiming originator-specific acceptance.',
    })
  }
  if (requireOriginatorProfile && !validProfile) {
    blockingIssues.push({
      category: 'requirement_profile',
      code: 'originator_profile_required',
      message: 'A certified requirement profile is required for the assigned bond originator.',
      blocking: true,
    })
  }

  const resolution = {
    engineVersion: BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION,
    baselineKey: BOND_ORIGINATOR_SA_BASELINE_PROFILE.key,
    baselineVersion: BOND_ORIGINATOR_SA_BASELINE_PROFILE.version,
    identity,
    profile: validProfile,
    profileKey: validProfile?.key || null,
    profileVersion: validProfile?.version || null,
    status: validProfile ? 'originator_profile_active' : 'sa_baseline_active',
    trusted: diagnostics.length === 0 && blockingIssues.length === 0,
    diagnostics,
    reviewTasks,
    blockingIssues,
  }
  resolution.fingerprint = profileFingerprint({
    baselineVersion: resolution.baselineVersion,
    profileKey: resolution.profileKey,
    profileVersion: resolution.profileVersion,
  })
  return resolution
}

function weakeningDiagnostic(requirementKey, field, baselineValue, requestedValue) {
  return {
    code: 'baseline_requirement_weakening_rejected',
    requirementKey,
    field,
    baselineValue,
    requestedValue,
  }
}

function applyStrengtheningOverride(rule, override) {
  const diagnostics = []
  const next = cloneValue(rule)
  const requirementKey = rule.key

  if (override.remove === true || override.enabled === false || override.required === false || override.visibleWhen === false) {
    diagnostics.push(weakeningDiagnostic(requirementKey, 'enabled', true, false))
  }
  if (override.canonicalDocumentType && override.canonicalDocumentType !== rule.canonicalDocumentType) {
    diagnostics.push(weakeningDiagnostic(requirementKey, 'canonicalDocumentType', rule.canonicalDocumentType, override.canonicalDocumentType))
  }
  if (override.minimumFileCount !== undefined && Number(override.minimumFileCount) < Number(rule.minimumFileCount || 1)) {
    diagnostics.push(weakeningDiagnostic(requirementKey, 'minimumFileCount', rule.minimumFileCount || 1, override.minimumFileCount))
  }
  if (override.requiredBefore && (TIMING_STRENGTH[override.requiredBefore] || 0) < (TIMING_STRENGTH[rule.requiredBefore] || 0)) {
    diagnostics.push(weakeningDiagnostic(requirementKey, 'requiredBefore', rule.requiredBefore, override.requiredBefore))
  }
  if (override.allowMultipleFiles === false && rule.allowMultipleFiles === true) {
    diagnostics.push(weakeningDiagnostic(requirementKey, 'allowMultipleFiles', true, false))
  }
  for (const field of ['evidencePeriodMonths', 'evidencePeriodYears']) {
    if (override[field] !== undefined && Number(override[field]) < Number(rule[field] || 0)) {
      diagnostics.push(weakeningDiagnostic(requirementKey, field, rule[field] || 0, override[field]))
    }
  }
  if (override.requiredWhen !== undefined && override.requiredWhen !== true) {
    diagnostics.push(weakeningDiagnostic(requirementKey, 'requiredWhen', rule.requiredWhen, override.requiredWhen))
  }
  if (diagnostics.length) return { rule, diagnostics }

  for (const field of [
    'title',
    'description',
    'reason',
    'requiredBefore',
    'minimumFileCount',
    'allowMultipleFiles',
    'evidencePeriodMonths',
    'evidencePeriodYears',
  ]) {
    if (override[field] !== undefined) next[field] = cloneValue(override[field])
  }
  if (override.requiredWhen === true) next.requiredWhen = true
  const addedCanonicalTypes = Array.isArray(override.addMatchingCanonicalTypes)
    ? override.addMatchingCanonicalTypes.map(String).filter(Boolean)
    : []
  if (addedCanonicalTypes.length) {
    next.matching = {
      ...(next.matching || {}),
      canonicalTypes: unique([...(next.matching?.canonicalTypes || []), ...addedCanonicalTypes]),
    }
  }
  return { rule: next, diagnostics }
}

export function applyBondOriginatorRequirementProfile({
  baselineRules = BOND_APPLICATION_DOCUMENT_RULES,
  profileResolution = resolveBondOriginatorRequirementProfile(),
} = {}) {
  const profile = profileResolution?.profile || null
  const diagnostics = [...(profileResolution?.diagnostics || [])]
  const baselineByKey = new Map((baselineRules || []).map((rule) => [rule.key, rule]))
  const overrides = Array.isArray(profile?.overrides) ? profile.overrides : []
  const additions = Array.isArray(profile?.additions) ? profile.additions : []
  const seenOverrides = new Set()
  const appliedOverrideKeys = []

  const rules = (baselineRules || []).map((baselineRule) => {
    const matchingOverrides = overrides.filter((override) => override?.requirementKey === baselineRule.key)
    if (matchingOverrides.length > 1) {
      diagnostics.push({ code: 'duplicate_profile_override', requirementKey: baselineRule.key })
      return cloneValue(baselineRule)
    }
    const override = matchingOverrides[0]
    if (!override) return cloneValue(baselineRule)
    seenOverrides.add(override)
    const applied = applyStrengtheningOverride(baselineRule, override)
    diagnostics.push(...applied.diagnostics)
    if (!applied.diagnostics.length) appliedOverrideKeys.push(baselineRule.key)
    return applied.rule
  })

  overrides.forEach((override) => {
    if (!seenOverrides.has(override) && !baselineByKey.has(override?.requirementKey)) {
      diagnostics.push({ code: 'profile_override_target_missing', requirementKey: override?.requirementKey || '' })
    }
  })

  const additionKeys = new Set()
  additions.forEach((addition) => {
    if (!addition?.key) {
      diagnostics.push({ code: 'profile_addition_key_required' })
      return
    }
    if (baselineByKey.has(addition.key) || additionKeys.has(addition.key)) {
      diagnostics.push({ code: 'duplicate_profile_addition', requirementKey: addition.key })
      return
    }
    if (!BOND_APPLICATION_DOCUMENT_CANONICAL_TYPES.has(addition.canonicalDocumentType)) {
      diagnostics.push({ code: 'profile_addition_unknown_canonical_type', requirementKey: addition.key })
      return
    }
    if (!Object.values(BOND_APPLICATION_DOCUMENT_PARTICIPANT_ROLES).includes(addition.participantRole)) {
      diagnostics.push({ code: 'profile_addition_invalid_participant_role', requirementKey: addition.key })
      return
    }
    if (!Object.values(BOND_APPLICATION_DOCUMENT_TIMING).includes(addition.requiredBefore)) {
      diagnostics.push({ code: 'profile_addition_invalid_timing', requirementKey: addition.key })
      return
    }
    if (!Object.values(BOND_APPLICATION_DOCUMENT_SATISFACTION_MODES).includes(addition.satisfactionMode)) {
      diagnostics.push({ code: 'profile_addition_invalid_satisfaction_mode', requirementKey: addition.key })
      return
    }
    additionKeys.add(addition.key)
    rules.push(cloneValue(addition))
  })

  const profileMetadata = {
    engineVersion: BOND_ORIGINATOR_REQUIREMENT_PROFILE_ENGINE_VERSION,
    baselineKey: profileResolution?.baselineKey || BOND_ORIGINATOR_SA_BASELINE_PROFILE.key,
    baselineVersion: profileResolution?.baselineVersion || BOND_ORIGINATOR_SA_BASELINE_PROFILE.version,
    profileKey: profileResolution?.profileKey || null,
    profileVersion: profileResolution?.profileVersion || null,
    fingerprint: profileResolution?.fingerprint || profileFingerprint({ baselineVersion: BOND_ORIGINATOR_SA_BASELINE_PROFILE.version }),
  }
  const profiledRules = rules.map((rule) => ({
    ...rule,
    requirementProfile: profileMetadata,
    requirementProfileEngineVersion: profileMetadata.engineVersion,
    requirementBaselineVersion: profileMetadata.baselineVersion,
    originatorProfileKey: profileMetadata.profileKey,
    originatorProfileVersion: profileMetadata.profileVersion,
    requirementProfileFingerprint: profileMetadata.fingerprint,
  }))

  return {
    rules: profiledRules,
    metadata: profileMetadata,
    diagnostics,
    trusted: Boolean(profileResolution?.trusted !== false) && diagnostics.length === 0,
    appliedOverrideKeys,
    addedRequirementKeys: Array.from(additionKeys),
  }
}
