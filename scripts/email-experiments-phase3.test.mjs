import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const migration = readFileSync(resolve('supabase/migrations/20260911145924_email_experiments_phase3.sql'),'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'),'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'),'utf8')
for (const item of ['email_campaign_experiments','sample_percent','experiment_json']) assert.ok(migration.includes(item))
for (const item of ['experiment_json']) assert.ok(service.includes(item))
for (const item of ['Test an alternate subject line','Variant B subject','sample_percent']) assert.ok(component.includes(item))
console.log('Email experiments Phase 3 checks passed.')
