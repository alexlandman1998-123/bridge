import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260916124500_website_blog_member_authoring.sql', import.meta.url), 'utf8')

for (const functionName of [
  'website_create_draft_revision_core',
  'website_revision_readiness_base',
  'website_publish_revision_core',
  'website_save_draft_blog_post',
  'website_manage_draft_blog_post',
  'website_blog_available_listings',
]) assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`, 'i'), `${functionName} must use the member authoring contract.`)

assert.match(migration, /bridge_is_org_member\(v_site\.organisation_id\)/i, 'Blog commands must be limited to active members of the owning organisation.')
assert.doesNotMatch(migration, /bridge_is_org_admin\(v_site\.organisation_id\)/i, 'Blog commands must not retain an administrator-only gate.')
assert.match(migration, /website_media_member_insert/i, 'Members must be able to upload blog images.')
assert.match(migration, /website_blog_posts_member_read/i, 'Members must be able to read their organisation blog posts.')

console.log('website blog member authoring checks passed')
