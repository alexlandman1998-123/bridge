import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [migration, service, component] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260913165354_property24_listing_performance_drilldown.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/marketingOverviewService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/marketing/Property24ListingPerformance.jsx', import.meta.url), 'utf8'),
])

assert.match(migration, /create or replace function public\.property24_listing_performance/)
assert.match(migration, /security definer/)
assert.match(migration, /bridge_is_active_member/)
assert.match(migration, /statistics\.environment = 'production'/)
assert.match(migration, /statistics\.listing_contact_form_leads/)
assert.match(migration, /statistics\.whatsapp_contact_form_leads/)
assert.match(migration, /statistics\.tel_leads/)
assert.match(migration, /grant execute on function public\.property24_listing_performance\(uuid, date, date, integer\) to authenticated/)
assert.match(service, /export function normalizeProperty24ListingPerformance/)
assert.match(service, /supabase\.rpc\('property24_listing_performance'/)
assert.match(component, /Listing performance/)
assert.match(component, /WhatsApp form/)
assert.match(component, /Open/)

console.log('Property24 listing performance drill-down contract passed.')
