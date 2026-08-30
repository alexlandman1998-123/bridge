import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')

const [app, tenancyPage, collectionsPage, importsPage, repository, maintenanceMigration, inspectionMigration, queueRepair, schemaReport] = await Promise.all([
  read('src/App.jsx'),
  read('src/pages/rentals/RentalTenancyWorkspacePage.jsx'),
  read('src/pages/rentals/RentalCollectionsPage.jsx'),
  read('src/pages/rentals/RentalFinancialImportsPage.jsx'),
  read('src/services/rentals/rentalApplicationRepository.js'),
  read('../supabase/migrations/20260830102542_rental_maintenance_request_intake.sql'),
  read('../supabase/migrations/20260830102856_rental_mobile_inspections.sql'),
  read('../supabase/migrations/20260830104130_rental_schema_reconciliation_repair.sql'),
  read('../docs/rentals-schema-reconciliation-2026-08-30.md'),
])

for (const route of [
  '/agent/rentals/tenancies/:tenancyId',
  '/agent/rentals/collections',
  '/agent/rentals/finance/imports',
  '/agent/rentals/vacancies',
]) {
  assert.match(app, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const tab of ['Payments', 'Maintenance', 'Inspections', 'Documents', 'Activity']) {
  assert.match(tenancyPage, new RegExp(`'${tab}'`))
}

for (const rpc of [
  'rental_record_payment',
  'rental_allocate_payment',
  'rental_request_financial_adjustment',
  'rental_get_arrears_dashboard',
  'rental_stage_financial_import',
]) {
  assert.match(repository, new RegExp(`'${rpc}'`))
}

assert.match(maintenanceMigration, /rental_create_maintenance_request/)
assert.match(inspectionMigration, /rental_start_field_inspection/)

assert.match(collectionsPage, /getRentalArrearsDashboard/)
assert.match(importsPage, /stageRentalFinancialImport/)
assert.match(queueRepair, /rental_get_maintenance_queue/)
assert.match(queueRepair, /grant execute on function public\.rental_get_maintenance_queue\(integer\) to authenticated/i)
assert.match(schemaReport, /58 tables/)
assert.match(schemaReport, /No Rentals function executable by `anon`/)

console.log('Rentals Phase 50 operational smoke contract checks passed.')
