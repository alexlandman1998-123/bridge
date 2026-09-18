import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [detail, migration] = await Promise.all([
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918120542_listing_seller_portal_document_tasks_phase4.sql', import.meta.url), 'utf8'),
])

assert.match(detail, /const sellerPortalTasks = getRequiredSellerDocuments/)
assert.match(detail, /signedRequirementKeys/)
assert.match(detail, /sellerPortalTasks,/)
assert.match(migration, /private_listing_seller_portal_task_plans/)
assert.match(migration, /signing_pack_snapshot -> 'sellerPortalTasks'/)
assert.match(migration, /private_listing_seller_portal_task_plan_projection/)

console.log('listing seller portal document tasks phase 4 checks passed.')
