import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/websiteWorkspaceService.js', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260913074251_website_domain_management_phase4.sql', import.meta.url), 'utf8')
const functionSource = await readFile(new URL('../../supabase/functions/website-domain-management/index.ts', import.meta.url), 'utf8')

for (const marker of ['WebsiteDomainManager', 'Connect a website domain safely.', 'Add domain', 'Verify', 'Make primary', 'Remove', 'MX, SPF, DKIM, or DMARC']) assert.ok(component.includes(marker), `Domain UI should include ${marker}.`)
assert.ok(service.includes('manageWebsiteDomain'), 'Website service should call controlled domain management.')
for (const marker of ['website_activate_verified_domain', 'website_remove_unconnected_domain', "grant execute on function public.website_activate_verified_domain(uuid, uuid) to service_role"]) assert.ok(migration.includes(marker), `Domain migration should include ${marker}.`)
for (const marker of ['VERCEL_TOKEN', 'VERCEL_WEBSITE_PROJECT_ID', 'verify', 'make-primary', 'website_activate_verified_domain', 'website_remove_unconnected_domain', 'nameserverChangesAllowed: false', 'emailDnsChangesAllowed: false']) assert.ok(functionSource.includes(marker), `Domain function should include ${marker}.`)
assert.ok(functionSource.includes('existing.data.website_site_id !== siteId'), 'A domain owned by another website must not be reassigned.')

console.log('website domain management phase 4 checks passed')
