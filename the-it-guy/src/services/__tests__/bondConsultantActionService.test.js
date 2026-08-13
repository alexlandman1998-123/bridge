import assert from 'node:assert/strict'
import {
  buildBondConsultantActionHref,
  getBondConsultantActionDeepLinkState,
  resolveBondConsultantAction,
  resolveBondProgressStage,
} from '../bondConsultantActionService.js'

const cases = [
  [{ financeStageKey: 'bond_application_open' }, 'documents_received', 'review-application', 'application'],
  [{ financeStageKey: 'ready_for_review' }, 'ready_for_review', 'submit-bank', 'workflow'],
  [{ financeStageKey: 'submitted_to_banks' }, 'applications_submitted', 'update-bank-feedback', 'workflow'],
  [{ financeStageKey: 'bank_feedback' }, 'quotes_received', 'capture-offer', 'workflow'],
  [{ financeStageKey: 'bond_approved' }, 'bond_approved', 'record-grant-received', 'workflow'],
  [{ financeStageKey: 'grant_received' }, 'grant_received', 'record-grant-signed', 'workflow'],
  [{ financeStageKey: 'grant_signed' }, 'grant_signed', 'submit-grant', 'workflow'],
  [{ financeStageKey: 'grant_submitted' }, 'grant_submitted', 'send-attorney-instruction', 'workflow'],
  [{ financeStageKey: 'bond_instruction_sent' }, 'instruction_sent', 'monitor-registration', 'activity'],
  [{ status: 'registered' }, 'registered', 'review-outcome', 'activity'],
  [{ status: 'cancelled' }, 'declined', 'review-outcome', 'activity'],
]

for (const [row, expectedStage, expectedAction, expectedTab] of cases) {
  const action = resolveBondConsultantAction({ transactionId: 'tx-123', ...row })
  assert.equal(resolveBondProgressStage(row), expectedStage)
  assert.equal(action.key, expectedAction)
  assert.equal(action.targetWorkspaceTab, expectedTab)
}

{
  const action = resolveBondConsultantAction({
    transactionId: 'tx-docs',
    financeStageKey: 'submitted_to_banks',
    nextAction: 'Missing bank statement documents',
  })
  assert.equal(action.key, 'request-docs')
  assert.equal(action.targetWorkspaceTab, 'documents')
}

{
  const href = buildBondConsultantActionHref({
    transactionId: 'tx ready/1',
    financeStageKey: 'ready_for_review',
  })
  assert.equal(href, '/bond/files/tx%20ready%2F1?tab=workflow&action=submit-bank')
}

{
  const deepLink = getBondConsultantActionDeepLinkState('request_documents')
  assert.equal(deepLink.targetWorkspaceTab, 'documents')
  assert.equal(deepLink.targetAction, 'request-docs')
}

console.log('Bond consultant action service tests passed')
