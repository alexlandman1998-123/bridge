import { canonicalizeBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import { createEmptyBondApplicationState } from '../bondApplicationState.js'
import { EMPLOYMENT_TYPE_VALUES } from '../flow/bondApplicationFlowContract.js'
import {
  BOND_APPLICATION_DOCUMENT_TIMING,
} from '../documents/bondApplicationDocumentRules.js'
import {
  applyBondOriginatorRequirementProfile,
  resolveBondOriginatorRequirementProfile,
} from '../originatorRequirements/bondOriginatorRequirementProfiles.js'
import {
  buildBondApplicationDocumentRequirementFingerprint,
  resolveBondApplicationDocumentRequirements,
} from '../documents/resolveBondApplicationDocumentRequirements.js'
import { buildBondOriginatorAcceptanceScenarioMatrix } from './bondOriginatorFunctionalContract.js'

export const BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION = 'phase-8-v1'

export const BOND_ORIGINATOR_REPRESENTATIVE_ACCEPTANCE_PROFILES = Object.freeze([
  Object.freeze({
    key: 'za_baseline',
    version: 'za-baseline-2026-08-v1',
    kind: 'baseline',
    owner: 'Arch9 policy governance',
    approvalReference: 'published-sa-baseline',
    policySource: 'representative_fixture',
    jurisdiction: 'ZA',
    effectiveFrom: '2026-08-28',
    status: 'active',
  }),
  Object.freeze({
    key: 'representative_strict_income',
    version: 'representative-strict-income-v1',
    kind: 'originator_overlay',
    owner: 'Arch9 acceptance fixtures',
    approvalReference: 'fixture-strict-income-v1',
    policySource: 'representative_fixture',
    jurisdiction: 'ZA',
    effectiveFrom: '2026-08-28',
    status: 'active',
    overrides: [{
      requirementKey: 'bond_application_primary_applicant_bank_statements',
      minimumFileCount: 3,
      evidencePeriodMonths: 3,
      allowMultipleFiles: true,
      requiredBefore: BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature,
    }],
  }),
  Object.freeze({
    key: 'representative_enhanced_entity',
    version: 'representative-enhanced-entity-v1',
    kind: 'originator_overlay',
    owner: 'Arch9 acceptance fixtures',
    approvalReference: 'fixture-enhanced-entity-v1',
    policySource: 'representative_fixture',
    jurisdiction: 'ZA',
    effectiveFrom: '2026-08-28',
    status: 'active',
    overrides: [
      { requirementKey: 'bond_application_buyer_company_beneficial_ownership', minimumFileCount: 2, allowMultipleFiles: true },
      { requirementKey: 'bond_application_buyer_trust_beneficial_ownership', minimumFileCount: 2, allowMultipleFiles: true },
    ],
  }),
])

function text(value) {
  return String(value || '').trim()
}

function profileDiagnostics(profile = {}, asOf = new Date().toISOString()) {
  const diagnostics = []
  if (!text(profile.key)) diagnostics.push({ code: 'profile_key_required' })
  if (!text(profile.version)) diagnostics.push({ code: 'profile_version_required' })
  if (!text(profile.owner)) diagnostics.push({ code: 'profile_owner_required' })
  if (!text(profile.approvalReference)) diagnostics.push({ code: 'profile_approval_reference_required' })
  if (!['originator_supplied', 'representative_fixture'].includes(profile.policySource)) diagnostics.push({ code: 'profile_policy_source_invalid' })
  if (profile.jurisdiction !== 'ZA') diagnostics.push({ code: 'profile_jurisdiction_invalid' })
  if (profile.status !== 'active') diagnostics.push({ code: 'profile_not_active' })
  const from = Date.parse(profile.effectiveFrom)
  const to = profile.effectiveTo ? Date.parse(profile.effectiveTo) : null
  const at = Date.parse(asOf)
  if (!Number.isFinite(from) || !Number.isFinite(at) || at < from || (Number.isFinite(to) && at > to)) diagnostics.push({ code: 'profile_not_effective' })
  for (const unsafeKey of ['approvalOutcome', 'autoApprove', 'creditDecision', 'creditScoreDecision', 'lenderApproval']) {
    if (profile[unsafeKey] !== undefined) diagnostics.push({ code: 'inferred_lender_decision_forbidden', field: unsafeKey })
  }
  return diagnostics
}

function participant(role, occupationStatus) {
  return {
    role,
    personal: { first_name: 'Fixture', surname: role, id_number: '9001010000000' },
    contact: { email: `${role}@example.test` },
    employment: { occupation_status: occupationStatus },
    expenses: { gross_salary: '50000' },
    incomeSources: [],
  }
}

function scenarioState(scenario, profileResolution) {
  const state = createEmptyBondApplicationState()
  const occupationStatus = EMPLOYMENT_TYPE_VALUES[scenario.employmentType]?.[0] || scenario.employmentType
  state.application.applicantStructure = scenario.applicantStructure
  state.application.requiresSurety = scenario.applicantStructure === 'surety' ? 'yes' : 'no'
  state.application.buyerEntity.entityType = scenario.buyerEntityType
  state.participants.primaryApplicant = { ...state.participants.primaryApplicant, ...participant('primary_applicant', occupationStatus) }
  state.participants.coApplicant = scenario.applicantStructure === 'joint' ? participant('co_applicant', occupationStatus) : null
  state.participants.sureties = scenario.applicantStructure === 'surety' ? [participant('surety', occupationStatus)] : []
  state.requirementProfile = profileResolution
  return state
}

function requirementSignatures(state) {
  const contexts = [{ participantRole: 'primary_applicant', participantKey: 'primary_applicant:1', participantPath: 'participants.primaryApplicant' }]
  if (state.participants.coApplicant) contexts.push({ participantRole: 'co_applicant', participantKey: 'co_applicant:1', participantPath: 'participants.coApplicant' })
  state.participants.sureties.forEach((_, index) => contexts.push({ participantRole: 'surety', participantKey: `surety:${index + 1}`, participantPath: `participants.sureties.${index}`, canEditShared: false }))
  return contexts.map((participantContext) => {
    const result = resolveBondApplicationDocumentRequirements({ applicationState: state, participantContext })
    return {
      participantKey: participantContext.participantKey,
      trusted: result.requirementProfileTrusted && result.interpretationTrusted,
      diagnostics: result.diagnostics,
      fingerprint: buildBondApplicationDocumentRequirementFingerprint(result.activeRequirements),
      requiredCount: result.requiredRequirements.length,
    }
  })
}

export function buildBondOriginatorMultiProfileAcceptanceReport({
  profiles = BOND_ORIGINATOR_REPRESENTATIVE_ACCEPTANCE_PROFILES,
  asOf = '2026-08-28T12:00:00.000Z',
} = {}) {
  const scenarios = buildBondOriginatorAcceptanceScenarioMatrix()
  const profileResults = (Array.isArray(profiles) ? profiles : []).map((profile) => {
    const metadataDiagnostics = profileDiagnostics(profile, asOf)
    const resolution = resolveBondOriginatorRequirementProfile({
      profile: profile.kind === 'baseline' ? null : profile,
      asOf,
      requireOriginatorProfile: profile.kind !== 'baseline',
    })
    const applied = applyBondOriginatorRequirementProfile({ profileResolution: resolution })
    const scenarioResults = scenarios.map((scenario) => {
      const state = scenarioState(scenario, resolution)
      const first = requirementSignatures(state)
      const second = requirementSignatures(state)
      const diagnostics = [...first.flatMap((item) => item.diagnostics), ...second.flatMap((item) => item.diagnostics)]
      const passed = metadataDiagnostics.length === 0 && applied.trusted && diagnostics.length === 0 &&
        first.every((item) => item.trusted) && canonicalizeBondApplicationSnapshot(first) === canonicalizeBondApplicationSnapshot(second)
      return {
        key: scenario.key,
        passed,
        applicantStructure: scenario.applicantStructure,
        buyerEntityType: scenario.buyerEntityType,
        employmentType: scenario.employmentType,
        requirementFingerprints: first.map((item) => ({ participantKey: item.participantKey, fingerprint: item.fingerprint })),
        requiredRequirementCount: first.reduce((total, item) => total + item.requiredCount, 0),
        diagnostics,
        decision: 'requirements_resolved_not_credit_approved',
      }
    })
    const failedScenarios = scenarioResults.filter((scenario) => !scenario.passed)
    return {
      profileKey: profile.key || null,
      profileVersion: profile.version || null,
      profileKind: profile.kind || 'originator_overlay',
      policyOwner: profile.owner || null,
      approvalReference: profile.approvalReference || null,
      policySource: profile.policySource || null,
      certified: metadataDiagnostics.length === 0 && applied.trusted && failedScenarios.length === 0,
      metadataDiagnostics,
      profileDiagnostics: applied.diagnostics,
      scenarioResults,
      metrics: { scenarioCount: scenarioResults.length, passedCount: scenarioResults.length - failedScenarios.length, failedCount: failedScenarios.length },
    }
  })
  const failedProfiles = profileResults.filter((profile) => !profile.certified)
  const payload = {
    version: BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION,
    asOf,
    profileResults,
  }
  return {
    ...payload,
    status: failedProfiles.length ? 'acceptance_blocked' : 'acceptance_certified',
    certified: failedProfiles.length === 0 && profileResults.length > 0,
    failedProfiles: failedProfiles.map((profile) => profile.profileKey),
    metrics: {
      profileCount: profileResults.length,
      certifiedProfileCount: profileResults.length - failedProfiles.length,
      scenarioCountPerProfile: scenarios.length,
      totalScenarioExecutions: profileResults.length * scenarios.length,
    },
    fingerprint: `${BOND_ORIGINATOR_MULTI_PROFILE_ACCEPTANCE_VERSION}:${canonicalizeBondApplicationSnapshot(payload)}`,
  }
}
