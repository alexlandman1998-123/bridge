import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911144903_email_assets_phase6.sql'), 'utf8')
const service = readFileSync(resolve('the-it-guy/src/services/emailCampaignService.js'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['email-assets', 'email_assets', 'allowed_mime_types', 'email_asset_path_organisation_id']) assert.ok(migration.includes(expected), `Missing asset security: ${expected}`)
for (const expected of ['uploadEmailImageAsset', 'email-assets', 'imageAssets']) assert.ok(service.includes(expected), `Missing asset service: ${expected}`)
for (const expected of ['Upload image', 'email-image-assets', 'insertAsset']) assert.ok(component.includes(expected), `Missing asset UI: ${expected}`)
console.log('Email assets Phase 6 checks passed.')
