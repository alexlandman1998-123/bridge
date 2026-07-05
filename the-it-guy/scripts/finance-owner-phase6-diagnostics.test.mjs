import assert from 'node:assert/strict'

import {
  buildFinanceOwnerWorkflowDiagnostics,
  getFinanceOwnerDiagnosticsStatusLabel,
} from '../src/services/financeOwnerWorkflowDiagnosticsService.js'

function codes(row) {
  return new Set((row?.issues || []).map((issue) => issue.code))
}

{
  const diagnostics = buildFinanceOwnerWorkflowDiagnostics([
    {
      transaction: {
        id: 'cash-stale-owner',
        finance_type: 'cash',
        finance_managed_by: 'bond_originator',
        current_main_stage: 'ATT',
        next_action: 'Open bond application',
      },
      clientPortalNextActions: [
        {
          id: 'bond_application_required',
          type: 'bond_application_required',
          actionRoute: 'bond_application',
        },
      ],
    },
  ], { generatedAt: '2026-07-05T10:00:00.000Z' })

  assert.equal(diagnostics.status, 'critical')
  assert.equal(diagnostics.totals.ownerMismatches, 1)
  assert.equal(diagnostics.totals.workflowLeaks, 1)
  const rowCodes = codes(diagnostics.rows[0])
  assert.equal(rowCodes.has('persisted_owner_mismatch'), true)
  assert.equal(rowCodes.has('cash_has_originator_workflow'), true)
  assert.equal(getFinanceOwnerDiagnosticsStatusLabel(diagnostics.status), 'Finance owner gaps found')
}

{
  const diagnostics = buildFinanceOwnerWorkflowDiagnostics([
    {
      transaction: {
        id: 'client-bond-leak',
        finance_type: 'bond',
        finance_managed_by: 'client',
        current_main_stage: 'FIN',
        onboarding_completed_at: '2026-07-01T10:00:00.000Z',
      },
      workflowReadModel: {
        blockers: [
          {
            id: 'missing-bond-role-assignment',
            blockingRole: 'bond_originator',
          },
        ],
      },
      clientPortalNextActions: [
        {
          id: 'bond_application_required',
          title: 'Complete your bond application',
          actionRoute: 'bond_application',
        },
      ],
      requiredDocumentChecklist: [
        {
          id: 'approval',
          key: 'bank_approval_letter',
          label: 'Bank approval letter',
          status: 'missing',
        },
      ],
    },
  ])

  const rowCodes = codes(diagnostics.rows[0])
  assert.equal(diagnostics.rows[0].clientManagedBondFinance, true)
  assert.equal(rowCodes.has('client_bond_originator_workflow_leak'), true)
  assert.equal(rowCodes.has('client_bond_missing_external_evidence'), true)
  assert.equal(diagnostics.remediationPlan.some((item) => item.code === 'client_bond_originator_workflow_leak' && item.count === 1), true)
}

{
  const diagnostics = buildFinanceOwnerWorkflowDiagnostics([
    {
      transaction: {
        id: 'originator-unassigned',
        finance_type: 'bond',
        finance_managed_by: 'bond_originator',
        current_main_stage: 'FIN',
      },
      participants: [],
      attorneyAssignments: [],
    },
  ])

  const row = diagnostics.rows[0]
  assert.equal(row.originatorManagedFinance, true)
  assert.equal(codes(row).has('originator_bond_missing_assignment'), true)
}

{
  const diagnostics = buildFinanceOwnerWorkflowDiagnostics([
    {
      transaction: {
        id: 'healthy-cash',
        finance_type: 'cash',
        finance_managed_by: 'client',
      },
      requiredDocumentChecklist: [
        {
          id: 'proof',
          key: 'proof_of_funds',
          label: 'Proof of funds',
          status: 'approved',
        },
      ],
    },
    {
      transaction: {
        id: 'healthy-client-bond',
        finance_type: 'bond',
        finance_managed_by: 'client',
        current_main_stage: 'FIN',
      },
      documents: [
        {
          id: 'approval-doc',
          finance_lane: 'external',
          name: 'Bank approval letter',
          category: 'External Finance',
        },
      ],
      requiredDocumentChecklist: [
        {
          id: 'approval',
          key: 'bank_approval_letter',
          label: 'Bank approval letter',
          status: 'uploaded',
        },
      ],
    },
    {
      transaction: {
        id: 'healthy-originator-bond',
        finance_type: 'bond',
        finance_managed_by: 'bond_originator',
        bond_originator: 'OOBA',
        assigned_bond_originator_email: 'originator@example.com',
      },
      workflowData: {
        applications: [],
        offers: [],
      },
    },
  ])

  assert.equal(diagnostics.status, 'healthy')
  assert.equal(diagnostics.totals.rows, 3)
  assert.equal(diagnostics.totals.healthy, 3)
  assert.equal(diagnostics.issues.length, 0)
  assert.deepEqual(diagnostics.remediationPlan, [])
}

console.log('finance owner phase 6 diagnostics tests passed')
