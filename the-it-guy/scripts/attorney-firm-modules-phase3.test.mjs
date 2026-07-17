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
    getAttorneyFirmModuleOverview,
    mapAttorneyFirmModuleRow,
  } = await server.ssrLoadModule('/src/services/attorneyFirmModulesService.js')

  const mapped = mapAttorneyFirmModuleRow({
    firm_id: 'firm-1',
    module_key: 'bond',
    status: 'winding_down',
    open_matter_count: 7,
  })
  assert.equal(mapped.openMatterCount, 7)

  const calls = []
  const overview = await getAttorneyFirmModuleOverview('firm-1', {
    client: {
      async rpc(name, payload) {
        calls.push({ name, payload })
        return {
          data: [{ firm_id: 'firm-1', module_key: 'transfer', status: 'active', open_matter_count: 3 }],
          error: null,
        }
      },
    },
  })
  assert.equal(overview[0].openMatterCount, 3)
  assert.equal(calls[0].name, 'get_attorney_firm_module_overview')

  const migrationSource = readFileSync(
    new URL('../../supabase/migrations/202607170012_attorney_firm_modules_phase3_control_plane.sql', import.meta.url),
    'utf8',
  )
  const componentSource = readFileSync(
    new URL('../src/components/attorney/AttorneyFirmModulesSettings.jsx', import.meta.url),
    'utf8',
  )
  const pageSource = readFileSync(new URL('../src/pages/AttorneyFirmSettingsPage.jsx', import.meta.url), 'utf8')
  const flagsSource = readFileSync(new URL('../src/lib/envValidation.js', import.meta.url), 'utf8')

  assert.match(migrationSource, /create or replace function public\.attorney_firm_module_open_matter_count/)
  assert.match(migrationSource, /count\(distinct assignment\.transaction_id\)/)
  assert.match(migrationSource, /create or replace function public\.get_attorney_firm_module_overview/)
  assert.match(migrationSource, /create trigger trg_enforce_attorney_firm_module_transition/)
  assert.match(migrationSource, /Move it to winding down until those matters are complete/)
  assert.match(componentSource, /Services &amp; Workflows/)
  assert.match(componentSource, /attorneyModules\.refreshModules\(\)/)
  assert.match(componentSource, /getAttorneyFirmModuleOverview\(firmId\)/)
  assert.match(componentSource, /setAttorneyFirmModuleStatus\(firmId, module\.moduleKey, transition\.targetStatus\)/)
  assert.match(pageSource, /FEATURE_FLAGS\.enableAttorneyModuleSettings/)
  assert.match(flagsSource, /VITE_FEATURE_ATTORNEY_MODULE_SETTINGS, false/)

  console.log('attorney firm modules Phase 3 control-plane tests passed')
} finally {
  await server.close()
}
