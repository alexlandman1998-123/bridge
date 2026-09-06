import assert from 'node:assert/strict'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'

function model({ facts, documentRequirements = [] }) {
  return buildTransferWorkspaceViewModel({
    selectedTaskKey: 'entity_authority_checked',
    workflow: {
      title: 'Transfer Progress',
      statusLabel: 'In Progress',
      facts,
      lane: {
        laneKey: 'transfer',
        currentStage: 'entity_authority_checked',
        permissions: { canUpdateStage: true, canUploadDocuments: true, canRequestDocuments: true, canAddNotes: true },
        steps: [{ id: 'authority', stepKey: 'entity_authority_checked', status: 'in_progress', sortOrder: 1 }],
        documentRequirements,
      },
    },
  })
}

function approved(id) {
  return { id, label: id, status: 'approved', complete: true }
}

const marriedDocuments = ['buyer_id_document', 'buyer_proof_of_address', 'buyer_marital_status_documents', 'buyer_spouse_consent', 'seller_id_document', 'seller_proof_of_address'].map(approved)
const married = model({
  facts: { financeType: 'cash', buyerEntityType: 'individual', buyerMaritalStatus: 'married_in_community', sellerEntityType: 'individual', sellerMaritalStatus: 'single', sellerHasExistingBond: false },
  documentRequirements: marriedDocuments,
})
assert.equal(married.selectedTask.completionReadiness.canComplete, true, 'complete married-party evidence should enable completion')
assert.deepEqual(married.selectedTask.dataRequirements.map((item) => item.complete), [true, true, true, true])
assert.equal(married.availableActions.primary.find((action) => action.id === 'mark_complete')?.disabled, false)

const missingConsent = model({
  facts: { financeType: 'cash', buyerEntityType: 'individual', buyerMaritalStatus: 'married_in_community', sellerEntityType: 'individual', sellerMaritalStatus: 'single', sellerHasExistingBond: false },
  documentRequirements: marriedDocuments.filter((item) => item.id !== 'buyer_spouse_consent'),
})
assert.equal(missingConsent.selectedTask.completionReadiness.canComplete, false, 'missing spouse consent must block completion')
assert.ok(missingConsent.selectedTask.completionReadiness.missingRequiredDocuments.some((item) => item.sourceRequirementKey === 'buyer_spouse_consent'))

const companyTrustDocuments = [
  'buyer_company_registration_documents', 'buyer_company_resolution', 'buyer_director_ids',
  'seller_trust_deed', 'seller_letters_of_authority', 'seller_trustee_ids', 'seller_trustee_resolution',
].map(approved)
const companyTrust = model({
  facts: {
    financeType: 'bond', buyerEntityType: 'company', buyer: { representative_capacity: 'Director' },
    sellerEntityType: 'trust', seller: { trust: { trustees: ['Trustee One'] } }, sellerHasExistingBond: true,
  },
  documentRequirements: companyTrustDocuments,
})
assert.equal(companyTrust.selectedTask.completionReadiness.canComplete, true, 'company/trust authority evidence and facts should enable completion')

const unknown = model({ facts: { financeType: 'unknown', buyerEntityType: '', sellerEntityType: '' } })
assert.equal(unknown.selectedTask.completionReadiness.canComplete, false)
assert.ok(unknown.selectedTask.completionReadiness.missingRequiredData.length >= 2)

console.log('Transfer attorney Phase 1 completion-gate scenarios passed.')
