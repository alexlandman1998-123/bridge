import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/websiteWorkspaceService.js', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.css', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260913074949_website_operations_phase6.sql', import.meta.url), 'utf8')
const domainFunction = await readFile(new URL('../../supabase/functions/website-domain-management/index.ts', import.meta.url), 'utf8')
const healthRoute = await readFile(new URL('../../apps/websites/app/api/health/route.ts', import.meta.url), 'utf8')

for (const marker of ['WebsiteOperations', 'OPERATIONS & SAFETY', 'Activity history', 'Safe rollback', 'Website administrators can edit content', 'Form delivery', 'Public route']) assert.ok(component.includes(marker), `Operations UI should include ${marker}.`)
assert.ok(service.includes("website_management_events"), 'The workspace service should load domain activity history.')
for (const marker of ['website_management_events', 'website_reject_management_event_mutation', 'website_management_events_admin_select', 'domain_connected', 'domain_removed']) assert.ok(migration.includes(marker), `Operations migration should include ${marker}.`)
for (const marker of ['recordDomainActivity', 'domain_verification_requested', 'domain_primary_changed', 'metadata_json: { hostname']) assert.ok(domainFunction.includes(marker), `Domain management should record ${marker}.`)
for (const marker of ["resolveSite", "status: 'ok'", "status: 'unavailable'", "Cache-Control': 'no-store'"]) assert.ok(healthRoute.includes(marker), `Health endpoint should include ${marker}.`)
for (const marker of ['.wwo-operations', '.wwo-health-checks', '.wwo-activity']) assert.ok(styles.includes(marker), `Operations styles should include ${marker}.`)

console.log('website operations phase 6 checks passed')
