import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCanonicalRequiredDocumentRows,
  syncCanonicalRequiredDocumentRows,
} from '../documentRequestCanonicalRequiredDocumentSyncService.js'

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

function createFakeClient(seedRows = []) {
  const state = {
    rows: [...seedRows],
    upsertedRows: [],
  }

  return {
    state,
    from(table) {
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
  assert.match(bondApproval.description, /agent may upload it on the client.s behalf/i)
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
  const client = createFakeClient([])
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
})

test('retires the legacy information sheet without deleting uploaded evidence', async () => {
  const client = createFakeClient([
    {
      id: 'legacy-info',
      transaction_id: 'transaction-1',
      document_key: 'information_sheet',
      document_label: 'Information Sheet',
      required_from_role: 'client',
      is_required: true,
      enabled: true,
      status: 'uploaded',
      is_uploaded: true,
      uploaded_document_id: 'historical-document-1',
    },
  ])

  const result = await syncCanonicalRequiredDocumentRows({
    client,
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'buyer',
  })

  assert.deepEqual(result.retiredDocumentKeys, ['information_sheet'])
  const retired = client.state.rows.find((row) => row.document_key === 'information_sheet')
  assert.equal(retired.enabled, false)
  assert.equal(retired.is_required, false)
  assert.equal(retired.status, 'uploaded')
  assert.equal(retired.uploaded_document_id, 'historical-document-1')
})

test('sync no-op reports zero synced rows without marking the result as dry run', async () => {
  const client = createFakeClient([])
  const result = await syncCanonicalRequiredDocumentRows({
    client,
    transactionId: 'transaction-1',
    scenario: MIXED_SCENARIO,
    audience: 'agent',
  })

  assert.equal(result.rows.length, 0)
  assert.equal(result.synced, 0)
  assert.equal(result.dryRun, false)
  assert.equal(client.state.upsertedRows.length, 0)
})
