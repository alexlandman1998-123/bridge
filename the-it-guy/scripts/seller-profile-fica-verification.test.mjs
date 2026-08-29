import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getComplianceProvider } from '../src/services/complianceProviderRegistry.js'

const page = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const component = await readFile(new URL('../src/components/compliance/SellerFicaVerification.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/clientComplianceService.js', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/202608290002_client_compliance_verification.sql', import.meta.url), 'utf8')

assert.match(page, /<SellerFicaVerification/, 'Seller Profile should mount the FICA verification experience.')
assert.doesNotMatch(page.slice(page.indexOf("key: 'tax'"), page.indexOf("key: 'ownership'")), /FICA Status/, 'Tax & Compliance must not expose an editable FICA status row.')
assert.match(component, /Additional information required/)
assert.match(component, /Verification in progress/)
assert.match(component, /FICA verification completed/)
assert.match(component, /Review required/)
assert.match(component, /Verification could not be completed/)
assert.match(component, /Re-run Verification/)
assert.match(component, /FICA verification storage is being activated/)
assert.match(service, /recordComplianceAuditEvent/)
assert.match(service, /COMPLIANCE_STORAGE_TABLES/)
assert.match(service, /complianceStorageUnavailable/)
assert.match(service, /clearComplianceStorageAvailabilityCache/)
assert.match(migration, /client_contact_id uuid not null references public\.contacts/)
assert.match(migration, /compliance_verification_checks/)

const result = await getComplianceProvider('mock').startVerification({ subject: { clientContactId: 'client-1' } })
assert.equal(result.status, 'verified')
assert.equal(result.riskRating, 'low')
assert.deepEqual(result.checks.map((check) => check.type), ['identity', 'address', 'sanctions', 'pep', 'risk'])

console.log('seller profile FICA verification contract passed')
