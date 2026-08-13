import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION,
  BOND_APPLICATION_DOCUMENT_TIMING,
  buildBondApplicationCanonicalDocumentModel,
  cloneBondApplicationValue,
  createEmptyBondApplicationState,
  resolveBondApplicationCanonicalParentKey,
  resolveBondApplicationDocumentRequirements,
} from '../src/modules/bond/application/index.js'
import { buildDocumentRequestContainerModel } from '../src/core/documents/documentRequestContainerModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const modelSource = fs.readFileSync('src/modules/bond/application/documents/bondApplicationCanonicalDocumentModel.js', 'utf8')
const indexSource = fs.readFileSync('src/modules/bond/application/index.js', 'utf8')
const containerSource = fs.readFileSync('src/core/documents/documentRequestContainerModel.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase4-bond-model.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase4-bond-model.md', 'utf8')

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

function baseState(type = 'permanent_employee') {
  let state = createEmptyBondApplicationState()
  state.application.transactionId = 'phase4-test-transaction'
  state.application.finance.purchasePrice = '2500000'
  state.application.finance.depositAmount = '200000'
  state.application.finance.requestedBondAmount = '2300000'
  state.application.applicantStructure = 'sole'
  state.participants.primaryApplicant.personal.first_name = 'Primary'
  state.participants.primaryApplicant.personal.surname = 'Buyer'
  state.participants.primaryApplicant.contact.email = 'primary@example.test'
  state.participants.primaryApplicant.credit.has_debts = 'no'
  state.participants.primaryApplicant.credit.owns_property = 'no'
  state.participants.primaryApplicant.credit.under_debt_review = 'no'
  state.participants.primaryApplicant.credit.has_judgment = 'no'
  state.participants.primaryApplicant.credit.has_arrears = 'no'
  state.participants.primaryApplicant.credit.declared_insolvent = 'no'
  state = setPath(state, 'participants.primaryApplicant.employment.occupation_status', type)
  state = setPath(state, 'participants.primaryApplicant.employment.has_additional_income', 'no')
  return state
}

assert.equal(
  packageJson.scripts['test:document-request-phase4-bond-model'],
  'node scripts/document-request-phase4-bond-model.test.mjs',
  'package.json should expose the Phase 4 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase4-bond-model'],
  'node scripts/document-request-phase4-bond-model.mjs',
  'package.json should expose the Phase 4 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase4-bond-model'],
  'npm run verify:document-request-phase3-buyer-cleanup && npm run test:document-request-phase4-bond-model && npm run report:document-request-phase4-bond-model',
  'package.json should expose the Phase 4 verification command.',
)

assert.match(modelSource, /bond_application_canonical_document_model_v1/, 'Bond model should carry a stable version.')
assert.match(modelSource, /income_affordability_documents/, 'Bond model should roll income children to the canonical affordability parent.')
assert.match(modelSource, /buildDocumentRequestContainerModel/, 'Bond model should use Phase 2 request containers.')
assert.match(indexSource, /buildBondApplicationCanonicalDocumentModel/, 'Bond module index should export the canonical bond model.')
assert.match(containerSource, /BOND_ORIGINATOR_VISIBLE_CONTAINER_KEYS/, 'Container model should know bond-originator finance parent keys.')
assert.match(scriptSource, /document_request_phase4_bond_model/, 'Phase 4 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 4 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 4 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 4 report should not query or mutate database tables.')
assert.match(docs, /Bond Document Model/, 'Phase 4 docs should name the phase.')
assert.match(docs, /income_affordability_documents/, 'Phase 4 docs should mention the canonical affordability parent.')

