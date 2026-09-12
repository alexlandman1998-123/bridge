import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911144646_email_contact_tags_phase4.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['email_sync_marketing_contact_tags', 'email_assign_contact_tag', 'email_sync_marketing_contact_tags_trigger']) assert.ok(migration.includes(expected), `Missing tag contract: ${expected}`)
for (const expected of ['createEmailContactTag', 'assignEmailContactTag', 'email_contact_tags']) assert.ok(service.includes(expected), `Missing tag service: ${expected}`)
for (const expected of ['Agency tags', 'Tag selected clients', 'contactTags']) assert.ok(component.includes(expected), `Missing tag UI: ${expected}`)
console.log('Email contact tags Phase 4 checks passed.')
