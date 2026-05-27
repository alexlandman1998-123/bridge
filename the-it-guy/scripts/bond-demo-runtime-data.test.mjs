import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBondDemoRuntimePlan,
  runSeeder,
  STAGING_PROJECT_REF,
} from './seed-bond-demo-runtime-data.mjs'

function createMockApplyAdapter({ resolvedEmails = [] } = {}) {
  const normalizedEmails = new Set(resolvedEmails.map((email) => String(email || '').trim().toLowerCase()))
  const writes = []

  return {
    writes,
    async getTableColumns() {
      return null
    },
    async lookupUsersByEmails(emails = []) {
      return new Map(
        emails
          .map((email) => String(email || '').trim().toLowerCase())
          .filter((email) => normalizedEmails.has(email))
          .map((email, index) => [email, { id: `auth-user-${index + 1}`, email }]),
      )
    },
    async upsertRows(table, rows = []) {
      writes.push({
        table,
        rows: rows.map((row) => ({ ...row })),
      })
      return {
        data: rows.map((row) => ({ id: row.id || row.transaction_id || row.development_id || `${table}-row` })),
        skippedColumns: [],
      }
    },
  }
}

test('dry-run demo plan targets Bridge Finance Demo and bond.demo owner by default', () => {
  const plan = buildBondDemoRuntimePlan({})
  assert.equal(plan.executionMode, 'dry_run')
  assert.equal(plan.dryRun, true)
  assert.equal(plan.workspace.name, 'Bridge Finance Demo')
  assert.equal(plan.metrics.totalApplications, 118)
  const owner = plan.users.find((user) => user.key === 'alex_van_der_merwe')
  assert.ok(owner)
  assert.equal(owner.email, 'bond.demo@bridgenine.co.za')
})

test('demo plan is deterministic and preserves requested operational shape', () => {
  const planA = buildBondDemoRuntimePlan({})
  const planB = buildBondDemoRuntimePlan({})
  assert.deepEqual(planA.metrics, planB.metrics)
  assert.deepEqual(planA.applications.slice(0, 20), planB.applications.slice(0, 20))

  const bucketCounts = planA.applications.reduce((accumulator, item) => {
    accumulator[item.bucketKey] = (accumulator[item.bucketKey] || 0) + 1
    return accumulator
  }, {})

  assert.deepEqual(bucketCounts, {
    new_finance_requested: 10,
    awaiting_contact: 10,
    documents_required: 14,
    pre_qualification: 7,
    ready_for_submission: 10,
    submitted_to_banks: 7,
    bank_feedback: 3,
    approved: 3,
    grant_signed: 2,
    bond_instruction_sent: 2,
    transfer_in_progress: 22,
    registered: 18,
    declined_or_cancelled: 10,
  })

  assert.equal(planA.metrics.transferStageTransactions, 22)
  assert.equal(planA.metrics.registeredTransactions, 18)
  assert.equal(planA.metrics.declinedOrCancelled, 10)
  assert.equal(planA.metrics.portalReadyBuyers, 15)
  assert.equal(planA.metrics.atRiskApplications, 10)
  assert.equal(planA.metrics.complianceFlags, 5)

  const transactionReferences = new Set(planA.applications.map((item) => item.transactionReference))
  assert.equal(transactionReferences.size, planA.metrics.totalApplications)
})

test('consultant workload is deliberately uneven for realistic dashboards', () => {
  const plan = buildBondDemoRuntimePlan({})
  const consultantCounts = plan.applications.reduce((accumulator, item) => {
    accumulator[item.consultant] = (accumulator[item.consultant] || 0) + 1
    return accumulator
  }, {})

  assert.equal(consultantCounts['Emma Roberts'], 24)
  assert.equal(consultantCounts['Chris Williams'], 7)
  assert.ok(consultantCounts['Nicole Daniels'] > consultantCounts['Chris Williams'])
  assert.ok(consultantCounts['Daniel Nkosi'] > consultantCounts['Rachel Adams'])
})

test('apply path succeeds with only the demo owner resolved and writes rich supporting rows', async () => {
  const plan = buildBondDemoRuntimePlan({})
  const owner = plan.users.find((user) => user.key === 'alex_van_der_merwe')
  assert.ok(owner?.email)
  const adapter = createMockApplyAdapter({
    resolvedEmails: [owner.email],
  })

  const { report } = await runSeeder(
    {
      BOND_DEMO_RUNTIME_APPLY: 'true',
      BOND_DEMO_RUNTIME_TARGET: 'staging',
      SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    },
    {
      adapter,
      applyConfig: {
        supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
        serviceRoleKey: 'service-role-placeholder',
        projectRef: STAGING_PROJECT_REF,
        target: 'staging',
      },
    },
  )

  assert.equal(report.applied, true)
  assert.equal(report.createdOrUpdated.organisationUsers.rowCount, 1)
  assert.ok(report.createdOrUpdated.transactions.rowCount >= 118)
  assert.ok(report.createdOrUpdated.transactionNotifications.rowCount >= 150)
  assert.ok(report.createdOrUpdated.transactionNotifications.rowCount <= 250)
  assert.ok(report.createdOrUpdated.documentRequests.rowCount >= 600)
  assert.ok(report.createdOrUpdated.transactionEvents.rowCount >= 590)
  assert.equal(report.createdOrUpdated.clientPortalLinks.rowCount, 15)

  const membershipWrite = adapter.writes.find((entry) => entry.table === 'organisation_users')
  assert.ok(membershipWrite)
  assert.equal(membershipWrite.rows.length, 1)
  assert.equal(membershipWrite.rows[0].email, 'bond.demo@bridgenine.co.za')
})

test('transaction summary select keeps bond command center signal fields', () => {
  const apiSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/api.js'), 'utf8')
  for (const field of [
    'finance_status',
    'compliance_status',
    'missing_documents_count',
    'uploaded_documents_count',
    'total_required_documents',
    'bank_feedback_pending',
    'application_prepared',
    'submitted_to_banks',
    'next_action_due_at',
    'finance_due_at',
    'processor_name',
    'compliance_name',
    'attorney_stage',
    'risk_status',
  ]) {
    assert.match(apiSource, new RegExp(field))
  }
})
