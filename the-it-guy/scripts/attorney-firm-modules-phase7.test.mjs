import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    getAttorneyFirmModuleHistory,
    getAttorneyFirmModuleLifecycleAssurance,
    mapAttorneyFirmModuleHistoryRow,
    mapAttorneyFirmModuleLifecycleRow,
  } = await server.ssrLoadModule('/src/services/attorneyFirmModulesService.js')

  const historyRow = mapAttorneyFirmModuleHistoryRow({
    id: 'history-1',
    firm_id: 'firm-1',
    module_key: 'bond',
    previous_status: 'active',
    new_status: 'winding_down',
    open_matter_count: 4,
    changed_by_name: 'Firm Director',
    change_source: 'firm_settings',
    changed_at: '2026-07-17T10:00:00Z',
  })
  assert.equal(historyRow.moduleKey, 'bond')
  assert.equal(historyRow.previousStatus, 'active')
  assert.equal(historyRow.newStatus, 'winding_down')
  assert.equal(historyRow.openMatterCount, 4)
  assert.equal(historyRow.changedByName, 'Firm Director')

  const lifecycleRow = mapAttorneyFirmModuleLifecycleRow({
    module_key: 'cancellation',
    status: 'winding_down',
    open_matter_count: 0,
    accepts_new_work: false,
    is_operational: true,
    ready_to_deactivate: true,
  })
  assert.equal(lifecycleRow.readyToDeactivate, true)
  assert.equal(lifecycleRow.acceptsNewWork, false)
  assert.equal(lifecycleRow.isOperational, true)

  const calls = []
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload })
      if (name === 'get_attorney_firm_module_history') {
        return { data: [{ ...historyRow, module_key: 'bond', new_status: 'winding_down' }], error: null }
      }
      return { data: [{ ...lifecycleRow, module_key: 'cancellation', status: 'winding_down' }], error: null }
    },
  }
  await getAttorneyFirmModuleHistory('firm-1', { client, limit: 500 })
  await getAttorneyFirmModuleLifecycleAssurance('firm-1', { client })
  assert.deepEqual(calls, [
    { name: 'get_attorney_firm_module_history', payload: { p_firm_id: 'firm-1', p_limit: 100 } },
    { name: 'get_attorney_firm_module_lifecycle_assurance', payload: { p_firm_id: 'firm-1' } },
  ])

  const migrationSource = readFileSync(
    new URL('../../supabase/migrations/202607170014_attorney_firm_modules_phase7_lifecycle_assurance.sql', import.meta.url),
    'utf8',
  )
  const componentSource = readFileSync(
    new URL('../src/components/attorney/AttorneyFirmModulesSettings.jsx', import.meta.url),
    'utf8',
  )
  const flagsSource = readFileSync(new URL('../src/lib/envValidation.js', import.meta.url), 'utf8')

  assert.match(migrationSource, /create table if not exists public\.attorney_firm_module_history/)
  assert.match(migrationSource, /change_source in \('baseline', 'firm_settings', 'system'\)/)
  assert.match(migrationSource, /create trigger trg_audit_attorney_firm_module_status_change/)
  assert.match(migrationSource, /when \(old\.status is distinct from new\.status\)/)
  assert.match(migrationSource, /public\.attorney_firm_module_open_matter_count\(new\.firm_id, new\.module_key\)/)
  assert.match(migrationSource, /create or replace function public\.get_attorney_firm_module_history/)
  assert.match(migrationSource, /create or replace function public\.get_attorney_firm_module_lifecycle_assurance/)
  assert.match(migrationSource, /module\.status = 'winding_down' and counts\.open_matter_count = 0/)
  assert.match(componentSource, /Wind-down complete/)
  assert.match(componentSource, /Recent service changes/)
  assert.match(componentSource, /getAttorneyFirmModuleLifecycleAssurance\(firmId\)/)
  assert.match(flagsSource, /VITE_FEATURE_ATTORNEY_MODULE_LIFECYCLE_ASSURANCE, false/)

  console.log('attorney firm modules Phase 7 lifecycle-assurance tests passed')
} finally {
  await server.close()
}
