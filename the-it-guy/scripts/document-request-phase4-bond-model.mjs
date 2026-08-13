import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION,
  buildBondApplicationCanonicalDocumentModel,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
} from '../src/modules/bond/application/index.js'

const PHASE = 'document_request_phase4_bond_model'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase4-bond-model.json'

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    output: DEFAULT_OUTPUT_PATH,
    strict: false,
    pretty: true,
  }
  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg === '--strict') options.strict = true
    else if (arg === '--compact') options.pretty = false
  }
  return options
}

function setPath(source, pathKey, value) {
  const next = cloneBondApplicationValue(source)
  const parts = pathKey.split('.')
  let current = next
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value
      return
    }
    current[part] = current[part] || {}
    current = current[part]
  })
  return next
}

function baseState() {
  const state = createEmptyBondApplicationState()
  state.application.transactionId = 'phase4-bond-transaction'
  state.application.finance.purchasePrice = '2500000'
  state.application.finance.depositAmount = '200000'
  state.application.finance.requestedBondAmount = '2300000'
  state.application.applicantStructure = 'sole'
  state.participants.primaryApplicant.personal.first_name = 'Phase'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.contact.email = 'phase.buyer@example.test'
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.primaryApplicant.credit.owns_property = 'no'
  state.participants.primaryApplicant.credit.under_debt_review = 'no'
  state.participants.primaryApplicant.credit.has_judgment = 'no'
  state.participants.primaryApplicant.credit.has_arrears = 'no'
  state.participants.primaryApplicant.credit.declared_insolvent = 'no'
  return state
}

function employmentState(type) {
  let state = baseState()
  state = setPath(state, 'participants.primaryApplicant.employment.occupation_status', type)
  state = setPath(state, 'participants.primaryApplicant.employment.has_additional_income', 'no')
  if (type === 'permanent_employee' || type === 'contract_employee') {
    state = setPath(state, 'participants.primaryApplicant.employment.employer_name', 'Employer')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '55000')
  }
  if (type === 'self_employed') {
    state = setPath(state, 'participants.primaryApplicant.employment.business_name', 'Trading Co')
    state = setPath(state, 'participants.primaryApplicant.expenses.gross_salary', '85000')
  }
  if (type === 'commission_based') {
    state = setPath(state, 'participants.primaryApplicant.expenses.average_commission', '25000')
  }
  if (type === 'retired' || type === 'other') {
    state = setPath(state, 'participants.primaryApplicant.incomeSources', [{
      id: `${type}_income`,
      type: type === 'retired' ? 'pension' : 'other',
      sourceName: 'Income source',
      monthlyAmount: '40000',
    }])
  }
  return state
}

function buildScenarioModels() {
  const scenarios = [
    ['permanent_employee', employmentState('permanent_employee')],
    ['contract_employee', employmentState('contract_employee')],
    ['self_employed', employmentState('self_employed')],
    ['commission_based', employmentState('commission_based')],
    ['retired', employmentState('retired')],
    ['other_income', employmentState('other')],
    ['existing_property', setPath(employmentState('permanent_employee'), 'participants.primaryApplicant.credit.owns_property', 'yes')],
    ['credit_history', setPath(employmentState('permanent_employee'), 'participants.primaryApplicant.credit.has_judgment', 'yes')],
    ['no_deposit', setPath(employmentState('permanent_employee'), 'application.finance.depositAmount', '0')],
  ]
  return scenarios.map(([id, applicationState]) => ({
    id,
    model: buildBondApplicationCanonicalDocumentModel({ applicationState }),
  }))
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function buildReport(options = {}) {
  const scenarioModels = buildScenarioModels()
  const modelSource = read('src/modules/bond/application/documents/bondApplicationCanonicalDocumentModel.js')
  const containerSource = read('src/core/documents/documentRequestContainerModel.js')
  const ruleSource = read('src/modules/bond/application/documents/bondApplicationDocumentRules.js')
  const unmapped = scenarioModels.flatMap((scenario) =>
    scenario.model.unmappedChildren.map((child) => ({ scenarioId: scenario.id, key: child.key, canonicalDocumentType: child.canonicalDocumentType })),
  )
  const checks = [
    {
      key: 'bond_rules_still_granular',
      ok: ruleSource.includes('BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION') && ruleSource.includes('selfEmployed'),
    },
    {
      key: 'bond_parent_model_exists',
      ok: modelSource.includes('bond_application_canonical_document_model_v1'),
    },
    {
      key: 'income_children_roll_up',
      ok: scenarioModels.every((scenario) => scenario.model.parentKeys.includes('income_affordability_documents')),
    },
    {
      key: 'originator_finance_container_visible',
      ok: scenarioModels.every((scenario) => scenario.model.originatorVisibleParentKeys.includes('income_affordability_documents')),
    },
    {
      key: 'no_unmapped_bond_children',
      ok: unmapped.length === 0,
    },
    {
      key: 'container_model_originator_finance_keys',
      ok: containerSource.includes('BOND_ORIGINATOR_VISIBLE_CONTAINER_KEYS'),
    },
  ]
  const failed = checks.filter((check) => !check.ok)
  const warnings = [
    {
      code: 'bond_parent_is_broad',
      message: 'Granular bond upload rows intentionally roll up to the broad canonical income_affordability_documents parent until Phase 4 child-container activation is approved.',
    },
  ]
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    modelVersion: BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION,
    scenarioModels: scenarioModels.map((scenario) => ({
      id: scenario.id,
      activeChildRequirementCount: scenario.model.activeChildRequirementCount,
      requiredChildRequirementCount: scenario.model.requiredChildRequirementCount,
      parentKeys: scenario.model.parentKeys,
      originatorVisibleParentKeys: scenario.model.originatorVisibleParentKeys,
      byCanonicalParentKey: scenario.model.byCanonicalParentKey,
      buyerContainerSummary: scenario.model.buyerContainerSummary,
      bondOriginatorContainerSummary: scenario.model.bondOriginatorContainerSummary,
    })),
    unmapped,
    phase4Decisions: [
      {
        key: 'bond_child_parent_model',
        decision: 'Bond application documents stay granular in the bond workflow but roll up to canonical transaction parent containers.',
      },
      {
        key: 'originator_visibility',
        decision: 'Bond originators see finance parent containers, especially income_affordability_documents, not unrelated seller or transfer documents.',
      },
      {
        key: 'schema_safety',
        decision: 'Phase 4 does not add unknown columns to transaction_required_documents; canonical parent metadata is model/report data until migration is designed.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'bond_model_mapped_with_warnings',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase5: failed.length === 0,
      productionActivationReady: failed.length === 0 && warnings.length === 0,
      checks,
      failed,
      warnings,
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
    modelVersion: report.modelVersion,
    scenarioCount: report.scenarioModels.length,
    unmappedCount: report.unmapped.length,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
