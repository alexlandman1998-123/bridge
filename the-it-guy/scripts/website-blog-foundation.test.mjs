import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260913112745_website_blog_posts_foundation.sql', import.meta.url), 'utf8')
const revisionMigration = await readFile(new URL('../../supabase/migrations/20260913113900_website_blog_revision_workflow.sql', import.meta.url), 'utf8')

for (const marker of [
  'create table public.website_blog_posts',
  'organisation_id uuid not null',
  'website_site_id uuid not null',
  "status in ('draft', 'published')",
  'website_blog_posts_site_slug_unique_idx',
  'website_blog_posts_cover_alt_check',
  'alter table public.website_blog_posts enable row level security',
  'website_blog_posts_admin_select',
  'website_blog_posts_admin_insert',
]) assert.ok(migration.includes(marker), `Blog migration must include ${marker}.`)

assert.match(migration, /status = 'draft' and published_at is null/i, 'Draft posts must not have a published timestamp.')
assert.match(migration, /status = 'published' and published_at is not null/i, 'Published posts must have a published timestamp.')
assert.match(migration, /organisation_id = \(select organisation_id from public\.website_sites where id = website_site_id\)/i, 'Posts must be tied to the matching website organisation.')

for (const marker of [
  'website_blog_posts_revision_slug_unique_idx',
  'website_save_draft_blog_post',
  'website_revision_readiness_brand',
  'changesReadyCount',
  'website_create_draft_revision_core',
  'website_publish_revision_core',
  'website_rollback_revision_core',
  'website_discard_draft_revision_core',
]) assert.ok(revisionMigration.includes(marker), `Revision workflow migration must include ${marker}.`)

assert.match(revisionMigration, /revision_id set not null/i, 'Every blog post must be tied to a revision.')
assert.match(revisionMigration, /revision\.id = p_revision_id[\s\S]*revision\.status = 'draft'/i, 'Only a draft revision can accept blog edits.')
assert.match(revisionMigration, /set status = 'published', published_at = coalesce\(published_at, now\(\)\)/i, 'Publishing a revision must publish its article snapshot.')
assert.match(revisionMigration, /on delete cascade/i, 'Discarding a draft revision must discard its article snapshot.')

console.log('website blog foundation checks passed')
