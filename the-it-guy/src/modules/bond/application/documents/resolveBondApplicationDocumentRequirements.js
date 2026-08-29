import { evaluateBondApplicationRule } from '../flow/bondApplicationRuleEvaluator.js'
import {
  BOND_APPLICATION_DOCUMENT_CANONICAL_TYPES,
  BOND_APPLICATION_DOCUMENT_PARTICIPANT_ROLES,
  BOND_APPLICATION_DOCUMENT_RULES,
  BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
  BOND_APPLICATION_DOCUMENT_SATISFACTION_MODES,
  BOND_APPLICATION_DOCUMENT_TIMING,
} from './bondApplicationDocumentRules.js'
import {
  applyBondOriginatorRequirementProfile,
  resolveBondOriginatorRequirementProfile,
} from '../originatorRequirements/bondOriginatorRequirementProfiles.js'

const VALID_TIMINGS = new Set(Object.values(BOND_APPLICATION_DOCUMENT_TIMING))
const VALID_SATISFACTION_MODES = new Set(Object.values(BOND_APPLICATION_DOCUMENT_SATISFACTION_MODES))
const VALID_PARTICIPANT_ROLES = new Set(Object.values(BOND_APPLICATION_DOCUMENT_PARTICIPANT_ROLES))
const PARTICIPANT_PATHS = {
  primary_applicant: 'participants.primaryApplicant',
  co_applicant: 'participants.coApplicant',
  surety: 'participants.sureties.0',
}

function replaceRuleParticipantPath(rule, participantPath) {
  if (rule === true || rule === false || rule === null || rule === undefined) return rule
  if (Array.isArray(rule)) return rule.map((item) => replaceRuleParticipantPath(item, participantPath))
  if (!rule || typeof rule !== 'object') return rule
  return Object.entries(rule).reduce((accumulator, [key, value]) => {
    if (key === 'field') {
      accumulator[key] = String(value || '').replace(/^participants\.primaryApplicant/, participantPath)
    } else {
      accumulator[key] = replaceRuleParticipantPath(value, participantPath)
    }
    return accumulator
  }, {})
}

function getParticipantDocumentTitlePrefix(participantRole, participantKey = '') {
  if (!participantKey) return ''
  const ordinal = Number(String(participantKey).match(/:(\d+)$/)?.[1] || 1)
  if (participantRole === 'surety') return `Surety ${Math.max(ordinal, 1)}: `
  if (participantRole === 'co_applicant') return `Applicant ${Math.max(ordinal + 1, 2)}: `
  return `Applicant ${Math.max(ordinal, 1)}: `
}

function adaptRequirementForParticipant(definition, participantRole, participantKey = '', participantPathOverride = '') {
  if (definition.scope !== 'participant') return definition
  const participantPath = participantPathOverride || PARTICIPANT_PATHS[participantRole] || PARTICIPANT_PATHS.primary_applicant
  const roleSuffix = participantRole === 'co_applicant'
    ? 'co_applicant'
    : participantRole === 'surety'
      ? 'surety'
      : 'primary_applicant'
  const baseKey = String(definition.key || '').replace('primary_applicant', roleSuffix)
  return {
    ...definition,
    key: participantKey ? `${participantKey}:${baseKey}` : baseKey,
    baseRequirementKey: definition.key,
    title: `${getParticipantDocumentTitlePrefix(participantRole, participantKey)}${definition.title}`,
    participantRole,
    participantKey: participantKey || null,
    visibleWhen: replaceRuleParticipantPath(definition.visibleWhen, participantPath),
    requiredWhen: replaceRuleParticipantPath(definition.requiredWhen, participantPath),
    reason: definition.reason
      ? String(definition.reason).replace(/primary applicant/gi, participantRole === 'co_applicant' ? 'co-applicant' : 'primary applicant')
      : definition.reason,
  }
}

function normalizeRequirement(definition, applicationState) {
  const visible = evaluateBondApplicationRule(definition.visibleWhen, applicationState)
  const required = visible && Boolean(evaluateBondApplicationRule(definition.requiredWhen, applicationState))
  return {
    ...definition,
    ruleSetVersion: definition.ruleSetVersion || BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
    active: visible,
    required,
    requiredBefore: definition.requiredBefore || BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature,
    satisfactionMode: definition.satisfactionMode || BOND_APPLICATION_DOCUMENT_SATISFACTION_MODES.uploaded,
    minimumFileCount: Math.max(Number(definition.minimumFileCount || 1), 1),
    allowMultipleFiles: Boolean(definition.allowMultipleFiles),
    matching: {
      canonicalTypes: [
        definition.canonicalDocumentType,
        ...((definition.matching?.canonicalTypes || [])),
      ].map((item) => String(item || '').trim()).filter(Boolean),
    },
  }
}

