#!/usr/bin/env node
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { simulate as simulatePhase5c } from './bond-rls-phase5c-write-simulation.mjs'

const INPUT_PATH =
  process.env.BOND_ASSIGNMENT_RECONCILIATION_INPUT ||
  process.env.BOND_RLS_SHADOW_INPUT ||
  '/tmp/staging-bond-assignment-export.json'
const MANUAL_MAPPING_PATH =
  process.env.BOND_ASSIGNMENT_MANUAL_MAPPING ||
  fileURLToPath(new URL('./data/bond-workspace-manual-mapping.json', import.meta.url))
const EXCLUSIONS_PATH =
  process.env.BOND_RLS_CUTOVER_EXCLUSIONS ||
  fileURLToPath(new URL('./data/bond-rls-cutover-exclusions.json', import.meta.url))
const OUTPUT_PATH = process.env.BOND_RLS_PHASE5D_WRITE_OUTPUT || ''
const SAMPLE_LIMIT = Number(process.env.BOND_RLS_SHADOW_SAMPLE_LIMIT || '25')

const COVERED_TABLES = Object.freeze({
  'finance.update_processing_step': 'transaction_subprocess_steps:update',
  'finance.review_compliance': 'transaction_subprocess_steps:update',
  'finance.internal_finance_mutation': 'transaction_finance_details:update',
  'finance.workflow_update': 'transaction_finance_details:update',
  'finance.request_documents': 'document_requests:insert_update',
  'finance.upload_documents': 'documents:insert_update',
  'finance.manage_bank_feedback': 'transaction_events_notifications:insert_update',
  'finance.submit_to_banks': 'not_covered',
  'finance.reassign_processor': 'not_covered',
})

