import assert from 'node:assert/strict'
import {
  TRANSACTION_REFERENCE_DISPLAY_ORDER,
  TRANSACTION_REFERENCE_POLICIES,
  TRANSACTION_REFERENCE_SOURCE_VALUES,
  TRANSACTION_REFERENCE_TYPES,
  buildTransactionReferenceDisplayModel,
  canCorrectTransactionReference,
  canEditTransactionReference,
  canViewTransactionReference,
  getCorrectableTransactionReferenceTypesForRole,
  getEditableTransactionReferenceTypesForRole,
  getAttorneyMatterReferenceTypeForRole,
  getSharedTransactionReferenceTypeForAudience,
  getTransactionReferenceDisplayPolicies,
  getTransactionReferencePolicy,
  isAttorneyMatterReferenceType,
  isBondApplicationReferenceType,
  isSystemOwnedTransactionReference,
  normalizeTransactionReferenceSource,
} from '../transactionReferencePolicy.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('declares every display reference in the policy map', () => {
  assert.deepEqual(
    TRANSACTION_REFERENCE_DISPLAY_ORDER,
    Object.values(TRANSACTION_REFERENCE_TYPES),
  )
  for (const referenceType of TRANSACTION_REFERENCE_DISPLAY_ORDER) {
    assert.ok(TRANSACTION_REFERENCE_POLICIES[referenceType], `${referenceType} should have a policy`)
  }
})

test('agent buyer and seller share the Bridge matter number', () => {
  assert.equal(getSharedTransactionReferenceTypeForAudience('agent'), TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber)
  assert.equal(getSharedTransactionReferenceTypeForAudience('buyer'), TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber)
  assert.equal(getSharedTransactionReferenceTypeForAudience('seller'), TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber)
  assert.equal(getSharedTransactionReferenceTypeForAudience('client'), TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber)
})

test('Bridge-owned references are not generally editable', () => {
  assert.equal(isSystemOwnedTransactionReference(TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber), true)
  assert.equal(getTransactionReferencePolicy(TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber).editable, false)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber, 'buyer'), false)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber, 'agent'), false)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.transactionReference, 'agent'), false)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber, 'internal_admin'), true)
  assert.equal(canCorrectTransactionReference(TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber, 'internal_admin'), true)
  assert.equal(canCorrectTransactionReference(TRANSACTION_REFERENCE_TYPES.transactionReference, 'agency_admin'), true)
  assert.equal(canCorrectTransactionReference(TRANSACTION_REFERENCE_TYPES.transactionReference, 'buyer'), false)
  assert.equal(canCorrectTransactionReference(TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber, 'internal_admin'), false)
})

test('attorney matter numbers are owned by the matching attorney lane', () => {
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber, 'transfer_attorney'), true)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber, 'bond_attorney'), false)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber, 'bond_attorney'), true)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber, 'cancellation_attorney'), true)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber, 'seller'), false)
})

test('attorney matter policies define assignment and provenance targets', () => {
  const transferPolicy = getTransactionReferencePolicy(TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber)
  const bondPolicy = getTransactionReferencePolicy(TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber)
  const cancellationPolicy = getTransactionReferencePolicy(TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber)

  assert.equal(transferPolicy.assignmentRole, 'transfer_attorney')
  assert.deepEqual(transferPolicy.assignmentTypeFallbacks, ['transfer', 'transfer_and_bond'])
  assert.equal(bondPolicy.assignmentRole, 'bond_attorney')
  assert.deepEqual(bondPolicy.assignmentTypeFallbacks, ['bond', 'transfer_and_bond'])
  assert.equal(cancellationPolicy.assignmentRole, 'cancellation_attorney')
  assert.deepEqual(cancellationPolicy.assignmentTypeFallbacks, ['cancellation'])

  for (const policy of [transferPolicy, bondPolicy, cancellationPolicy]) {
    assert.equal(policy.sourceTarget, 'transaction_attorney_assignments.matter_reference_source')
    assert.equal(policy.updatedByTarget, 'transaction_attorney_assignments.matter_reference_updated_by')
    assert.equal(policy.updatedAtTarget, 'transaction_attorney_assignments.matter_reference_updated_at')
  }
})

test('bond originator references are editable by bond originator and transaction admins', () => {
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference, 'bond_originator'), true)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bankApplicationReference, 'bond_originator'), true)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bankApplicationReference, 'agency_admin'), true)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bankApplicationReference, 'agent'), false)
  assert.equal(canEditTransactionReference(TRANSACTION_REFERENCE_TYPES.bankApplicationReference, 'buyer'), false)
})

test('display policies expose stable storage targets for later implementation phases', () => {
  const policies = getTransactionReferenceDisplayPolicies()
  assert.equal(policies[0].storageTarget, 'transactions.matter_number')
  assert.equal(policies[1].storageTarget, 'transactions.transaction_reference')
  assert.ok(policies.some((policy) => policy.storageTarget === 'transaction_attorney_assignments.matter_reference'))
  assert.ok(policies.some((policy) => policy.storageTarget === 'transaction_bond_applications.application_reference'))
})

