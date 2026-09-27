import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCanonicalRequiredDocumentRows,
  reconcileRequiredDocumentInstanceLinks,
  syncCanonicalRequiredDocumentRows,
} from '../documentRequestCanonicalRequiredDocumentSyncService.js'
import { getAttorneyCategoryForRequiredDocument } from '../matterDocumentWorkspaceModel.js'

const MIXED_SCENARIO = Object.freeze({
  buyerEntityType: 'trust',
  sellerEntityType: 'company',
  financeType: 'hybrid',
  sellerHasExistingBond: true,
  propertyType: 'sectional_title',
  gasInstallation: true,
})

function keySet(rows = []) {
  return new Set(rows.map((row) => row.document_key))
}

function assertIncludes(keys, expected, label) {
  for (const key of expected) {
    assert.equal(keys.has(key), true, `${label}: expected ${key}`)
  }
}

function assertExcludes(keys, excluded, label) {
  for (const key of excluded) {
    assert.equal(keys.has(key), false, `${label}: did not expect ${key}`)
  }
}

function createFakeClient(seedRows = [], instances = []) {
  const state = {
    rows: [...seedRows],
    upsertedRows: [],
  }

  return {
    state,
    from(table) {
      if (table === 'document_requirement_instances') {
        return {
          select() {
            return {
              eq(column, value) {
                assert.equal(column, 'context_type')
                assert.equal(value, 'transaction')
                return {
                  eq(contextColumn, transactionId) {
                    assert.equal(contextColumn, 'context_id')
                    return Promise.resolve({
                      data: instances.filter((instance) => instance.context_id === transactionId),
                      error: null,
                    })
                  },
                }
              },
            }
          },
        }
      }
      assert.equal(table, 'transaction_required_documents')
      return {
        select() {
          return {
            eq(column, value) {
              assert.equal(column, 'transaction_id')
              return Promise.resolve({
                data: state.rows.filter((row) => row.transaction_id === value),
                error: null,
              })
            },
          }
        },
        upsert(rows) {
          state.upsertedRows = rows
          for (const row of rows) {
            const index = state.rows.findIndex(
              (existing) =>
                existing.transaction_id === row.transaction_id &&
                existing.document_key === row.document_key,
            )
            if (index >= 0) state.rows[index] = { ...state.rows[index], ...row }
            else state.rows.push({ id: `row-${state.rows.length + 1}`, ...row })
          }
          return {
            select() {
              return Promise.resolve({
                data: state.upsertedRows,
                error: null,
              })
            },
          }
        },
      }
    },
  }
}

test('builds required document rows from the canonical request plan', () => {
  const result = buildCanonicalRequiredDocumentRows({
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'client',
  })
  const keys = keySet(result.rows)

  assertIncludes(
    keys,
    [
      'buyer_trust_deed',
      'buyer_letters_of_authority',
      'proof_of_funds_cash_component',
      'bond_approval',
      'grant_signed',
      'seller_company_registration',
      'seller_company_resolution',
      'seller_bank_account_confirmation',
      'seller_tax_number',
      'bond_statement',
      'levy_statement',
      'gas_compliance_certificate',
    ],
    'canonical required rows',
  )
  assertExcludes(
    keys,
    ['buyer_trust_beneficial_ownership', 'seller_company_beneficial_ownership', 'bond_cancellation_figures'],
    'canonical required rows',
  )

  const bondApproval = result.rows.find((row) => row.document_key === 'bond_approval')
  assert.equal(bondApproval.group_key, 'finance')
  assert.equal(bondApproval.required_from_role, 'buyer')
  assert.equal(bondApproval.visibility_scope, 'client')
  assert.equal(bondApproval.status, 'missing')
  assert.equal(bondApproval.enabled, true)
  const sellerCompany = result.rows.find((row) => row.document_key === 'seller_company_registration')
  assert.equal(sellerCompany.group_key, 'seller_documents')
  assert.equal(sellerCompany.group_label, 'Seller Documents')
})

