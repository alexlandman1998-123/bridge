import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '../..')
const migration = readFileSync(resolve(root, 'supabase/migrations/202606040002_workspace_entitlements_phase4.sql'), 'utf8')

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

assertIncludes(migration, 'create table if not exists public.workspace_plan_catalog', 'plan catalog table')
assertIncludes(migration, 'create table if not exists public.workspace_subscriptions', 'workspace subscriptions table')
assertIncludes(migration, 'create table if not exists public.workspace_entitlement_overrides', 'entitlement overrides table')
assertIncludes(migration, 'bridge_default_workspace_plan_key', 'default plan function')
assertIncludes(migration, 'bridge_seed_workspace_subscription', 'workspace subscription seed trigger')
assertIncludes(migration, "'personal_originator' then 'solo'", 'solo default for independent originators')
assertIncludes(migration, "'bond_company' then 'team'", 'team default for bond companies')
assertIncludes(migration, 'after insert or update of type, workspace_kind', 'workspace kind correction trigger')
assertIncludes(migration, "'bridge_seed_workspace_subscription'", 'auto-seeded subscription guard')
assertIncludes(migration, "case when v_plan.billing_model = 'contract' then 'active' else 'trialing' end", 'trialing SaaS default')

const settingsApiSource = readFileSync(resolve(root, 'the-it-guy/src/lib/settingsApi.js'), 'utf8')
assertIncludes(settingsApiSource, 'workspaceKind: normalizeText', 'settings context exposes workspace kind')
assertIncludes(settingsApiSource, 'type: normalizeText', 'settings context exposes workspace type')

const entitlementServiceSource = readFileSync(resolve(root, 'the-it-guy/src/services/workspaceEntitlementsService.js'), 'utf8')
assertIncludes(entitlementServiceSource, ".gte('created_at', monthStart)", 'monthly bond application usage window')

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
    resolveDefaultWorkspacePlanKey,
  } = await server.ssrLoadModule('/src/constants/workspaceEntitlements.js')
  const {
    buildBillingSummary,
    evaluateEntitlementLimit,
  } = await server.ssrLoadModule('/src/services/workspaceEntitlementsService.js')

  assert.equal(
    resolveDefaultWorkspacePlanKey({ workspaceType: 'bond_originator', workspaceKind: 'personal_originator' }),
    WORKSPACE_PLAN_KEYS.solo,
  )
  assert.equal(
    resolveDefaultWorkspacePlanKey({ workspaceType: 'bond_originator', workspaceKind: 'bond_company' }),
    WORKSPACE_PLAN_KEYS.team,
  )
  assert.equal(getWorkspacePlanDefinition('enterprise').entitlements[ENTITLEMENT_KEYS.apiAccess], true)

  const teamSummary = buildBillingSummary({
    subscription: {
      planKey: 'team',
      planName: 'Team',
      status: 'trialing',
      billingCycle: 'monthly',
      monthlyAmount: 1490,
      entitlements: getWorkspacePlanDefinition('team').entitlements,
    },
    usage: { activeUsers: 4, activeBranches: 1, monthlyBondApplications: 88 },
  })
  assert.equal(teamSummary.includedUsers, 8)
  assert.equal(teamSummary.activeUsers, 4)
  assert.deepEqual(evaluateEntitlementLimit(teamSummary.entitlements, { activeUsers: 4 }, ENTITLEMENT_KEYS.maxUsers), {
    limited: true,
    limit: 8,
    used: 4,
    remaining: 4,
    exceeded: false,
  })
  assert.deepEqual(evaluateEntitlementLimit(teamSummary.entitlements, { maxUsers: 4 }, ENTITLEMENT_KEYS.maxUsers), {
    limited: true,
    limit: 8,
    used: 4,
    remaining: 4,
    exceeded: false,
  })

  console.log('workspace entitlements phase 4 tests passed')
} finally {
  await server.close()
}
