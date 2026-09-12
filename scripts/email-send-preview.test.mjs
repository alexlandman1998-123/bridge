import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
for (const expected of ['NON-SENDING PREVIEW', 'Send preview', 'This does not send anything', 'email-send-preview', 'live action reruns consent']) assert.ok(component.includes(expected), `Missing send preview capability: ${expected}`)
console.log('Email send preview checks passed.')
