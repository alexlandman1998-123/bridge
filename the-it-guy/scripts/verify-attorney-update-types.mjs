import assert from 'node:assert/strict'
import {
  getAttorneyUpdateType,
  resolveAttorneyUpdateOptions,
} from '../src/constants/attorneyUpdateTypes.js'

function optionIds(result) {
  return new Set((result.groups || []).flatMap((group) => group.options.map((option) => option.id)))
}

function verifyCashIndividualTransfer() {
  const transaction = {
    id: 'cash-individual',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    cancellation_required: false,
  }
  const transfer = optionIds(resolveAttorneyUpdateOptions(transaction, 'transfer_attorney'))
  const bond = optionIds(resolveAttorneyUpdateOptions(transaction, 'bond_attorney'))
  const cancellation = optionIds(resolveAttorneyUpdateOptions(transaction, 'cancellation_attorney'))

  assert.equal(transfer.has('buyer_fica_requested'), true)
  assert.equal(transfer.has('seller_fica_requested'), true)
  assert.equal(transfer.has('marital_status_confirmed'), true)
  assert.equal(bond.size, 0)
  assert.equal(cancellation.size, 0)
}

function verifyBondCompanyOptions() {
  const transaction = {
    id: 'bond-company',
    finance_type: 'bond',
    transaction_type: 'resale',
    buyer_entity_type: 'company',
    seller_entity_type: 'individual',
  }
  const transfer = optionIds(resolveAttorneyUpdateOptions(transaction, 'transfer_attorney'))
  const bond = optionIds(resolveAttorneyUpdateOptions(transaction, 'bond_attorney'))

  assert.equal(transfer.has('company_resolution_requested'), true)
  assert.equal(transfer.has('director_documents_received'), true)
  assert.equal(bond.has('bond_instruction_received'), true)
  assert.equal(bond.has('bank_conditions_outstanding'), true)
}

function verifyTrustAndCancellationOptions() {
  const transaction = {
    id: 'trust-cancellation',
    finance_type: 'hybrid',
    transaction_type: 'commercial',
    buyer_entity_type: 'trust',
    seller_entity_type: 'company',
    seller_has_existing_bond: true,
  }
  const transfer = optionIds(resolveAttorneyUpdateOptions(transaction, 'transfer_attorney'))
  const cancellation = optionIds(resolveAttorneyUpdateOptions(transaction, 'cancellation_attorney'))

  assert.equal(transfer.has('trust_deed_requested'), true)
  assert.equal(transfer.has('letters_of_authority_received'), true)
  assert.equal(transfer.has('beneficial_ownership_requested'), true)
  assert.equal(cancellation.has('cancellation_figures_requested'), true)
  assert.equal(cancellation.has('cancellation_close_out_complete'), true)
}

function verifyRegistryMetadata() {
  const internalBankCondition = getAttorneyUpdateType('bank_conditions_outstanding')
  assert.equal(internalBankCondition.clientVisibleAllowed, false)
  assert.equal(internalBankCondition.requiresNote, true)
}

verifyCashIndividualTransfer()
verifyBondCompanyOptions()
verifyTrustAndCancellationOptions()
verifyRegistryMetadata()

console.log('Attorney update registry verification passed.')