test('links only exact document identity and requested party, including canonical aliases', () => {
  const rows = [
    { document_key: 'buyer_id_document', required_from_role: 'buyer', canonical_requirement_instance_id: null },
    { document_key: 'seller_id_document', required_from_role: 'seller', canonical_requirement_instance_id: null },
    { document_key: 'grant_signed', required_from_role: 'buyer', canonical_requirement_instance_id: null },
  ]
  const instances = [
    { id: 'buyer-id', document_definition_key: 'buyer_id_document', requested_from_role: 'buyer', status: 'pending' },
    { id: 'seller-id', document_definition_key: 'seller_id_document', requested_from_role: 'seller', status: 'pending' },
    { id: 'grant', document_definition_key: 'grant_letter', requested_from_role: 'buyer', status: 'pending' },
  ]
  const result = reconcileRequiredDocumentInstanceLinks(rows, instances)
  assert.deepEqual(result.rows.map((row) => row.canonical_requirement_instance_id), ['buyer-id', 'seller-id', 'grant'])
  assert.deepEqual(result.diagnostics.missingKeys, [])
})

test('does not guess between contacts or retain a wrong-party link as a valid match', () => {
  const result = reconcileRequiredDocumentInstanceLinks([
    { document_key: 'buyer_id_document', required_from_role: 'buyer', canonical_requirement_instance_id: null },
    { document_key: 'seller_id_document', required_from_role: 'seller', canonical_requirement_instance_id: 'buyer-id' },
    { document_key: 'bond_approval', required_from_role: 'buyer', canonical_requirement_instance_id: null },
  ], [
    { id: 'buyer-id', document_definition_key: 'buyer_id_document', requested_from_role: 'buyer', status: 'pending' },
    { id: 'buyer-id-2', document_definition_key: 'buyer_id_document', requested_from_role: 'buyer', status: 'pending' },
    { id: 'seller-id', document_definition_key: 'seller_id_document', requested_from_role: 'seller', status: 'pending' },
    { id: 'ignored', document_definition_key: 'bond_approval', requested_from_role: 'buyer', status: 'not_applicable' },
  ])
  assert.equal(result.rows[0].canonical_requirement_instance_id, null)
  assert.equal(result.rows[1].canonical_requirement_instance_id, 'buyer-id')
  assert.deepEqual(result.diagnostics.ambiguousKeys, ['buyer_id_document'])
  assert.deepEqual(result.diagnostics.conflictingKeys, ['seller_id_document'])
  assert.deepEqual(result.diagnostics.missingKeys, ['bond_approval'])
})

test('broad taxonomy aliases cannot merge separate legal checklist requirements', () => {
  const result = reconcileRequiredDocumentInstanceLinks([
    { document_key: 'buyer_company_registration', required_from_role: 'buyer', canonical_requirement_instance_id: null },
    { document_key: 'buyer_company_resolution', required_from_role: 'buyer', canonical_requirement_instance_id: null },
    { document_key: 'proof_of_funds_cash_component', required_from_role: 'buyer', canonical_requirement_instance_id: null },
  ], [
    { id: 'registration', document_definition_key: 'buyer_company_registration', requested_from_role: 'buyer', status: 'pending' },
    { id: 'funds', document_definition_key: 'proof_of_funds', requested_from_role: 'buyer', status: 'pending' },
  ])
  assert.deepEqual(result.rows.map((row) => row.canonical_requirement_instance_id), ['registration', null, null])
  assert.deepEqual(result.diagnostics.missingKeys, ['buyer_company_resolution', 'proof_of_funds_cash_component'])
})

test('legacy seller rows are classified by party even if their old group says buyer FICA', () => {
  assert.equal(getAttorneyCategoryForRequiredDocument({
    key: 'property_condition_disclosure',
    groupKey: 'buyer_fica',
    requiredFromRole: 'seller',
  }), 'Seller FICA / Compliance')
})

test('preserves existing uploaded/review state when rebuilding canonical rows', () => {
  const result = buildCanonicalRequiredDocumentRows({
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'buyer',
    existingRows: [
      {
        transaction_id: 'transaction-1',
        document_key: 'buyer_trust_deed',
        status: 'uploaded',
        is_uploaded: true,
        uploaded_document_id: 'document-1',
        uploaded_at: '2026-08-01T10:00:00.000Z',
      },
    ],
  })

  const trustDeed = result.rows.find((row) => row.document_key === 'buyer_trust_deed')
  assert.equal(trustDeed.status, 'uploaded')
  assert.equal(trustDeed.is_uploaded, true)
  assert.equal(trustDeed.uploaded_document_id, 'document-1')
  assert.equal(trustDeed.uploaded_at, '2026-08-01T10:00:00.000Z')
})