const permanent = buildBondApplicationCanonicalDocumentModel({ applicationState: baseState('permanent_employee') })
assert.equal(permanent.version, BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION)
assert.equal(permanent.unmappedChildren.length, 0)
assert.ok(permanent.parentKeys.includes('buyer_id_document'))
assert.ok(permanent.parentKeys.includes('buyer_proof_of_address'))
assert.ok(permanent.parentKeys.includes('income_affordability_documents'))
assert.ok(permanent.originatorVisibleParentKeys.includes('income_affordability_documents'))
assert.ok(permanent.childContainerKeys.includes('bond_application_primary_applicant_bank_statements'))
assert.ok(permanent.childContainerKeys.includes('bond_application_salary_income_evidence'))
assert.equal(permanent.buyerContainerKeys.includes('income_affordability_documents'), false)
assert.equal(permanent.bondOriginatorContainerKeys.includes('income_affordability_documents'), false)
assert.ok(permanent.bondOriginatorContainerKeys.includes('bond_application_primary_applicant_bank_statements'))
assert.ok(permanent.bondOriginatorContainerKeys.includes('bond_application_salary_income_evidence'))
assert.ok(permanent.bondOriginatorContainerSummary.total > 1)
assert.ok(permanent.bondOriginatorContainerSummary.blocking > 1)
assert.ok(permanent.canonicalBondOriginatorPlanKeys.includes('income_affordability_documents'))

const resolved = resolveBondApplicationDocumentRequirements({ applicationState: baseState('self_employed') })
const businessRegistration = resolved.activeRequirements.find((item) => item.key === 'bond_application_business_registration')
const selfEmployedFinancials = resolved.activeRequirements.find((item) => item.key === 'bond_application_self_employed_financials')
assert.equal(resolveBondApplicationCanonicalParentKey(businessRegistration), 'income_affordability_documents')
assert.equal(resolveBondApplicationCanonicalParentKey(selfEmployedFinancials), 'income_affordability_documents')

const branches = [
  ['contract_employee', 'bond_application_employment_contract'],
  ['self_employed', 'bond_application_business_registration'],
  ['commission_based', 'bond_application_commission_income_evidence'],
  ['retired', 'bond_application_retirement_income_evidence'],
  ['other', 'bond_application_other_income_evidence'],
]
for (const [employmentType, expectedKey] of branches) {
  const model = buildBondApplicationCanonicalDocumentModel({ applicationState: baseState(employmentType) })
  assert.ok(model.children.some((child) => child.key === expectedKey), `${employmentType} should include ${expectedKey}`)
  assert.ok(model.children.find((child) => child.key === expectedKey)?.canonicalParentKey === 'income_affordability_documents')
  assert.equal(model.unmappedChildren.length, 0)
}

const noDeposit = buildBondApplicationCanonicalDocumentModel({
  applicationState: setPath(baseState('permanent_employee'), 'application.finance.depositAmount', '0'),
})
assert.equal(noDeposit.children.some((child) => child.key === 'bond_application_deposit_proof'), false)

const credit = buildBondApplicationCanonicalDocumentModel({
  applicationState: setPath(baseState('permanent_employee'), 'participants.primaryApplicant.credit.has_judgment', 'yes'),
})
assert.ok(credit.children.some((child) => child.key === 'bond_application_credit_history_support'))
assert.equal(credit.children.find((child) => child.key === 'bond_application_credit_history_support')?.canonicalParentKey, 'income_affordability_documents')

const signatureChildren = permanent.children.filter((child) => child.blocksSignature)
assert.ok(signatureChildren.every((child) => child.requiredBefore === BOND_APPLICATION_DOCUMENT_TIMING.requiredBeforeSignature))

const originatorContainer = buildDocumentRequestContainerModel({
  transactionId: 'phase4-test-transaction',
  audience: 'bond_originator',
  requiredDocuments: [{
    id: 'income-parent',
    document_key: 'income_affordability_documents',
    document_label: 'Income and Affordability Documents',
    requested_from: 'buyer',
    visibility_scope: 'client_visible',
    status: 'missing',
  }],
})
assert.equal(originatorContainer.summary.total, 1)
assert.equal(originatorContainer.containers[0].visibleTo.includes('bond_originator'), true)

const outputPath = 'output/document-request-phase4-bond-model.test.json'
execFileSync('node', ['scripts/document-request-phase4-bond-model.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase4_bond_model')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'bond_model_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.warnings.length, 0)
assert.equal(report.unmapped.length, 0)
assert.ok(report.scenarioModels.length >= 8)

console.log('document request phase 4 bond model tests passed')
