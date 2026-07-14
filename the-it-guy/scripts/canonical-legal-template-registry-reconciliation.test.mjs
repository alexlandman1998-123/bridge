import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607140021_canonical_legal_template_registry_reconciliation.sql', import.meta.url),
  'utf8',
)
const auditDeleteFix = await readFile(
  new URL('../../supabase/migrations/202607140022_canonical_template_audit_delete_fix.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create table if not exists public\.document_packet_template_versions/i)
assert.match(migration, /create table if not exists public\.document_packet_template_audit/i)
assert.match(migration, /where t\.organisation_id is null[\s\S]*exists \([\s\S]*public\.organisations/i)
assert.match(migration, /insert into storage\.buckets[\s\S]*'legal-templates'/i)
assert.match(migration, /public\.bridge_is_platform_admin\(\)[\s\S]*auth\.jwt\(\) -> 'app_metadata'/i)
assert.doesNotMatch(migration, /auth\.jwt\(\) -> 'user_metadata'/i)
assert.doesNotMatch(migration, /from public\.profiles p[\s\S]*where p\.id = auth\.uid\(\)[\s\S]*'developer'/i)
assert.doesNotMatch(migration, /'admin',\s*\n\s*'developer'/i)
assert.match(migration, /revoke all on function public\.bridge_is_platform_admin\(\) from public, anon, authenticated, service_role/i)
assert.match(migration, /revoke all on function public\.bridge_document_packet_template_audit\(\) from public, anon, authenticated, service_role/i)
assert.match(migration, /\(organisation_id is null and status = 'published' and is_active = true\)/i)
assert.match(migration, /\(organisation_id is null and status = 'published'\)/i)
assert.match(auditDeleteFix, /template_version_deleted[\s\S]*v_version_id := null/i)
assert.match(auditDeleteFix, /template_deleted[\s\S]*v_template_id := null/i)
assert.match(auditDeleteFix, /event_payload_json/i)
assert.match(auditDeleteFix, /v_actor_profile_id[\s\S]*where profile\.id = v_actor_auth_user_id/i)
assert.match(auditDeleteFix, /jsonb_build_object\('actor_auth_user_id', v_actor_auth_user_id\)/i)

console.log('Canonical legal-template registry reconciliation checks passed.')
