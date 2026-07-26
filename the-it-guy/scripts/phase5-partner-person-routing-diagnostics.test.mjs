import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildPartnerPersonRoutingDiagnosticsFromSources,
  } = await server.ssrLoadModule('/src/services/partnerPersonRoutingDiagnosticsService.js')

  const snapshot = buildPartnerPersonRoutingDiagnosticsFromSources({
    attorneyAssignments: [
      {
        id: 'att-awaiting',
        transaction_id: 'tx-att-awaiting',
        attorney_firm_id: 'firm-1',
        attorney_role: 'transfer_attorney',
        allocation_state: 'awaiting_staff_assignment',
        firm_acceptance_status: 'accepted',
        staff_assignment_status: 'awaiting_staff_assignment',
        preferred_attorney_user_id: 'att-preferred',
        updated_at: '2026-07-20T08:00:00.000Z',
      },
      {
        id: 'att-assigned-different',
        transaction_id: 'tx-att-different',
        attorney_firm_id: 'firm-1',
        attorney_role: 'bond_attorney',
        allocation_state: 'staff_assigned',
        attorney_user_id: 'att-other',
        preferred_attorney_user_id: 'att-preferred',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
      {
        id: 'att-clean',
        transaction_id: 'tx-att-clean',
        attorney_firm_id: 'firm-1',
        attorney_role: 'cancellation_attorney',
        allocation_state: 'staff_assigned',
        attorney_user_id: 'att-clean',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
    ],
    bondApplications: [
      {
        id: 'bond-company-queue',
        transaction_id: 'tx-bond-company',
        assigned_organisation_id: 'bond-org-1',
        assignment_status: 'organisation_queue',
        updated_at: '2026-07-21T08:00:00.000Z',
      },
      {
        id: 'bond-mismatch',
        transaction_id: 'tx-bond-mismatch',
        assigned_organisation_id: 'bond-org-1',
        assigned_user_id: 'consultant-app',
        assignment_status: 'consultant_assigned',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
      {
        id: 'bond-clean',
        transaction_id: 'tx-bond-clean',
        assigned_organisation_id: 'bond-org-1',
        assigned_user_id: 'consultant-clean',
        assignment_status: 'consultant_assigned',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx-bond-mismatch',
        bond_workspace_id: 'bond-org-1',
        primary_bond_consultant_user_id: 'consultant-transaction',
      },
      {
        id: 'tx-bond-clean',
        bond_workspace_id: 'bond-org-1',
        primary_bond_consultant_user_id: 'consultant-clean',
      },
    ],
  }, {
    now: '2026-07-26T08:00:00.000Z',
    staleAfterDays: 2,
  })

  assert.equal(snapshot.status, 'critical')
  assert.equal(snapshot.totals.attorneyRows, 3)
  assert.equal(snapshot.totals.attorneyPersonAssigned, 2)
  assert.equal(snapshot.totals.attorneyCompanyQueue, 1)
  assert.equal(snapshot.totals.bondRows, 3)
  assert.equal(snapshot.totals.bondPersonAssigned, 2)
  assert.equal(snapshot.totals.bondCompanyQueue, 1)
  assert.equal(snapshot.totals.critical, 2)
  assert.equal(snapshot.totals.warnings, 1)
  assert.equal(snapshot.totals.info, 1)
  assert.equal(snapshot.totals.byCode.attorney_awaiting_internal_assignment, 1)
  assert.equal(snapshot.totals.byCode.attorney_accepted_without_staff_owner || 0, 0)
  assert.equal(snapshot.totals.byCode.attorney_assigned_to_non_preferred_person, 1)
  assert.equal(snapshot.totals.byCode.bond_company_queue_without_consultant, 1)
  assert.equal(snapshot.totals.byCode.bond_application_transaction_consultant_mismatch, 1)
  assert.equal(snapshot.topIssues[0].severity, 'critical')
  assert(snapshot.topIssues.some((issue) => issue.code === 'bond_application_transaction_consultant_mismatch'))

  console.log('phase5 partner-person routing diagnostics tests passed')
} finally {
  await server.close()
}
