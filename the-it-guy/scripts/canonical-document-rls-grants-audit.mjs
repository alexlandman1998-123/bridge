import assert from 'node:assert/strict'
import { createServer } from 'vite'

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function hasPrivilege(privileges = [], privilege) {
  return privileges.includes(privilege)
}

async function main() {
  const server = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Cannot run canonical document RLS/grants audit.')
    }

    const result = await supabase.rpc('canonical_document_rls_grants_audit')
    if (result.error) throw result.error

    const audit = result.data || {}
    const checks = audit.checks || {}
    const tables = Array.isArray(audit.tables) ? audit.tables : []
    const byTable = new Map(tables.map((table) => [table.table_name, table]))

    assert.equal(checks.all_canonical_tables_rls_enabled, true, 'all canonical tables should have RLS enabled')
    assert.equal(checks.operational_broad_anon_access, false, 'operational canonical tables must not grant anon table access')
    assert.equal(checks.operational_broad_authenticated_write, false, 'operational canonical tables must not grant authenticated writes')
    assert.equal(checks.reference_authenticated_readable, true, 'packs/definitions should remain authenticated-readable')
    assert.equal(checks.rules_has_no_anon_table_access, true, 'rules table should not grant anon table access')
    assert.equal(checks.service_role_has_crud_on_all_canonical_tables, true, 'service_role should keep CRUD on canonical tables')

    for (const tableName of ['document_requirement_instances', 'document_requirement_reviews', 'document_requirement_events', 'document_requirement_reminders', 'document_requirement_reminder_items']) {
      const table = byTable.get(tableName)
      assert.ok(table, `${tableName} should be present in audit`)
      assert.deepEqual(table.anon_privileges || [], [], `${tableName} should not expose anon table privileges`)
      assert.equal(hasPrivilege(table.authenticated_privileges || [], 'INSERT'), false, `${tableName} should not expose authenticated INSERT`)
      assert.equal(hasPrivilege(table.authenticated_privileges || [], 'UPDATE'), false, `${tableName} should not expose authenticated UPDATE`)
      assert.equal(hasPrivilege(table.authenticated_privileges || [], 'DELETE'), false, `${tableName} should not expose authenticated DELETE`)
    }

    console.log(safeJson({
      ok: true,
      checks,
      tables: tables.map((table) => ({
        table: table.table_name,
        rlsEnabled: table.rls_enabled,
        anonPrivileges: table.anon_privileges,
        authenticatedPrivileges: table.authenticated_privileges,
        serviceRolePrivileges: table.service_role_privileges,
        policies: (table.policies || []).map((policy) => policy.policyname),
      })),
    }))
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
