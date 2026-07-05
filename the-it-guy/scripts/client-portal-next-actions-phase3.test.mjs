import assert from 'node:assert/strict'

import { generateClientPortalNextActions } from '../src/lib/clientPortalNextActionsEngine.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function actionIds(actions = []) {
  return new Set(actions.map((action) => action.id))
}

test('rejected required documents produce one reupload action', () => {
  const actions = generateClientPortalNextActions({
    workspaceMode: 'buying',
    onboarding: { status: 'submitted' },
    transaction: { finance_type: 'cash' },
    documentCenter: {
      requiredDocuments: [
        {
          key: 'buyer_id',
          label: 'Buyer ID',
          status: 'rejected',
          rejectionReason: 'Image is blurry.',
        },
      ],
    },
  })

  const reuploadActions = actions.filter((action) => action.type === 'document_reupload_required')
  assert.equal(reuploadActions.length, 1)
  assert.equal(reuploadActions[0].id, 'rejected_buyer_id')
  assert.equal(reuploadActions[0].priority, 'urgent')
  assert.equal(reuploadActions[0].actionRoute, 'documents')
})

test('bond finance asks buyer to complete the bond application when not started', () => {
  const actions = generateClientPortalNextActions({
    workspaceMode: 'buying',
    onboarding: { status: 'submitted' },
    transaction: { finance_type: 'bond' },
    documentCenter: {
      requiredDocuments: [],
    },
    portalData: {
      onboardingFormData: {
        formData: {},
      },
    },
  })

  const ids = actionIds(actions)
  assert.equal(ids.has('bond_application_required'), true)
  const action = actions.find((item) => item.id === 'bond_application_required')
  assert.equal(action.blocking, true)
  assert.equal(action.actionRoute, 'bond_application')
})

test('client-managed bond finance skips originator bond application actions', () => {
  const actions = generateClientPortalNextActions({
    workspaceMode: 'buying',
    onboarding: { status: 'submitted' },
    transaction: {
      finance_type: 'bond',
      finance_managed_by: 'client',
    },
    documentCenter: {
      requiredDocuments: [
        {
          key: 'bank_approval',
          label: 'Bank approval letter',
          status: 'required',
          requirementLevel: 'required',
        },
      ],
    },
    portalData: {
      onboardingFormData: {
        formData: {},
      },
    },
  })

  const ids = actionIds(actions)
  assert.equal(ids.has('bond_application_required'), false)
  const financeAction = actions.find((item) => item.id === 'bond_finance_documents_required')
  assert.equal(Boolean(financeAction), true)
  assert.equal(financeAction.title, 'Upload external finance documents')
  assert.equal(financeAction.actionRoute, 'documents')
  assert.equal(financeAction.metadata.financeManagedBy, 'client')
})

test('combination finance treats bond documents and application as buyer actions', () => {
  const actions = generateClientPortalNextActions({
    workspaceMode: 'buying',
    onboarding: { status: 'submitted' },
    transaction: { finance_type: 'combination' },
    documentCenter: {
      requiredDocuments: [
        {
          key: 'bank_statements',
          label: 'Bank Statements',
          status: 'required',
          requirementLevel: 'required',
        },
      ],
    },
    portalData: {
      onboardingFormData: {
        formData: {
          bond_application: {
            status: 'In Progress',
          },
        },
      },
    },
  })

  const ids = actionIds(actions)
  assert.equal(ids.has('bond_application_in_progress'), true)
  assert.equal(ids.has('bond_finance_documents_required'), true)
})

test('submitted bond application is informational, not blocking', () => {
  const actions = generateClientPortalNextActions({
    workspaceMode: 'buying',
    onboarding: { status: 'submitted' },
    transaction: { finance_type: 'bond' },
    documentCenter: {
      requiredDocuments: [],
    },
    portalData: {
      onboardingFormData: {
        formData: {
          bond_application: {
            status: 'Submitted',
            submitted_at: '2026-06-01T10:00:00.000Z',
          },
        },
      },
    },
  })

  assert.equal(actions.some((action) => action.id === 'bond_application_required'), false)
  const reviewAction = actions.find((action) => action.id === 'bond_application_under_review')
  assert.equal(Boolean(reviewAction), true)
  assert.equal(reviewAction.blocking, false)
  assert.equal(reviewAction.notificationEligible, false)
})

console.log('client portal next actions phase 3 tests passed')
