import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const migration = readFileSync(resolve('supabase/migrations/20260911145837_email_personalisation_phase2.sql'),'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'),'utf8')
const worker = readFileSync(resolve('supabase/functions/email-campaign-worker/index.ts'),'utf8')
for (const item of ['recipient_snapshot','role_type','email_campaign_recipient_snapshot_traits']) assert.ok(migration.includes(item))
for (const item of ['PERSONALISATION_TOKENS','Personalise each send','insertConditional']) assert.ok(component.includes(item))
for (const item of ['lead_stage','role_type','const conditional']) assert.ok(worker.includes(item))
console.log('Email personalisation Phase 2 checks passed.')
