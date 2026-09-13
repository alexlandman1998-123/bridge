import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/websiteWorkspaceService.js', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260913073516_website_dashboard_analytics_phase2.sql', import.meta.url), 'utf8')

for (const marker of ['WebsiteAnalytics', 'Website traffic', 'Visits', 'Page views', 'Listing views', 'Enquiries', 'Valuation requests', 'Leads created', 'Top pages', 'Top listings', 'Recent website submissions']) assert.ok(component.includes(marker), `Website dashboard should include ${marker}.`)
assert.ok(component.includes('does not store visitor identities, IP addresses or browsing histories'), 'The dashboard must make its privacy boundary clear.')
assert.ok(service.includes("website_dashboard_analytics"), 'Website workspace service should use the scoped analytics RPC.')
for (const marker of ['security definer', "bridge_has_organisation_membership", "revoke all on function public.website_dashboard_analytics", "grant execute on function public.website_dashboard_analytics(uuid, integer) to authenticated", "website_lead_submissions"]) assert.ok(migration.includes(marker), `Analytics migration should include ${marker}.`)
assert.ok(!migration.includes('payload_json'), 'Dashboard analytics must not expose submission payloads.')

console.log('website dashboard phase 2 checks passed')
