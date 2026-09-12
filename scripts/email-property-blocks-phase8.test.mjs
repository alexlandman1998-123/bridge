import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
for (const expected of ['Property card', 'insertListingCard', 'escapeEmailText', 'View property']) assert.ok(component.includes(expected), `Missing property-content control: ${expected}`)
console.log('Email property blocks Phase 8 checks passed.')
