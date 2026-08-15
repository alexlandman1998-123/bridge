export const BOND_APPLICATION_RELEASE_READINESS_VERSION = 'phase-18-v1'

export const BOND_APPLICATION_RELEASE_READINESS_CHECKS = Object.freeze([
  {
    key: 'prefill_matrix_locked',
    label: 'Prefill matrix locked',
    required: true,
    remediation: 'Fix Phase 11 source-matrix gaps before release.',
  },
  {
    key: 'buyer_deep_link_locked',
    label: 'Buyer deep link locked',
    required: true,
    remediation: 'Restore the /client/:token/bond-application route and buyer workspace marker contract.',
  },
  {
    key: 'buyer_prefill_confirmation_locked',
    label: 'Buyer prefill confirmation locked',
    required: true,
    remediation: 'Restore confirmation cards and section action markers in the buyer portal.',
  },
  {
    key: 'browser_smoke_harness_locked',
    label: 'Browser smoke harness locked',
    required: true,
    remediation: 'Restore Phase 16 browser smoke checks for visible content and dev-overlay detection.',
  },
  {
    key: 'originator_workspace_locked',
    label: 'Originator workspace locked',
    required: true,
    remediation: 'Restore the Phase 15 originator review workspace model and source buckets.',
  },
  {
    key: 'originator_handoff_pdf_locked',
    label: 'Originator handoff PDF locked',
    required: true,
    remediation: 'Restore originator review, action list, confirmation, and field-alignment sections in the generated PDF.',
  },
  {
    key: 'known_collection_gaps_tracked',
    label: 'Known collection gaps tracked',
    required: false,
    remediation: 'Keep company, trust, co-applicant, and credit gaps visible as explicit buyer/originator tasks.',
  },
  {
    key: 'read_only_release_gate',
    label: 'Read-only release gate',
    required: true,
    remediation: 'Run release readiness without live writes, submissions, emails, or bank payload mutation.',
  },
])

function includesAll(values = [], requiredValues = []) {
  const source = new Set((Array.isArray(values) ? values : []).filter(Boolean))
  return requiredValues.every((value) => source.has(value))
}

function textIncludesAll(value = '', requiredValues = []) {
  const text = String(value || '')
  return requiredValues.every((item) => text.includes(item))
}

function scenarioByKey(contract = {}, key = '') {
  return (Array.isArray(contract.scenarios) ? contract.scenarios : []).find((scenario) => scenario?.key === key) || null
}

function makeCheck(definition, passed, evidence = {}, statusOverride = '') {
  const status = statusOverride || (passed ? 'pass' : 'fail')
  return {
    key: definition.key,
    label: definition.label,
    required: Boolean(definition.required),
    status,
    passed: status === 'pass' || (!definition.required && status === 'warn'),
    evidence,
    remediation: definition.remediation,
  }
}

function definitionFor(key) {
  return BOND_APPLICATION_RELEASE_READINESS_CHECKS.find((check) => check.key === key)
}

