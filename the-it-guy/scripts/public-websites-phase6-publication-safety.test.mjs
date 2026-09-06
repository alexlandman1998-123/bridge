import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905183337_public_websites_phase6_publication_safety.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_phase6_publication_safety_rls_test.sql'))
const publicRepository = read(resolve(repositoryRoot, 'apps/websites/lib/site-repository.ts'))
const publicTypes = read(resolve(repositoryRoot, 'apps/websites/lib/types.ts'))
const brandPublisher = read(resolve(repositoryRoot, 'supabase/functions/website-brand-publication/index.ts'))
const workspaceService = read(resolve(appRoot, 'src/services/websiteWorkspaceService.js'))
const workspace = read(resolve(appRoot, 'src/components/marketing/WebsiteWorkspace.jsx'))

for (const [pattern, message] of [
  [/add column if not exists published_revision_id uuid/i, 'pins each site to one exact public revision'],
  [/foreign key \(published_revision_id, id\)[\s\S]*references public\.website_site_revisions\(id, website_site_id\)/i, 'prevents cross-site revision pointers'],
  [/foreign key \(revision_id, website_site_id\)[\s\S]*references public\.website_site_revisions\(id, website_site_id\)/i, 'prevents cross-site page ownership'],
  [/Website publication safety cannot be enabled while a published site or revision has an inconsistent pointer/i, 'fails deployment on inconsistent legacy publication state'],
  [/create or replace function public\.website_revision_readiness/i, 'creates the authoritative release-readiness command'],
  [/website_validate_page_content/i, 'revalidates every page at publication time'],
  [/exactly one Home, About, Contact and Valuation page/i, 'requires the four standard routes'],
  [/Activate the managed preview domain before publishing/i, 'requires an active hostname'],
  [/contentFingerprint/i, 'fingerprints the reviewed publication content'],
  [/insert into public\.website_site_revisions[\s\S]*v_source\.id[\s\S]*returning id into v_new_id/i, 'rollback creates a new revision from archived content'],
  [/action, from_revision_id,[\s\S]*'rolled_back'/i, 'records rollback evidence'],
  [/create table if not exists public\.website_publication_events/i, 'stores publication history'],
  [/foreign key \(website_site_id, organisation_id\)[\s\S]*references public\.website_sites\(id, organisation_id\)/i, 'binds publication evidence to one tenant'],
  [/grant select, insert on table public\.website_publication_events to service_role/i, 'keeps publication evidence append-only through the API'],
  [/revoke insert, update, delete on table public\.website_sites from authenticated/i, 'blocks direct pointer mutation'],
  [/revoke insert, update, delete on table public\.website_site_revisions from authenticated/i, 'blocks direct revision mutation'],
  [/revoke all on function public\.website_publish_revision\(uuid, uuid\) from public, anon/i, 'keeps publication unavailable to anonymous callers'],
]) assert.match(migration, pattern, message)

const definerFunctions = migration.match(/create or replace function public\.(?:website_enforce_published_revision_pointer|website_revision_readiness|website_create_draft_revision|website_publish_revision|website_rollback_revision|website_discard_draft_revision)[\s\S]*?\n\$\$;/gi) || []
assert.equal(definerFunctions.length, 6, 'migration defines all six Phase 6 privileged functions')
for (const functionSql of definerFunctions) {
  assert.match(functionSql, /security definer\s+set search_path = ''/i, 'every Phase 6 definer function pins an empty search path')
}
assert.doesNotMatch(migration, /set search_path = public/i, 'Phase 6 does not trust a mutable public search path')

assert.match(databaseTest, /plan\(25\)/, 'database contract has a fixed assertion plan')
assert.match(databaseTest, /not has_table_privilege\('authenticated'.*website_publication_events.*'insert'/, 'database test prevents forged history')
assert.match(databaseTest, /not has_table_privilege\('service_role'.*website_publication_events.*'delete'/, 'database test prevents deleted history')
assert.match(databaseTest, /not has_function_privilege\('anon'.*website_publish_revision/, 'database test denies anonymous publication')
assert.match(databaseTest, /has_function_privilege\('authenticated'.*website_rollback_revision/, 'database test permits guarded admin recovery')

assert.match(publicTypes, /publishedRevisionId: string/, 'the public site contract requires an exact revision id')
assert.match(publicRepository, /\.eq\('revision_id', site\.publishedRevisionId\)/, 'public pages load only from the pinned revision')
assert.match(publicRepository, /\.eq\('id', site\.published_revision_id\)[\s\S]*\.eq\('website_site_id', site\.id\)[\s\S]*\.eq\('status', 'published'\)/, 'host resolution validates revision ownership and state')
assert.doesNotMatch(publicRepository, /website_site_revisions!inner\(status\)/, 'public page reads do not infer live content from revision status alone')

assert.match(workspaceService, /website_revision_readiness/, 'CRM loads authoritative publication blockers')
assert.match(workspaceService, /action: 'discard'/, 'CRM routes draft discard through the website publisher')
assert.match(brandPublisher, /website_discard_draft_revision/, 'the verified publisher calls the guarded discard command')
assert.match(workspaceService, /website_publication_events/, 'CRM loads publication evidence')
assert.match(workspaceService, /revision\.id === site\.published_revision_id/, 'CRM identifies the live revision from the exact pointer')
assert.match(workspaceService, /page\.revision_id === activeRevision\?\.id/, 'CRM editor shows only the active draft or live revision pages')

assert.match(workspace, /Publication blockers/, 'Website Studio displays release blockers')
assert.match(workspace, /Publish reviewed draft/, 'Website Studio labels the guarded release action clearly')
assert.match(workspace, /Restore selected revision/, 'Website Studio supports explicit recovery-point selection')
assert.match(workspace, /new published copy/i, 'Website Studio explains immutable recovery semantics')
assert.match(workspace, /PUBLICATION HISTORY/, 'Website Studio displays publication evidence')
assert.match(workspace, /window\.confirm/, 'destructive publication actions require confirmation')

console.log('Public websites phase 6 publication safety checks passed')
