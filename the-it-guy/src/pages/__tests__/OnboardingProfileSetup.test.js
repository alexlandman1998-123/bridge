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
  hasExistingWorkspaceMembership,
  isExistingWorkspaceJoinProfileStep,
  resolveExistingWorkspaceJoinProfileRoute,
} = await server.ssrLoadModule('/src/pages/OnboardingProfileSetup.jsx')
const { SIGNUP_WORKSPACE_ACTIONS } = await server.ssrLoadModule('/src/constants/signupIntents.js')
const { resolveOnboardingCompletionWorkspace } = await server.ssrLoadModule('/src/context/WorkspaceContext.jsx')

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
  hasExistingWorkspaceMembership({
    activeMemberships: [],
    currentMembership: null,
  }),
  false,
  'pending invite users should not complete onboarding before a membership exists',
)

assert.equal(
  hasExistingWorkspaceMembership({
    activeMemberships: [{ id: 'membership-1' }],
  }),
  true,
  'active memberships should allow onboarding completion',
)

assert.equal(
  resolveExistingWorkspaceJoinProfileRoute({
    role: 'agent',
    activeMemberships: [{ id: 'membership-1' }],
  }),
  '/dashboard',
  'active agency memberships should route to dashboard',
)

const activeMembershipOnlyCompletion = resolveOnboardingCompletionWorkspace({
  activeMemberships: [
    {
      id: 'membership-1',
      workspaceId: 'workspace-1',
      workspace: { id: 'workspace-1', type: 'agency' },
    },
  ],
  currentMembership: null,
  currentWorkspace: null,
})
assert.deepEqual(
  {
    hasMembership: activeMembershipOnlyCompletion.hasMembership,
    workspaceId: activeMembershipOnlyCompletion.workspaceId,
  },
  {
    hasMembership: true,
    workspaceId: 'workspace-1',
  },
  'profile completion should accept active memberships even before currentMembership is selected',
)

assert.equal(
  resolveOnboardingCompletionWorkspace({
    activeMemberships: [],
    currentMembership: null,
    currentWorkspace: { id: 'workspace-1', type: 'agency' },
  }).hasMembership,
  false,
  'profile completion should still require a real membership, not just a workspace shell',
)

console.log('OnboardingProfileSetup tests passed')
await server.close()
