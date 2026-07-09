import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607090011_client_branding_canonical_phase1.sql', import.meta.url),
  'utf8',
)
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

function assertIncludes(source, token, message) {
  assert.ok(source.includes(token), message || `Expected token: ${token}`)
}

for (const token of [
  'add column if not exists logo_icon_url text',
  'add column if not exists hero_image_url text',
  'add column if not exists primary_color text',
  'add column if not exists accent_color text',
  'add column if not exists neutral_color text',
  'add column if not exists suggested_primary_color text',
  'add column if not exists suggested_accent_color text',
  "add column if not exists theme_json jsonb not null default '{}'::jsonb",
  "add column if not exists draft_theme_json jsonb not null default '{}'::jsonb",
  'add column if not exists published_at timestamptz',
]) {
  assertIncludes(migration, token, `canonical branding migration should add ${token}`)
}

for (const token of [
  "os.settings_json #> '{agencyOnboarding,branding}'",
  "os.settings_json #> '{agency_onboarding,branding}'",
  "os.settings_json -> 'branding'",
  "settings_branding.branding ->> 'logoLight'",
  "settings_branding.branding ->> 'logoDark'",
  "settings_branding.branding ->> 'logoIcon'",
  "settings_branding.branding ->> 'heroImageUrl'",
  "settings_branding.branding ->> 'backgroundImageUrl'",
  "settings_branding.branding #>> '{brandColours,primary}'",
  "settings_branding.branding #>> '{brandColours,accent}'",
]) {
  assertIncludes(migration, token, `canonical branding migration should backfill legacy settings field: ${token}`)
}

for (const token of [
  'primary_brand_color = coalesce',
  'secondary_brand_color = coalesce',
  'accent_brand_color = coalesce',
  "'logoLightUrl'",
  "'logoDarkUrl'",
  "'logoIconUrl'",
  "'heroImageUrl'",
  "'primaryColor'",
  "'accentColor'",
  "'canonicalThemeVersion', 1",
]) {
  assertIncludes(migration, token, `canonical branding migration should retain compatibility/theme token: ${token}`)
}

assertIncludes(
  packageJson,
  '"test:client-branding-canonical-phase1": "node scripts/client-branding-canonical-phase1.test.mjs"',
  'package scripts should expose the phase 1 branding contract test',
)

console.log('Client branding canonical phase 1 contract passed.')
