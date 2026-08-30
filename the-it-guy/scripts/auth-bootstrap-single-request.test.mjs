#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const authBootSource = await readFile(new URL('../src/lib/authBoot.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/services/workspaceResolutionService.js', import.meta.url), 'utf8')
const migrationSource = await readFile(
  new URL('../../supabase/migrations/20260830160810_secure_auth_bootstrap_rpc.sql', import.meta.url),
  'utf8',
)

assert.match(
  authBootSource,
  /'workspace\.context\.load'[\s\S]*?fetchWorkspaceResolutionContextRpc\(supabase, \{[\s\S]*?requestedWorkspaceId: selectedWorkspaceId/,
  'authenticated boot should start with the consolidated workspace context RPC',
)

assert.match(
  authBootSource,
  /const rpcProfile = workspaceContext[\s\S]*?normalizeWorkspaceResolutionRpcContext\(workspaceContext, \{ user \}\)\.profile[\s\S]*?if \(rpcProfile\?\.id\) return rpcProfile/,
  'the profile returned by the startup RPC should avoid a second profile read for established users',
)

assert.match(
  authBootSource,
  /workspaceContext,[\s\S]*?requestedWorkspaceId: selectedWorkspaceId/,
  'workspace resolution should reuse the already loaded RPC payload instead of issuing it again',
)

assert.match(
  authBootSource,
  /consolidated startup context unavailable; using legacy profile bootstrap/,
  'older environments and new-user edge cases should retain the legacy profile fallback',
)

assert.match(
  workspaceSource,
  /export async function fetchWorkspaceResolutionContextRpc/,
  'the consolidated RPC fetcher should be a reusable public bootstrap boundary',
)

assert.match(
  migrationSource,
  /revoke all on function public\.bridge_resolve_current_workspace_context\(uuid, text, text\) from public, anon;/,
  'the app-start RPC must not retain the default public execute grant',
)
assert.match(
  migrationSource,
  /grant execute on function public\.bridge_resolve_current_workspace_context\(uuid, text, text\) to authenticated;/,
  'the app-start RPC should remain available to authenticated sessions',
)

console.log('auth bootstrap single-request contract ok')
