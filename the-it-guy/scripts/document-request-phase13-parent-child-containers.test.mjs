import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  BOND_APPLICATION_CHILD_CONTAINER_POLICY_VERSION,
  buildBondApplicationCanonicalDocumentModel,
  createEmptyBondApplicationState,
} from '../src/modules/bond/application/index.js'
import {
  normalizeRequiredDocumentContainer,
} from '../src/core/documents/documentRequestContainerModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const bondModelSource = fs.readFileSync('src/modules/bond/application/documents/bondApplicationCanonicalDocumentModel.js', 'utf8')
const containerSource = fs.readFileSync('src/core/documents/documentRequestContainerModel.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase13-parent-child-containers.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase13-parent-child-containers.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase13-parent-child-containers'],
  'node scripts/document-request-phase13-parent-child-containers.test.mjs',
  'package.json should expose the Phase 13 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase13-parent-child-containers'],
  'node scripts/document-request-phase13-parent-child-containers.mjs',
  'package.json should expose the Phase 13 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase13-parent-child-containers'],
  'npm run verify:document-request-phase12-seller-compliance-cleanup && npm run test:document-request-phase13-parent-child-containers && npm run report:document-request-phase13-parent-child-containers',
  'package.json should expose the Phase 13 verification command.',
)

assert.equal(BOND_APPLICATION_CHILD_CONTAINER_POLICY_VERSION, 'bond_application_child_container_policy_v1')
assert.match(bondModelSource, /buildChildRows/, 'Bond canonical model should build child upload rows.')
assert.match(bondModelSource, /buildUploadRows/, 'Bond canonical model should build upload rows separately from parent rows.')
assert.match(containerSource, /parentDocumentKey/, 'Container model should preserve parent metadata.')
assert.match(containerSource, /childRequirementKey/, 'Container model should preserve child requirement metadata.')
assert.match(containerSource, /childContainer/, 'Container model should mark child containers.')
assert.match(scriptSource, /document_request_phase13_parent_child_upload_containers/, 'Phase 13 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 13 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 13 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.insert\(/, 'Phase 13 report should not insert data.')
assert.doesNotMatch(scriptSource, /\.update\(/, 'Phase 13 report should not update data.')
assert.doesNotMatch(scriptSource, /\.upsert\(/, 'Phase 13 report should not upsert data.')
assert.match(docs, /Parent Vs Child Upload Containers/, 'Phase 13 docs should name the phase.')
assert.match(docs, /document generator/i, 'Phase 13 docs should state generator work is out of scope.')

const applicationState = createEmptyBondApplicationState()
applicationState.application.transactionId = 'phase13-contract-test'
applicationState.application.finance.purchasePrice = '2500000'
applicationState.application.finance.depositAmount = '200000'
applicationState.application.finance.requestedBondAmount = '2300000'
applicationState.application.applicantStructure = 'sole'
applicationState.participants.primaryApplicant.personal.first_name = 'Phase'
applicationState.participants.primaryApplicant.personal.surname = 'Buyer'
applicationState.participants.primaryApplicant.contact.email = 'phase13@example.test'
applicationState.participants.primaryApplicant.employment.occupation_status = 'permanent_employee'
applicationState.participants.primaryApplicant.employment.employer_name = 'Employer'
applicationState.participants.primaryApplicant.employment.has_additional_income = 'no'
applicationState.participants.primaryApplicant.expenses.gross_salary = '55000'
applicationState.participants.primaryApplicant.credit.has_debts = 'no'
applicationState.participants.primaryApplicant.credit.owns_property = 'no'
applicationState.participants.primaryApplicant.credit.under_debt_review = 'no'
applicationState.participants.primaryApplicant.credit.has_judgment = 'no'
applicationState.participants.primaryApplicant.credit.has_arrears = 'no'
applicationState.participants.primaryApplicant.credit.declared_insolvent = 'no'

const model = buildBondApplicationCanonicalDocumentModel({ applicationState })
assert.ok(model.parentKeys.includes('income_affordability_documents'), 'Broad finance parent should remain as roll-up metadata.')
assert.ok(model.splitParentKeys.includes('income_affordability_documents'), 'Broad finance parent should be marked as split.')
assert.ok(model.childContainerKeys.includes('bond_application_primary_applicant_bank_statements'), 'Bank statement child should have its own upload container.')
assert.ok(model.childContainerKeys.includes('bond_application_salary_income_evidence'), 'Salary evidence child should have its own upload container.')
assert.equal(model.uploadContainerKeys.includes('income_affordability_documents'), false, 'Broad finance parent should not be an upload container.')
assert.equal(model.buyerContainerKeys.includes('income_affordability_documents'), false, 'Buyer workspace should not expose broad finance upload container.')
assert.equal(model.bondOriginatorContainerKeys.includes('income_affordability_documents'), false, 'Originator workspace should not expose broad finance upload container.')
assert.ok(model.bondOriginatorContainerKeys.includes('bond_application_primary_applicant_bank_statements'), 'Originator should see bank statement child container.')
assert.ok(model.bondOriginatorContainerKeys.includes('bond_application_salary_income_evidence'), 'Originator should see salary evidence child container.')

const childContainer = normalizeRequiredDocumentContainer({
  transactionId: 'phase13-contract-test',
  key: 'bond_application_salary_income_evidence',
  label: 'Latest payslips',
  requestedFrom: 'buyer',
  visibility: 'client_visible',
  parent_document_key: 'income_affordability_documents',
  child_requirement_key: 'bond_application_salary_income_evidence',
  child_container: true,
  originatorVisible: true,
})
assert.equal(childContainer.parentDocumentKey, 'income_affordability_documents')
assert.equal(childContainer.childRequirementKey, 'bond_application_salary_income_evidence')
assert.equal(childContainer.childContainer, true)
assert.ok(childContainer.visibleTo.includes('buyer'))
assert.ok(childContainer.visibleTo.includes('agent'))
assert.ok(childContainer.visibleTo.includes('bond_originator'))

const outputPath = 'output/document-request-phase13-parent-child-containers.test.json'
execFileSync('node', ['scripts/document-request-phase13-parent-child-containers.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase13_parent_child_upload_containers')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'parent_child_upload_containers_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.warnings.length, 0)
assert.equal(report.gate.mayProceedToPhase14, true)
assert.equal(report.gate.productionActivationReady, true)
assert.ok(report.bondScenarioSummary.length >= 8)
for (const scenario of report.bondScenarioSummary) {
  assert.ok(scenario.parentKeys.includes('income_affordability_documents'), `${scenario.id} should retain parent roll-up.`)
  assert.ok(scenario.splitParentKeys.includes('income_affordability_documents'), `${scenario.id} should split finance parent.`)
  assert.equal(scenario.uploadContainerKeys.includes('income_affordability_documents'), false, `${scenario.id} should not upload against finance parent.`)
  assert.ok(scenario.childContainerKeys.length > 0, `${scenario.id} should have child upload containers.`)
  assert.ok(scenario.bondOriginatorContainerKeys.length > 0, `${scenario.id} should expose child containers to originator.`)
}

console.log('document request phase 13 parent child container tests passed')
