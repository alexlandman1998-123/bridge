import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260918201647_arch9_reference_settings_access_lockdown.sql', import.meta.url), 'utf8')
const allocator = await readFile(new URL('../../supabase/migrations/20260912074159_arch9_reference_assignment_and_transaction_link.sql', import.meta.url), 'utf8')
const allocatorAccess = await readFile(new URL('../../supabase/migrations/20260912073608_arch9_reference_foundation.sql', import.meta.url), 'utf8')

assert.match(migration, /alter table public\.arch9_reference_settings enable row level security/)
assert.match(migration, /revoke all on table public\.arch9_reference_settings from public/)
assert.match(migration, /revoke all on table public\.arch9_reference_settings from anon/)
assert.match(migration, /revoke all on table public\.arch9_reference_settings from authenticated/)
assert.match(allocator, /create or replace function public\.arch9_allocate_reference\([\s\S]*?security definer/)
assert.match(allocatorAccess, /grant execute on function public\.arch9_allocate_reference\(uuid, text\)\s+to service_role/)

console.log('arch9 reference settings access-lockdown tests passed')
