import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911150919_email_experiment_dispatch_phase3_completion.sql'), 'utf8')
const worker = readFileSync(resolve('supabase/functions/email-campaign-worker/index.ts'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const item of ['experiment_variant', 'email_campaign_experiment_allocate', 'email_campaign_experiment_decide', 'winner_variant', 'decision_after', "'holdout'", 'grant execute on function public.email_campaign_experiment_allocate']) assert.ok(migration.includes(item), `Missing experiment dispatch contract: ${item}`)
for (const item of ['email_campaign_experiment_allocate', 'email_campaign_experiment_decide', 'experiment_variant", ["control", "variant"]', 'variant_subject', 'arch9_experiment_variant']) assert.ok(worker.includes(item), `Missing worker experiment contract: ${item}`)
for (const item of ['email_campaign_experiments', 'experiment: experiment.data']) assert.ok(service.includes(item), `Missing experiment reporting contract: ${item}`)
for (const item of ['A/B EXPERIMENT', 'automatically selects the better subject', 'Variant events']) assert.ok(component.includes(item), `Missing experiment UI contract: ${item}`)
console.log('Email experiment dispatch Phase 3 completion checks passed.')
