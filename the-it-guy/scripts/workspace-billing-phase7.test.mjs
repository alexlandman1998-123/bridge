import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '../..')
const migration = readFileSync(resolve(root, 'supabase/migrations/202606040006_workspace_billing_activity_phase7.sql'), 'utf8')

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

assertIncludes(migration, 'workspace_plan_change_requests_pending_created_idx', 'pending request index')
assertIncludes(migration, 'workspace_billing_events_request_idx', 'request event index')
assertIncludes(migration, 'bridge_cancel_workspace_plan_change', 'cancel request RPC')
assertIncludes(migration, 'bridge_reject_workspace_plan_change', 'reject request RPC')
assertIncludes(migration, 'plan_change_canceled', 'cancel billing event')
assertIncludes(migration, 'plan_change_rejected', 'reject billing event')
assertIncludes(migration, 'bridge_is_workspace_billing_admin', 'workspace admin cancellation guard')
assertIncludes(migration, 'bridge_is_platform_billing_operator', 'platform operator rejection guard')

const entitlementService = readFileSync(resolve(root, 'the-it-guy/src/services/workspaceEntitlementsService.js'), 'utf8')
assertIncludes(entitlementService, 'listWorkspaceBillingActivity', 'billing activity service')
assertIncludes(entitlementService, 'cancelWorkspacePlanChange', 'cancel plan request service')
assertIncludes(entitlementService, 'workspace_plan_change_requests', 'plan request reads')
assertIncludes(entitlementService, 'workspace_billing_events', 'billing event reads')

const billingPage = readFileSync(resolve(root, 'the-it-guy/src/pages/settings/SettingsBillingPage.jsx'), 'utf8')
assertIncludes(billingPage, 'Plan requests', 'plan requests UI')
assertIncludes(billingPage, 'Billing activity', 'billing activity UI')
assertIncludes(billingPage, 'handleCancelRequest', 'cancel request handler')
assertIncludes(billingPage, 'cancelWorkspacePlanChange', 'cancel request API')

const server = await createServer({
  root: resolve(root, 'the-it-guy'),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    cancelWorkspacePlanChange,
    listWorkspaceBillingActivity,
  } = await server.ssrLoadModule('/src/services/workspaceEntitlementsService.js')

  assert.deepEqual(await listWorkspaceBillingActivity({ workspaceId: '' }), { requests: [], events: [] })
  await assert.rejects(
    () => cancelWorkspacePlanChange({ requestId: '' }),
    /Plan change request is required/,
  )

  console.log('workspace billing phase 7 tests passed')
} finally {
  await server.close()
}
