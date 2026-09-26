import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'

function buildTransferModel(facts = {}) {
  return buildTransferWorkspaceViewModel({
    workflowKey: 'transfer',
    workflow: {
      title: 'Transfer Attorney Workflow',
      facts,
      lane: {
        laneKey: 'transfer',
        currentStage: 'instruction_received',
        permissions: { canUpdateStage: true, canAddNotes: true },
        steps: [{ id: 'instruction', stepKey: 'instruction_received', status: 'in_progress' }],
        dataRequirements: [],
        documentRequirements: [],
      },
    },
  })
}

function taskKeys(model) {
  return model.phases.flatMap((phase) => phase.tasks.map((task) => task.key))
}

function phaseFor(model, key) {
  return model.phases.find((phase) => phase.tasks.some((task) => task.key === key))
}

const cash = buildTransferModel({
  financeType: 'cash',
  isCashDeal: true,
  buyerEntityType: 'individual',
  sellerEntityType: 'individual',
})
const cashTasks = taskKeys(cash)
assert(cashTasks.includes('payment_security_review'), 'cash transfer must review its agreed payment security')
assert(!cashTasks.includes('guarantees_requested'), 'retired guarantee request must not reappear')

const bond = buildTransferModel({
  financeType: 'bond',
  buyerEntityType: 'company',
  sellerEntityType: 'individual',
})
const bondTasks = taskKeys(bond)
assert(bondTasks.includes('payment_security_review'), 'bond transfer must review guarantees and payment security')

const individualBuyerFica = cash.tasks.find((task) => task.key === 'buyer_fica_review')
const companyBuyerFica = bond.tasks.find((task) => task.key === 'buyer_fica_review')
assert(individualBuyerFica?.requiredDocumentKeys.includes('buyer_id_document'), 'individual buyer FICA must include an ID document')
assert(companyBuyerFica?.requiredDocumentKeys.includes('buyer_company_registration_documents'), 'company buyer FICA must include company registration documents')
assert(!companyBuyerFica?.requiredDocumentKeys.includes('buyer_id_document'), 'company buyer FICA must not inherit the individual-only ID task')

for (const model of [cash, bond]) {
  const visibleTaskCount = taskKeys(model).length
  const phaseTaskCount = model.phases.reduce((total, phase) => total + phase.total, 0)
  assert.equal(phaseTaskCount, visibleTaskCount, 'phase totals must count exactly the tasks that can be opened in Work')
  assert.equal(new Set(taskKeys(model)).size, visibleTaskCount, 'each Work task must belong to one phase only')
}

const financialPhase = phaseFor(bond, 'municipal_rates_clearance_review')
assert.equal(financialPhase?.key, 'financial_preparation', 'rates clearance must be in Financial Preparation')
assert.ok(taskKeys(bond).includes('property_compliance_review'), 'compliance certificates must be a visible attorney task')
assert.equal(phaseFor(bond, 'transfer_document_pack_review')?.key, 'documents_guarantees', 'transfer documents must be in Documents & Guarantees')

const headerSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(headerSource, /getApplicableAttorneyTaskDefinitions/)
// Actual header/Work state equivalence is exercised in attorney-mvp-task-state.test.mjs.

console.log(`Attorney workflow scenario alignment passed: ${cashTasks.length} cash tasks, ${bondTasks.length} bond tasks, with rates clearance and compliance mapped to Work.`)
