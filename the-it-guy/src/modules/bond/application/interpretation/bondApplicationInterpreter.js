import {
  BOND_APPLICATION_INTENTS,
  cloneBondApplicationValue,
} from '../bondApplicationState.js'
import {
  EMPLOYMENT_TYPE_VALUES,
} from '../flow/bondApplicationFlowContract.js'

export const BOND_APPLICATION_INTERPRETER_VERSION = 'phase-1-v1'

const APPLICANT_STRUCTURE_ALIASES = Object.freeze({
  sole: ['sole', 'single', 'individual', 'primary_only'],
  joint: ['joint', 'co_applicant', 'co-applicant', 'multiple', 'two_applicants'],
  surety: ['surety', 'with_surety', 'surety_assisted'],
})

const BUYER_ENTITY_ALIASES = Object.freeze({
  individual: ['individual', 'natural_person', 'person', 'private_individual'],
  company: ['company', 'private_company', 'pty', 'pty_ltd', 'close_corporation', 'cc'],
  trust: ['trust', 'inter_vivos_trust', 'testamentary_trust'],
})

const APPLICATION_INTENT_ALIASES = Object.freeze({
  [BOND_APPLICATION_INTENTS.bondApplication]: ['bond_application', 'bond', 'application'],
  [BOND_APPLICATION_INTENTS.preApproval]: ['pre_approval', 'preapproval', 'pre_qualification', 'prequalification'],
  [BOND_APPLICATION_INTENTS.bondApplicationWithPreApproval]: [
    'bond_application_with_pre_approval',
    'bond_with_pre_approval',
    'application_with_pre_approval',
    'already_pre_approved',
  ],
})

