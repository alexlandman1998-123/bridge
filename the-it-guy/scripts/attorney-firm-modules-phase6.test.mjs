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
    assertAttorneyModuleAcceptsNewWork,
    filterAttorneyLeadServiceOptions,
    getAttorneyModuleKeyForLeadService,
    getCreatableAttorneyMatterTypes,
  } = await server.ssrLoadModule('/src/services/attorneyModuleWriteGuard.js')
  const { normalizeAttorneyPublicIntake } = await server.ssrLoadModule('/src/services/attorneyPublicIntakeService.js')

  const transferOnly = (moduleKey) => moduleKey === 'transfer'
  assert.equal(getAttorneyModuleKeyForLeadService('bond_registration'), 'bond')
  assert.equal(getAttorneyModuleKeyForLeadService('general_enquiry'), '')
  assert.deepEqual(getCreatableAttorneyMatterTypes(transferOnly), ['transfer'])
  assert.deepEqual(filterAttorneyLeadServiceOptions([
    ['property_transfer', 'Transfer'],
    ['bond_registration', 'Bond'],
    ['bond_cancellation', 'Cancellation'],
    ['general_enquiry', 'General'],
  ], transferOnly).map(([value]) => value), ['property_transfer', 'general_enquiry'])
  assert.equal(assertAttorneyModuleAcceptsNewWork('transfer', transferOnly), 'transfer')
  assert.throws(
    () => assertAttorneyModuleAcceptsNewWork('bond', transferOnly),
    (error) => error.code === 'ATTORNEY_MODULE_NOT_ACCEPTING_NEW_WORK' && error.moduleKey === 'bond',
  )

  const emptyPublicServices = normalizeAttorneyPublicIntake({
    slug: 'firm',
    status: 'active',
    service_types: [],
  })
  assert.deepEqual(emptyPublicServices.serviceTypes, [])

  const migrationSource = readFileSync(
    new URL('../../supabase/migrations/202607170013_attorney_firm_modules_phase6_write_guards.sql', import.meta.url),
    'utf8',
  )
  const quickCreateSource = readFileSync(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8')
  const leadsSource = readFileSync(new URL('../src/pages/AttorneyLeadsPage.jsx', import.meta.url), 'utf8')
  const mattersSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
  const edgeSource = readFileSync(
    new URL('../../supabase/functions/attorney-public-intake/index.ts', import.meta.url),
    'utf8',
  )
  const flagsSource = readFileSync(new URL('../src/lib/envValidation.js', import.meta.url), 'utf8')

  assert.match(migrationSource, /create trigger trg_enforce_attorney_assignment_module_write_guard/)
  assert.match(migrationSource, /Reassignment and workflow maintenance on an existing firm matter remain/)
  assert.match(migrationSource, /v_status <> 'active'/)
  assert.match(migrationSource, /create or replace function public\.resolve_attorney_public_intake/)
  assert.match(migrationSource, /when 'bond_cancellation'.+module_key = 'cancellation'/s)
  assert.match(quickCreateSource, /item\.type !== 'attorney-matter' \|\| canCreateAnyMatter/)
  assert.match(leadsSource, /filterAttorneyLeadServiceOptions\(SERVICE_OPTIONS, canCreateAttorneyMatter\)/)
  assert.match(leadsSource, /assertAttorneyModuleAcceptsNewWork\(values\?\.matterType, canCreateAttorneyMatter/)
  assert.match(mattersSource, /canAcceptNewInstructions=\{canReceiveTransferInstruction\}/)
  assert.match(edgeSource, /service_not_accepting_new_work/)
  assert.match(edgeSource, /resolve_attorney_public_intake/)
  assert.match(flagsSource, /VITE_FEATURE_ATTORNEY_MODULE_WRITE_GUARDS, false/)

  console.log('attorney firm modules Phase 6 write-guard tests passed')
} finally {
  await server.close()
}
