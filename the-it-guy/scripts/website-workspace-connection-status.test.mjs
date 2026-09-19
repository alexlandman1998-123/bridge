import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [migration, correctiveMigration, service, workspace] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260918133954_website_workspace_connection_status.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918222000_fix_website_workspace_connection_status_preview_slug.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/websiteWorkspaceService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/marketing/WebsiteWorkspace.jsx', import.meta.url), 'utf8'),
])

assert.match(migration, /create or replace function public\.website_workspace_connection_status/)
assert.match(migration, /security definer/)
assert.match(migration, /auth\.uid\(\) is null or not public\.bridge_is_org_member\(p_organisation_id\)/)
assert.match(migration, /grant execute on function public\.website_workspace_connection_status\(uuid\) to authenticated, service_role/)
assert.match(correctiveMigration, /select ws\.id, ws\.preview_slug, ws\.status, ws\.template_key, ws\.published_revision_id, ws\.updated_at/)
assert.match(correctiveMigration, /where ws\.organisation_id = p_organisation_id/)
assert.match(correctiveMigration, /grant execute on function public\.website_workspace_connection_status\(uuid\) to authenticated, service_role/)

assert.match(service, /WEBSITE_CONNECTION_TIMEOUT_MS = 8_000/)
assert.match(service, /supabase\.rpc\('website_workspace_connection_status'/)
assert.match(service, /request\.abortSignal\(controller\.signal\)/)
assert.doesNotMatch(service, /website_pilot_enrolments'\)\s*\.select/)
assert.doesNotMatch(service, /website_production_releases'\)\s*\.select/)
assert.doesNotMatch(service, /website_production_dark_launches'\)\s*\.select/)

assert.match(service, /Website connection check timed out\. Please retry\./)
assert.match(workspace, /Retry connection check/)

console.log('website workspace connection status checks passed.')
