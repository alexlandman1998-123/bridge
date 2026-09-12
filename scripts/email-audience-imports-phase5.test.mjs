import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911150323_email_audience_imports_phase5.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
const page = readFileSync(resolve('the-it-guy/src/pages/MarketingComingSoonPage.jsx'), 'utf8')

for (const item of ['email_audience_imports', 'email_audience_import_apply', 'security invoker', 'enable row level security', "'opted_out' then 'opted_out'", 'jsonb_array_length(p_rows) > 500']) assert.ok(migration.includes(item), `Missing import safety contract: ${item}`)
for (const item of ['importEmailAudience', 'email_audience_imports', 'email_audience_import_apply']) assert.ok(service.includes(item), `Missing import service contract: ${item}`)
for (const item of ['EmailAudienceImportStudio', 'parseCsv', 'Import contacts safely', 'A prior opt-out is never changed']) assert.ok(component.includes(item), `Missing import UI contract: ${item}`)
assert.ok(page.includes('view: "import"'), 'Import route is not wired')
console.log('Email audience imports Phase 5 checks passed.')
