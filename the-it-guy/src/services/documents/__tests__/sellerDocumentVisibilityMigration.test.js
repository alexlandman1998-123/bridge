import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../supabase/migrations/20260924170000_listing_seller_document_visibility_phase4.sql',
)

test('seller portal RPC filters documents at the database boundary and preserves the secured source wrapper', async () => {
  const migration = await fs.readFile(migrationPath, 'utf8')

  assert.match(migration, /rename to bridge_private_listing_seller_portal_payload_visibility_phase4_source/i)
  assert.match(migration, /bridge_seller_portal_record_visible_phase4\(item\.requirement\)/i)
  assert.match(migration, /bridge_seller_portal_record_visible_phase4\(item\.document\)/i)
  assert.match(migration, /'internal_only'[\s\S]*'compliance_only'[\s\S]*'shared_role_players'/i)
  assert.match(migration, /jsonb_set\(v_payload, '\{requirements\}', v_requirements, true\)/i)
  assert.match(migration, /jsonb_set\(v_payload, '\{documents\}', v_documents, true\)/i)
  assert.match(migration, /grant execute on function public\.bridge_private_listing_seller_portal_payload\(text, text, boolean\)[\s\S]*to anon, authenticated/i)
})
