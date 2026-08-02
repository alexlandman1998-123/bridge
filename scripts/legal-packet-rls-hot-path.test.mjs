import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608020005_legal_packet_rls_hot_path.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /organisation_users_active_member_lookup_idx/)
assert.match(migration, /document_packet_versions_packet_lookup_idx/)
assert.match(migration, /document_packet_versions_signable_lookup_idx/)
assert.match(migration, /drop policy if exists document_packets_h2_select/)
assert.match(migration, /create policy document_packets_h2_select[\s\S]*using \(\s*public\.bridge_is_active_member\(organisation_id\)/)
assert.doesNotMatch(
  migration,
  /create policy document_packets_h2_select[\s\S]*using \(\s*public\.bridge_can_access_legal_packet_h2\(id\)/,
  'document_packets direct select policy must not call the packet lookup helper recursively.',
)

console.log('Legal packet RLS hot-path migration contract passed.')
