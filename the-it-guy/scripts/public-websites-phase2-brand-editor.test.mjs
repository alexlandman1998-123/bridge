import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')

function read(path) {
  return readFileSync(path, 'utf8')
}

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905174555_public_websites_phase2_brand_editor.sql'))
const service = read(resolve(appRoot, 'src/services/websiteWorkspaceService.js'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))
const editor = read(resolve(appRoot, 'src/components/marketing/WebsiteBrandEditor.jsx'))
const repository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))
const chrome = read(resolve(repositoryRoot, 'apps/websites/components/site-chrome.tsx'))
const publicStyles = read(resolve(repositoryRoot, 'apps/websites/app/styles.css'))

for (const [pattern, message] of [
  [/create or replace function public\.website_update_draft_brand\(/i, 'creates the draft-brand update command'],
  [/security definer[\s\S]*set search_path = ''/i, 'pins the privileged function search path'],
  [/v_user_id uuid := auth\.uid\(\)/i, 'requires an authenticated caller'],
  [/public\.bridge_is_org_admin\(v_site\.organisation_id\)/i, 'authorises an organisation administrator'],
  [/revision\.status = 'draft'[\s\S]*for update/i, 'locks and limits updates to a draft revision'],
  [/unsupported fields/i, 'rejects fields outside the website-brand allow-list'],
  [/jsonb_typeof\(p_brand_patch -> v_value\) <> 'string'/i, 'rejects non-text brand values'],
  [/\^#\[0-9a-f\]\{6\}\$/i, 'validates six-digit hex colours'],
  [/\^https:\/\//i, 'requires HTTPS logo and website URLs'],
  [/from public\.organisation_branding branding/i, 'can reset from current organisation branding'],
  [/set brand_json = jsonb_strip_nulls\(v_next_brand\)/i, 'persists only the website revision brand data'],
  [/revoke all on function public\.website_update_draft_brand\(uuid, uuid, jsonb, boolean\) from public, anon/i, 'keeps the privileged command private'],
  [/grant execute on function public\.website_update_draft_brand\(uuid, uuid, jsonb, boolean\) to authenticated/i, 'exposes the guarded command to authenticated administrators'],
]) {
  assert.match(migration, pattern, message)
}

assert.match(service, /select\('id, revision_number, status, brand_json,[^']*published_at,[^']*updated_at'\)/, 'loads draft website branding')
assert.match(service, /draftBrand:/, 'returns the editable draft brand')
assert.match(service, /export async function saveWebsiteDraftBrand/, 'exports the save operation')
assert.match(service, /export async function resetWebsiteDraftBrand/, 'exports the reset operation')
assert.match(service, /supabase\.rpc\('website_update_draft_brand'/, 'uses the guarded database command')

for (const label of ['Company display name', 'Logo for light backgrounds', 'Logo for dark backgrounds', 'Primary colour', 'Secondary colour', 'Accent colour', 'Contact email', 'Contact phone', 'WhatsApp number']) {
  assert.match(editor, new RegExp(label, 'i'), `renders the ${label} editor`)
}
assert.match(editor, /uploadOrganisationBrandingAsset/, 'uses the existing organisation-scoped logo uploader')
assert.match(editor, /Live draft preview/i, 'renders a live draft preview')
assert.match(editor, /Reset to organisation branding/i, 'provides the explicit reset action')
assert.match(workspace, /<WebsiteBrandEditor/, 'mounts the editor for an editable website draft')

for (const key of ['logoLightUrl', 'logoDarkUrl', 'primaryColor', 'secondaryColor', 'accentColor', 'phone', 'email', 'website', 'whatsappNumber']) {
  assert.match(repository, new RegExp(`${key}:`), `maps ${key} from the published revision`)
}
assert.match(chrome, /import Image from 'next\/image'/, 'uses the Next.js image component for tenant logos')
assert.match(chrome, /logoDarkUrl \|\| site\.logoLightUrl/, 'selects a logo suitable for the dark footer')
assert.match(chrome, /site\.phone/, 'renders the website-specific contact phone')
assert.match(chrome, /site\.email/, 'renders the website-specific contact email')
assert.match(chrome, /site\.whatsappNumber/, 'renders the website-specific WhatsApp link')
assert.match(chrome, /site\.website/, 'renders the website-specific company website link')
assert.match(publicStyles, /background:var\(--accent\)/, 'applies the editable accent colour to public template controls')

console.log('Public websites phase 2 brand editor checks passed')
