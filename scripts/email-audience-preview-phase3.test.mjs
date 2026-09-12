import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911144529_email_audience_preview_phase3.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['email_campaign_preview_audience_detail', 'no_marketing_consent', 'unsubscribed_category', 'suppressed', 'security definer']) assert.ok(migration.includes(expected), `Missing audience-evidence contract: ${expected}`)
for (const expected of ['previewEmailAudienceDetail', 'email_campaign_preview_audience_detail']) assert.ok(service.includes(expected), `Missing audience-evidence service: ${expected}`)
for (const expected of ['audienceDetail', 'email-audience-evidence', 'category unsubscribed']) assert.ok(component.includes(expected), `Missing audience-evidence UI: ${expected}`)
console.log('Email audience preview Phase 3 checks passed.')
