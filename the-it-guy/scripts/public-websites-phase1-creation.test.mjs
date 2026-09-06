import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')

function read(path) {
  return readFileSync(path, 'utf8')
}

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905173734_public_websites_phase1_creation.sql'))
const service = read(resolve(appRoot, 'src/services/websiteWorkspaceService.js'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))

for (const [pattern, message] of [
  [/create or replace function public\.website_create_site\(p_organisation_id uuid\)/i, 'creates the website setup command'],
  [/security definer[\s\S]*set search_path = ''/i, 'pins the privileged function search path'],
  [/v_user_id uuid := auth\.uid\(\)/i, 'requires an authenticated caller'],
  [/public\.bridge_is_org_admin\(p_organisation_id\)/i, 'authorises the organisation administrator'],
  [/from public\.website_sites site[\s\S]*where site\.organisation_id = p_organisation_id/i, 'returns an existing site idempotently'],
  [/'property-standard-v1'/i, 'uses only the frozen first template'],
  [/from public\.organisation_branding branding/i, 'loads the organisation brand seed'],
  [/'logoLightUrl'[\s\S]*'logoDarkUrl'[\s\S]*'primaryColor'[\s\S]*'secondaryColor'[\s\S]*'accentColor'/i, 'copies logos and colours into the website revision'],
  [/insert into public\.website_domains[\s\S]*'preview'[\s\S]*'active'/i, 'reserves an active managed preview hostname'],
  [/insert into public\.website_site_revisions[\s\S]*1,[\s\S]*'draft'/i, 'creates the initial draft revision'],
  [/'home'[\s\S]*'about'[\s\S]*'contact'[\s\S]*'valuation'/i, 'creates all frozen standard pages'],
  [/revoke all on function public\.website_create_site\(uuid\) from public, anon/i, 'does not expose the privileged command publicly'],
  [/grant execute on function public\.website_create_site\(uuid\) to authenticated/i, 'allows authenticated admins to call through the explicit function guard'],
]) {
  assert.match(migration, pattern, message)
}

assert.match(service, /export async function createWebsiteSite\(organisationId\)/, 'exports the setup client')
assert.match(service, /supabase\.rpc\('website_create_site'/, 'calls the atomic database command')
assert.match(workspace, /overview\.mode === 'ready_to_create'/, 'shows setup only when no website exists')
assert.match(workspace, /Create website/, 'provides the agency administrator setup action')
assert.match(workspace, /Future website edits will not change email or document branding/, 'explains the copied-brand boundary')

console.log('Public websites phase 1 creation checks passed')
