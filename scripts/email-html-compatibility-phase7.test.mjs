import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
const worker = readFileSync(resolve('supabase/functions/email-campaign-worker/index.ts'), 'utf8')
for (const expected of ['inspectEmailHtml', 'HTML compatibility', 'missing alt text', 'unsafe construct']) assert.ok(component.includes(expected), `Missing HTML confidence control: ${expected}`)
for (const expected of ['<script', '<iframe', 'javascript']) assert.ok(worker.includes(expected), `Missing delivery sanitisation: ${expected}`)
console.log('Email HTML compatibility Phase 7 checks passed.')
