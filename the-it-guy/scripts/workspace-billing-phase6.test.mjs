import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '../..')
const migration = readFileSync(resolve(root, 'supabase/migrations/202606040005_workspace_billing_operations_phase6.sql'), 'utf8')

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

assertIncludes(migration, 'create table if not exists public.workspace_plan_change_requests', 'plan change request table')
assertIncludes(migration, 'create table if not exists public.workspace_billing_events', 'billing events table')
assertIncludes(migration, 'workspace_plan_change_requests_one_pending_idx', 'single pending request guard')
assertIncludes(migration, 'bridge_request_workspace_plan_change', 'plan request RPC')
assertIncludes(migration, 'bridge_apply_workspace_plan_change', 'plan approval RPC')
assertIncludes(migration, 'bridge_log_workspace_billing_event', 'billing audit event function')
assertIncludes(migration, 'bridge_is_workspace_billing_admin', 'workspace billing admin check')
assertIncludes(migration, 'bridge_is_platform_billing_operator', 'platform billing operator check')
assertIncludes(migration, 'plan_change_requested', 'plan request audit event')
assertIncludes(migration, 'plan_change_approved', 'plan approval audit event')

const entitlementService = readFileSync(resolve(root, 'the-it-guy/src/services/workspaceEntitlementsService.js'), 'utf8')
assertIncludes(entitlementService, 'listWorkspacePlanCatalog', 'plan catalog service')
assertIncludes(entitlementService, 'requestWorkspacePlanChange', 'plan change request service')
assertIncludes(entitlementService, 'bridge_request_workspace_plan_change', 'plan change RPC call')

const billingPage = readFileSync(resolve(root, 'the-it-guy/src/pages/settings/SettingsBillingPage.jsx'), 'utf8')
assertIncludes(billingPage, 'Available plans', 'billing plan catalog UI')
assertIncludes(billingPage, 'handlePlanRequest', 'plan request handler')
assertIncludes(billingPage, 'requestWorkspacePlanChange', 'billing page request API')

const server = await createServer({
  root: resolve(root, 'the-it-guy'),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    listWorkspacePlanCatalog,
    requestWorkspacePlanChange,
  } = await server.ssrLoadModule('/src/services/workspaceEntitlementsService.js')
  const {
    getWorkspacePlanDefinition,
  } = await server.ssrLoadModule('/src/constants/workspaceEntitlements.js')

  assert.equal(typeof listWorkspacePlanCatalog, 'function')
  assert.equal(getWorkspacePlanDefinition('solo').monthlyAmount, 490)
  assert.equal(getWorkspacePlanDefinition('enterprise').monthlyAmount, null)

  await assert.rejects(
    () => requestWorkspacePlanChange({ workspaceId: '', planKey: 'team' }),
    /Workspace is required/,
  )

  await assert.rejects(
    () => requestWorkspacePlanChange({ workspaceId: 'workspace-1', planKey: 'not-a-plan' }),
    /valid workspace plan/,
  )

  console.log('workspace billing phase 6 tests passed')
} finally {
  await server.close()
}