test('reference source values support manual entry partner systems and correction flows', () => {
  assert.ok(TRANSACTION_REFERENCE_SOURCE_VALUES.includes('manual'))
  assert.ok(TRANSACTION_REFERENCE_SOURCE_VALUES.includes('partner_portal'))
  assert.ok(TRANSACTION_REFERENCE_SOURCE_VALUES.includes('partner_api'))
  assert.ok(TRANSACTION_REFERENCE_SOURCE_VALUES.includes('correction'))
  assert.equal(normalizeTransactionReferenceSource('Partner Portal'), 'partner_portal')
  assert.equal(normalizeTransactionReferenceSource('unsupported'), 'manual')
})

test('role helpers return only editable or correctable reference types', () => {
  assert.deepEqual(
    getEditableTransactionReferenceTypesForRole('buyer'),
    [],
  )
  assert.ok(
    getEditableTransactionReferenceTypesForRole('bond_originator').includes(
      TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference,
    ),
  )
  assert.ok(
    getEditableTransactionReferenceTypesForRole('internal_admin').includes(
      TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
    ),
  )
  assert.deepEqual(
    getCorrectableTransactionReferenceTypesForRole('internal_admin'),
    [
      TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber,
      TRANSACTION_REFERENCE_TYPES.transactionReference,
    ],
  )
})

test('reference type helpers separate attorney matter refs from bond application refs', () => {
  assert.equal(
    getAttorneyMatterReferenceTypeForRole('bond_attorney'),
    TRANSACTION_REFERENCE_TYPES.bondAttorneyMatterNumber,
  )
  assert.equal(
    getAttorneyMatterReferenceTypeForRole('cancellation_attorney'),
    TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber,
  )
  assert.equal(isAttorneyMatterReferenceType(TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber), true)
  assert.equal(isBondApplicationReferenceType(TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference), true)
  assert.equal(isBondApplicationReferenceType(TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber), false)
})

test('display model makes the Bridge matter number the primary audience reference', () => {
  const model = buildTransactionReferenceDisplayModel({
    transaction: {
      id: '12345678-1234-4000-8000-123456789abc',
      matter_number: 'BRG-2026-001',
      transaction_reference: 'LEGACY-001',
    },
    audienceRole: 'buyer',
  })

  assert.equal(model.primary.type, TRANSACTION_REFERENCE_TYPES.bridgeMatterNumber)
  assert.equal(model.primary.value, 'BRG-2026-001')
  assert.equal(model.primary.isPrimary, true)
  assert.equal(model.primary.isFallback, false)
  assert.equal(model.items.some((item) => item.type === TRANSACTION_REFERENCE_TYPES.transactionReference), false)
})

test('display model falls back safely when the Bridge matter number is missing', () => {
  const model = buildTransactionReferenceDisplayModel({
    transaction: {
      id: 'abcdef12-1234-4000-8000-123456789abc',
      transaction_reference: 'LEGACY-FALLBACK',
    },
    audienceRole: 'agent',
  })

  assert.equal(model.primary.value, 'LEGACY-FALLBACK')
  assert.equal(model.primary.source, 'legacy')
  assert.equal(model.primary.isFallback, true)
  assert.equal(model.primary.fallbackStorageTarget, 'transactions.transaction_reference')
})

test('display model aggregates visible partner reference numbers', () => {
  const model = buildTransactionReferenceDisplayModel({
    transaction: {
      id: 'tx-ref-model',
      matter_number: 'BRG-2026-002',
    },
    attorneyAssignments: [
      {
        id: 'assignment-transfer',
        attorney_role: 'transfer_attorney',
        matter_reference: 'TRF-MAT-9',
        matter_reference_source: 'partner_portal',
      },
      {
        id: 'assignment-cancellation',
        attorney_role: 'cancellation_attorney',
        matter_reference: 'CAN-MAT-7',
        matter_reference_source: 'partner_api',
      },
    ],
    transactionFinanceWorkflow: {
      applications: [
        {
          id: 'application-1',
          application_reference: 'BO-APP-1',
          reference_number: 'BANK-APP-1',
        },
      ],
    },
    audienceRole: 'internal_admin',
  })

  assert.ok(model.partnerItems.some((item) => item.type === TRANSACTION_REFERENCE_TYPES.transferAttorneyMatterNumber && item.value === 'TRF-MAT-9'))
  assert.ok(model.partnerItems.some((item) => item.type === TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber && item.source === 'partner_api'))
  assert.ok(model.partnerItems.some((item) => item.type === TRANSACTION_REFERENCE_TYPES.bondOriginatorApplicationReference && item.value === 'BO-APP-1'))
  assert.ok(model.partnerItems.some((item) => item.type === TRANSACTION_REFERENCE_TYPES.bankApplicationReference && item.value === 'BANK-APP-1'))
})

test('display visibility follows audience policy', () => {
  assert.equal(canViewTransactionReference(TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber, 'buyer'), false)
  assert.equal(canViewTransactionReference(TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber, 'seller'), true)

  const model = buildTransactionReferenceDisplayModel({
    transaction: { id: 'tx-audience', matter_number: 'BRG-2026-003' },
    attorneyAssignments: [
      {
        id: 'assignment-cancellation',
        attorney_role: 'cancellation_attorney',
        matter_reference: 'CAN-MAT-8',
      },
    ],
    audienceRole: 'buyer',
  })

  assert.equal(model.items.some((item) => item.type === TRANSACTION_REFERENCE_TYPES.cancellationAttorneyMatterNumber), false)
})

console.log('transactionReferencePolicy tests passed')
