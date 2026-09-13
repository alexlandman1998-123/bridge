import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const service = read('src/services/marketingOverviewService.js')
const dashboard = read('src/components/marketing/MarketingDashboard.jsx')
const migrations = fs.readdirSync(new URL('../../supabase/migrations', import.meta.url), 'utf8')
const migrationName = migrations.find((name) => name.endsWith('_property24_marketing_analytics_read_model.sql'))

assert.ok(migrationName, 'Property24 marketing analytics migration should exist')
const migration = fs.readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')
assert.match(migration, /create or replace function public\.property24_marketing_analytics/)
assert.match(migration, /security definer/)
assert.match(migration, /bridge_is_active_member\(p_organisation_id\)/)
assert.match(migration, /revoke all on function public\.property24_marketing_analytics/)
assert.match(migration, /grant execute on function public\.property24_marketing_analytics\(uuid, date, date\) to authenticated/)

assert.match(service, /supabase\.rpc\('property24_marketing_analytics'/)
assert.match(service, /listingContactFormLeads/)
assert.match(service, /whatsAppContactFormLeads/)
assert.match(service, /importedProperty24Leads/)
assert.match(service, /contactRate/)
assert.match(service, /resolveProperty24StatisticsFreshness/)
assert.match(dashboard, /Property24 portal performance/)
assert.match(dashboard, /Listing contact forms/)
assert.match(dashboard, /WhatsApp contact forms/)
assert.match(dashboard, /Imported into Arch9/)
assert.match(dashboard, /data may be stale/)

console.log('Property24 marketing analytics contract passed')
