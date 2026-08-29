import {
  cloneBondApplicationValue,
  convertPreApprovalToBondApplication,
  createEmptyBondApplicationState,
} from '../bondApplicationState.js'
import { fromLegacyBondApplication, toLegacyBondApplication } from '../legacy/bondApplicationLegacyAdapter.js'
import { hashCanonicalBondApplicationPayload } from '../submission/bondApplicationSnapshotHash.js'
import { buildBondApplicationParticipantEntityCompleteness } from './bondApplicationParticipantEntityCompleteness.js'

export const GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG = 'guided_bond_application_participants_v1'
export const GUIDED_BOND_APPLICATION_PARTICIPANTS_ENV = 'VITE_FEATURE_GUIDED_BOND_APPLICATION_PARTICIPANTS_V1'
export const GUIDED_BOND_APPLICATION_SURETIES_FLAG = 'guided_bond_application_sureties_v1'
export const GUIDED_BOND_APPLICATION_SURETIES_ENV = 'VITE_FEATURE_GUIDED_BOND_APPLICATION_SURETIES_V1'
export const GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG = 'guided_bond_application_change_requests_v1'
export const GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_ENV = 'VITE_FEATURE_GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_V1'
export const BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION = 'phase-7-v1'
export const BOND_APPLICATION_NORMALIZED_STORAGE_MODE = 'normalized_v1'
export const BOND_APPLICATION_LEGACY_STORAGE_MODE = 'legacy'
export const BOND_APPLICATION_PHASE7_MAXIMUM_ACTIVE_SURETIES = 1

export const BOND_APPLICATION_PARTICIPANT_ROLES = {
  primaryApplicant: 'primary_applicant',
  coApplicant: 'co_applicant',
  surety: 'surety',
}

export const BOND_APPLICATION_SHARED_SECTION_KEYS = [
  'application_intent',
  'application_finance',
  'applicant_structure',
  'pre_approval',
  'buyer_entity',
  'selected_banks',
  'shared_property_summary',
]

export const BOND_APPLICATION_PARTICIPANT_SECTION_KEYS = [
  'personal_contact',
  'address_residency',
  'marital_details',
  'employment_income',
  'monthly_commitments',
  'accounts_assets',
  'credit_history',
  'relationship_context',
  'financial_position',
  'liabilities',
  'surety_terms_confirmation',
  'review_declarations_draft',
]

export const BOND_APPLICATION_STATUSES = {
  draft: 'draft',
  awaitingParticipants: 'awaiting_participants',
  readyForReview: 'ready_for_review',
  preparingSubmission: 'preparing_submission',
  awaitingSignatures: 'awaiting_signatures',
  submitted: 'submitted',
  changesRequested: 'changes_requested',
  revisionInProgress: 'revision_in_progress',
  revisionUnderReview: 'revision_under_review',
  readyForReReview: 'ready_for_re_review',
  awaitingRevisedSignatures: 'awaiting_revised_signatures',
  cancelled: 'cancelled',
}

export const BOND_APPLICATION_PARTICIPANT_STATUSES = {
  pendingInvite: 'pending_invite',
  invited: 'invited',
  accepted: 'accepted',
  inProgress: 'in_progress',
  changesRequested: 'changes_requested',
  correctionsSubmitted: 'corrections_submitted',
  readyForSubmission: 'ready_for_submission',
  awaitingSignature: 'awaiting_signature',
  signed: 'signed',
  completed: 'completed',
  declined: 'declined',
  withdrawn: 'withdrawn',
  removed: 'removed',
}

export const BOND_APPLICATION_INVITE_STATUSES = {
  pending: 'pending',
  sent: 'sent',
  accepted: 'accepted',
  declined: 'declined',
  revoked: 'revoked',
  expired: 'expired',
  superseded: 'superseded',
}

export const BOND_APPLICATION_CHANGE_REQUEST_TYPES = {
  supplementalDocuments: 'supplemental_documents',
  applicationCorrection: 'application_correction',
  participantChange: 'participant_change',
  mixed: 'mixed',
}

export const BOND_APPLICATION_CHANGE_REQUEST_STATUSES = {
  draft: 'draft',
  sent: 'sent',
  inProgress: 'in_progress',
  awaitingInternalReview: 'awaiting_internal_review',
  resolved: 'resolved',
  withdrawn: 'withdrawn',
  superseded: 'superseded',
  cancelled: 'cancelled',
}

export const BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES = {
  open: 'open',
  inProgress: 'in_progress',
  addressed: 'addressed',
  awaitingReview: 'awaiting_review',
  accepted: 'accepted',
  needsMoreInformation: 'needs_more_information',
  withdrawn: 'withdrawn',
  superseded: 'superseded',
}

export const BOND_APPLICATION_CHANGE_REQUEST_EFFECTS = {
  supplementalOnly: 'supplemental_only',
  newSubmissionRequired: 'new_submission_required',
}

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled'])
const PRIVATE_PARTICIPANT_STATUSES = new Set([
  BOND_APPLICATION_PARTICIPANT_STATUSES.pendingInvite,
  BOND_APPLICATION_PARTICIPANT_STATUSES.invited,
  BOND_APPLICATION_PARTICIPANT_STATUSES.accepted,
  BOND_APPLICATION_PARTICIPANT_STATUSES.inProgress,
  BOND_APPLICATION_PARTICIPANT_STATUSES.readyForSubmission,
  BOND_APPLICATION_PARTICIPANT_STATUSES.awaitingSignature,
  BOND_APPLICATION_PARTICIPANT_STATUSES.signed,
  BOND_APPLICATION_PARTICIPANT_STATUSES.completed,
  BOND_APPLICATION_PARTICIPANT_STATUSES.declined,
  BOND_APPLICATION_PARTICIPANT_STATUSES.withdrawn,
  BOND_APPLICATION_PARTICIPANT_STATUSES.removed,
])

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (ENABLED_VALUES.has(normalized)) return true
  if (DISABLED_VALUES.has(normalized)) return false
  return null
}

function flagValueFrom(source, flagKey) {
  if (!source || typeof source !== 'object') return null
  const camelKey = flagKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  return normalizeBoolean(
    source[flagKey] ??
      source[camelKey] ??
      source.features?.[flagKey] ??
      source.features?.[camelKey] ??
      source.feature_flags?.[flagKey] ??
      source.featureFlags?.[camelKey],
  )
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'primary' || value === 'primary_applicant') return BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant
  if (value === 'co' || value === 'co_applicant' || value === 'co-applicant') return BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant
  if (value === 'surety') return BOND_APPLICATION_PARTICIPANT_ROLES.surety
  return value
}

function participantStateKey(role) {
  const normalizedRole = normalizeRole(role)
  if (normalizedRole === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant) return 'coApplicant'
  if (normalizedRole === BOND_APPLICATION_PARTICIPANT_ROLES.surety) return 'sureties'
  return 'primaryApplicant'
}

