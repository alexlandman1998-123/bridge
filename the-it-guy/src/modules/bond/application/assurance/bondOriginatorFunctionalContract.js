import {
  BUYER_ENTITY_TYPE_OPTIONS,
  EMPLOYMENT_TYPE_VALUES,
} from '../flow/bondApplicationFlowContract.js'

export const BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION = 'phase-0-v1'

export const BOND_ORIGINATOR_APPLICANT_STRUCTURES = Object.freeze([
  'sole',
  'joint',
  'surety',
])

export const BOND_ORIGINATOR_BUYER_ENTITY_TYPES = Object.freeze(
  BUYER_ENTITY_TYPE_OPTIONS.map((option) => option.value),
)

export const BOND_ORIGINATOR_EMPLOYMENT_TYPES = Object.freeze(
  Object.keys(EMPLOYMENT_TYPE_VALUES),
)

export const BOND_ORIGINATOR_FUNCTIONAL_GUARANTEES = Object.freeze([
  {
    key: 'canonical_application_interpretation',
    implementationPhase: 1,
    statement: 'The same saved answers always resolve to the same application state and requirement inputs.',
    acceptanceCriteria: [
      'Prefill precedence is deterministic and records the winning source for every populated field.',
      'Changing applicant, entity, employment, or finance answers recalculates dependent requirements.',
      'Unknown or unsupported values create an explicit review blocker instead of silently selecting a branch.',
    ],
  },
  {
    key: 'originator_requirement_profiles',
    implementationPhase: 2,
    statement: 'A versioned South African baseline can be extended by an assigned originator without changing application answers.',
    acceptanceCriteria: [
      'Every resolved requirement records the baseline and originator profile versions used.',
      'An originator overlay can add or strengthen requirements but cannot silently remove mandatory baseline requirements.',
      'An unknown originator uses the published baseline and creates a review task when an overlay is required.',
    ],
  },
  {
    key: 'idempotent_document_reconciliation',
    implementationPhase: 3,
    statement: 'Re-running document interpretation never creates duplicate requirements or loses uploaded evidence.',
    acceptanceCriteria: [
      'A requirement instance has one stable canonical identity per transaction, participant, and requirement key.',
      'Existing uploads satisfying a canonical requirement are reused instead of requested again.',
      'Requirements that no longer apply are disabled with history retained; user-uploaded files are never deleted.',
    ],
  },
  {
    key: 'participant_and_entity_completeness',
    implementationPhase: 4,
    statement: 'Every natural person and juristic purchaser contributing to the application is represented and assessed.',
    acceptanceCriteria: [
      'Primary applicants, co-applicants, sureties, directors, trustees, and authorised signatories have stable identities.',
      'Company and trust authority, ownership, registration, and supporting-document requirements are evaluated.',
      'Each participant completes and signs only the declarations and sections applicable to their role.',
    ],
  },
  {
    key: 'canonical_document_workspace',
    implementationPhase: 5,
    statement: 'The buyer portal, document tab, originator workspace, and submission pack read one canonical document model.',
    acceptanceCriteria: [
      'Requirement status is consistent across every workspace.',
      'One uploaded document may satisfy multiple compatible requirements without duplicating the file.',
      'Replacing or rejecting evidence updates every view without orphaning requirement history.',
    ],
  },
  {
    key: 'submission_readiness_gate',
    implementationPhase: 6,
    statement: 'No application can be submitted while required answers, participants, declarations, or documents are incomplete.',
    acceptanceCriteria: [
      'Readiness returns actionable blockers grouped by applicant, section, document, and declaration.',
      'A submitted snapshot is immutable, versioned, and reproducible from its audit record.',
      'Changes after review invalidate stale confirmations and signatures before resubmission.',
    ],
  },
  {
    key: 'originator_branded_download',
    implementationPhase: 7,
    statement: 'The complete application is downloadable as an originator-branded review and submission pack.',
    acceptanceCriteria: [
      'The assigned originator name and logo are resolved from organisation or assignment data with a safe fallback.',
      'The pack includes applicants, entity details, affordability, declarations, document status, and outstanding actions.',
      'The generated pack records application, requirement-profile, and generation versions.',
    ],
  },
  {
    key: 'sa_originator_acceptance_matrix',
    implementationPhase: 8,
    statement: 'Representative South African originator profiles pass the same fixture-based acceptance suite.',
    acceptanceCriteria: [
      'Every supported applicant, entity, and employment combination has a deterministic expected result.',
      'Originator-specific deviations are configuration with named ownership, effective dates, and versions.',
      'Legal or lender policy uncertainty becomes a review task and never an inferred approval.',
    ],
  },
  {
    key: 'live_flow_smoke_and_promotion',
    implementationPhase: 9,
    statement: 'Authenticated buyer and originator flows are certified against representative live-shaped data before promotion.',
    acceptanceCriteria: [
      'Open, save, resume, recalculate, upload, review, download, and submit paths complete without console or API errors.',
      'A repeated reconciliation produces no additional active requirement rows.',
      'Promotion evidence records fixture, environment, build, rule, profile, and schema versions.',
    ],
  },
])

