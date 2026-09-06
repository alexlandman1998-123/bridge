import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')

function read(path) {
  return readFileSync(path, 'utf8')
}

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260906090949_public_websites_durable_brand_assets.sql'))
const edgeFunction = read(resolve(repositoryRoot, 'supabase/functions/website-brand-publication/index.ts'))
const helper = read(resolve(repositoryRoot, 'supabase/functions/_shared/websiteBrandAssets.ts'))
const service = read(resolve(appRoot, 'src/services/websiteWorkspaceService.js'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))
const editor = read(resolve(appRoot, 'src/components/marketing/WebsiteBrandEditor.jsx'))
const repository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))
const chrome = read(resolve(repositoryRoot, 'apps/websites/components/site-chrome.tsx'))
const publicStyles = read(resolve(repositoryRoot, 'apps/websites/app/styles.css'))

for (const [pattern, message] of [
  [/create table if not exists public\.website_brand_assets/i, 'creates the durable website brand ledger'],
  [/security definer[\s\S]*set search_path = ''/i, 'pins the privileged function search path'],
  [/website_commit_draft_brand/i, 'creates the service-only brand commit'],
  [/website_brand_assets_site_organisation_fkey/i, 'enforces the brand asset tenant boundary'],
  [/source_fingerprint[\s\S]*\{64\}/i, 'requires a SHA-256 source fingerprint'],
  [/status text not null default 'active'[\s\S]*'retired'[\s\S]*'deleted'/i, 'tracks asset cleanup state'],
  [/registered durable website logo/i, 'rejects unregistered logo URLs'],
  [/durable public asset before publishing/i, 'blocks unsafe logos at publication readiness'],
  [/revoke all on function public\.website_commit_draft_brand[^;]+authenticated/i, 'keeps the durable commit private'],
  [/grant execute on function public\.website_commit_draft_brand[^;]+service_role/i, 'exposes the durable commit only to the server'],
  [/drop function if exists public\.website_update_draft_brand/i, 'removes the old browser mutation'],
]) {
  assert.match(migration, pattern, message)
}

for (const [pattern, message] of [
  [/admin\.auth\.getUser\(token\)/, 'verifies the caller token server-side'],
  [/parseProjectStorageUrl/, 'accepts only same-project storage sources'],
  [/cacheControl: "31536000"/, 'creates long-lived immutable website logo objects'],
  [/websiteBrandAssetStoragePath/, 'uses tenant-scoped content-addressed paths'],
  [/website_commit_draft_brand/, 'registers assets and branding atomically'],
  [/website_publish_revision/, 'repairs branding before publishing'],
  [/removeNewUploads/, 'compensates failed partial uploads'],
  [/cleanupRetiredAssets/, 'cleans unreferenced logo objects'],
]) {
  assert.match(edgeFunction, pattern, message)
}
assert.match(helper, /organisations\/\$\{input\.organisationId\}\/websites\/\$\{input\.websiteSiteId\}\/branding/, 'owns logos under the website path')

assert.match(service, /select\('id, revision_number, status, brand_json,[^']*published_at,[^']*updated_at'\)/, 'loads draft website branding')
assert.match(service, /draftBrand:/, 'returns the editable draft brand')
assert.match(service, /export async function saveWebsiteDraftBrand/, 'exports the save operation')
assert.match(service, /export async function resetWebsiteDraftBrand/, 'exports the reset operation')
assert.match(service, /WEBSITE_BRAND_PUBLICATION_FUNCTION/, 'routes brand mutations through the server pipeline')
assert.doesNotMatch(service, /supabase\.rpc\('website_update_draft_brand'/, 'does not expose the retired browser brand mutation')

for (const label of ['Company display name', 'Logo for light backgrounds', 'Logo for dark backgrounds', 'Primary colour', 'Secondary colour', 'Accent colour', 'Contact email', 'Contact phone', 'WhatsApp number']) {
  assert.match(editor, new RegExp(label, 'i'), `renders the ${label} editor`)
}
assert.match(editor, /uploadOrganisationBrandingAsset/, 'uses the organisation-scoped logo uploader')
assert.match(editor, /permanent website copy/i, 'explains durable logo ownership')
assert.doesNotMatch(editor, /Or use an HTTPS image URL/i, 'does not accept arbitrary remote logo URLs')
assert.match(editor, /Live draft preview/i, 'renders a live draft preview')
assert.match(editor, /Reset to organisation branding/i, 'provides the explicit reset action')
assert.match(workspace, /isRepairableBrandBlocker/, 'allows the publisher to repair legacy draft logos')
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

console.log('Public websites phase 2 durable brand checks passed')
