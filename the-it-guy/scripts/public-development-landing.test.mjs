import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/PublicDevelopmentLandingPage.jsx', import.meta.url), 'utf8')
const detail = await readFile(new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const roles = await readFile(new URL('../src/lib/roles.js', import.meta.url), 'utf8')
const permissions = await readFile(new URL('../src/auth/permissions/permissionRegistry.js', import.meta.url), 'utf8')
const invite = await readFile(new URL('../../supabase/functions/development-access-invite/index.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260901075131_public_development_landing_and_access_boundary.sql', import.meta.url), 'utf8')

assert.match(app, /path="\/development\/:slug"/)
assert.match(page, /get_public_development_landing/)
assert.match(page, /Live availability/)
assert.match(page, /Plans and downloads/)
assert.match(detail, /buildPublicDevelopmentSlug/)
assert.match(detail, /developmentLandingPageUrl: publicLandingUrl/)
assert.match(detail, /Generated automatically when plans or marketing assets are uploaded/)

assert.match(migration, /create or replace function public\.bridge_can_view_development_record/)
assert.match(migration, /create or replace function public\.bridge_can_manage_development_record[\s\S]*bridge_has_development_org_access[\s\S]*?\),[\s\S]*?false/)
assert.doesNotMatch(
  migration.match(/create or replace function public\.bridge_can_manage_development_record[\s\S]*?\$\$;/)?.[0] || '',
  /bridge_has_development_access/,
  'Participant visibility must not imply development management access.',
)
assert.match(migration, /grant execute on function public\.get_public_development_landing\(text\) to anon, authenticated/)
assert.match(migration, /publicVisibility/)
assert.match(migration, /marketingStatus/)
assert.match(migration, /table_name \|\| '_modify_scoped'/)
assert.match(migration, /create policy units_select_scoped[\s\S]*bridge_can_view_development_record/)
assert.match(migration, /create policy units_update_scoped[\s\S]*bridge_can_manage_development_record/)

assert.match(roles, /to: '\/developer\/developments'/)
assert.match(permissions, /prefix: '\/developer\/developments'/)
assert.match(invite, /signedInRole === "developer"/)
assert.match(invite, /redirectTo: developmentRoute/)

console.log('Public development landing and developer boundary checks passed.')
