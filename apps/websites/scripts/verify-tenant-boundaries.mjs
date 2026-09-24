#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../../..', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const repository = await read('apps/websites/lib/site-repository.ts')
const migration = await read('supabase/migrations/20260921115101_website_tenant_boundary_enforcement.sql')

const publicReadScopes = [
  ["website_listing_publications", ".eq('website_site_id', site.id)"],
  ["website_blog_posts", ".eq('website_site_id', site.id)"],
  ["website_media_assets", ".eq('website_site_id', site.id)"],
  ["website_blog_slug_redirects", ".eq('website_site_id', site.id)"],
  ["website_pages", ".eq('website_site_id', site.id).eq('revision_id', site.publishedRevisionId)"],
]

for (const [table, scope] of publicReadScopes) {
  assert.match(repository, new RegExp(`from\\('${table}'\\)[\\s\\S]{0,800}${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${table} public read must remain site-scoped`)
}

for (const table of [
  'website_listing_publications',
  'website_pages',
  'website_lead_submissions',
  'website_preapproval_applications',
  'website_blog_posts',
  'website_media_assets',
  'website_blog_slug_redirects',
  'website_blog_listing_links',
  'website_analytics_daily',
]) {
  assert.match(migration, new RegExp(`trg_${table}_tenant_boundary`), `${table} needs a database tenant-boundary trigger`)
}

assert.match(migration, /create or replace view public\.website_tenant_boundary_violations/, 'migration must expose a read-only drift audit')
assert.match(migration, /with \(security_invoker = true\)/, 'drift audit must not bypass RLS')
console.log('PASS: public website reads are site-scoped and every tenant-bearing write surface has a database boundary trigger.')
