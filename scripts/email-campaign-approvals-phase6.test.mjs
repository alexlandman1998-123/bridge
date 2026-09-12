import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911150530_email_campaign_approvals_calendar_phase6.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
const page = readFileSync(resolve('the-it-guy/src/pages/MarketingComingSoonPage.jsx'), 'utf8')

for (const item of ['email_campaign_approvals', 'approval_required', 'email_campaign_set_approval', 'email_campaign_approval_guard', "requires approval before it can be scheduled", 'enable row level security', 'revoke all on function']) assert.ok(migration.includes(item), `Missing approval safety contract: ${item}`)
for (const item of ['approval_required', 'getEmailCampaignApprovals', 'setEmailCampaignApproval']) assert.ok(service.includes(item), `Missing approval service contract: ${item}`)
for (const item of ['EmailCampaignPlanning', 'Require approval before sending', 'Campaign calendar & approvals', 'Plan & approvals']) assert.ok(component.includes(item), `Missing planning UI contract: ${item}`)
assert.ok(page.includes('view: "planning"'), 'Planning route is not wired')
console.log('Email campaign approvals Phase 6 checks passed.')