const HQ_SCOPE_ROLES = new Set(['owner', 'director', 'hq_manager', 'personal_originator'])
const REGION_SCOPE_ROLES = new Set(['regional_manager', 'manager'])
const UNIT_SCOPE_ROLES = new Set(['branch_manager', 'team_lead', 'manager'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function readJsonFromPath(filePath, label) {
  if (!filePath) return null
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function explicitScenarioIndex(payload = {}) {
  const scenarios = Array.isArray(payload.simulation_scenarios)
    ? payload.simulation_scenarios
    : Array.isArray(payload.simulationScenarios)
      ? payload.simulationScenarios
      : []
  return new Map(
    scenarios.map((scenario, index) => [
      normalizeText(scenario.id || `scenario-${index + 1}`),
      scenario,
    ]),
  )
}

function isScopedManager(outcome = {}) {
  const scopeLevel = normalizeText(outcome.scopeLevel).toLowerCase()
  const workspaceRole = normalizeText(outcome.workspaceRole).toLowerCase()
  if (scopeLevel === 'workspace_hq' || HQ_SCOPE_ROLES.has(workspaceRole)) return true
  if (scopeLevel === 'region' && REGION_SCOPE_ROLES.has(workspaceRole)) return true
  if (['branch', 'team'].includes(scopeLevel) && UNIT_SCOPE_ROLES.has(workspaceRole)) return true
  return false
}

function derivePhase5dExpected(outcome = {}, scenario = {}) {
  const action = outcome.action
  const actorRole = normalizeText(outcome.actorRole).toLowerCase()
  const coveredTable = COVERED_TABLES[action] || 'not_covered'
  const stepKey = normalizeText(scenario.stepKey || scenario.step_key).toLowerCase()

  if (outcome.exclusionStatus?.excluded) {
    if (outcome.exclusionStatus.exclusionType === 'manual_review') {
      return {
        allow: outcome.currentAllowed,
        expectedDifference: null,
        reason: 'Manual review rows remain excluded from Phase 5D write enforcement.',
        forcedClassification: 'manualReviewWriteExcluded',
        coveredTable,
      }
    }
    return {
      allow: outcome.currentAllowed,
      expectedDifference: null,
      reason: 'Excluded legacy rows remain on the compatibility path during Phase 5D write rollout.',
      forcedClassification: 'phase5dLegacyExcluded',
      coveredTable,
    }
  }

  if (!outcome.canonicalReady) {
    return {
      allow: false,
      expectedDifference: null,
      reason: 'Only canonical-ready Bond rows are enforced in Phase 5D.',
      forcedClassification: 'phase5dLegacyExcluded',
      coveredTable,
    }
  }

  const scopedManager = isScopedManager(outcome)
  let allow = false
  let reason = 'No Phase 5D write grant exists for this role and action.'

  switch (action) {
    case 'finance.request_documents':
      allow =
        outcome.canonicalAllowed &&
        !['participant', 'role_player', 'unrelated'].includes(actorRole)
      reason = allow
        ? 'Assigned and scoped finance operators may request Bond finance documents in Phase 5D.'
        : 'Document requests stay limited to assigned and scoped finance operators.'
      break
    case 'finance.upload_documents':
      allow = outcome.canonicalAllowed
      reason = allow
        ? 'Phase 5D keeps canonical document upload permissions for Bond finance documents.'
        : 'No Phase 5D document upload grant exists for this actor.'
      break
    case 'finance.update_processing_step':
      allow =
        outcome.canonicalAllowed &&
        (actorRole === 'processor' || actorRole === 'manager' || scopedManager) &&
        !stepKey.includes('compliance')
      reason = allow
        ? 'Processing step updates are limited to processors, managers, and in-scope operational leads.'
        : 'Processing step updates are not granted for this role, scope, or step type in Phase 5D.'
      break
    case 'finance.review_compliance':
      allow = outcome.canonicalAllowed && (actorRole === 'compliance' || scopedManager)
      reason = allow
        ? 'Compliance reviews are limited to assigned compliance users and in-scope operational leads.'
        : 'Compliance review is not granted for this role or scope in Phase 5D.'
      break
    case 'finance.manage_bank_feedback':
      allow =
        outcome.canonicalAllowed &&
        (actorRole === 'processor' || actorRole === 'manager' || scopedManager)
      reason = allow
        ? 'Bank feedback mutations are limited to processors and in-scope operational leads.'
        : 'Bank feedback mutation is not granted for this role or scope in Phase 5D.'
      break
    case 'finance.internal_finance_mutation':
    case 'finance.workflow_update':
      allow =
        outcome.canonicalAllowed &&
        (['consultant', 'processor', 'manager', 'personal_originator'].includes(actorRole) ||
          scopedManager)
      reason = allow
        ? 'Finance detail and workflow updates are limited to assigned finance operators and in-scope leads.'
        : 'Internal finance mutations are not granted for this role or scope in Phase 5D.'
      break
    case 'finance.submit_to_banks':
      allow = false
      reason = 'Submit-to-bank final enforcement is intentionally deferred beyond Phase 5D.'
      break
    case 'finance.reassign_processor':
      allow = false
      reason = 'Assignment mutation enforcement is intentionally deferred beyond Phase 5D.'
      break
    default:
      allow = false
      reason = 'Unknown Phase 5D action.'
      break
  }

  let expectedDifference = null
  if (outcome.currentAllowed && !allow) expectedDifference = 'expectedWriteTightening'
  if (!outcome.currentAllowed && allow) expectedDifference = 'expectedCanonicalExpansion'

  return {
    allow,
    expectedDifference,
    reason,
    forcedClassification: null,
    coveredTable,
  }
}

function createCategories() {
  return {
    currentAllows_phase5dAllows: 0,
    currentAllows_phase5dDenies: 0,
    currentDenies_phase5dAllows: 0,
    currentDenies_phase5dDenies: 0,
    unexpectedAllow: 0,
    unexpectedDeny: 0,
    expectedWriteTightening: 0,
    expectedCanonicalExpansion: 0,
    intentionalChanges: 0,
    phase5dCanonicalReadyEnforced: 0,
    phase5dLegacyExcluded: 0,
    manualReviewWriteExcluded: 0,
  }
}

function createMismatchReporting() {
  return {
    unexpectedAllow: [],
    unexpectedDeny: [],
    expectedWriteTightening: [],
    expectedCanonicalExpansion: [],
  }
}

function buildSample(outcome = {}) {
  return {
    scenarioId: outcome.scenarioId,
    transactionId: outcome.transactionId,
    actorUserId: outcome.actorUserId,
    actorRole: outcome.actorRole,
    workspaceRole: outcome.workspaceRole,
    scopeLevel: outcome.scopeLevel,
    regionId: outcome.regionId,
    workspaceUnitId: outcome.workspaceUnitId,
    action: outcome.action,
    currentAllowed: outcome.currentAllowed,
    canonicalAllowed: outcome.canonicalAllowed,
    phase5dAllowed: outcome.phase5dAllowed,
    expectedPhase5d: outcome.expectedPhase5d,
    expectedDifference: outcome.expectedDifference,
    finalClassification: outcome.finalClassification,
    reason: outcome.reason,
    canonicalReason: outcome.canonicalReason,
    currentReason: outcome.currentReason,
    coveredTable: outcome.coveredTable,
    exclusionStatus: outcome.exclusionStatus,
    assignmentSummary: outcome.assignmentSummary,
  }
}

function incrementGroup(group = {}, key = '') {
  const normalizedKey = normalizeText(key) || 'unknown'
  group[normalizedKey] = (group[normalizedKey] || 0) + 1
}

function groupedSummary(samples = []) {
  const byAction = {}
  const byRole = {}
  const byScope = {}
  for (const sample of samples) {
    incrementGroup(byAction, sample.action)
    incrementGroup(byRole, sample.actorRole)
    incrementGroup(byScope, sample.scopeLevel || 'none')
  }
  return { byAction, byRole, byScope }
}

function finalClassification(outcome = {}) {
  if (outcome.forcedClassification) return outcome.forcedClassification
  if (outcome.phase5dAllowed !== outcome.expectedPhase5d) {
    return outcome.phase5dAllowed ? 'unexpectedAllow' : 'unexpectedDeny'
  }
  if (outcome.expectedDifference === 'expectedWriteTightening') return 'expectedWriteTightening'
  if (outcome.expectedDifference === 'expectedCanonicalExpansion') return 'expectedCanonicalExpansion'
  return 'matchedExpectation'
}

function simulate(payload = {}, manualMappings = [], exclusions = []) {
  const phase5cReport = simulatePhase5c(payload, manualMappings, exclusions, {
    includeAllOutcomes: true,
  })
  const scenarioMeta = explicitScenarioIndex(payload)
  const hasExplicitScenarios = scenarioMeta.size > 0
  const categories = createCategories()
  const mismatchReporting = createMismatchReporting()
  const scenarioOutcomes = []

  for (const phase5cOutcome of phase5cReport.scenarioOutcomes) {
    const scenario = scenarioMeta.get(phase5cOutcome.scenarioId) || {}
    const derived = derivePhase5dExpected(phase5cOutcome, scenario)
    const expectedPhase5d =
      typeof scenario.expectedPhase5d === 'boolean'
        ? scenario.expectedPhase5d
        : derived.allow
    const expectedDifference =
      normalizeText(scenario.expectedDifference || scenario.expected_difference) ||
      derived.expectedDifference
    const reason = normalizeText(scenario.reason) || derived.reason

    if (phase5cOutcome.currentAllowed && derived.allow) categories.currentAllows_phase5dAllows += 1
    else if (phase5cOutcome.currentAllowed && !derived.allow) categories.currentAllows_phase5dDenies += 1
    else if (!phase5cOutcome.currentAllowed && derived.allow) categories.currentDenies_phase5dAllows += 1
    else categories.currentDenies_phase5dDenies += 1

    if (phase5cOutcome.canonicalReady && !phase5cOutcome.exclusionStatus?.excluded) {
      categories.phase5dCanonicalReadyEnforced += 1
    }

    const outcome = {
      ...phase5cOutcome,
      phase5dAllowed: derived.allow,
      expectedPhase5d,
      expectedDifference,
      reason,
      coveredTable: derived.coveredTable,
      forcedClassification: derived.forcedClassification,
    }

    outcome.finalClassification = finalClassification(outcome)

    if (outcome.finalClassification === 'unexpectedAllow') categories.unexpectedAllow += 1
    if (outcome.finalClassification === 'unexpectedDeny') categories.unexpectedDeny += 1
    if (outcome.finalClassification === 'expectedWriteTightening') categories.expectedWriteTightening += 1
    if (outcome.finalClassification === 'expectedCanonicalExpansion') categories.expectedCanonicalExpansion += 1
    if (outcome.finalClassification === 'phase5dLegacyExcluded') categories.phase5dLegacyExcluded += 1
    if (outcome.finalClassification === 'manualReviewWriteExcluded') categories.manualReviewWriteExcluded += 1

    if (mismatchReporting[outcome.finalClassification]) {
      mismatchReporting[outcome.finalClassification].push(buildSample(outcome))
    }

    scenarioOutcomes.push(outcome)
  }

  categories.intentionalChanges =
    categories.expectedWriteTightening + categories.expectedCanonicalExpansion

  return {
    input: phase5cReport.input,
    categories,
    mismatchReporting: {
      unexpectedAllowSamples: mismatchReporting.unexpectedAllow.slice(0, SAMPLE_LIMIT),
      unexpectedDenySamples: mismatchReporting.unexpectedDeny.slice(0, SAMPLE_LIMIT),
      expectedWriteTighteningSamples: mismatchReporting.expectedWriteTightening.slice(0, SAMPLE_LIMIT),
      expectedCanonicalExpansionSamples: mismatchReporting.expectedCanonicalExpansion.slice(0, SAMPLE_LIMIT),
      unexpectedAllowByAction: groupedSummary(mismatchReporting.unexpectedAllow).byAction,
      unexpectedAllowByRole: groupedSummary(mismatchReporting.unexpectedAllow).byRole,
      unexpectedAllowByScope: groupedSummary(mismatchReporting.unexpectedAllow).byScope,
      unexpectedDenyByAction: groupedSummary(mismatchReporting.unexpectedDeny).byAction,
      unexpectedDenyByRole: groupedSummary(mismatchReporting.unexpectedDeny).byRole,
      unexpectedDenyByScope: groupedSummary(mismatchReporting.unexpectedDeny).byScope,
    },
    scenarioOutcomes: hasExplicitScenarios
      ? scenarioOutcomes
      : scenarioOutcomes.filter((outcome) => outcome.finalClassification !== 'matchedExpectation').slice(0, SAMPLE_LIMIT),
  }
}

function main() {
  const payload = readJsonFromPath(INPUT_PATH, 'input payload')
  if (!payload) {
    throw new Error(`Input payload file not found: ${INPUT_PATH}`)
  }

  const manualMappings = readJsonFromPath(MANUAL_MAPPING_PATH, 'manual mapping') || []
  const exclusions = readJsonFromPath(EXCLUSIONS_PATH, 'cutover exclusions') || []
  const report = simulate(payload, manualMappings, exclusions)
  const output = JSON.stringify(report, null, 2)

  if (OUTPUT_PATH) {
    fs.writeFileSync(OUTPUT_PATH, `${output}\n`)
  }

  console.log(output)
}

export { simulate }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
