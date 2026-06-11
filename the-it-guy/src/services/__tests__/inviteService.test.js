import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const { getInviteByToken } = await server.ssrLoadModule('/src/services/inviteService.js')

function createQueryResponse(response) {
  return {
    select() {
      return this
    },
    eq() {
      return this
    },
    maybeSingle() {
      return Promise.resolve(response)
    },
  }
}

function createClient({ directResponse, rpcResponse }) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push({ type: 'from', table })
      assert.equal(table, 'invites')
      return createQueryResponse(directResponse)
    },
    rpc(name, params) {
      calls.push({ type: 'rpc', name, params })
      assert.equal(name, 'bridge_lookup_invite_by_token')
      return Promise.resolve(rpcResponse)
    },
  }
}

const inviteRow = {
  id: 'invite-1',
  invite_type: 'workspace_invite',
  status: 'pending',
  token: 'token-123',
  expires_at: '2026-07-01T00:00:00.000Z',
  target_workspace_id: 'workspace-1',
  target_workspace_role: 'agent',
  target_branch_id: null,
  target_team_id: null,
  email: 'agent@example.com',
  phone: '0820000000',
  metadata: { first_name: 'Invite', last_name: 'Agent', role_label: 'Agent' },
  created_at: '2026-06-11T00:00:00.000Z',
  updated_at: '2026-06-11T00:00:00.000Z',
  organisations: { id: 'workspace-1', name: 'ABC Realty', display_name: 'ABC Realty', type: 'agency', logo_url: 'https://cdn.example.com/abc-logo.png' },
}

{
  const client = createClient({
    directResponse: { data: inviteRow, error: null },
    rpcResponse: { data: null, error: null },
  })
  const context = await getInviteByToken('token-123', { client })
  assert.equal(context.ok, true, 'visible direct invite rows should still resolve')
  assert.equal(context.invite.email, 'agent@example.com')
  assert.equal(context.invite.workspace.logo_url, 'https://cdn.example.com/abc-logo.png')
  assert.equal(client.calls.some((call) => call.type === 'rpc'), false, 'direct matches should not call the public lookup RPC')
}

{
  const client = createClient({
    directResponse: { data: null, error: null },
    rpcResponse: { data: { success: true, invite: inviteRow }, error: null },
  })
  const context = await getInviteByToken('token-123', { client })
  assert.equal(context.ok, true, 'public token lookup should recover invite rows hidden by RLS from unauthenticated users')
  assert.equal(context.invite.targetWorkspaceId, 'workspace-1')
  assert.equal(client.calls.some((call) => call.type === 'rpc'), true, 'empty direct results should try the public lookup RPC')
}

{
  const client = createClient({
    directResponse: { data: null, error: { code: '42501', message: 'permission denied for table invites' } },
    rpcResponse: { data: { success: true, invite: inviteRow }, error: null },
  })
  const context = await getInviteByToken('token-123', { client })
  assert.equal(context.ok, true, 'permission-blocked invite reads should fall back to the public token lookup RPC')
  assert.equal(context.invite.workspace.name, 'ABC Realty')
}

{
  const client = createClient({
    directResponse: { data: null, error: null },
    rpcResponse: { data: { success: false, code: 'not_found' }, error: null },
  })
  const context = await getInviteByToken('missing-token', { client })
  assert.equal(context.ok, false)
  assert.equal(context.reason, 'not_found')
}

console.log('inviteService tests passed')
await server.close()
