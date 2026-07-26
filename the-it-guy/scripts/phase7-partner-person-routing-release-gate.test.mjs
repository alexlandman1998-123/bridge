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
    buildPartnerPersonRoutingReleaseGate,
    buildPartnerPersonRoutingRemediationPlanFromSources,
  } = await server.ssrLoadModule('/src/services/partnerPersonRoutingDiagnosticsService.js')

  const blockedPlan = buildPartnerPersonRoutingRemediationPlanFromSources({
    attorneyAssignments: [
      {
        id: 'att-awaiting',
        transaction_id: 'tx-att-awaiting',
        attorney_firm_id: 'firm-1',
        allocation_state: 'awaiting_staff_assignment',
        firm_acceptance_status: 'accepted',
        staff_assignment_status: 'awaiting_staff_assignment',
        updated_at: '2026-07-20T08:00:00.000Z',
      },
    ],
    bondApplications: [
      {
        id: 'bond-blank-person',
        transaction_id: 'tx-bond-blank-person',
        assigned_organisation_id: 'bond-org-1',
        assignment_status: 'organisation_queue',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx-bond-blank-person',
        bond_workspace_id: 'bond-org-1',
        primary_bond_consultant_user_id: 'consultant-ready',
      },
    ],
  }, {
    now: '2026-07-26T08:00:00.000Z',
    staleAfterDays: 2,
  })

  assert.equal(blockedPlan.releaseGate.status, 'no_go')
  assert(blockedPlan.releaseGate.score < 100)
  assert(blockedPlan.releaseGate.blockers.some((blocker) => blocker.code === 'critical_routing_gaps'))
  assert(blockedPlan.releaseGate.blockers.some((blocker) => blocker.code === 'automatic_syncs_pending'))
  assert.match(blockedPlan.releaseGate.nextAction, /Resolve|Apply|Assign|Confirm/)

  const conditionalPlan = buildPartnerPersonRoutingRemediationPlanFromSources({
    attorneyAssignments: [
      {
        id: 'att-non-preferred',
        transaction_id: 'tx-att-non-preferred',
        attorney_firm_id: 'firm-1',
        allocation_state: 'staff_assigned',
        attorney_user_id: 'att-other',
        preferred_attorney_user_id: 'att-preferred',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
    ],
    bondApplications: [],
    transactions: [],
  }, {
    now: '2026-07-26T08:00:00.000Z',
    staleAfterDays: 2,
  })

  assert.equal(conditionalPlan.releaseGate.status, 'no_go')
  assert(conditionalPlan.releaseGate.blockers.some((blocker) => blocker.code === 'ownership_review_pending'))

  const cleanGate = buildPartnerPersonRoutingReleaseGate({
    diagnostics: {
      status: 'healthy',
      totals: {
        critical: 0,
        warnings: 0,
        info: 0,
        attorneyCompanyQueue: 0,
        bondCompanyQueue: 0,
      },
    },
    remediation: {
      status: 'clear',
      summary: {
        automatic: 0,
        manualReview: 0,
        needsPerson: 0,
        reviewRequired: 0,
      },
    },
  })

  assert.equal(cleanGate.status, 'go')
  assert.equal(cleanGate.score, 100)
  assert.equal(cleanGate.blockers.length, 0)
  assert.equal(cleanGate.nextAction, 'Company-to-person routing is ready for controlled rollout.')

  console.log('phase7 partner-person routing release gate tests passed')
} finally {
  await server.close()
}
