import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [migration, edge] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260918120035_listing_seller_portal_workspace_phase2.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
])

assert.match(migration, /create or replace function public\.bridge_prepare_listing_seller_portal_workspace/)
assert.match(migration, /if not v_group_complete then[\s\S]*signing_group_incomplete/)
assert.match(migration, /when seller_portal_status = 'not_activated' then 'invitation_pending'/)
assert.match(migration, /'seller_portal_workspace_prepared'/)
assert.match(migration, /if v_group_complete then[\s\S]*bridge_prepare_listing_seller_portal_workspace\(v_session\.id\)/)
assert.match(migration, /grant execute on function public\.bridge_prepare_listing_seller_portal_workspace\(uuid\)[\s\S]*to service_role/)
assert.match(edge, /sellerPortalWorkspace: snapshot\(completion\.sellerPortalWorkspace\)/)

console.log('listing seller portal workspace phase 2 checks passed.')
