import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')

for (const expected of ['function TemplateStudio', 'accept=".html,.htm,text/html"', 'file.size > 750 * 1024', 'safePreviewHtml', 'saveEmailTemplate']) assert.ok(component.includes(expected), `Missing Phase 2 studio control: ${expected}`)
assert.match(service, /supabase\.from\('email_templates'\)/)
assert.match(service, /design_json/)
console.log('Email campaign Phase 2 content studio checks passed.')