export const BOND_ORIGINATOR_PHASE0_BLOCKERS = Object.freeze([
  {
    key: 'joint_applicant_financial_capture',
    implementationPhase: 4,
    sourcePaths: [
      'employment.co_applicant.employer_name',
      'income_deductions_expenses.co_applicant.gross_salary',
    ],
    blocksProduction: true,
  },
  {
    key: 'company_participant_capture',
    implementationPhase: 4,
    sourcePaths: [
      'company.director_names',
      'company.shareholding_structure',
      'company.resolution_document',
    ],
    blocksProduction: true,
  },
  {
    key: 'trust_participant_capture',
    implementationPhase: 4,
    sourcePaths: [
      'trust.trustee_names',
      'trust.letters_of_authority',
      'trust.trust_deed',
    ],
    blocksProduction: true,
  },
  {
    key: 'guided_surety_completion',
    implementationPhase: 4,
    sourcePaths: ['application.applicantStructure', 'participants.sureties'],
    blocksProduction: true,
  },
])

function buildScenarioKey(applicantStructure, buyerEntityType, employmentType) {
  return `${applicantStructure}:${buyerEntityType}:${employmentType}`
}

export function buildBondOriginatorAcceptanceScenarioMatrix({
  applicantStructures = BOND_ORIGINATOR_APPLICANT_STRUCTURES,
  buyerEntityTypes = BOND_ORIGINATOR_BUYER_ENTITY_TYPES,
  employmentTypes = BOND_ORIGINATOR_EMPLOYMENT_TYPES,
} = {}) {
  return applicantStructures.flatMap((applicantStructure) =>
    buyerEntityTypes.flatMap((buyerEntityType) =>
      employmentTypes.map((employmentType) => ({
        key: buildScenarioKey(applicantStructure, buyerEntityType, employmentType),
        applicantStructure,
        buyerEntityType,
        employmentType,
        requiredGuarantees: BOND_ORIGINATOR_FUNCTIONAL_GUARANTEES.map((guarantee) => guarantee.key),
      })),
    ),
  )
}

export const BOND_ORIGINATOR_FUNCTIONAL_CONTRACT = Object.freeze({
  version: BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION,
  status: 'contract_locked_implementation_in_progress',
  jurisdiction: 'ZA',
  scopeClaim: 'versioned_sa_baseline_with_originator_overlays',
  productionCertification: 'blocked_until_acceptance_audit_passes',
  applicantStructures: BOND_ORIGINATOR_APPLICANT_STRUCTURES,
  buyerEntityTypes: BOND_ORIGINATOR_BUYER_ENTITY_TYPES,
  employmentTypes: BOND_ORIGINATOR_EMPLOYMENT_TYPES,
  guarantees: BOND_ORIGINATOR_FUNCTIONAL_GUARANTEES,
  knownBlockers: BOND_ORIGINATOR_PHASE0_BLOCKERS,
})

function duplicateValues(values = []) {
  const seen = new Set()
  const duplicates = new Set()
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  })
  return Array.from(duplicates)
}

export function buildBondOriginatorFunctionalContractAudit({
  contract = BOND_ORIGINATOR_FUNCTIONAL_CONTRACT,
} = {}) {
  const issues = []
  const guarantees = Array.isArray(contract.guarantees) ? contract.guarantees : []
  const knownBlockers = Array.isArray(contract.knownBlockers) ? contract.knownBlockers : []
  const scenarios = buildBondOriginatorAcceptanceScenarioMatrix({
    applicantStructures: contract.applicantStructures || [],
    buyerEntityTypes: contract.buyerEntityTypes || [],
    employmentTypes: contract.employmentTypes || [],
  })

  duplicateValues(guarantees.map((item) => item.key)).forEach((key) => {
    issues.push({ code: 'duplicate_guarantee_key', target: key })
  })
  duplicateValues(scenarios.map((item) => item.key)).forEach((key) => {
    issues.push({ code: 'duplicate_scenario_key', target: key })
  })

  guarantees.forEach((guarantee) => {
    if (!guarantee.key || !guarantee.statement) {
      issues.push({ code: 'incomplete_guarantee_definition', target: guarantee.key || 'unknown' })
    }
    if (!Number.isInteger(guarantee.implementationPhase) || guarantee.implementationPhase < 1) {
      issues.push({ code: 'invalid_implementation_phase', target: guarantee.key || 'unknown' })
    }
    if (!Array.isArray(guarantee.acceptanceCriteria) || guarantee.acceptanceCriteria.length < 2) {
      issues.push({ code: 'missing_acceptance_criteria', target: guarantee.key || 'unknown' })
    }
  })

  knownBlockers.forEach((blocker) => {
    if (!blocker.key || blocker.blocksProduction !== true || !blocker.sourcePaths?.length) {
      issues.push({ code: 'invalid_known_blocker', target: blocker.key || 'unknown' })
    }
  })

  if (contract.scopeClaim !== 'versioned_sa_baseline_with_originator_overlays') {
    issues.push({ code: 'unsafe_scope_claim', target: contract.scopeClaim || 'missing' })
  }
  if (contract.productionCertification !== 'blocked_until_acceptance_audit_passes') {
    issues.push({ code: 'unsafe_production_certification', target: contract.productionCertification || 'missing' })
  }

  return {
    version: contract.version || '',
    status: issues.length ? 'contract_invalid' : 'contract_locked',
    issues,
    scenarios,
    metrics: {
      guaranteeCount: guarantees.length,
      knownBlockerCount: knownBlockers.length,
      scenarioCount: scenarios.length,
      issueCount: issues.length,
    },
  }
}
