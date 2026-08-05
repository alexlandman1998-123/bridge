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

const {
  isExistingWorkspaceJoinProfileStep,
  resolveExistingWorkspaceJoinProfileRoute,
} = await server.ssrLoadModule('/src/pages/OnboardingProfileSetup.jsx')
const { SIGNUP_WORKSPACE_ACTIONS } = await server.ssrLoadModule('/src/constants/signupIntents.js')

assert.equal(
  isExistingWorkspaceJoinProfileStep({
    signupIntent: { workspace_action: SIGNUP_WORKSPACE_ACTIONS.acceptInvite },
  }),
  true,
  'accepted invite intents should use the existing workspace profile step',
)

assert.equal(
  isExistingWorkspaceJoinProfileStep({
    signupIntent: { workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace },
    activeMemberships: [{ id: 'membership-1' }],
  }),
  true,
  'active memberships should use the existing workspace profile step',
)

assert.equal(
  isExistingWorkspaceJoinProfileStep({
    signupIntent: { workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace },
    pendingInviteToken: 'invite-token-1',
  }),
  true,
  'join/request intents with pending invite tokens should return to invite acceptance',
)

assert.equal(
  isExistingWorkspaceJoinProfileStep({
    signupIntent: { workspace_action: SIGNUP_WORKSPACE_ACTIONS.createWorkspace },
  }),
  false,
  'new workspace setup should keep the workspace profile step',
)

assert.equal(
  resolveExistingWorkspaceJoinProfileRoute({
    role: 'agent',
    signupIntent: { workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace },
    pendingInviteToken: 'invite-token-1',
  }),
  '/invite/invite-token-1?accept=1',
  'pending invite tokens should route back through the invite resolver',
)

assert.equal(
  resolveExistingWorkspaceJoinProfileRoute({
    role: 'agent',
    activeMemberships: [{ id: 'membership-1' }],
  }),
  '/dashboard',
  'active agency memberships should route to dashboard',
)

console.log('OnboardingProfileSetup tests passed')
await server.close()
