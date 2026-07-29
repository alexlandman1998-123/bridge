import {
  resolveGuidedBondApplicationParticipantsFlag,
  resolveGuidedBondApplicationV2Flag,
} from '../../../../lib/guidedBondApplicationFeatureFlag.js'
import { getGuidedBondApplicationMetadataFromState } from './phase2GuidedFlow.js'

const YES_VALUES = new Set(['yes', 'true', '1', 'y'])
const PERMANENT_EMPLOYMENT_VALUES = new Set([
  'permanent_employee',
  'full_time_employed',
  'full-time employed',
  'permanent employed',
  'permanent',
])
const PHASE3_SUPPORTED_EMPLOYMENT_VALUES = new Set([
  ...PERMANENT_EMPLOYMENT_VALUES,
  'self_employed',
  'self-employed',
  'own_business',
  'contract_employee',
  'temporary_employed',
  'fixed_term_contract',
  'commission_based',
  'commission',
  'retired',
  'pensioner',
  'other',
  'other_income',
])

function normalized(value) {
  return String(value ?? '').trim().toLowerCase()
}

function isYes(value) {
  return YES_VALUES.has(normalized(value))
}

function hasMeaningfulCoApplicant(state = {}) {
  const coApplicant = state?.participants?.coApplicant
  if (!coApplicant) return false
  const personal = coApplicant.personal || {}
  const employment = coApplicant.employment || {}
  return Object.entries({ ...personal, ...employment }).some(([key, value]) => {
    if (['key', 'label', 'role', 'legacyApplicantKey'].includes(key)) return false
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value).length > 0
    return Boolean(value)
  })
}

function resolveApplicantStructure(state = {}) {
  const legacySummary = state?.compatibility?.legacyBase?.summary || {}
  if (state?.application?.applicantStructure) return state.application.applicantStructure
  if (isYes(legacySummary.has_surety)) return 'surety'
  if (isYes(legacySummary.has_co_applicant) || hasMeaningfulCoApplicant(state)) return 'joint'
  if (normalized(legacySummary.has_co_applicant) === 'no' && normalized(legacySummary.has_surety) === 'no') return 'sole'
  return ''
}

export function isPermanentEmploymentValue(value) {
  const key = normalized(value).replaceAll('_', ' ')
  return PERMANENT_EMPLOYMENT_VALUES.has(normalized(value)) || PERMANENT_EMPLOYMENT_VALUES.has(key)
}

export function isPhase3SupportedEmploymentValue(value) {
  const raw = normalized(value)
  const key = raw.replaceAll('_', ' ')
  return PHASE3_SUPPORTED_EMPLOYMENT_VALUES.has(raw) || PHASE3_SUPPORTED_EMPLOYMENT_VALUES.has(key)
}

export function getPhase2GuidedBondApplicationEligibility(applicationState = {}, options = {}) {
  const activeTab = String(options.activeBondApplicationTab || 'application')
  if (activeTab !== 'application') return { eligible: false, reason: 'not_application_tab' }

  const flag = resolveGuidedBondApplicationV2Flag({
    config: options.featureFlags || {},
    organisation: options.portal?.organisation || options.portal?.organization || null,
    transaction: options.portal?.transaction || null,
  })
  if (!flag.enabled) return { eligible: false, reason: 'feature_disabled' }
  const participantFlag = resolveGuidedBondApplicationParticipantsFlag({
    config: options.featureFlags || {},
    organisation: options.portal?.organisation || options.portal?.organization || null,
    transaction: options.portal?.transaction || null,
  })

  const status = normalized(applicationState?.legacySubmission?.status || applicationState?.meta?.status)
  if (applicationState?.legacySubmission?.submittedAt || status.includes('submitted') || status.includes('approved')) {
    return { eligible: false, reason: 'submitted_application' }
  }

  const metadata = getGuidedBondApplicationMetadataFromState(applicationState)
  if (metadata?.legacy_handoff_at) return { eligible: false, reason: 'phase2_handoff_completed' }

  const applicantStructure = resolveApplicantStructure(applicationState)
  if ((applicantStructure === 'joint' || hasMeaningfulCoApplicant(applicationState)) && !participantFlag.enabled) {
    return { eligible: false, reason: 'joint_application' }
  }
  if (applicantStructure === 'surety') return { eligible: false, reason: 'surety_application' }

  const employmentStatus = applicationState?.participants?.primaryApplicant?.employment?.occupation_status
  if (employmentStatus && !isPhase3SupportedEmploymentValue(employmentStatus)) {
    return { eligible: false, reason: 'unsupported_employment' }
  }

  return { eligible: true, reason: null }
}

export function shouldUseGuidedBondApplicationV2(input = {}) {
  return getPhase2GuidedBondApplicationEligibility(input.applicationState, input)
}
