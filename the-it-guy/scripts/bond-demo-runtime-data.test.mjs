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

test('dry-run demo plan targets Bridge Finance Demo and bond.demo regional manager by default', () => {
  const plan = buildBondDemoRuntimePlan({})
  assert.equal(plan.executionMode, 'dry_run')
  assert.equal(plan.dryRun, true)
  assert.equal(plan.workspace.name, 'Bridge Finance Demo')
  assert.equal(plan.metrics.totalApplications, 118)
  const targetUser = plan.users.find((user) => user.key === 'alex_van_der_merwe')
  assert.ok(targetUser)
  assert.equal(targetUser.email, 'bond.demo@bridgenine.co.za')
  assert.equal(targetUser.workspaceRole, 'regional_manager')
  assert.equal(targetUser.scopeLevel, 'region')
  assert.equal(targetUser.regionKey, 'gauteng')
  assert.equal(targetUser.regionId, plan.hierarchy.regionIdByKey.gauteng)
  assert.equal(targetUser.workspaceUnitId, null)
  assert.equal(targetUser.branchId, null)

  assert.deepEqual(plan.hierarchy.regions.map((region) => region.name), [
    'Gauteng',
    'Western Cape',
    'KwaZulu-Natal',
  ])

  const gautengBranches = plan.hierarchy.branches
    .filter((branch) => branch.regionKey === 'gauteng')
    .map((branch) => branch.name)
    .sort()
  assert.deepEqual(gautengBranches, ['Centurion', 'Fourways', 'Pretoria East', 'Sandton'])

  const gautengTeamNames = plan.hierarchy.teams
    .filter((team) => plan.hierarchy.branches.find((branch) => branch.key === team.branchKey)?.regionKey === 'gauteng')
    .map((team) => team.name)
  assert.ok(gautengTeamNames.includes('Developer Desk'))
  assert.ok(gautengTeamNames.includes('Private Buyer Team'))
  assert.ok(gautengTeamNames.includes('Processing Team'))

  const gautengConsultants = plan.users.filter((user) => user.regionKey === 'gauteng' && user.roleFamily === 'consultant')
  assert.ok(gautengConsultants.length >= 8)
  assert.ok(gautengConsultants.length <= 12)

  const gautengApplications = plan._raw.applications.filter((application) => application.branch.regionKey === 'gauteng')
  assert.ok(gautengApplications.length >= 40)
  assert.ok(gautengApplications.length <= 80)
  const gautengBuckets = new Set(gautengApplications.map((application) => application.bucketKey))
  for (const bucket of [
    'new_finance_requested',
    'documents_required',
    'ready_for_submission',
    'submitted_to_banks',
    'approved',
    'grant_signed',
    'bond_instruction_sent',
    'registered',
  ]) {
    assert.ok(gautengBuckets.has(bucket), `Expected Gauteng applications to include ${bucket}`)
  }
  assert.ok(gautengApplications.some((application) => application.atRisk))
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

  assert.equal(consultantCounts['Emma Roberts'], 15)
  assert.equal(consultantCounts['Rachel Adams'], 15)
  assert.equal(consultantCounts['Naledi Maseko'], 11)
  assert.equal(consultantCounts['Thabo Mokoena'], 7)
  assert.ok(consultantCounts['Emma Roberts'] > consultantCounts['Thabo Mokoena'])
  assert.ok(consultantCounts['Rachel Adams'] > consultantCounts['Zanele Khumalo'])
})

