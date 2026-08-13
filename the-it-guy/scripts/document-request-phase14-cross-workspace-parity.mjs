import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildDocumentRequestContainerModel,
} from '../src/core/documents/documentRequestContainerModel.js'
import {
  buildBondApplicationCanonicalDocumentModel,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
} from '../src/modules/bond/application/index.js'
import {
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'
import {
  buildSellerDocumentCanonicalCleanupAudit,
} from '../src/services/documents/sellerDocumentCanonicalCleanupService.js'

const PHASE = 'document_request_phase14_cross_workspace_parity'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase14-cross-workspace-parity.json'
const FINANCE_PARENT_KEY = 'income_affordability_documents'
const AUDIENCES = Object.freeze(['buyer', 'seller', 'agent', 'attorney', 'bond_originator', 'internal'])
const CHILD_REQUIRED_AUDIENCES = Object.freeze(['buyer', 'agent', 'attorney', 'bond_originator', 'internal'])
const SELLER_ACCEPTED_GROUPED_KEYS = Object.freeze([
  'bond_statement',
  'seller_company_registration',
  'seller_director_fica',
  'seller_trustee_fica',
  'seller_executor_authority',
  'hoa_levy_statement',
  'lease_agreement',
])

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

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
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
  state.application.transactionId = `phase14-bond-${type}`
  state.application.finance.purchasePrice = '2500000'
  state.application.finance.depositAmount = '200000'
  state.application.finance.requestedBondAmount = '2300000'
  state.application.applicantStructure = 'sole'
  state.participants.primaryApplicant.personal.first_name = 'Phase'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.contact.email = 'phase14@example.test'
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

function buildBondScenarioStates() {
  return Object.freeze([
    ['permanent_employee', baseBondState('permanent_employee')],
    ['contract_employee', baseBondState('contract_employee')],
    ['self_employed', baseBondState('self_employed')],
    ['commission_based', baseBondState('commission_based')],
    ['retired', baseBondState('retired')],
    ['other_income', baseBondState('other')],
    ['existing_property', setPath(baseBondState('permanent_employee'), 'participants.primaryApplicant.credit.owns_property', 'yes')],
    ['credit_history', setPath(baseBondState('permanent_employee'), 'participants.primaryApplicant.credit.has_judgment', 'yes')],
  ])
}

function keysFor(model = {}) {
  return unique((model.containers || []).map((container) => container.documentKey))
}

function childContainersFor(model = {}, childKeys = []) {
  return (model.containers || []).filter((container) => childKeys.includes(container.documentKey))
}

function buildAudienceModels(model = {}) {
  return Object.fromEntries(AUDIENCES.map((audience) => [
    audience,
    buildDocumentRequestContainerModel({
      transactionId: `phase14-${model.participantRole || 'bond'}`,
      requiredDocuments: model.uploadRows,
      additionalRequests: [],
      audience,
    }),
  ]))
}

function buildBondParityScenarios() {
  return buildBondScenarioStates().map(([id, applicationState]) => {
    const model = buildBondApplicationCanonicalDocumentModel({ applicationState })
    const audienceModels = buildAudienceModels(model)
    const audienceKeys = Object.fromEntries(AUDIENCES.map((audience) => [audience, keysFor(audienceModels[audience])]))
    const childKeys = model.childContainerKeys
    const childContainerMetadataFailures = CHILD_REQUIRED_AUDIENCES.flatMap((audience) =>
      childContainersFor(audienceModels[audience], childKeys)
        .filter((container) =>
          container.parentDocumentKey !== FINANCE_PARENT_KEY ||
          container.childRequirementKey !== container.documentKey ||
          container.childContainer !== true,
        )
        .map((container) => ({
          audience,
          documentKey: container.documentKey,
          code: 'child_container_metadata_mismatch',
        })),
    )
    const childContainerIdDrift = childKeys.map((documentKey) => {
      const containerIds = unique(CHILD_REQUIRED_AUDIENCES.map((audience) =>
        audienceModels[audience].containers.find((container) => container.documentKey === documentKey)?.id,
      ))
      return {
        documentKey,
        containerIds,
        stable: containerIds.length === 1,
      }
    }).filter((row) => !row.stable)

    const failures = []
    for (const audience of CHILD_REQUIRED_AUDIENCES) {
      const missingChildren = childKeys.filter((key) => !audienceKeys[audience].includes(key))
      if (missingChildren.length) failures.push({ code: 'missing_child_container', audience, missingChildren })
      if (audienceKeys[audience].includes(FINANCE_PARENT_KEY)) failures.push({ code: 'broad_finance_parent_visible_as_upload', audience })
    }
    if (childKeys.some((key) => audienceKeys.seller.includes(key))) {
      failures.push({ code: 'seller_sees_buyer_finance_child_container', audience: 'seller' })
    }
    if (!model.parentKeys.includes(FINANCE_PARENT_KEY)) failures.push({ code: 'missing_parent_rollup' })
    if (!model.splitParentKeys.includes(FINANCE_PARENT_KEY)) failures.push({ code: 'parent_not_marked_split' })
    failures.push(...childContainerMetadataFailures, ...childContainerIdDrift.map((row) => ({ code: 'child_container_id_drift', ...row })))

    return Object.freeze({
      id,
      parentKeys: model.parentKeys,
      splitParentKeys: model.splitParentKeys,
      childContainerKeys: childKeys,
      audienceKeys,
      childContainerIdDrift,
      childContainerMetadataFailures,
      failures,
      ok: failures.length === 0,
    })
  })
}

function buildSellerGroupingSummary() {
  const audit = buildSellerDocumentCanonicalCleanupAudit()
  return audit.results.flatMap((result) =>
    result.profile.duplicateCanonicalGroups.map((group) => Object.freeze({
      scenarioId: result.id,
      canonicalKey: group.canonicalKey,
      legacyKeys: group.legacyKeys,
      accepted: SELLER_ACCEPTED_GROUPED_KEYS.includes(group.canonicalKey),
    })),
  )
}

function buildReport(options = {}) {
  const packageJson = JSON.parse(read('package.json'))
  const phase13Report = JSON.parse(read('output/document-request-phase13-parent-child-containers.json'))
  const smokeAudit = buildDocumentRequestWorkspaceSmokeAudit()
  const bondParityScenarios = buildBondParityScenarios()
  const sellerGroupingSummary = buildSellerGroupingSummary()
  const scriptSource = read('scripts/document-request-phase14-cross-workspace-parity.mjs')
  const docs = read('docs/document-request-phase14-cross-workspace-parity.md')
  const forbiddenDataAccessTokens = [
    'create' + 'Client',
    '.fro' + 'm(',
    '.inse' + 'rt(',
    '.upd' + 'ate(',
    '.upse' + 'rt(',
    '.del' + 'ete(',
  ]
  const excludedScopeTokens = [
    'document' + 'Generator',
    'generate' + 'Document',
    'legal' + 'Document',
  ]

  const unacceptedSellerGroupings = sellerGroupingSummary.filter((group) => !group.accepted)
  const bondFailures = bondParityScenarios.flatMap((scenario) =>
    scenario.failures.map((failure) => ({ scenarioId: scenario.id, ...failure })),
  )
  const additionalRequestDrift = smokeAudit.unstableContainerIds || []

  const checks = [
    {
      key: 'phase13_gate_clean',
      ok: phase13Report.gate?.ok === true &&
        phase13Report.gate?.productionActivationReady === true &&
        phase13Report.gate?.warnings?.length === 0,
    },
    {
      key: 'bond_child_containers_match_across_workspaces',
      ok: bondFailures.length === 0,
    },
    {
      key: 'additional_request_container_ids_stable',
      ok: smokeAudit.summary.unstableContainerIdCount === 0 && additionalRequestDrift.length === 0,
    },
    {
      key: 'workspace_smoke_has_no_visibility_drift',
      ok: smokeAudit.summary.failedSmokeCount === 0 &&
        smokeAudit.summary.deferredSellerUploadLeakCount === 0,
    },
    {
      key: 'seller_groupings_are_intentionally_accepted',
      ok: sellerGroupingSummary.length > 0 && unacceptedSellerGroupings.length === 0,
    },
    {
      key: 'phase14_is_read_only_local_qa',
      ok: scriptSource.includes('mutatedData: false') &&
        forbiddenDataAccessTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'document_generator_remains_out_of_scope',
      ok: docs.toLowerCase().includes('document generator') &&
        excludedScopeTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'phase14_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase14-cross-workspace-parity'] ===
        'npm run verify:document-request-phase13-parent-child-containers && npm run test:document-request-phase14-cross-workspace-parity && npm run report:document-request-phase14-cross-workspace-parity',
    },
  ]

  const failed = [
    ...checks.filter((check) => !check.ok),
    ...bondFailures.map((failure) => ({ key: failure.code, ...failure })),
    ...additionalRequestDrift.map((drift) => ({ key: 'additional_request_container_id_drift', ...drift })),
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
    version: 'document_request_cross_workspace_parity_v1',
    phase13Status: phase13Report.gate?.status || 'unknown',
    bondParityScenarios,
    sellerGroupingSummary,
    smokeSummary: smokeAudit.summary,
    additionalRequestContainerParity: smokeAudit.crossAudienceContainerIds,
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'cross_workspace_parity_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase15: failed.length === 0,
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
    bondScenarioCount: report.bondParityScenarios.length,
    sellerGroupingCount: report.sellerGroupingSummary.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
