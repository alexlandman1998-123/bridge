import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  BOND_APPLICATION_CHILD_CONTAINER_POLICY_VERSION,
  buildBondApplicationCanonicalDocumentModel,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
} from '../src/modules/bond/application/index.js'
import {
  buildSellerDocumentCanonicalCleanupAudit,
} from '../src/services/documents/sellerDocumentCanonicalCleanupService.js'
import {
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'

const PHASE = 'document_request_phase13_parent_child_upload_containers'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase13-parent-child-containers.json'

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

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
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

function baseBondState(type = 'permanent_employee') {
  let state = createEmptyBondApplicationState()
  state.application.transactionId = 'phase13-bond-transaction'
  state.application.finance.purchasePrice = '2500000'
  state.application.finance.depositAmount = '200000'
  state.application.finance.requestedBondAmount = '2300000'
  state.application.applicantStructure = 'sole'
  state.participants.primaryApplicant.personal.first_name = 'Phase'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.contact.email = 'phase13@example.test'
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.primaryApplicant.credit.owns_property = 'no'
  state.participants.primaryApplicant.credit.under_debt_review = 'no'
  state.participants.primaryApplicant.credit.has_judgment = 'no'
  state.participants.primaryApplicant.credit.has_arrears = 'no'
  state.participants.primaryApplicant.credit.declared_insolvent = 'no'
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

function buildBondScenarioModels() {
  return [
    ['permanent_employee', baseBondState('permanent_employee')],
    ['contract_employee', baseBondState('contract_employee')],
    ['self_employed', baseBondState('self_employed')],
    ['commission_based', baseBondState('commission_based')],
    ['retired', baseBondState('retired')],
    ['other_income', baseBondState('other')],
    ['existing_property', setPath(baseBondState('permanent_employee'), 'participants.primaryApplicant.credit.owns_property', 'yes')],
    ['credit_history', setPath(baseBondState('permanent_employee'), 'participants.primaryApplicant.credit.has_judgment', 'yes')],
  ].map(([id, applicationState]) => Object.freeze({
    id,
    model: buildBondApplicationCanonicalDocumentModel({ applicationState }),
  }))
}

function buildSellerGroupingSummary() {
  const audit = buildSellerDocumentCanonicalCleanupAudit()
  return audit.results.flatMap((result) =>
    result.profile.duplicateCanonicalGroups.map((group) => Object.freeze({
      scenarioId: result.id,
      canonicalKey: group.canonicalKey,
      legacyKeys: group.legacyKeys,
    })),
  )
}

function buildReport(options = {}) {
  const bondScenarioModels = buildBondScenarioModels()
  const sellerGroupingSummary = buildSellerGroupingSummary()
  const smokeAudit = buildDocumentRequestWorkspaceSmokeAudit()
  const packageJson = JSON.parse(read('package.json'))
  const bondModelSource = read('src/modules/bond/application/documents/bondApplicationCanonicalDocumentModel.js')
  const containerSource = read('src/core/documents/documentRequestContainerModel.js')

  const bondFailures = bondScenarioModels.flatMap((scenario) => {
    const model = scenario.model
    const failures = []
    if (!model.parentKeys.includes('income_affordability_documents')) {
      failures.push({ scenarioId: scenario.id, code: 'missing_income_parent_rollup' })
    }
    if (!model.splitParentKeys.includes('income_affordability_documents')) {
      failures.push({ scenarioId: scenario.id, code: 'income_parent_not_split' })
    }
    if (model.buyerContainerKeys.includes('income_affordability_documents')) {
      failures.push({ scenarioId: scenario.id, code: 'buyer_still_uses_broad_income_parent' })
    }
    if (model.bondOriginatorContainerKeys.includes('income_affordability_documents')) {
      failures.push({ scenarioId: scenario.id, code: 'originator_still_uses_broad_income_parent' })
    }
    if (!model.childContainerKeys.length || !model.originatorVisibleChildKeys.length) {
      failures.push({ scenarioId: scenario.id, code: 'missing_finance_child_containers' })
    }
    return failures
  })

  const unacceptedSellerGroupings = sellerGroupingSummary.filter((group) =>
    ![
      'bond_statement',
      'seller_company_registration',
      'seller_director_fica',
      'seller_trustee_fica',
      'seller_executor_authority',
      'hoa_levy_statement',
      'lease_agreement',
    ].includes(group.canonicalKey),
  )

  const checks = [
    {
      key: 'bond_child_container_policy_exists',
      ok: bondModelSource.includes('BOND_APPLICATION_CHILD_CONTAINER_POLICY_VERSION') &&
        bondModelSource.includes('buildChildRows') &&
        bondModelSource.includes('buildUploadRows'),
    },
    {
      key: 'container_model_preserves_parent_child_metadata',
      ok: containerSource.includes('parentDocumentKey') &&
        containerSource.includes('childRequirementKey') &&
        containerSource.includes('childContainer') &&
        containerSource.includes('originatorVisible === true'),
    },
    {
      key: 'bond_finance_parent_is_split_into_child_upload_containers',
      ok: bondFailures.length === 0,
    },
    {
      key: 'bond_parent_rollup_is_retained_for_summary_only',
      ok: bondScenarioModels.every((scenario) =>
        scenario.model.parentKeys.includes('income_affordability_documents') &&
        scenario.model.parentRows.some((row) => row.document_key === 'income_affordability_documents') &&
        scenario.model.uploadContainerKeys.includes('income_affordability_documents') === false,
      ),
    },
    {
      key: 'seller_grouped_containers_are_accepted_not_split',
      ok: sellerGroupingSummary.length > 0 && unacceptedSellerGroupings.length === 0,
    },
    {
      key: 'workspace_smoke_still_has_no_container_drift',
      ok: smokeAudit.summary.failedSmokeCount === 0 &&
        smokeAudit.summary.unstableContainerIdCount === 0 &&
        smokeAudit.summary.deferredSellerUploadLeakCount === 0,
    },
    {
      key: 'phase13_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase13-parent-child-containers'] ===
        'npm run verify:document-request-phase12-seller-compliance-cleanup && npm run test:document-request-phase13-parent-child-containers && npm run report:document-request-phase13-parent-child-containers',
    },
  ]

  const failed = [
    ...checks.filter((check) => !check.ok),
    ...bondFailures.map((failure) => ({ key: failure.code, ...failure })),
    ...unacceptedSellerGroupings.map((group) => ({ key: 'unaccepted_seller_grouping', ...group })),
  ]
  const warnings = []
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: 'document_request_parent_child_upload_containers_v1',
    bondChildContainerPolicyVersion: BOND_APPLICATION_CHILD_CONTAINER_POLICY_VERSION,
    bondScenarioSummary: bondScenarioModels.map((scenario) => ({
      id: scenario.id,
      parentKeys: scenario.model.parentKeys,
      splitParentKeys: scenario.model.splitParentKeys,
      childContainerKeys: scenario.model.childContainerKeys,
      uploadContainerKeys: scenario.model.uploadContainerKeys,
      buyerContainerKeys: scenario.model.buyerContainerKeys,
      bondOriginatorContainerKeys: scenario.model.bondOriginatorContainerKeys,
      bondOriginatorContainerSummary: scenario.model.bondOriginatorContainerSummary,
    })),
    sellerGroupingSummary,
    smokeSummary: smokeAudit.summary,
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'parent_child_upload_containers_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase14: failed.length === 0,
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
    failedChecks: report.gate.failed.length,
    warnings: report.gate.warnings.length,
    productionActivationReady: report.gate.productionActivationReady,
    bondScenarioCount: report.bondScenarioSummary.length,
    sellerGroupingCount: report.sellerGroupingSummary.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