function stableKey(role, ordinal = 1) {
  return `${normalizeRole(role)}:${Math.max(Number(ordinal) || 1, 1)}`
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeAnswers(value) {
  return isPlainObject(value) ? cloneBondApplicationValue(value) : {}
}

function getParticipantValue(state, role) {
  if (normalizeRole(role) === BOND_APPLICATION_PARTICIPANT_ROLES.surety) return null
  return state?.participants?.[participantStateKey(role)] || null
}

function getSuretyParticipantValues(state) {
  const sureties = state?.participants?.sureties
  return Array.isArray(sureties) ? sureties.filter(Boolean) : []
}

function isActiveParticipant(participant = {}) {
  return Boolean(participant) &&
    participant.status !== BOND_APPLICATION_PARTICIPANT_STATUSES.removed &&
    participant.status !== BOND_APPLICATION_PARTICIPANT_STATUSES.withdrawn &&
    participant.status !== BOND_APPLICATION_PARTICIPANT_STATUSES.declined &&
    !participant.removedAt &&
    !participant.withdrawnAt &&
    !participant.declinedAt
}

export function resolveGuidedBondApplicationParticipantsFlag({
  env = (typeof import.meta !== 'undefined' && import.meta.env) || {},
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG)],
    ['organisation', flagValueFrom(organisation, GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG)],
    ['config', flagValueFrom(config, GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG)],
    ['environment', normalizeBoolean(env?.[GUIDED_BOND_APPLICATION_PARTICIPANTS_ENV])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)
  return {
    key: GUIDED_BOND_APPLICATION_PARTICIPANTS_FLAG,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function resolveGuidedBondApplicationSuretiesFlag({
  env = (typeof import.meta !== 'undefined' && import.meta.env) || {},
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, GUIDED_BOND_APPLICATION_SURETIES_FLAG)],
    ['organisation', flagValueFrom(organisation, GUIDED_BOND_APPLICATION_SURETIES_FLAG)],
    ['config', flagValueFrom(config, GUIDED_BOND_APPLICATION_SURETIES_FLAG)],
    ['environment', normalizeBoolean(env?.[GUIDED_BOND_APPLICATION_SURETIES_ENV])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)
  return {
    key: GUIDED_BOND_APPLICATION_SURETIES_FLAG,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function resolveGuidedBondApplicationChangeRequestsFlag({
  env = (typeof import.meta !== 'undefined' && import.meta.env) || {},
  config = null,
  organisation = null,
  transaction = null,
} = {}) {
  const candidates = [
    ['transaction', flagValueFrom(transaction, GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG)],
    ['organisation', flagValueFrom(organisation, GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG)],
    ['config', flagValueFrom(config, GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG)],
    ['environment', normalizeBoolean(env?.[GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_ENV])],
  ]
  const explicit = candidates.find(([, value]) => value !== null)
  return {
    key: GUIDED_BOND_APPLICATION_CHANGE_REQUESTS_FLAG,
    enabled: explicit ? explicit[1] === true : false,
    source: explicit ? explicit[0] : 'default_disabled',
  }
}

export function resolveBondApplicationCapabilities({
  guidedV2 = false,
  participantsV1 = false,
  suretiesV1 = false,
  changeRequestsV1 = false,
  maximumActiveSureties = BOND_APPLICATION_PHASE7_MAXIMUM_ACTIVE_SURETIES,
} = {}) {
  const guided = Boolean(guidedV2)
  const participants = guided && Boolean(participantsV1)
  const sureties = participants && Boolean(suretiesV1)
  const changeRequests = participants && Boolean(changeRequestsV1)
  return {
    guidedV2: guided,
    participantsV1: participants,
    suretiesV1: sureties,
    changeRequestsV1: changeRequests,
    maximumActiveSureties: Math.max(Number(maximumActiveSureties) || 0, 0),
  }
}

export function resolveBondApplicationMode({
  guidedFlowEnabled = false,
  participantFlowEnabled = false,
  existingApplication = null,
  existingSubmission = null,
  legacyData = null,
  requestedApplicantStructure = null,
} = {}) {
  const submissionStatus = String(existingSubmission?.status || legacyData?.status || '').trim().toLowerCase()
  if (!guidedFlowEnabled) return { mode: 'legacy', reason: 'guided_feature_disabled' }
  if (['submitted', 'awaiting_signature', 'awaiting_signatures'].includes(submissionStatus)) {
    return { mode: 'legacy', reason: 'submitted_or_locked_application' }
  }
  if (!participantFlowEnabled) return { mode: 'guided_legacy_storage', reason: 'participant_feature_disabled' }
  if (existingApplication?.storage_mode === BOND_APPLICATION_NORMALIZED_STORAGE_MODE) {
    return { mode: 'guided_normalized_storage', reason: 'existing_normalized_application' }
  }
  const structure = String(requestedApplicantStructure || legacyData?.application?.applicantStructure || '').trim().toLowerCase()
  if (structure === 'surety') return { mode: 'legacy', reason: 'surety_unsupported' }
  return { mode: 'guided_normalized_storage', reason: 'phase6_eligible' }
}

export function createBondApplicationParticipant({
  role,
  id = null,
  participantKey = null,
  ordinal = 1,
  status = null,
  invitationStatus = null,
  personId = null,
  contactId = null,
  displayName = '',
  email = '',
  phone = '',
  metadata = {},
} = {}) {
  const resolvedRole = normalizeRole(role)
  if (!Object.values(BOND_APPLICATION_PARTICIPANT_ROLES).includes(resolvedRole)) {
    throw new Error(`Unsupported bond application participant role: ${role}`)
  }
  return {
    id,
    participantKey: participantKey || stableKey(resolvedRole, ordinal),
    role: resolvedRole,
    ordinal,
    personId,
    contactId,
    status: status || (resolvedRole === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant
      ? BOND_APPLICATION_PARTICIPANT_STATUSES.inProgress
      : BOND_APPLICATION_PARTICIPANT_STATUSES.pendingInvite),
    invitationStatus: invitationStatus || null,
    displayName,
    email,
    phone,
    reviewContextHash: metadata.reviewContextHash || null,
    reviewedRevision: metadata.reviewedRevision || null,
    readyAt: metadata.readyAt || null,
    signedAt: metadata.signedAt || null,
    completedAt: metadata.completedAt || null,
    declinedAt: metadata.declinedAt || null,
    removedAt: metadata.removedAt || null,
    metadata: normalizeAnswers(metadata),
  }
}

export function createNormalizedBondApplicationRecord({
  id = null,
  transactionId = null,
  onboardingFormDataId = null,
  status = BOND_APPLICATION_STATUSES.draft,
  revision = 1,
  legacyHash = '',
  legacyUpdatedAt = null,
  participants = [],
  sharedSections = {},
  participantSections = {},
  metadata = {},
} = {}) {
  return {
    id,
    transactionId,
    onboardingFormDataId,
    schemaVersion: BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION,
    flowVersion: 'phase-7-v1',
    storageMode: BOND_APPLICATION_NORMALIZED_STORAGE_MODE,
    status,
    revision: Math.max(Number(revision) || 1, 1),
    sourceLegacyHash: legacyHash || '',
    sourceLegacyUpdatedAt: legacyUpdatedAt || null,
    compatibilityProjectionVersion: metadata.compatibilityProjectionVersion || null,
    compatibilityProjectionHash: metadata.compatibilityProjectionHash || null,
    compatibilityProjectedAt: metadata.compatibilityProjectedAt || null,
    activeSubmissionId: metadata.activeSubmissionId || null,
    lockedAt: metadata.lockedAt || null,
    submittedAt: metadata.submittedAt || null,
    participants: participants.map(createBondApplicationParticipant),
    sharedSections: normalizeAnswers(sharedSections),
    participantSections: normalizeAnswers(participantSections),
    documentRequirements: Array.isArray(metadata.documentRequirements) ? cloneBondApplicationValue(metadata.documentRequirements) : [],
    metadata: normalizeAnswers(metadata),
  }
}

export function buildNormalizedBondApplicationFromState({
  applicationState = createEmptyBondApplicationState(),
  transactionId = applicationState?.application?.transactionId || null,
  onboardingFormDataId = null,
  includeCoApplicant = false,
  legacyHash = '',
  legacyUpdatedAt = null,
} = {}) {
  const participants = [
    createBondApplicationParticipant({
      role: BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
      ordinal: 1,
      status: BOND_APPLICATION_PARTICIPANT_STATUSES.inProgress,
      displayName: [
        applicationState?.participants?.primaryApplicant?.personal?.first_name,
        applicationState?.participants?.primaryApplicant?.personal?.surname,
      ].filter(Boolean).join(' '),
      email: applicationState?.participants?.primaryApplicant?.contact?.email || applicationState?.participants?.primaryApplicant?.personal?.email || '',
      phone: applicationState?.participants?.primaryApplicant?.contact?.phone || applicationState?.participants?.primaryApplicant?.personal?.phone || '',
    }),
  ]
  if (includeCoApplicant || applicationState?.application?.applicantStructure === 'joint' || applicationState?.participants?.coApplicant) {
    participants.push(createBondApplicationParticipant({
      role: BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant,
      ordinal: 1,
      status: applicationState?.participants?.coApplicant
        ? BOND_APPLICATION_PARTICIPANT_STATUSES.inProgress
        : BOND_APPLICATION_PARTICIPANT_STATUSES.pendingInvite,
      displayName: [
        applicationState?.participants?.coApplicant?.personal?.first_name,
        applicationState?.participants?.coApplicant?.personal?.surname,
      ].filter(Boolean).join(' '),
      email: applicationState?.participants?.coApplicant?.contact?.email || applicationState?.participants?.coApplicant?.personal?.email || '',
      phone: applicationState?.participants?.coApplicant?.contact?.phone || applicationState?.participants?.coApplicant?.personal?.phone || '',
    }))
  }
  getSuretyParticipantValues(applicationState).forEach((surety, index) => {
    participants.push(createBondApplicationParticipant({
      role: BOND_APPLICATION_PARTICIPANT_ROLES.surety,
      ordinal: index + 1,
      status: surety.status || BOND_APPLICATION_PARTICIPANT_STATUSES.pendingInvite,
      displayName: [
        surety?.personal?.first_name,
        surety?.personal?.surname,
      ].filter(Boolean).join(' '),
      email: surety?.contact?.email || surety?.personal?.email || '',
      phone: surety?.contact?.phone || surety?.personal?.phone || '',
      metadata: {
        relationship_to_applicant: surety?.relationshipToApplicant || surety?.relationship_context?.relationship_to_applicant || null,
        required_to_sign: surety?.requiredToSign !== false,
      },
    }))
  })

  return createNormalizedBondApplicationRecord({
    transactionId,
    onboardingFormDataId,
    revision: 1,
    legacyHash,
    legacyUpdatedAt,
    participants,
    sharedSections: {
      application_intent: {
        intent: applicationState.application?.intent || 'bond_application',
      },
      application_finance: cloneBondApplicationValue(applicationState.application?.finance || {}),
      pre_approval: cloneBondApplicationValue(applicationState.application?.preApproval || {}),
      applicant_structure: {
        applicantStructure: applicationState.application?.applicantStructure || (participants.length > 1 ? 'joint' : 'sole'),
        requiresSurety: applicationState.application?.requiresSurety || 'no',
      },
      buyer_entity: cloneBondApplicationValue(applicationState.application?.buyerEntity || {
        entityType: 'individual',
        name: null,
        registrationNumber: null,
      }),
      selected_banks: cloneBondApplicationValue(applicationState.application?.selectedBankIds || []),
      shared_property_summary: cloneBondApplicationValue(applicationState.application?.property || {}),
    },
    participantSections: participants.reduce((accumulator, participant) => {
      const participantValue = participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety
        ? getSuretyParticipantValues(applicationState)[Math.max(Number(participant.ordinal) || 1, 1) - 1] || {}
        : getParticipantValue(applicationState, participant.role) || {}
      accumulator[participant.participantKey] = splitParticipantIntoSections(participantValue)
      return accumulator
    }, {}),
  })
}

export function convertNormalizedPreApprovalToBondApplication({
  normalizedApplication = {},
  now = new Date().toISOString(),
  preserveSelectedBankIds = false,
  preApproval = {},
} = {}) {
  const applicationState = buildApplicationStateFromNormalizedApplication(normalizedApplication)
  const convertedState = convertPreApprovalToBondApplication(applicationState, {
    now,
    preserveSelectedBankIds,
    preApproval,
  })
  const next = cloneBondApplicationValue(normalizedApplication) || {}
  next.revision = Math.max(Number(next.revision) || 1, 1) + 1
  next.status = BOND_APPLICATION_STATUSES.draft
  next.activeSubmissionId = null
  next.lockedAt = null
  next.submittedAt = null
  next.sharedSections = {
    ...(next.sharedSections || {}),
    application_intent: {
      intent: convertedState.application.intent,
    },
    pre_approval: cloneBondApplicationValue(convertedState.application.preApproval || {}),
    selected_banks: cloneBondApplicationValue(convertedState.application.selectedBankIds || []),
  }
  next.metadata = {
    ...(next.metadata || {}),
    preApprovalConversion: cloneBondApplicationValue(convertedState.compatibility?.preApprovalConversion || {}),
  }
  return {
    applicationState: convertedState,
    normalizedApplication: next,
  }
}

export function splitParticipantIntoSections(participant = {}) {
  return {
    personal_contact: {
      personal: cloneBondApplicationValue(participant.personal || {}),
      contact: cloneBondApplicationValue(participant.contact || {}),
    },
    address_residency: {
      address: cloneBondApplicationValue(participant.address || {}),
    },
    marital_details: {
      marital: cloneBondApplicationValue(participant.marital || {}),
    },
    employment_income: {
      employment: cloneBondApplicationValue(participant.employment || {}),
      incomeSources: cloneBondApplicationValue(participant.incomeSources || []),
      expenses: cloneBondApplicationValue(participant.expenses || {}),
    },
    monthly_commitments: {
      monthlyCommitments: cloneBondApplicationValue(participant.monthlyCommitments || []),
    },
    accounts_assets: {
      bankAccounts: cloneBondApplicationValue(participant.bankAccounts || []),
      debts: cloneBondApplicationValue(participant.debts || []),
      assets: cloneBondApplicationValue(participant.assets || []),
      liabilities: cloneBondApplicationValue(participant.liabilities || []),
      existingProperties: cloneBondApplicationValue(participant.existingProperties || []),
    },
    relationship_context: {
      relationship: cloneBondApplicationValue(participant.relationship || participant.relationshipContext || {}),
      relationshipToApplicant: participant.relationshipToApplicant || participant.relationship_context?.relationship_to_applicant || null,
    },
    financial_position: {
      financialPosition: cloneBondApplicationValue(participant.financialPosition || {}),
    },
    liabilities: {
      liabilities: cloneBondApplicationValue(participant.liabilities || []),
    },
    credit_history: {
      credit: cloneBondApplicationValue(participant.credit || {}),
    },
    surety_terms_confirmation: {
      suretyTerms: cloneBondApplicationValue(participant.suretyTerms || {}),
      approvedTemplateKey: participant.approvedTemplateKey || null,
    },
    review_declarations_draft: {
      declarations: cloneBondApplicationValue(participant.declarations || {}),
    },
  }
}

export function mergeParticipantSectionsToParticipant(sections = {}, base = {}) {
  return {
    role: base.role || null,
    legacyApplicantKey: base.legacyApplicantKey || null,
    personal: cloneBondApplicationValue(sections.personal_contact?.personal || base.personal || {}),
    contact: cloneBondApplicationValue(sections.personal_contact?.contact || base.contact || {}),
    address: cloneBondApplicationValue(sections.address_residency?.address || base.address || {}),
    marital: cloneBondApplicationValue(sections.marital_details?.marital || base.marital || {}),
    employment: cloneBondApplicationValue(sections.employment_income?.employment || base.employment || {}),
    incomeSources: cloneBondApplicationValue(sections.employment_income?.incomeSources || base.incomeSources || []),
    expenses: cloneBondApplicationValue(sections.employment_income?.expenses || base.expenses || {}),
    monthlyCommitments: cloneBondApplicationValue(sections.monthly_commitments?.monthlyCommitments || base.monthlyCommitments || []),
    bankAccounts: cloneBondApplicationValue(sections.accounts_assets?.bankAccounts || base.bankAccounts || []),
    debts: cloneBondApplicationValue(sections.accounts_assets?.debts || base.debts || []),
    assets: cloneBondApplicationValue(sections.accounts_assets?.assets || base.assets || []),
    liabilities: cloneBondApplicationValue(sections.accounts_assets?.liabilities || base.liabilities || []),
    existingProperties: cloneBondApplicationValue(sections.accounts_assets?.existingProperties || base.existingProperties || []),
    relationship: cloneBondApplicationValue(sections.relationship_context?.relationship || base.relationship || {}),
    relationshipToApplicant: sections.relationship_context?.relationshipToApplicant || base.relationshipToApplicant || null,
    financialPosition: cloneBondApplicationValue(sections.financial_position?.financialPosition || base.financialPosition || {}),
    credit: cloneBondApplicationValue(sections.credit_history?.credit || base.credit || {}),
    suretyTerms: cloneBondApplicationValue(sections.surety_terms_confirmation?.suretyTerms || base.suretyTerms || {}),
    approvedTemplateKey: sections.surety_terms_confirmation?.approvedTemplateKey || base.approvedTemplateKey || null,
    declarations: cloneBondApplicationValue(sections.review_declarations_draft?.declarations || base.declarations || {}),
    legacySignature: cloneBondApplicationValue(base.legacySignature || {}),
  }
}

export function buildApplicationStateFromNormalizedApplication(normalizedApplication = {}) {
  const state = createEmptyBondApplicationState()
  state.application.transactionId = normalizedApplication.transactionId || null
  state.application.intent = normalizedApplication.sharedSections?.application_intent?.intent || state.application.intent
  state.application.finance = cloneBondApplicationValue(normalizedApplication.sharedSections?.application_finance || {})
  state.application.preApproval = {
    ...state.application.preApproval,
    ...(cloneBondApplicationValue(normalizedApplication.sharedSections?.pre_approval || {})),
  }
  state.application.applicantStructure = normalizedApplication.sharedSections?.applicant_structure?.applicantStructure ||
    ((normalizedApplication.participants || []).some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant && !participant.removedAt) ? 'joint' : 'sole')
  state.application.requiresSurety = normalizedApplication.sharedSections?.applicant_structure?.requiresSurety || 'no'
  state.application.buyerEntity = cloneBondApplicationValue(normalizedApplication.sharedSections?.buyer_entity || {
    entityType: 'individual',
    name: null,
    registrationNumber: null,
  })
  state.application.selectedBankIds = cloneBondApplicationValue(normalizedApplication.sharedSections?.selected_banks || [])
  state.application.property = cloneBondApplicationValue(normalizedApplication.sharedSections?.shared_property_summary || {})

  ;(normalizedApplication.participants || []).forEach((participant) => {
    if (!isActiveParticipant(participant)) return
    const sections = normalizedApplication.participantSections?.[participant.participantKey] || {}
    const merged = mergeParticipantSectionsToParticipant(sections, {
      role: participant.role,
      legacyApplicantKey: participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant
        ? 'co'
        : participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety
          ? 'surety'
          : 'primary',
    })
    if (participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant) {
      state.participants.coApplicant = merged
    } else if (participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety) {
      state.participants.sureties = Array.isArray(state.participants.sureties) ? state.participants.sureties : []
      state.participants.sureties.push(merged)
    } else {
      state.participants.primaryApplicant = merged
    }
  })
  state.participantEntityCompleteness = buildBondApplicationParticipantEntityCompleteness(state)
  return state
}

export function loadNormalizedBondApplicationState({
  normalizedApplication,
  viewerParticipantKey = null,
  viewerRole = BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
  internal = false,
} = {}) {
  const fullState = buildApplicationStateFromNormalizedApplication(normalizedApplication)
  if (internal) {
    return { applicationState: fullState, participants: cloneBondApplicationValue(normalizedApplication.participants || []), privacy: { internal: true } }
  }

  const role = normalizeRole(viewerRole)
  const viewerKey = viewerParticipantKey ||
    (normalizedApplication.participants || []).find((participant) => participant.role === role)?.participantKey ||
    stableKey(role)
  const participant = (normalizedApplication.participants || []).find((item) => item.participantKey === viewerKey) || null
  const redactedState = cloneBondApplicationValue(fullState)
  if (role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant) {
    redactedState.participants.coApplicant = null
    redactedState.participants.sureties = []
  } else if (role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant) {
    redactedState.participants.primaryApplicant = null
    redactedState.participants.sureties = []
  } else if (role === BOND_APPLICATION_PARTICIPANT_ROLES.surety) {
    const suretyIndex = (normalizedApplication.participants || [])
      .filter((item) => item.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety)
      .findIndex((item) => item.participantKey === viewerKey)
    redactedState.participants.primaryApplicant = null
    redactedState.participants.coApplicant = null
    redactedState.participants.sureties = suretyIndex >= 0 && fullState.participants.sureties?.[suretyIndex]
      ? [fullState.participants.sureties[suretyIndex]]
      : []
  } else {
    redactedState.participants.primaryApplicant = null
    redactedState.participants.coApplicant = null
    redactedState.participants.sureties = []
  }
  const safeOtherParticipants = (normalizedApplication.participants || [])
    .filter((item) => item.participantKey !== viewerKey)
    .map((item) => ({
      participantKey: item.participantKey,
      role: item.role,
      displayName: item.displayName || '',
      status: PRIVATE_PARTICIPANT_STATUSES.has(item.status) ? item.status : BOND_APPLICATION_PARTICIPANT_STATUSES.inProgress,
      invitationStatus: item.invitationStatus || null,
      readyAt: item.readyAt || null,
      signedAt: item.signedAt || null,
      completedAt: item.completedAt || null,
    }))

  return {
    applicationState: redactedState,
    participant,
    safeParticipants: safeOtherParticipants,
    privacy: {
      internal: false,
      viewerRole: role,
      canEditShared: role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
      canManageParticipants: role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
    },
  }
}

export function saveNormalizedBondApplicationSection({
  normalizedApplication,
  participantKey = null,
  sectionKey,
  scope = 'participant',
  answers,
  expectedSectionVersion = null,
  idempotencyKey = '',
  material = true,
} = {}) {
  const revisionPermission = isSectionSaveAllowedByRevisionScope({
    normalizedApplication,
    participantKey,
    scope,
    sectionKey,
  })
  if (!revisionPermission.allowed) {
    return {
      ok: false,
      reason: revisionPermission.reason,
      message: revisionPermission.message,
      normalizedApplication,
    }
  }
  const next = cloneBondApplicationValue(normalizedApplication)
  const now = new Date().toISOString()
  next.metadata = { ...(next.metadata || {}) }
  next.sectionVersions = { ...(next.sectionVersions || next.metadata.sectionVersions || {}) }
  const versionKey = scope === 'application' ? `application:${sectionKey}` : `participant:${participantKey}:${sectionKey}`
  const currentVersion = Number(next.sectionVersions[versionKey] || 0)
  if (expectedSectionVersion !== null && Number(expectedSectionVersion) !== currentVersion) {
    return {
      ok: false,
      reason: 'stale_section_version',
      message: 'This section was updated elsewhere. Refresh to load the latest information before continuing.',
      currentVersion,
      normalizedApplication,
    }
  }
  if (next.metadata.lastSectionIdempotencyKey === idempotencyKey && idempotencyKey) {
    return { ok: true, idempotent: true, normalizedApplication: next, sectionVersion: currentVersion }
  }
  if (scope === 'application') {
    next.sharedSections = { ...(next.sharedSections || {}), [sectionKey]: normalizeAnswers(answers) }
  } else {
    next.participantSections = { ...(next.participantSections || {}) }
    next.participantSections[participantKey] = {
      ...(next.participantSections[participantKey] || {}),
      [sectionKey]: normalizeAnswers(answers),
    }
  }
  next.sectionVersions[versionKey] = currentVersion + 1
  if (material) {
    next.revision = Number(next.revision || 1) + 1
    next.participants = invalidateParticipantReadiness(next.participants || [])
  }
  next.updatedAt = now
  next.metadata.lastSectionIdempotencyKey = idempotencyKey || null
  next.metadata.sectionVersions = next.sectionVersions
  return { ok: true, normalizedApplication: next, sectionVersion: currentVersion + 1 }
}

export function invalidateParticipantReadiness(participants = []) {
  return participants.map((participant) => {
    if (!participant.readyAt && !participant.reviewContextHash) return participant
    return {
      ...participant,
      status: participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.readyForSubmission
        ? BOND_APPLICATION_PARTICIPANT_STATUSES.inProgress
        : participant.status,
      reviewContextHash: null,
      reviewedRevision: null,
      readyAt: null,
      metadata: {
        ...(participant.metadata || {}),
        readiness_invalidated_at: new Date().toISOString(),
      },
    }
  })
}

export async function calculateBondApplicationReviewContextHash(normalizedApplication = {}) {
  const material = {
    schemaVersion: normalizedApplication.schemaVersion || BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION,
    revision: normalizedApplication.revision || 1,
    sharedSections: normalizedApplication.sharedSections || {},
    participants: (normalizedApplication.participants || [])
      .filter((participant) => participant.status !== BOND_APPLICATION_PARTICIPANT_STATUSES.removed && !participant.removedAt)
      .map((participant) => ({
        participantKey: participant.participantKey,
        role: participant.role,
        status: participant.status,
        sectionHashes: normalizedApplication.metadata?.sectionHashes?.[participant.participantKey] || null,
        sections: normalizedApplication.participantSections?.[participant.participantKey] || {},
      })),
    documentRequirements: (normalizedApplication.documentRequirements || []).map((requirement) => ({
      participantKey: requirement.participantKey || null,
      requirementKey: requirement.requirementKey || requirement.key,
      status: requirement.status || null,
      requiredBefore: requirement.requiredBefore || null,
      satisfactionMode: requirement.satisfactionMode || null,
    })),
    declarationContractVersion: normalizedApplication.metadata?.declarationContractVersion || 'phase-7-v1',
  }
  return hashCanonicalBondApplicationPayload(material)
}

export function markBondApplicationParticipantReady({
  normalizedApplication,
  participantKey,
  reviewContextHash,
  declarationEvidence = [],
  now = new Date().toISOString(),
} = {}) {
  const next = cloneBondApplicationValue(normalizedApplication)
  let found = false
  next.participants = (next.participants || []).map((participant) => {
    if (participant.participantKey !== participantKey) return participant
    found = true
    return {
      ...participant,
      status: BOND_APPLICATION_PARTICIPANT_STATUSES.readyForSubmission,
      reviewContextHash,
      reviewedRevision: next.revision || 1,
      reviewedAt: now,
      readyAt: now,
      metadata: {
        ...(participant.metadata || {}),
        declarationEvidence: cloneBondApplicationValue(declarationEvidence || []),
      },
    }
  })
  if (!found) {
    return { ok: false, reason: 'participant_not_found', normalizedApplication }
  }
  const active = (next.participants || []).filter((participant) => !participant.removedAt && participant.status !== BOND_APPLICATION_PARTICIPANT_STATUSES.removed)
  const allReady = active.length > 0 && active.every((participant) => (
    participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.readyForSubmission &&
    participant.reviewContextHash === reviewContextHash
  ))
  next.status = allReady ? BOND_APPLICATION_STATUSES.readyForReview : BOND_APPLICATION_STATUSES.awaitingParticipants
  return { ok: true, allReady, normalizedApplication: next }
}

export function buildParticipantProgressSummary({ normalizedApplication, participantKey } = {}) {
  const participant = (normalizedApplication?.participants || []).find((item) => item.participantKey === participantKey) || null
  if (!participant) return { status: 'not_started', complete: false, label: 'Not started' }
  if (participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.readyForSubmission) return { status: 'ready_for_review', complete: true, label: 'Ready for review' }
  if (participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.awaitingSignature) return { status: 'awaiting_signature', complete: true, label: 'Awaiting signature' }
  if (participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.signed || participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.completed) return { status: 'signed', complete: true, label: 'Signed' }
  if (participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.invited || participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.pendingInvite) return { status: participant.status, complete: false, label: 'Invitation sent' }
  if (participant.status === BOND_APPLICATION_PARTICIPANT_STATUSES.declined) return { status: 'declined', complete: false, label: 'Declined' }
  return { status: 'in_progress', complete: false, label: 'In progress' }
}

export function projectNormalizedBondApplicationToLegacy({ normalizedApplication, existingLegacy = {} } = {}) {
  const applicationState = buildApplicationStateFromNormalizedApplication(normalizedApplication)
  const projected = toLegacyBondApplication(applicationState, existingLegacy)
  const metadata = {
    ...((projected._meta && typeof projected._meta === 'object') ? projected._meta : {}),
    normalized_bond_application: {
      application_id: normalizedApplication.id || null,
      storage_mode: BOND_APPLICATION_NORMALIZED_STORAGE_MODE,
      application_revision: normalizedApplication.revision || 1,
      projection_version: normalizedApplication.revision || 1,
      projected_at: new Date().toISOString(),
    },
  }
  return {
    ...projected,
    _meta: metadata,
  }
}

export async function hashLegacyBondApplicationSource(legacyBondApplication = {}) {
  return hashCanonicalBondApplicationPayload(legacyBondApplication || {})
}

export function buildParticipantScopedRequirementKey({ participantRole, participantKey = '', requirementKey }) {
  const role = normalizeRole(participantRole)
  if (!participantKey && role === 'application') return requirementKey
  return `${participantKey || role}:${requirementKey}`
}

export function buildJointSignerManifest({ normalizedApplication, signerIdentities = [] } = {}) {
  const byParticipantKey = new Map(signerIdentities.map((identity) => [identity.participantKey, identity]))
  const byRole = new Map(signerIdentities.map((identity) => [normalizeRole(identity.participantRole || identity.role), identity]))
  return (normalizedApplication?.participants || [])
    .filter((participant) => [
      BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
      BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant,
      BOND_APPLICATION_PARTICIPANT_ROLES.surety,
    ].includes(participant.role))
    .filter(isActiveParticipant)
    .map((participant) => {
      const identity = byParticipantKey.get(participant.participantKey) || byRole.get(participant.role) || {}
      const documentRole = participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety ? 'surety_undertaking' : 'main_application'
      return {
        participantId: participant.id || null,
        participantKey: participant.participantKey,
        participantRole: participant.role,
        fullName: identity.fullName || participant.displayName || '',
        identityReference: identity.identityReference || '',
        email: identity.email || participant.email || '',
        phone: identity.phone || participant.phone || '',
        signingOrder: 1,
        required: true,
        documentAssignments: [documentRole],
        status: 'pending',
      }
    })
}

export function getActiveBondApplicationParticipants(normalizedApplication = {}) {
  return (normalizedApplication.participants || []).filter(isActiveParticipant)
}

export function getActiveSuretyParticipants(normalizedApplication = {}) {
  return getActiveBondApplicationParticipants(normalizedApplication)
    .filter((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety)
}

export function validateSuretyCapacity({
  normalizedApplication = {},
  maximumActiveSureties = BOND_APPLICATION_PHASE7_MAXIMUM_ACTIVE_SURETIES,
  adding = 1,
} = {}) {
  const current = getActiveSuretyParticipants(normalizedApplication).length
  const maximum = Math.max(Number(maximumActiveSureties) || 0, 0)
  if (maximum <= 0) {
    return { valid: false, current, maximum, reason: 'surety_capability_disabled' }
  }
  if (current + Math.max(Number(adding) || 0, 0) > maximum) {
    return { valid: false, current, maximum, reason: 'maximum_active_sureties_exceeded' }
  }
  return { valid: true, current, maximum }
}

export function createSuretyParticipant({
  normalizedApplication,
  displayName = '',
  email = '',
  phone = '',
  relationshipToApplicant = '',
  maximumActiveSureties = BOND_APPLICATION_PHASE7_MAXIMUM_ACTIVE_SURETIES,
  metadata = {},
  now = new Date().toISOString(),
} = {}) {
  const capacity = validateSuretyCapacity({ normalizedApplication, maximumActiveSureties, adding: 1 })
  if (!capacity.valid) {
    return { ok: false, reason: capacity.reason, normalizedApplication, capacity }
  }
  const next = cloneBondApplicationValue(normalizedApplication)
  const ordinal = Math.max(0, ...(next.participants || [])
    .filter((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety)
    .map((participant) => Number(participant.ordinal) || 0)) + 1
  const participant = createBondApplicationParticipant({
    role: BOND_APPLICATION_PARTICIPANT_ROLES.surety,
    ordinal,
    displayName,
    email,
    phone,
    status: BOND_APPLICATION_PARTICIPANT_STATUSES.pendingInvite,
    invitationStatus: BOND_APPLICATION_INVITE_STATUSES.pending,
    metadata: {
      ...metadata,
      relationship_to_applicant: relationshipToApplicant || metadata.relationship_to_applicant || null,
      required_to_sign: metadata.required_to_sign !== false,
    },
  })
  next.participants = [...(next.participants || []), participant]
  next.participantSections = {
    ...(next.participantSections || {}),
    [participant.participantKey]: splitParticipantIntoSections({
      relationshipToApplicant,
      relationship: relationshipToApplicant ? { relationship_to_applicant: relationshipToApplicant } : {},
    }),
  }
  next.sharedSections = {
    ...(next.sharedSections || {}),
    applicant_structure: {
      ...(next.sharedSections?.applicant_structure || {}),
      requiresSurety: 'yes',
    },
  }
  next.revision = Number(next.revision || 1) + 1
  next.participants = invalidateParticipantReadiness(next.participants)
  next.updatedAt = now
  return { ok: true, participant, normalizedApplication: next }
}

export function withdrawBondApplicationParticipant({
  normalizedApplication,
  participantKey,
  status = BOND_APPLICATION_PARTICIPANT_STATUSES.withdrawn,
  now = new Date().toISOString(),
} = {}) {
  const next = cloneBondApplicationValue(normalizedApplication)
  let found = false
  next.participants = (next.participants || []).map((participant) => {
    if (participant.participantKey !== participantKey) return participant
    found = true
    return {
      ...participant,
      status,
      invitationStatus: participant.invitationStatus === BOND_APPLICATION_INVITE_STATUSES.accepted
        ? participant.invitationStatus
        : BOND_APPLICATION_INVITE_STATUSES.revoked,
      withdrawnAt: status === BOND_APPLICATION_PARTICIPANT_STATUSES.withdrawn ? now : participant.withdrawnAt || null,
      declinedAt: status === BOND_APPLICATION_PARTICIPANT_STATUSES.declined ? now : participant.declinedAt || null,
      removedAt: status === BOND_APPLICATION_PARTICIPANT_STATUSES.removed ? now : participant.removedAt || null,
      metadata: {
        ...(participant.metadata || {}),
        access_revoked_at: now,
      },
    }
  })
  if (!found) return { ok: false, reason: 'participant_not_found', normalizedApplication }
  next.revision = Number(next.revision || 1) + 1
  next.participants = invalidateParticipantReadiness(next.participants)
  next.updatedAt = now
  return { ok: true, normalizedApplication: next }
}

export function replaceSuretyParticipant({
  normalizedApplication,
  previousParticipantKey,
  replacement = {},
  maximumActiveSureties = BOND_APPLICATION_PHASE7_MAXIMUM_ACTIVE_SURETIES,
  now = new Date().toISOString(),
} = {}) {
  const withdrawn = withdrawBondApplicationParticipant({
    normalizedApplication,
    participantKey: previousParticipantKey,
    status: BOND_APPLICATION_PARTICIPANT_STATUSES.removed,
    now,
  })
  if (!withdrawn.ok) return withdrawn
  return createSuretyParticipant({
    normalizedApplication: withdrawn.normalizedApplication,
    maximumActiveSureties,
    now,
    ...replacement,
  })
}

export function resolveChangeRequestEffect({
  targetType = '',
  fieldPath = '',
  documentRequirement = null,
  targetScope = '',
  overrideEffect = null,
  overrideReason = '',
} = {}) {
  const requestedOverride = overrideEffect && Object.values(BOND_APPLICATION_CHANGE_REQUEST_EFFECTS).includes(overrideEffect)
  if (requestedOverride) {
    return {
      effect: overrideEffect,
      requiresNewSubmission: overrideEffect === BOND_APPLICATION_CHANGE_REQUEST_EFFECTS.newSubmissionRequired,
      reason: overrideReason || 'authorized_override',
      overridden: true,
    }
  }
  const normalizedTargetType = String(targetType || '').trim()
  const normalizedPath = String(fieldPath || '').trim()
  const supplementalDocument = normalizedTargetType === 'document_requirement' ||
    String(targetScope || '').includes('document') ||
    documentRequirement?.requiredBefore === 'requested_after_originator_review'
  if (supplementalDocument) {
    return {
      effect: BOND_APPLICATION_CHANGE_REQUEST_EFFECTS.supplementalOnly,
      requiresNewSubmission: false,
      reason: 'supplemental_document_request',
      overridden: false,
    }
  }
  const materialTargets = new Set(['section', 'field', 'repeatable_record', 'participant_structure', 'declaration'])
  if (materialTargets.has(normalizedTargetType) || normalizedPath.startsWith('application.') || normalizedPath.startsWith('participants.')) {
    return {
      effect: BOND_APPLICATION_CHANGE_REQUEST_EFFECTS.newSubmissionRequired,
      requiresNewSubmission: true,
      reason: 'signable_application_content',
      overridden: false,
    }
  }
  return {
    effect: BOND_APPLICATION_CHANGE_REQUEST_EFFECTS.supplementalOnly,
    requiresNewSubmission: false,
    reason: 'non_signable_request',
    overridden: false,
  }
}

export function createBondApplicationChangeRequest({
  normalizedApplication,
  id = null,
  baseSubmissionId = normalizedApplication?.activeSubmissionId || null,
  requestType = BOND_APPLICATION_CHANGE_REQUEST_TYPES.mixed,
  items = [],
  requestedBy = null,
  requestedByRole = 'originator',
  buyerVisibleSummary = '',
  internalSummary = '',
  dueAt = null,
  send = true,
  now = new Date().toISOString(),
} = {}) {
  const normalizedItems = items.map((item, index) => {
    const effect = resolveChangeRequestEffect(item)
    return {
      id: item.id || null,
      participantKey: item.participantKey || null,
      participantId: item.participantId || null,
      targetScope: item.targetScope || 'shared_application',
      targetType: item.targetType || 'general',
      sectionKey: item.sectionKey || null,
      questionKey: item.questionKey || null,
      fieldPath: item.fieldPath || null,
      documentRequirementKey: item.documentRequirementKey || item.documentRequirementId || null,
      declarationKey: item.declarationKey || null,
      title: item.title || 'Changes requested',
      buyerInstruction: item.buyerInstruction || '',
      internalNote: item.internalNote || '',
      status: item.status || BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.open,
      blocking: item.blocking !== false,
      requiresNewSubmission: effect.requiresNewSubmission,
      effect: effect.effect,
      effectReason: effect.reason,
      displayOrder: item.displayOrder ?? index + 1,
      metadata: normalizeAnswers(item.metadata || {}),
    }
  })
  const requiresNewSubmission = normalizedItems.some((item) => item.requiresNewSubmission)
  return {
    id,
    bondApplicationId: normalizedApplication?.id || null,
    baseSubmissionId,
    requestType,
    status: send ? BOND_APPLICATION_CHANGE_REQUEST_STATUSES.sent : BOND_APPLICATION_CHANGE_REQUEST_STATUSES.draft,
    requiresNewSubmission,
    targetApplicationRevision: normalizedApplication?.revision || 1,
    requestedBy,
    requestedByRole,
    buyerVisibleSummary,
    internalSummary,
    dueAt,
    sentAt: send ? now : null,
    createdAt: now,
    updatedAt: now,
    items: normalizedItems,
    metadata: {
      source_application_revision: normalizedApplication?.revision || 1,
    },
  }
}

export function filterChangeRequestForParticipant({
  changeRequest,
  viewerParticipantKey = null,
  viewerRole = null,
  internal = false,
} = {}) {
  if (!changeRequest) return null
  if (internal) return cloneBondApplicationValue(changeRequest)
  const role = normalizeRole(viewerRole)
  const visibleScopes = role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant
    ? new Set(['shared_application', 'primary_applicant', 'application_documents'])
    : role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant
      ? new Set(['co_applicant', 'participant_documents'])
      : new Set(['surety', 'participant_documents'])
  const items = (changeRequest.items || [])
    .filter((item) => {
      if (item.participantKey) return item.participantKey === viewerParticipantKey
      return visibleScopes.has(item.targetScope)
    })
    .map((item) => {
      const publicItem = { ...item, metadata: {} }
      delete publicItem.internalNote
      return publicItem
    })
  return {
    id: changeRequest.id || null,
    bondApplicationId: changeRequest.bondApplicationId || null,
    requestType: changeRequest.requestType,
    status: changeRequest.status,
    requiresNewSubmission: changeRequest.requiresNewSubmission,
    buyerVisibleSummary: changeRequest.buyerVisibleSummary || '',
    dueAt: changeRequest.dueAt || null,
    sentAt: changeRequest.sentAt || null,
    items,
  }
}

export function resolveRevisionEditScope({ changeRequestItems = [] } = {}) {
  return changeRequestItems
    .filter((item) => item.status !== BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.withdrawn)
    .reduce((scope, item) => {
      const participantKey = item.participantKey || null
      const scopeKey = participantKey || 'application'
      scope[scopeKey] = scope[scopeKey] || { sections: new Set(), questions: new Set(), fields: new Set(), documents: new Set() }
      if (item.sectionKey) scope[scopeKey].sections.add(item.sectionKey)
      if (item.questionKey) scope[scopeKey].questions.add(item.questionKey)
      if (item.fieldPath) scope[scopeKey].fields.add(item.fieldPath)
      if (item.documentRequirementKey) scope[scopeKey].documents.add(item.documentRequirementKey)
      return scope
    }, {})
}

export function serializeRevisionEditScope(scope = {}) {
  return Object.fromEntries(Object.entries(scope).map(([key, value]) => [
    key,
    {
      sections: [...(value.sections || [])],
      questions: [...(value.questions || [])],
      fields: [...(value.fields || [])],
      documents: [...(value.documents || [])],
    },
  ]))
}

export function isSectionSaveAllowedByRevisionScope({
  normalizedApplication = {},
  participantKey = null,
  scope = 'participant',
  sectionKey = '',
} = {}) {
  const revisionStatus = normalizedApplication.revisionStatus || normalizedApplication.metadata?.revisionStatus || 'none'
  if (!revisionStatus || revisionStatus === 'none') return { allowed: true }
  const editScope = normalizedApplication.metadata?.revisionEditScope || {}
  const scopeKey = scope === 'application' ? 'application' : participantKey
  const permitted = editScope[scopeKey]?.sections || []
  if (permitted.includes(sectionKey)) return { allowed: true }
  return {
    allowed: false,
    reason: 'section_outside_revision_scope',
    message: 'This section is not part of the requested correction.',
  }
}

export function openBondApplicationRevision({
  normalizedApplication,
  changeRequest,
  baseSubmission = null,
  expectedActiveSubmissionId = null,
  now = new Date().toISOString(),
} = {}) {
  const activeSubmissionId = normalizedApplication?.activeSubmissionId || normalizedApplication?.metadata?.activeSubmissionId || null
  if (expectedActiveSubmissionId && expectedActiveSubmissionId !== activeSubmissionId) {
    return { ok: false, reason: 'active_submission_changed', normalizedApplication }
  }
  if (changeRequest?.requiresNewSubmission !== true) {
    return { ok: false, reason: 'request_does_not_require_revision', normalizedApplication }
  }
  if (baseSubmission?.id && activeSubmissionId && baseSubmission.id !== activeSubmissionId) {
    return { ok: false, reason: 'base_submission_is_not_active', normalizedApplication }
  }
  const editScope = serializeRevisionEditScope(resolveRevisionEditScope({ changeRequestItems: changeRequest.items || [] }))
  const next = cloneBondApplicationValue(normalizedApplication)
  next.status = BOND_APPLICATION_STATUSES.changesRequested
  next.revisionStatus = 'revision_in_progress'
  next.activeChangeRequestId = changeRequest.id || null
  next.revisionBaseSubmissionId = baseSubmission?.id || changeRequest.baseSubmissionId || activeSubmissionId || null
  next.revisionOpenedAt = now
  next.revisionTargetNumber = Number(next.metadata?.revisionTargetNumber || 0) + 1
  next.revision = Number(next.revision || 1) + 1
  next.participants = invalidateParticipantReadiness(next.participants || [])
  next.metadata = {
    ...(next.metadata || {}),
    revisionStatus: 'revision_in_progress',
    active_change_request_id: next.activeChangeRequestId,
    revision_base_submission_id: next.revisionBaseSubmissionId,
    revision_opened_at: now,
    revisionEditScope: editScope,
  }
  return { ok: true, normalizedApplication: next, editScope }
}

export function submitParticipantCorrections({
  changeRequest,
  participantKey,
  now = new Date().toISOString(),
} = {}) {
  const next = cloneBondApplicationValue(changeRequest)
  let touched = false
  next.items = (next.items || []).map((item) => {
    if (item.participantKey !== participantKey || item.status === BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.accepted) return item
    touched = true
    return {
      ...item,
      status: BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.awaitingReview,
      addressedAt: item.addressedAt || now,
      submittedAt: now,
    }
  })
  if (!touched) return { ok: false, reason: 'no_participant_items', changeRequest }
  next.status = BOND_APPLICATION_CHANGE_REQUEST_STATUSES.awaitingInternalReview
  next.submittedForReviewAt = now
  next.updatedAt = now
  return { ok: true, changeRequest: next }
}

export function reviewChangeRequestItem({
  changeRequest,
  itemId,
  action,
  reviewedBy = null,
  buyerFollowUp = '',
  internalNote = '',
  now = new Date().toISOString(),
} = {}) {
  const next = cloneBondApplicationValue(changeRequest)
  const statusByAction = {
    accept: BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.accepted,
    more_information: BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.needsMoreInformation,
    withdraw: BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.withdrawn,
  }
  const nextStatus = statusByAction[action]
  if (!nextStatus) return { ok: false, reason: 'unsupported_review_action', changeRequest }
  let found = false
  next.items = (next.items || []).map((item) => {
    if ((item.id || item.displayOrder) !== itemId) return item
    found = true
    return {
      ...item,
      status: nextStatus,
      reviewedAt: now,
      reviewedBy,
      buyerInstruction: buyerFollowUp || item.buyerInstruction,
      internalNote: internalNote || item.internalNote,
    }
  })
  if (!found) return { ok: false, reason: 'item_not_found', changeRequest }
  const blocking = next.items.filter((item) => item.blocking !== false)
  const blockingResolved = blocking.every((item) => [
    BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.accepted,
    BOND_APPLICATION_CHANGE_REQUEST_ITEM_STATUSES.withdrawn,
  ].includes(item.status))
  next.status = blockingResolved
    ? BOND_APPLICATION_CHANGE_REQUEST_STATUSES.resolved
    : BOND_APPLICATION_CHANGE_REQUEST_STATUSES.awaitingInternalReview
  next.resolvedAt = blockingResolved ? now : next.resolvedAt || null
  next.updatedAt = now
  return { ok: true, resolved: blockingResolved, changeRequest: next }
}

export function supersedeBondApplicationSubmission({
  previousSubmission,
  newSubmission,
  changeRequestId = null,
  reason = 'revised_application_submitted',
  now = new Date().toISOString(),
} = {}) {
  if (!previousSubmission?.id || !newSubmission?.id || previousSubmission.id === newSubmission.id) {
    return { ok: false, reason: 'invalid_submission_lineage' }
  }
  return {
    ok: true,
    previousSubmission: {
      ...cloneBondApplicationValue(previousSubmission),
      status: 'superseded',
      supersededAt: now,
      supersededBySubmissionId: newSubmission.id,
      supersessionReason: reason,
    },
    newSubmission: {
      ...cloneBondApplicationValue(newSubmission),
      supersedesSubmissionId: previousSubmission.id,
      revisionChangeRequestId: changeRequestId,
    },
  }
}

export function buildJointBondApplicationSubmissionSnapshot({
  normalizedApplication,
  declarationsByParticipant = {},
  documentManifest = [],
  signingPackageManifest = [],
  signerManifest = null,
  submissionVersion = 1,
  reviewContextHash = '',
  source = {},
  createdAt = new Date().toISOString(),
} = {}) {
  const fullState = buildApplicationStateFromNormalizedApplication(normalizedApplication)
  const participants = (normalizedApplication?.participants || [])
    .filter(isActiveParticipant)
    .map((participant) => ({
      participantId: participant.id || null,
      participantKey: participant.participantKey,
      role: participant.role,
      answers: cloneBondApplicationValue(normalizedApplication.participantSections?.[participant.participantKey] || {}),
      documents: cloneBondApplicationValue(documentManifest.filter((item) => item.participantKey === participant.participantKey || item.participantRole === participant.role)),
      declarations: cloneBondApplicationValue(declarationsByParticipant[participant.participantKey] || participant.metadata?.declarationEvidence || []),
    }))
  const hasSurety = participants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.surety)
  const hasSigningPackage = Array.isArray(signingPackageManifest) && signingPackageManifest.length > 0

  return {
    snapshotSchemaVersion: hasSurety || hasSigningPackage ? '3' : '2',
    submissionVersion,
    application: {
      id: normalizedApplication.id || null,
      transactionId: normalizedApplication.transactionId || fullState.application.transactionId || null,
      revision: normalizedApplication.revision || 1,
      reviewContextHash,
    },
    shared: {
      property: cloneBondApplicationValue(fullState.application.property || {}),
      finance: cloneBondApplicationValue(fullState.application.finance || {}),
      applicantStructure: fullState.application.applicantStructure || 'joint',
    },
    participants,
    selectedBanks: cloneBondApplicationValue(fullState.application.selectedBankIds || []),
    documentManifest: cloneBondApplicationValue(documentManifest || []),
    signingPackageManifest: cloneBondApplicationValue(signingPackageManifest || []),
    signerManifest: cloneBondApplicationValue(signerManifest || buildJointSignerManifest({ normalizedApplication })),
    source: {
      onboardingFormDataId: source.onboardingFormDataId || normalizedApplication.onboardingFormDataId || null,
      sourceRevision: normalizedApplication.revision || 1,
      sourceHash: source.sourceHash || normalizedApplication.compatibilityProjectionHash || normalizedApplication.sourceLegacyHash || null,
    },
    versions: {
      applicationSchemaVersion: BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION,
      flowVersion: hasSurety || hasSigningPackage ? 'phase-7-v1' : 'phase-6-v1',
      documentRuleSetVersion: normalizedApplication.metadata?.documentRuleSetVersion || 'phase-4-v1',
      declarationContractVersion: normalizedApplication.metadata?.declarationContractVersion || 'phase-6-v1',
    },
    createdAt,
  }
}

export function buildNormalizedApplicationFromLegacyBondApplication({
  legacyBondApplication = {},
  transactionId = null,
  onboardingFormDataId = null,
  includeCoApplicant = false,
} = {}) {
  const applicationState = fromLegacyBondApplication(legacyBondApplication)
  return buildNormalizedBondApplicationFromState({
    applicationState: {
      ...applicationState,
      application: {
        ...(applicationState.application || {}),
        transactionId: transactionId || applicationState.application?.transactionId || null,
      },
    },
    transactionId,
    onboardingFormDataId,
    includeCoApplicant,
  })
}
