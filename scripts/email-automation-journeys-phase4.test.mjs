import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911150030_email_automation_journeys_phase4.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
const page = readFileSync(resolve('the-it-guy/src/pages/MarketingComingSoonPage.jsx'), 'utf8')

for (const item of [
  'email_automation_journeys',
  'email_automation_steps',
  'email_automation_enrolments',
  'email_automation_run_log',
  'email_automation_validate_step',
  "trigger_key in ('manual', 'contact_created', 'listing_enquiry', 'tag_added', 'price_reduction')",
  'enable row level security',
]) assert.ok(migration.includes(item), `Missing migration contract: ${item}`)
for (const item of ['saveEmailAutomation', 'email_automation_journeys', 'email_automation_steps']) assert.ok(service.includes(item), `Missing service contract: ${item}`)
for (const item of ['EmailAutomationStudio', 'JOURNEY BLUEPRINT', 'Save journey draft', 'Activation and event processing']) assert.ok(component.includes(item), `Missing UI contract: ${item}`)
assert.ok(page.includes('view: "automation"'), 'Automation route is not wired')
console.log('Email automation journeys Phase 4 checks passed.')
