import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '../..')
const migration = readFileSync(resolve(root, 'supabase/migrations/202606040004_workspace_entitlement_enforcement_phase5.sql'), 'utf8')

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

assertIncludes(migration, 'bridge_assert_workspace_entitlement_capacity', 'database entitlement assertion')
assertIncludes(migration, 'organisation_users_enforce_workspace_entitlements', 'seat trigger')
assertIncludes(migration, 'organisation_branches_enforce_workspace_entitlements', 'organisation branch trigger')
assertIncludes(migration, 'workspace_units_enforce_workspace_entitlements', 'bond branch trigger')
assertIncludes(migration, 'transaction_bond_applications_enforce_workspace_entitlements', 'bond application trigger')
assertIncludes(migration, "lower(coalesce(ou.status, 'active')) in ('active', 'invited', 'pending')", 'billable seat statuses')
assertIncludes(migration, "date_trunc('month', now())", 'monthly application window')

const entitlementService = readFileSync(resolve(root, 'the-it-guy/src/services/workspaceEntitlementsService.js'), 'utf8')
assertIncludes(entitlementService, 'WorkspaceEntitlementLimitError', 'structured entitlement error')
assertIncludes(entitlementService, 'assertWorkspaceEntitlementLimit', 'client entitlement assertion')

const settingsApi = readFileSync(resolve(root, 'the-it-guy/src/lib/settingsApi.js'), 'utf8')
assertIncludes(settingsApi, 'ENTITLEMENT_KEYS.maxUsers', 'organisation invite seat enforcement')

const branchService = readFileSync(resolve(root, 'the-it-guy/src/services/agencyBranchService.js'), 'utf8')
assertIncludes(branchService, 'ENTITLEMENT_KEYS.maxBranches', 'agency branch enforcement')
assertIncludes(branchService, 'ENTITLEMENT_KEYS.maxUsers', 'branch invite seat enforcement')

const bondOrganisationService = readFileSync(resolve(root, 'the-it-guy/src/services/bondOrganisationService.js'), 'utf8')
assertIncludes(bondOrganisationService, 'ENTITLEMENT_KEYS.maxBranches', 'bond branch enforcement')
assertIncludes(bondOrganisationService, 'ENTITLEMENT_KEYS.maxUsers', 'bond consultant enforcement')

const bondIntakeService = readFileSync(resolve(root, 'the-it-guy/src/services/bondIntakeWorkflowService.js'), 'utf8')
assertIncludes(bondIntakeService, 'ENTITLEMENT_KEYS.monthlyBondApplications', 'bond intake assignment enforcement')

const apiService = readFileSync(resolve(root, 'the-it-guy/src/lib/api.js'), 'utf8')
assertIncludes(apiService, 'ENTITLEMENT_KEYS.monthlyBondApplications', 'roleplayer propagation enforcement')

const server = await createServer({
  root: resolve(root, 'the-it-guy'),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    ENTITLEMENT_KEYS,
    WORKSPACE_PLAN_KEYS,
    getWorkspacePlanDefinition,
  } = await server.ssrLoadModule('/src/constants/workspaceEntitlements.js')
  const {
    WorkspaceEntitlementLimitError,
    assertWorkspaceEntitlementLimit,
    evaluateEntitlementLimit,
  } = await server.ssrLoadModule('/src/services/workspaceEntitlementsService.js')

  await assert.rejects(
    () =>
      assertWorkspaceEntitlementLimit({
        workspaceId: '',
        workspaceType: 'bond_originator',
        workspaceKind: 'bond_company',
        entitlementKey: ENTITLEMENT_KEYS.maxUsers,
        usage: { activeUsers: 8 },
      }),
    (error) => error instanceof WorkspaceEntitlementLimitError && error.code === 'WORKSPACE_ENTITLEMENT_LIMIT_EXCEEDED',
  )

  await assert.doesNotReject(() =>
    assertWorkspaceEntitlementLimit({
      workspaceId: '',
      workspaceType: 'bond_originator',
      workspaceKind: 'bond_company',
      entitlementKey: ENTITLEMENT_KEYS.maxUsers,
      usage: { activeUsers: 7 },
    }),
  )

  const enterpriseEntitlements = getWorkspacePlanDefinition(WORKSPACE_PLAN_KEYS.enterprise).entitlements
  assert.equal(
    evaluateEntitlementLimit(enterpriseEntitlements, { activeUsers: 500 }, ENTITLEMENT_KEYS.maxUsers).limited,
    false,
  )

  console.log('workspace entitlements phase 5 tests passed')
} finally {
  await server.close()
}
