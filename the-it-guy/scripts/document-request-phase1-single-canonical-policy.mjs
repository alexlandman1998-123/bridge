import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { buildCanonicalDocumentRequestPlan } from '../src/core/documents/documentRequestCanonicalPlanner.js'
import { buildCanonicalDocumentRequestPolicyReport } from '../src/core/documents/documentRequestCanonicalPolicy.js'

const PHASE = 'document_request_phase1_single_canonical_policy'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase1-single-canonical-policy.json'
const CANONICAL_POLICY_PATH = 'config/document-request-phase1-legal-checklist.json'

const SAMPLE_SCENARIOS = Object.freeze([
  {
    id: 'individual_buyer_company_seller_hybrid',
    scenario: {
      buyerEntityType: 'individual',
      sellerEntityType: 'company',
      financeType: 'hybrid',
      sellerHasExistingBond: true,
      propertyType: 'sectional_title',
    },
  },
  {
    id: 'trust_buyer_trust_seller_bond',
    scenario: {
      buyerEntityType: 'trust',
      sellerEntityType: 'trust',
      financeType: 'bond',
      gasInstallation: true,
    },
  },
  {
    id: 'foreign_cash_buyer_individual_seller',
    scenario: {
      buyerEntityType: 'foreign_individual',
      sellerEntityType: 'individual',
      financeType: 'cash',
      propertyType: 'estate_hoa',
    },
  },
])

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    output: DEFAULT_OUTPUT_PATH,
    strictSignoff: false,
    pretty: true,
  }

  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg === '--strict-signoff') options.strictSignoff = true
    else if (arg === '--compact') options.pretty = false
  }

  return options
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function readCanonicalPolicySource() {
  const absolutePath = path.join(process.cwd(), CANONICAL_POLICY_PATH)
  const source = fs.readFileSync(absolutePath, 'utf8')
  return {
    path: CANONICAL_POLICY_PATH,
    bytes: Buffer.byteLength(source),
    hash: `sha256:${sha256(source)}`,
  }
}

function summarizeScenarioPlans() {
  return SAMPLE_SCENARIOS.map(({ id, scenario }) => {
    const plan = buildCanonicalDocumentRequestPlan(scenario)
    return {
      id,
      scenario,
      tokens: plan.scenarioTokens,
      total: plan.summary.total,
      requestable: plan.summary.requestable,
      pendingPolicy: plan.summary.pendingPolicy,
      byAudience: plan.summary.byAudience,
      buyerKeys: plan.requests.filter((request) => request.portalAudience.includes('buyer')).map((request) => request.key),
      sellerKeys: plan.requests.filter((request) => request.portalAudience.includes('seller')).map((request) => request.key),
      bondOriginatorKeys: plan.requests.filter((request) => request.portalAudience.includes('bond_originator')).map((request) => request.key),
      pendingPolicyKeys: plan.requests.filter((request) => request.pendingPolicy).map((request) => request.key),
      nonRequestablePendingPolicyKeys: plan.requests
        .filter((request) => request.pendingPolicy && request.requestable === false && request.blocksStage === null)
        .map((request) => request.key),
    }
  })
}

function buildReport(options = {}) {
  const policy = buildCanonicalDocumentRequestPolicyReport()
  const gateStatus = policy.validation.ok
    ? options.strictSignoff && policy.counts.pendingSignoffDecisions
      ? 'blocked_pending_signoff'
      : policy.counts.pendingSignoffDecisions
        ? 'policy_valid_pending_signoff'
        : 'policy_valid'
    : 'policy_invalid'

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strictSignoff: options.strictSignoff === true,
    canonicalPolicySource: readCanonicalPolicySource(),
    policy,
    scenarioProofs: summarizeScenarioPlans(),
    phase1Decisions: [
      {
        key: 'single_source_of_truth',
        decision: 'config/document-request-phase1-legal-checklist.json is the canonical policy source consumed by the matrix, planner, sync, portal, and later migration gates.',
      },
      {
        key: 'pending_policy_requestability',
        decision: 'Pending-policy rows may be visible for internal/legal review but are not requestable and do not block stages by default.',
      },
      {
        key: 'deferred_seller_records',
        decision: 'Acquisition and capital-improvement records stay outside canonical policy until a legal requirement is approved.',
      },
      {
        key: 'legacy_keys',
        decision: 'Legacy buyer and seller keys must map through adapters/backfill; new client-visible rules must be added to canonical policy first.',
      },
    ],
    gate: {
      status: gateStatus,
      ok: policy.validation.ok && !(options.strictSignoff && policy.counts.pendingSignoffDecisions),
      mayProceedToPhase2: policy.validation.ok,
      productionActivationReady: policy.validation.ok && policy.counts.pendingSignoffDecisions === 0,
      errors: policy.validation.errors,
      warnings: policy.validation.warnings,
    },
  }
}

async function main() {
  const options = parseArgs()
  const report = buildReport(options)
  const outputPath = path.resolve(process.cwd(), options.output)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`)

  console.log(JSON.stringify({
    phase: report.phase,
    status: report.gate.status,
    output: options.output,
    mutatedData: report.mutatedData,
    requirementCount: report.policy.counts.requirements,
    requestableByDefault: report.policy.counts.requestableByDefault,
    pendingPolicy: report.policy.counts.pendingPolicy,
    pendingSignoffDecisions: report.policy.counts.pendingSignoffDecisions,
    warnings: report.policy.counts.warnings,
    errors: report.policy.counts.errors,
  }, null, 2))

  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
