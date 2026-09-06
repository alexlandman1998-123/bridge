import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905181043_public_websites_phase4_page_authoring.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_phase4_page_authoring_rls_test.sql'))
const service = read(resolve(appRoot, 'src/services/websiteWorkspaceService.js'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))
const editor = read(resolve(appRoot, 'src/components/marketing/WebsitePageEditor.jsx'))
const publicHome = read(resolve(repositoryRoot, 'apps/websites/app/page.tsx'))
const publicBlocks = read(resolve(repositoryRoot, 'apps/websites/components/content-blocks.tsx'))
const publicRepository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))

for (const [pattern, message] of [
  [/create or replace function public\.website_validate_page_content/i, 'creates the structured content validator'],
  [/create or replace function public\.website_save_draft_page/i, 'creates the guarded page save command'],
  [/create or replace function public\.website_delete_draft_campaign/i, 'creates the guarded campaign delete command'],
  [/public\.bridge_is_org_admin\(v_site\.organisation_id\)/i, 'requires organisation administrator ownership'],
  [/revision\.status = 'draft'/i, 'limits mutations to draft revisions'],
  [/Only campaign pages can be added to the standard template/i, 'keeps the four standard routes fixed'],
  [/Campaign pages use the fixed hero, property collection and enquiry layout/i, 'locks campaigns to one approved format'],
  [/CTA must use a local website path/i, 'rejects unsafe CTA destinations'],
  [/Social image must use a valid HTTPS URL/i, 'requires HTTPS social images'],
  [/revoke insert, update, delete on table public\.website_pages from authenticated/i, 'prevents direct browser writes'],
  [/revoke all on function public\.website_save_draft_page[\s\S]*from public, anon/i, 'keeps the privileged command private'],
]) assert.match(migration, pattern, message)

assert.match(databaseTest, /not has_table_privilege\('authenticated'.*'insert'/, 'database test checks insert denial')
assert.match(databaseTest, /not has_function_privilege\('anon'/, 'database test checks anonymous command denial')
assert.match(databaseTest, /has_function_privilege\('authenticated'/, 'database test checks guarded command access')

assert.match(service, /website_save_draft_page/, 'CRM saves pages through the guarded command')
assert.match(service, /website_delete_draft_campaign/, 'CRM deletes draft campaigns through the guarded command')
assert.doesNotMatch(service, /from\('website_pages'\)\.insert/, 'CRM does not insert campaign pages directly')
assert.match(workspace, /<WebsitePageEditor/, 'Website Studio mounts the page editor')
for (const label of ['Page title', 'Search title', 'Search description', 'Social image URL', 'Save page', 'Add section']) {
  assert.match(editor, new RegExp(label, 'i'), `page editor exposes ${label}`)
}
assert.match(editor, /Fixed campaign layout/, 'campaign editor communicates the fixed layout')
assert.match(editor, /Move section up/, 'standard sections can be reordered')
assert.match(editor, /Hide section/, 'standard sections can be hidden')

assert.match(publicHome, /getPublicPage\(site, ''\)/, 'homepage loads the published home page')
assert.match(publicHome, /<ContentBlocks page=\{page\}/, 'homepage renders structured published content')
assert.doesNotMatch(publicHome, /Find the place that feels like home/, 'homepage copy is no longer hard-coded')
assert.match(publicBlocks, /page\.kind === 'home'/, 'home hero retains the property search journey')
assert.match(publicBlocks, /filter\(\(block\) => !block\.hidden\)/, 'hidden draft sections stay hidden after publication')
assert.match(publicRepository, /social_image_url/, 'public page mapping includes social sharing imagery')

console.log('Public websites phase 4 page authoring checks passed')