const DECISION_LINEAGE_PATHS = Object.freeze({
  applicantStructure: ['summary.has_surety', 'summary.has_co_applicant'],
  buyerEntityType: ['summary.buyer_entity_type'],
  applicationIntent: ['summary.application_intent'],
  primaryEmploymentType: ['employment.primary.occupation_status'],
  coApplicantEmploymentType: ['employment.co_applicant.occupation_status'],
  purchasePrice: ['summary.purchase_price'],
  depositAmount: ['summary.deposit_contribution'],
  requestedBondAmount: ['loan_details.amount_to_be_registered'],
})

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function meaningful(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function findAlias(value, aliasMap) {
  const token = normalizeToken(value)
  if (!token) return { value: null, rawValue: value, supported: false, missing: true }
  const match = Object.entries(aliasMap).find(([, aliases]) => aliases.some((alias) => normalizeToken(alias) === token))
  return match
    ? { value: match[0], rawValue: value, supported: true, missing: false }
    : { value: null, rawValue: value, supported: false, missing: false }
}

function findEmploymentType(value) {
  const token = normalizeToken(value)
  if (!token) return { value: null, rawValue: value, supported: false, missing: true }
  const match = Object.entries(EMPLOYMENT_TYPE_VALUES).find(([, aliases]) =>
    aliases.some((alias) => normalizeToken(alias) === token),
  )
  return match
    ? { value: match[0], canonicalValue: match[1][0], rawValue: value, supported: true, missing: false }
    : { value: null, canonicalValue: null, rawValue: value, supported: false, missing: false }
}

function rawApplicantStructure(rawApplication = {}, applicationState = {}) {
  const explicit = applicationState?.application?.applicantStructure
  if (meaningful(explicit)) return explicit
  const hasSurety = normalizeToken(rawApplication?.summary?.has_surety)
  if (['yes', 'true', '1'].includes(hasSurety)) return 'surety'
  const hasCoApplicant = normalizeToken(rawApplication?.summary?.has_co_applicant)
  if (['yes', 'true', '1'].includes(hasCoApplicant)) return 'joint'
  if (['no', 'false', '0'].includes(hasCoApplicant) && ['no', 'false', '0', ''].includes(hasSurety)) return 'sole'
  if (applicationState?.participants?.coApplicant) return 'joint'
  return explicit || null
}

function rawBuyerEntityType(rawApplication = {}, applicationState = {}) {
  return rawApplication?.summary?.buyer_entity_type ||
    rawApplication?.summary?.purchaser_type ||
    applicationState?.application?.buyerEntity?.entityType ||
    null
}

function rawApplicationIntent(rawApplication = {}, applicationState = {}) {
  return rawApplication?.summary?.application_intent ||
    rawApplication?.application_intent ||
    applicationState?.application?.intent ||
    null
}

function issue({ code, path, rawValue, message, category = 'interpretation' }) {
  return {
    category,
    code,
    path,
    rawValue: rawValue ?? null,
    message,
    blocking: true,
  }
}

function addDecisionIssue(issues, decision, { missingCode, unsupportedCode, path, label, required = true }) {
  if (decision.missing && required) {
    issues.push(issue({
      code: missingCode,
      path,
      rawValue: decision.rawValue,
      message: `Select a supported ${label} before the application can continue.`,
    }))
  } else if (!decision.missing && !decision.supported) {
    issues.push(issue({
      code: unsupportedCode,
      path,
      rawValue: decision.rawValue,
      message: `The ${label} value "${String(decision.rawValue)}" needs originator review before requirements can be trusted.`,
    }))
  }
}

function parseAmount(value) {
  if (!meaningful(value)) return { value: null, valid: true, rawValue: value }
  const parsed = Number(String(value).replace(/[R,$\s]/g, ''))
  return {
    value: Number.isFinite(parsed) ? parsed : null,
    valid: Number.isFinite(parsed) && parsed >= 0,
    rawValue: value,
  }
}

function buildLineage(prefillMetadata = {}) {
  const sourceByPath = prefillMetadata?.sourceByPath || {}
  return Object.fromEntries(Object.entries(DECISION_LINEAGE_PATHS).map(([decisionKey, paths]) => {
    const matchedPath = paths.find((path) => sourceByPath[path]) || ''
    const source = matchedPath ? sourceByPath[matchedPath] : null
    return [decisionKey, source
      ? {
          decisionKey,
          fieldPath: matchedPath,
          sourceKey: source.sourceKey || 'unknown',
          sourcePath: source.sourcePath || '',
          sourceLabel: source.sourceLabel || source.sourceKey || 'Unknown',
        }
      : {
          decisionKey,
          fieldPath: paths[0],
          sourceKey: 'normalized_application_state',
          sourcePath: '',
          sourceLabel: 'Normalized application state',
        }]
  }))
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

function fingerprint(value) {
  const input = JSON.stringify(canonicalize(value))
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${BOND_APPLICATION_INTERPRETER_VERSION}:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function participantHasMeaningfulData(participant = null) {
  if (!participant || typeof participant !== 'object') return false
  const personal = participant.personal || {}
  const contact = participant.contact || {}
  const employment = participant.employment || {}
  const expenses = participant.expenses || {}
  const identifyingValues = [
    personal.first_name,
    personal.firstName,
    personal.last_name,
    personal.lastName,
    personal.id_number,
    personal.identity_number,
    personal.passport_number,
    personal.email,
    personal.phone,
    contact.email,
    contact.phone,
    employment.occupation_status,
    employment.employer_name,
    employment.nature_of_occupation,
    expenses.gross_salary,
  ]
  if (identifyingValues.some(meaningful)) return true
  return [
    participant.incomeSources,
    participant.monthlyCommitments,
    participant.bankAccounts,
    participant.debts,
    participant.assets,
    participant.liabilities,
    participant.existingProperties,
  ].some((items) => Array.isArray(items) && items.length > 0)
}

function participantSummary(applicationState = {}, applicantStructure = null) {
  const coApplicant = applicationState?.participants?.coApplicant || null
  const sureties = Array.isArray(applicationState?.participants?.sureties)
    ? applicationState.participants.sureties.filter(participantHasMeaningfulData)
    : []
  return {
    primaryApplicantCount: applicationState?.participants?.primaryApplicant ? 1 : 0,
    coApplicantCount: participantHasMeaningfulData(coApplicant) ? 1 : 0,
    suretyCount: sureties.length,
    expectedCoApplicant: applicantStructure === 'joint',
    expectedSurety: applicantStructure === 'surety',
  }
}

export function interpretBondApplicationState({
  applicationState = {},
  rawApplication = applicationState?.compatibility?.legacyBase || {},
  prefillMetadata = rawApplication?.prefill_metadata || {},
} = {}) {
  const applicantStructure = findAlias(rawApplicantStructure(rawApplication, applicationState), APPLICANT_STRUCTURE_ALIASES)
  const buyerEntityType = findAlias(rawBuyerEntityType(rawApplication, applicationState), BUYER_ENTITY_ALIASES)
  const applicationIntent = findAlias(rawApplicationIntent(rawApplication, applicationState), APPLICATION_INTENT_ALIASES)
  const primaryEmploymentType = findEmploymentType(
    rawApplication?.employment?.primary?.occupation_status ||
    applicationState?.participants?.primaryApplicant?.employment?.occupation_status,
  )
  const coApplicantEmploymentType = findEmploymentType(
    rawApplication?.employment?.co_applicant?.occupation_status ||
    applicationState?.participants?.coApplicant?.employment?.occupation_status,
  )
  const participants = participantSummary(applicationState, applicantStructure.value)
  const finance = {
    purchasePrice: parseAmount(applicationState?.application?.finance?.purchasePrice),
    depositAmount: parseAmount(applicationState?.application?.finance?.depositAmount),
    requestedBondAmount: parseAmount(applicationState?.application?.finance?.requestedBondAmount),
  }
  const issues = []

  addDecisionIssue(issues, applicantStructure, {
    missingCode: 'applicant_structure_required',
    unsupportedCode: 'unsupported_applicant_structure',
    path: 'application.applicantStructure',
    label: 'applicant structure',
  })
  addDecisionIssue(issues, buyerEntityType, {
    missingCode: 'buyer_entity_type_required',
    unsupportedCode: 'unsupported_buyer_entity_type',
    path: 'application.buyerEntity.entityType',
    label: 'purchaser type',
  })
  addDecisionIssue(issues, applicationIntent, {
    missingCode: 'application_intent_required',
    unsupportedCode: 'unsupported_application_intent',
    path: 'application.intent',
    label: 'application intent',
  })
  addDecisionIssue(issues, primaryEmploymentType, {
    missingCode: 'primary_employment_type_required',
    unsupportedCode: 'unsupported_primary_employment_type',
    path: 'participants.primaryApplicant.employment.occupation_status',
    label: 'primary applicant employment type',
  })
  if (participants.expectedCoApplicant || participants.coApplicantCount > 0) {
    addDecisionIssue(issues, coApplicantEmploymentType, {
      missingCode: 'co_applicant_employment_type_required',
      unsupportedCode: 'unsupported_co_applicant_employment_type',
      path: 'participants.coApplicant.employment.occupation_status',
      label: 'co-applicant employment type',
    })
  }
  if (participants.expectedCoApplicant && participants.coApplicantCount === 0) {
    issues.push(issue({
      code: 'co_applicant_missing',
      path: 'participants.coApplicant',
      message: 'Add the co-applicant before requirements can be trusted.',
    }))
  }
  if (participants.expectedSurety && participants.suretyCount === 0) {
    issues.push(issue({
      code: 'surety_missing',
      path: 'participants.sureties',
      message: 'Add the surety before requirements can be trusted.',
    }))
  }
  Object.entries(finance).forEach(([key, amount]) => {
    if (!amount.valid) {
      issues.push(issue({
        code: 'invalid_finance_amount',
        path: `application.finance.${key}`,
        rawValue: amount.rawValue,
        message: `${key} must be a valid non-negative amount.`,
      }))
    }
  })

  const decisions = {
    applicantStructure: applicantStructure.value,
    buyerEntityType: buyerEntityType.value,
    applicationIntent: applicationIntent.value,
    primaryEmploymentType: primaryEmploymentType.value,
    primaryEmploymentCanonicalValue: primaryEmploymentType.canonicalValue || null,
    coApplicantEmploymentType: coApplicantEmploymentType.value,
    coApplicantEmploymentCanonicalValue: coApplicantEmploymentType.canonicalValue || null,
    participants,
    finance: Object.fromEntries(Object.entries(finance).map(([key, amount]) => [key, amount.value])),
  }
  const lineage = buildLineage(prefillMetadata)
  const decisionFingerprint = fingerprint({
    transactionId: applicationState?.application?.transactionId || null,
    decisions,
  })
  const interpretedState = cloneBondApplicationValue(applicationState) || {}
  interpretedState.application = {
    ...(interpretedState.application || {}),
    applicantStructure: applicantStructure.value,
    intent: applicationIntent.value,
    buyerEntity: {
      ...(interpretedState.application?.buyerEntity || {}),
      entityType: buyerEntityType.value,
    },
  }
  if (interpretedState.participants?.primaryApplicant?.employment && primaryEmploymentType.canonicalValue) {
    interpretedState.participants.primaryApplicant.employment.occupation_status = primaryEmploymentType.canonicalValue
  }
  if (interpretedState.participants?.coApplicant?.employment && coApplicantEmploymentType.canonicalValue) {
    interpretedState.participants.coApplicant.employment.occupation_status = coApplicantEmploymentType.canonicalValue
  }

  const interpretation = {
    version: BOND_APPLICATION_INTERPRETER_VERSION,
    status: issues.length ? 'review_blocked' : 'trusted',
    trusted: issues.length === 0,
    decisionFingerprint,
    decisions,
    lineage,
    blockingIssues: issues,
  }
  interpretedState.interpretation = interpretation

  return {
    ...interpretation,
    applicationState: interpretedState,
  }
}
