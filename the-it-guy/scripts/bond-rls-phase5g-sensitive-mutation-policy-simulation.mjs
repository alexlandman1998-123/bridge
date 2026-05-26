import { simulate as simulatePhase5f, SENSITIVE_MUTATION_ACTIONS } from './bond-rls-phase5f-sensitive-mutation-simulation.mjs'

const DEFAULT_SAMPLE_LIMIT = Number.parseInt(process.env.BOND_RLS_PHASE5G_SAMPLE_LIMIT || '8', 10)

function increment(map, key) {
  const normalized = key || 'unknown'
  map[normalized] = (map[normalized] || 0) + 1
}

function takeSample(list, value, limit) {
  if (limit <= 0) return
  if (list.length < limit) list.push(value)
}

function toSample(outcome) {
  return {
    scenarioId: outcome.scenarioId,
    transactionId: outcome.transactionId,
    actorUserId: outcome.actorUserId,
    actorRole: outcome.actorRole,
    workspaceRole: outcome.workspaceRole,
    scopeLevel: outcome.scopeLevel,
    regionId: outcome.regionId ?? null,
    workspaceUnitId: outcome.workspaceUnitId ?? null,
    action: outcome.action,
    currentAllowed: Boolean(outcome.currentAllowed),
    phase5gAllowed: Boolean(outcome.phase5gAllowed),
    expectedPhase5g: Boolean(outcome.expectedPhase5g),
    expectedDifference: outcome.expectedDifference ?? null,
    finalClassification: outcome.finalClassification ?? null,
    reason: outcome.reason ?? null,
    canonicalReason: outcome.canonicalReason ?? null,
    exclusionStatus: outcome.exclusionStatus ?? null,
    targetScopeLevel: outcome.targetScopeLevel ?? null,
  }
}

function stripForCli(report) {
  return {
    input: report.input,
    categories: report.categories,
    actionBreakdown: report.actionBreakdown,
    mismatchReporting: report.mismatchReporting,
  }
}

export async function simulate(options = {}) {
  const phase5fReport = options.phase5fReport || await simulatePhase5f(options)
  const sampleLimit = Number.isFinite(options.sampleLimit) ? options.sampleLimit : DEFAULT_SAMPLE_LIMIT

  const categories = {
    currentAllows_phase5gAllows: 0,
    currentAllows_phase5gDenies: 0,
    currentDenies_phase5gAllows: 0,
    currentDenies_phase5gDenies: 0,
    expectedSensitiveTightening: 0,
    expectedCanonicalExpansion: 0,
    unexpectedAllow: 0,
    unexpectedDeny: 0,
    phase5gCanonicalReadyEnforced: 0,
    phase5gLegacyExcluded: 0,
    manualReviewMutationExcluded: 0,
  }

  const mismatchReporting = {
    unexpectedAllowSamples: [],
    unexpectedDenySamples: [],
    expectedSensitiveTighteningSamples: [],
    expectedCanonicalExpansionSamples: [],
    unexpectedAllowByAction: {},
    unexpectedAllowByRole: {},
    unexpectedAllowByScope: {},
    unexpectedDenyByAction: {},
    unexpectedDenyByRole: {},
    unexpectedDenyByScope: {},
  }

  const actionBreakdown = {}
  const scenarioOutcomes = []

  for (const action of SENSITIVE_MUTATION_ACTIONS) {
    actionBreakdown[action] = {
      evaluations: 0,
      currentAllows: 0,
      phase5gAllows: 0,
      phase5gDenies: 0,
    }
  }

  for (const baseOutcome of phase5fReport.scenarioOutcomes || []) {
    const phase5gAllowed = Boolean(baseOutcome.phase5fAllowed)
    const expectedPhase5g = baseOutcome.expectedPhase5f ?? phase5gAllowed

    let finalClassification = baseOutcome.finalClassification ?? null
    if (finalClassification === 'excludedLegacyMutationCompat') finalClassification = 'phase5gLegacyExcluded'

    const outcome = {
      ...baseOutcome,
      phase5gAllowed,
      expectedPhase5g,
      finalClassification,
    }

    const breakdown = actionBreakdown[outcome.action] || {
      evaluations: 0,
      currentAllows: 0,
      phase5gAllows: 0,
      phase5gDenies: 0,
    }

    breakdown.evaluations += 1
    if (outcome.currentAllowed) breakdown.currentAllows += 1
    if (phase5gAllowed) breakdown.phase5gAllows += 1
    else breakdown.phase5gDenies += 1
    actionBreakdown[outcome.action] = breakdown

    if (outcome.currentAllowed && phase5gAllowed) categories.currentAllows_phase5gAllows += 1
    else if (outcome.currentAllowed && !phase5gAllowed) categories.currentAllows_phase5gDenies += 1
    else if (!outcome.currentAllowed && phase5gAllowed) categories.currentDenies_phase5gAllows += 1
    else categories.currentDenies_phase5gDenies += 1

    if (finalClassification === 'manualReviewMutationExcluded') {
      categories.manualReviewMutationExcluded += 1
    } else if (finalClassification === 'phase5gLegacyExcluded') {
      categories.phase5gLegacyExcluded += 1
    } else {
      categories.phase5gCanonicalReadyEnforced += 1
    }

    if (phase5gAllowed && !expectedPhase5g) {
      categories.unexpectedAllow += 1
      increment(mismatchReporting.unexpectedAllowByAction, outcome.action)
      increment(mismatchReporting.unexpectedAllowByRole, outcome.actorRole)
      increment(mismatchReporting.unexpectedAllowByScope, outcome.scopeLevel)
      takeSample(mismatchReporting.unexpectedAllowSamples, toSample(outcome), sampleLimit)
    } else if (!phase5gAllowed && expectedPhase5g) {
      categories.unexpectedDeny += 1
      increment(mismatchReporting.unexpectedDenyByAction, outcome.action)
      increment(mismatchReporting.unexpectedDenyByRole, outcome.actorRole)
      increment(mismatchReporting.unexpectedDenyByScope, outcome.scopeLevel)
      takeSample(mismatchReporting.unexpectedDenySamples, toSample(outcome), sampleLimit)
    } else if (outcome.expectedDifference === 'expectedSensitiveTightening') {
      categories.expectedSensitiveTightening += 1
      takeSample(mismatchReporting.expectedSensitiveTighteningSamples, toSample(outcome), sampleLimit)
    } else if (outcome.expectedDifference === 'expectedCanonicalExpansion') {
      categories.expectedCanonicalExpansion += 1
      takeSample(mismatchReporting.expectedCanonicalExpansionSamples, toSample(outcome), sampleLimit)
    }

    scenarioOutcomes.push(outcome)
  }

  return {
    input: {
      ...(phase5fReport.input || {}),
      actions: SENSITIVE_MUTATION_ACTIONS,
      scenariosEvaluated: scenarioOutcomes.length,
    },
    categories,
    actionBreakdown,
    mismatchReporting,
    scenarioOutcomes,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await simulate()
  console.log(JSON.stringify(stripForCli(report), null, 2))
}
