import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911144133_email_client_audiences_phase1.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['email_contact_tags', 'email_marketing_contact_tags', 'email_saved_audience_members', "audience_kind in ('dynamic','static')", 'email_saved_audience_set_members', 'enable row level security']) assert.ok(migration.includes(expected), `Missing audience foundation: ${expected}`)
for (const expected of ['audience_kind', 'email_saved_audience_set_members', 'memberIds']) assert.ok(service.includes(expected), `Missing audience service support: ${expected}`)
for (const expected of ['Dynamic list', 'Curated list', 'audienceKind']) assert.ok(component.includes(expected), `Missing audience studio control: ${expected}`)
console.log('Email client audiences Phase 1 checks passed.')
