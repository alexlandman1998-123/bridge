import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')
for (const expected of ['VISUAL_EMAIL_BLOCKS', 'Visual blocks', 'insertVisualBlock', 'Call to action']) assert.ok(component.includes(expected), `Missing visual-editor capability: ${expected}`)
console.log('Email visual blocks checks passed.')
