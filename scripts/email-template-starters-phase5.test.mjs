import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
for (const expected of ['PROPERTY_TEMPLATE_STARTERS', 'New listing', 'Market update', 'Open house', 'property_starter', 'email-template-starters']) assert.ok(component.includes(expected), `Missing template-starter capability: ${expected}`)
console.log('Email template starters Phase 5 checks passed.')