export function buildBondApplicationReleaseReadinessGate({
  prefillCoverageAudit = {},
  browserE2EContract = {},
  originatorReviewWorkspace = {},
  pdfHtml = '',
  mutatedData = false,
} = {}) {
  const buyerDeepLinkScenario = scenarioByKey(browserE2EContract, 'buyer_deep_link_unlock')
  const buyerPrefillScenario = scenarioByKey(browserE2EContract, 'buyer_prefill_confirmation')
  const sourceBucketKeys = (Array.isArray(originatorReviewWorkspace.sourceBuckets) ? originatorReviewWorkspace.sourceBuckets : [])
    .map((bucket) => bucket.key)
  const runtimeChecks = Array.isArray(browserE2EContract.runtimeChecks) ? browserE2EContract.runtimeChecks : []
  const requiredPdfSections = [
    'Originator Review Workspace',
    'Originator Action List',
    'Buyer Section Confirmations',
    'Buyer Portal Field Alignment',
  ]
  const knownCollectionGaps = Array.isArray(prefillCoverageAudit.notYetCollectedPaths)
    ? prefillCoverageAudit.notYetCollectedPaths
    : []

  const checks = [
    makeCheck(
      definitionFor('prefill_matrix_locked'),
      prefillCoverageAudit.status === 'prefill_coverage_matrix_locked' &&
        Number(prefillCoverageAudit.metrics?.scenarioGapCount || 0) === 0 &&
        Number(prefillCoverageAudit.metrics?.matrixFieldCount || 0) >= 40,
      {
        version: prefillCoverageAudit.version || '',
        status: prefillCoverageAudit.status || '',
        scenarioGapCount: Number(prefillCoverageAudit.metrics?.scenarioGapCount || 0),
        matrixFieldCount: Number(prefillCoverageAudit.metrics?.matrixFieldCount || 0),
      },
    ),
    makeCheck(
      definitionFor('buyer_deep_link_locked'),
      buyerDeepLinkScenario?.routePattern === '/client/:token/bond-application' &&
        includesAll(buyerDeepLinkScenario?.requiredSelectors, [
          '[data-bond-ux-task-workspace="phase-10"]',
          '[data-bond-ux-next-action-bar="true"]',
          '[data-bond-ux-section-stepper="true"]',
        ]),
      {
        routePattern: buyerDeepLinkScenario?.routePattern || '',
        selectors: buyerDeepLinkScenario?.requiredSelectors || [],
      },
    ),
    makeCheck(
      definitionFor('buyer_prefill_confirmation_locked'),
      includesAll(buyerPrefillScenario?.requiredSelectors, [
        '[data-bond-prefill-confirmation-cards="true"]',
        '[data-bond-prefill-section-actions="true"]',
      ]) &&
        includesAll(buyerPrefillScenario?.requiredTexts, [
          'Confirm Section',
          'Complete Missing Field',
          'Save Progress',
        ]),
      {
        selectors: buyerPrefillScenario?.requiredSelectors || [],
        texts: buyerPrefillScenario?.requiredTexts || [],
      },
    ),
    makeCheck(
      definitionFor('browser_smoke_harness_locked'),
      includesAll(runtimeChecks, [
        'page_has_visible_content',
        'no_vite_error_overlay',
        'buyer_workspace_markers',
        'originator_workspace_markers',
      ]),
      {
        version: browserE2EContract.version || '',
        runtimeChecks,
      },
    ),
    makeCheck(
      definitionFor('originator_workspace_locked'),
      originatorReviewWorkspace.version === 'phase-15-v1' &&
        originatorReviewWorkspace.source === 'buyer_portal_originator_review_workspace' &&
        originatorReviewWorkspace.target === 'bond_originator_workspace' &&
        includesAll(sourceBucketKeys, ['buyer_confirmed', 'system_prefilled', 'missing_data']),
      {
        version: originatorReviewWorkspace.version || '',
        source: originatorReviewWorkspace.source || '',
        target: originatorReviewWorkspace.target || '',
        sourceBucketKeys,
      },
    ),
    makeCheck(
      definitionFor('originator_handoff_pdf_locked'),
      textIncludesAll(pdfHtml, requiredPdfSections),
      {
        requiredPdfSections,
      },
    ),
    makeCheck(
      definitionFor('known_collection_gaps_tracked'),
      knownCollectionGaps.length > 0,
      {
        count: knownCollectionGaps.length,
        paths: knownCollectionGaps.slice(0, 12),
      },
      knownCollectionGaps.length ? 'warn' : 'pass',
    ),
    makeCheck(
      definitionFor('read_only_release_gate'),
      mutatedData !== true,
      {
        mutatedData: mutatedData === true,
      },
    ),
  ]

  const requiredFailures = checks.filter((check) => check.required && check.status !== 'pass')
  const warnings = checks.filter((check) => check.status === 'warn')

  return {
    version: BOND_APPLICATION_RELEASE_READINESS_VERSION,
    status: requiredFailures.length ? 'release_readiness_blocked' : 'release_readiness_locked',
    source: 'buyer_portal_bond_application_release_gate',
    target: 'buyer_portal_to_bond_originator_handoff',
    checks,
    requiredFailures,
    warnings,
    metrics: {
      checkCount: checks.length,
      requiredCheckCount: checks.filter((check) => check.required).length,
      passedRequiredCheckCount: checks.filter((check) => check.required && check.status === 'pass').length,
      warningCount: warnings.length,
      requiredFailureCount: requiredFailures.length,
    },
    nextAction: requiredFailures.length
      ? 'Resolve required release blockers before authenticated staging certification.'
      : 'Ready for authenticated staging certification with buyer and originator fixtures.',
  }
}
