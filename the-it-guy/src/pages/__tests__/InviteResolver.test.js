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

const { getInviteTarget, getRedirectTarget } = await server.ssrLoadModule('/src/pages/InviteResolver.jsx')

const principalClaimInvite = {
  inviteType: 'principal_claim_invite',
  targetWorkspaceId: 'workspace-1',
}

assert.equal(
  getRedirectTarget({ success: true, invite: principalClaimInvite }),
  '/setup',
  'accepted principal claim invites should continue into claim setup',
)

assert.equal(
  getInviteTarget({ ...principalClaimInvite, status: 'accepted' }),
  '/setup',
  'already-accepted principal claim invites should continue into claim setup',
)

assert.equal(
  getRedirectTarget({ success: true, invite: { inviteType: 'workspace_invite' } }),
  '/dashboard',
  'standard workspace invites should keep the dashboard fallback',
)

console.log('InviteResolver tests passed')
await server.close()
