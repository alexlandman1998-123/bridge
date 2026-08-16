import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { resolveOnboardingBranding } from '../src/lib/onboardingBranding.js'

const appRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appRoot, '..')
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260816134635_sync_onboarding_brand_colours_to_public_branding.sql'),
  'utf8',
)
const rlsMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260816134910_buyer_onboarding_token_public_branding_scope.sql'),
  'utf8',
)
const clientOnboardingSource = readFileSync(resolve(appRoot, 'src/pages/ClientOnboarding.jsx'), 'utf8')

const branding = resolveOnboardingBranding({
  agencyOnboarding: {
    branding: {
      brandColours: {
        primary: '#274C69',
        secondary: '#10273A',
        accent: '#F7CF22',
      },
    },
  },
})

assert.equal(branding.primaryColour, '#274C69')
assert.equal(branding.secondaryColour, '#10273A')
assert.equal(branding.accentColour, '#F7CF22')

for (const requiredSql of [
  'bridge_sync_onboarding_branding_to_public_branding',
  'after insert or update of settings_json on public.organisation_settings',
  'brandColours',
  'primary_brand_color',
  'secondary_brand_color',
  'accent_brand_color',
  'on conflict (organisation_id) do update',
  "notify pgrst, 'reload schema'",
]) {
  assert.match(migration, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}

assert.doesNotMatch(
  migration,
  /create policy .*organisation_settings.*anon|for select to anon/i,
  'The fix must not expose organisation_settings to anonymous onboarding sessions.',
)

for (const requiredSql of [
  'organisations_select_onboarding_token_brand_scope',
  'organisation_branding_select_onboarding_token_brand_scope',
  'to anon, authenticated',
  'bridge_has_onboarding_token_transaction_access(tx.id)',
]) {
  assert.match(rlsMigration, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}

assert.match(
  clientOnboardingSource,
  /const accent = configuredAccent \|\| configuredSecondary \|\| \(configuredPrimary \? primary : '#f7cf22'\)/,
  'Buyer onboarding should only use the platform yellow when no organisation colours are configured.',
)

console.log('developer buyer onboarding branding test passed')