test('apply path succeeds with only the demo regional manager resolved and writes rich supporting rows', async () => {
  const plan = buildBondDemoRuntimePlan({})
  const targetUser = plan.users.find((user) => user.key === 'alex_van_der_merwe')
  assert.ok(targetUser?.email)
  const adapter = createMockApplyAdapter({
    resolvedEmails: [targetUser.email],
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
  assert.equal(report.createdOrUpdated.organisationUsers.rowCount, plan.users.length)
  assert.equal(report.createdOrUpdated.organisationSettings.rowCount, 1)
  assert.ok(report.createdOrUpdated.transactions.rowCount >= 118)
  assert.ok(report.createdOrUpdated.transactionNotifications.rowCount >= 150)
  assert.ok(report.createdOrUpdated.transactionNotifications.rowCount <= 250)
  assert.ok(report.createdOrUpdated.documentRequests.rowCount >= 600)
  assert.ok(report.createdOrUpdated.transactionEvents.rowCount >= 590)
  assert.equal(report.createdOrUpdated.clientPortalLinks.rowCount, 15)
  assert.equal(report.createdOrUpdated.transactionFinanceWorkflows.rowCount, plan.metrics.totalApplications)
  assert.equal(report.createdOrUpdated.transactionBondApplications.rowCount, plan.metrics.totalApplications)
  assert.ok(report.createdOrUpdated.transactionBondQuotes.rowCount >= 40)
  assert.ok(report.createdOrUpdated.bondApplicationOwnershipHistory.rowCount >= plan.metrics.totalApplications)
  assert.ok(report.createdOrUpdated.bondRoutingRules.rowCount >= 18)
  assert.ok(report.createdOrUpdated.bondPartners.rowCount >= 12)
  assert.ok(report.createdOrUpdated.bondPartnerRequests.rowCount >= 30)
  assert.equal(report.createdOrUpdated.bondBanks.rowCount, 5)
  assert.ok(report.createdOrUpdated.bondBankFeedback.rowCount >= 30)
  assert.ok(report.createdOrUpdated.bondCommissions.rowCount >= 40)
  assert.ok(report.createdOrUpdated.bondPayouts.rowCount >= 35)
  assert.ok(report.createdOrUpdated.bondAutomationRuns.rowCount >= 35)
  assert.ok(report.createdOrUpdated.bondPredictionSnapshots.rowCount >= 40)
  assert.ok(report.metrics.bondModuleRows >= 1000)

  const membershipWrite = adapter.writes.find((entry) => entry.table === 'organisation_users')
  assert.ok(membershipWrite)
  assert.equal(membershipWrite.rows.length, plan.users.length)
  const targetMembership = membershipWrite.rows.find((row) => row.email === 'bond.demo@bridgenine.co.za')
  assert.ok(targetMembership)
  assert.equal(targetMembership.user_id, 'auth-user-1')
  assert.equal(targetMembership.workspace_role, 'regional_manager')
  assert.equal(targetMembership.organisation_role, 'regional_manager')
  assert.equal(targetMembership.scope_level, 'region')
  assert.equal(targetMembership.region_id, plan.hierarchy.regionIdByKey.gauteng)
  assert.equal(targetMembership.branch_id, null)
  assert.equal(targetMembership.primary_branch_id, null)
  assert.equal(targetMembership.workspace_unit_id, null)

  const settingsWrite = adapter.writes.find((entry) => entry.table === 'organisation_settings')
  assert.ok(settingsWrite)
  assert.equal(settingsWrite.rows.length, 1)
  assert.equal(settingsWrite.rows[0].settings_json.organisation_structure_type, 'regional')
  assert.equal(settingsWrite.rows[0].settings_json.organisationHierarchy.organisation_structure_type, 'regional')

  const bondApplicationWrite = adapter.writes.find((entry) => entry.table === 'transaction_bond_applications')
  assert.ok(bondApplicationWrite)
  assert.equal(bondApplicationWrite.rows.length, plan.metrics.totalApplications)
  assert.ok(bondApplicationWrite.rows.every((row) => row.application_type === 'originator_intake'))
  assert.ok(bondApplicationWrite.rows.every((row) => row.assigned_organisation_id === plan.workspace.id))

  const partnerRequestWrite = adapter.writes.find((entry) => entry.table === 'bond_partner_requests')
  assert.ok(partnerRequestWrite)
  assert.ok(partnerRequestWrite.rows.some((row) => row.escalated))
  assert.ok(partnerRequestWrite.rows.some((row) => row.status === 'resolved'))

  const hqWrite = adapter.writes.find((entry) => entry.table === 'bond_hq_health_snapshots')
  assert.ok(hqWrite)
  assert.equal(hqWrite.rows[0].period, '2026-05')
  assert.equal(hqWrite.rows[0].health_status, 'Healthy')
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