test('keeps pending-policy rows out by default and supports explicit signoff', () => {
  const defaultResult = buildCanonicalRequiredDocumentRows({
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'buyer',
  })
  assert.equal(keySet(defaultResult.rows).has('buyer_trust_beneficial_ownership'), false)
  assert.equal(defaultResult.skippedPendingPolicyKeys.includes('buyer_trust_beneficial_ownership'), true)

  const pendingVisible = buildCanonicalRequiredDocumentRows({
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'buyer',
    includePendingPolicyRows: true,
  })
  const pendingRow = pendingVisible.rows.find((row) => row.document_key === 'buyer_trust_beneficial_ownership')
  assert.equal(pendingRow.status, 'not_required')
  assert.equal(pendingRow.enabled, false)

  const signedOff = buildCanonicalRequiredDocumentRows({
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'buyer',
    includePendingPolicyRows: true,
    requestPendingPolicy: true,
  })
  const signedOffRow = signedOff.rows.find((row) => row.document_key === 'buyer_trust_beneficial_ownership')
  assert.equal(signedOffRow.status, 'missing')
  assert.equal(signedOffRow.enabled, true)
  assert.equal(signedOffRow.is_required, true)
})

test('sync supports dry-run without upserting rows', async () => {
  const client = createFakeClient([])
  const result = await syncCanonicalRequiredDocumentRows({
    client,
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'seller',
    dryRun: true,
  })

  assert.equal(result.dryRun, true)
  assert.equal(result.synced, 0)
  assert.equal(client.state.upsertedRows.length, 0)
  assert.equal(keySet(result.rows).has('seller_company_registration'), true)
})

test('sync upserts canonical rows into transaction_required_documents', async () => {
  const client = createFakeClient([], [{
    id: 'instance-trust-deed',
    context_id: 'transaction-1',
    document_definition_key: 'buyer_trust_deed',
    requested_from_role: 'buyer',
    status: 'pending',
  }])
  const result = await syncCanonicalRequiredDocumentRows({
    client,
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'buyer',
  })

  assert.equal(result.dryRun, false)
  assert.equal(result.synced, result.rows.length)
  assert.equal(client.state.upsertedRows.length, result.rows.length)
  assert.equal(client.state.rows.some((row) => row.document_key === 'buyer_trust_deed'), true)
  assert.equal(client.state.rows.every((row) => row.transaction_id === 'transaction-1'), true)
  assert.equal(client.state.rows.find((row) => row.document_key === 'buyer_trust_deed').canonical_requirement_instance_id, 'instance-trust-deed')
  assert.equal(result.reconciliation.linkedKeys.includes('buyer_trust_deed'), true)
})

test('sync leaves an incorrectly linked seller row untouched and reports it', async () => {
  const existing = {
    id: 'seller-row',
    transaction_id: 'transaction-1',
    document_key: 'seller_company_registration',
    required_from_role: 'seller',
    canonical_requirement_instance_id: 'buyer-instance',
    status: 'uploaded',
    is_uploaded: true,
    uploaded_document_id: 'seller-upload',
  }
  const client = createFakeClient([existing], [
    { id: 'buyer-instance', context_id: 'transaction-1', document_definition_key: 'buyer_company_registration', requested_from_role: 'buyer', status: 'pending' },
    { id: 'seller-instance', context_id: 'transaction-1', document_definition_key: 'seller_company_registration', requested_from_role: 'seller', status: 'pending' },
  ])
  const result = await syncCanonicalRequiredDocumentRows({
    client,
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'client',
  })
  assert.deepEqual(result.reconciliation.conflictingKeys, ['seller_company_registration'])
  assert.equal(client.state.upsertedRows.some((row) => row.document_key === 'seller_company_registration'), false)
  assert.deepEqual(client.state.rows.find((row) => row.id === 'seller-row'), existing)
})

test('sync no-op reports zero synced rows without marking the result as dry run', async () => {
  const client = createFakeClient([])
  const result = await syncCanonicalRequiredDocumentRows({
    client,
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'none',
  })

  assert.equal(result.rows.length, 0)
  assert.equal(result.synced, 0)
  assert.equal(result.dryRun, false)
  assert.equal(client.state.upsertedRows.length, 0)
})