export function validateBondApplicationDocumentRuleContract(contract = BOND_APPLICATION_DOCUMENT_RULES) {
  const diagnostics = []
  const seen = new Set()
  contract.forEach((definition) => {
    if (!definition?.key) diagnostics.push({ code: 'missing_key', key: '' })
    if (seen.has(definition.key)) diagnostics.push({ code: 'duplicate_key', key: definition.key })
    seen.add(definition.key)
    if (!BOND_APPLICATION_DOCUMENT_CANONICAL_TYPES.has(definition.canonicalDocumentType)) {
      diagnostics.push({ code: 'unknown_canonical_document_type', key: definition.key, canonicalDocumentType: definition.canonicalDocumentType })
    }
    if (!VALID_PARTICIPANT_ROLES.has(definition.participantRole)) {
      diagnostics.push({ code: 'invalid_participant_role', key: definition.key, participantRole: definition.participantRole })
    }
    if (!VALID_TIMINGS.has(definition.requiredBefore)) {
      diagnostics.push({ code: 'invalid_required_before', key: definition.key, requiredBefore: definition.requiredBefore })
    }
    if (!VALID_SATISFACTION_MODES.has(definition.satisfactionMode)) {
      diagnostics.push({ code: 'invalid_satisfaction_mode', key: definition.key, satisfactionMode: definition.satisfactionMode })
    }
    if (Number(definition.minimumFileCount || 0) < 1) {
      diagnostics.push({ code: 'invalid_minimum_file_count', key: definition.key })
    }
  })
  return { valid: diagnostics.length === 0, diagnostics }
}

export function resolveBondApplicationDocumentRequirements({
  applicationState = {},
  documentRuleContract = BOND_APPLICATION_DOCUMENT_RULES,
  participantRole = 'primary_applicant',
  participantContext = null,
} = {}) {
  const requirementProfileResolution = applicationState?.requirementProfile || resolveBondOriginatorRequirementProfile()
  const profiledContract = applyBondOriginatorRequirementProfile({
    baselineRules: documentRuleContract,
    profileResolution: requirementProfileResolution,
  })
  const interpretationIssues = Array.isArray(applicationState?.interpretation?.blockingIssues)
    ? applicationState.interpretation.blockingIssues.map((item) => ({
        ...item,
        code: item.code || 'interpretation_blocker',
        source: 'canonical_application_interpreter',
      }))
    : []
  const diagnostics = [
    ...validateBondApplicationDocumentRuleContract(profiledContract.rules).diagnostics,
    ...profiledContract.diagnostics.map((item) => ({ ...item, source: 'originator_requirement_profile' })),
    ...interpretationIssues,
  ]
  const role = participantContext?.participantRole || participantRole || 'primary_applicant'
  const participantKey = participantContext?.participantKey || null
  const participantPath = participantContext?.participantPath || null
  const hideSharedApplicationRequirements = Boolean(participantContext) &&
    role === 'surety' &&
    participantContext.canEditShared === false
  const resolved = profiledContract.rules
    .filter((definition) => {
      if (definition.scope === 'application') return !hideSharedApplicationRequirements
      return !definition.participantRole || definition.participantRole === role || (role !== 'surety' && definition.participantRole === 'primary_applicant')
    })
    .map((definition) => adaptRequirementForParticipant(definition, role, participantKey, participantPath))
    .map((definition) => normalizeRequirement(definition, applicationState))
    .map((requirement) => ({
      ...requirement,
      decisionFingerprint: applicationState?.interpretation?.decisionFingerprint || null,
    }))
    .sort((left, right) => (Number(left.order || 0) - Number(right.order || 0)) || String(left.key).localeCompare(String(right.key)))

  const activeRequirements = resolved.filter((requirement) => requirement.active)
  return {
    ruleSetVersion: BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
    interpretationVersion: applicationState?.interpretation?.version || null,
    interpretationTrusted: interpretationIssues.length === 0,
    decisionFingerprint: applicationState?.interpretation?.decisionFingerprint || null,
    requirementProfile: profiledContract.metadata,
    requirementProfileTrusted: profiledContract.trusted,
    activeRequirements,
    inactiveRequirements: resolved.filter((requirement) => !requirement.active),
    requiredRequirements: activeRequirements.filter((requirement) => requirement.required),
    optionalRequirements: activeRequirements.filter((requirement) => !requirement.required),
    diagnostics,
  }
}

export function buildBondApplicationDocumentRequirementFingerprint(requirements = []) {
  return requirements
    .map((requirement) => [
      requirement.ruleSetVersion || BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
      requirement.key,
      requirement.participantRole || '',
      requirement.requiredBefore || '',
      requirement.satisfactionMode || '',
      requirement.minimumFileCount || 1,
      requirement.allowMultipleFiles ? 'multiple_files' : 'single_file',
      requirement.requirementBaselineVersion || '',
      requirement.originatorProfileKey || '',
      requirement.originatorProfileVersion || '',
      requirement.requirementProfileFingerprint || '',
      requirement.evidencePeriodMonths || '',
      requirement.evidencePeriodYears || '',
      requirement.required ? 'required' : 'optional',
    ].join(':'))
    .sort()
    .join('|')
}
