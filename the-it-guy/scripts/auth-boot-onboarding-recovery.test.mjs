import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const authBootSource = await readFile(new URL('../src/lib/authBoot.js', import.meta.url), 'utf8')
  const loadBridgeAuthStateStart = authBootSource.indexOf('export async function loadBridgeAuthState')
  const profileLoadStart = authBootSource.indexOf('const [profile, loadedSignupIntent]', loadBridgeAuthStateStart)
  const bridgeUserResolution = authBootSource.slice(loadBridgeAuthStateStart, profileLoadStart)

  assert.ok(loadBridgeAuthStateStart >= 0)
  assert.ok(profileLoadStart > loadBridgeAuthStateStart)
  assert.match(bridgeUserResolution, /const user = session\.user/)
  assert.doesNotMatch(bridgeUserResolution, /auth\.getUser/)

  const {
    deriveAuthBootOnboardingState,
    shouldAutoClaimWorkspaceMembership,
    shouldIgnoreStaleMembershipRecovery,
    shouldAutoRepairWorkspaceOnboarding,
  } = await server.ssrLoadModule('/src/lib/authBoot.js')
  const { deriveStatusFromRuntime } = await server.ssrLoadModule('/src/services/onboarding/onboardingState.js')

  const staleProfile = {
    id: 'user-1',
    email: 'principal@example.test',
    firstName: 'Principal',
    lastName: 'Demo',
    role: 'agent',
    onboardingCompleted: false,
  }
  const workspace = {
    id: 'workspace-1',
    type: 'agency',
    name: 'Arch9 Realty',
  }
  const membership = {
    id: 'membership-1',
    status: 'active',
    workspace,
    workspaceId: workspace.id,
  }

  const recovered = deriveAuthBootOnboardingState({
    profile: staleProfile,
    appRole: 'agent',
    activeMemberships: [membership],
    currentMembership: membership,
  })

  assert.equal(recovered.onboardingComplete, true)
  assert.equal(recovered.onboardingRequiredReason, '')
  assert.equal(
    shouldIgnoreStaleMembershipRecovery({
      appRole: 'attorney',
      activeMemberships: [membership],
      currentMembership: membership,
      currentWorkspace: workspace,
      onboardingState: { recoveryReason: 'no_active_membership' },
    }),
    true,
  )
  assert.equal(
    shouldIgnoreStaleMembershipRecovery({
      appRole: 'attorney',
      activeMemberships: [membership],
      currentMembership: membership,
      currentWorkspace: workspace,
      onboardingState: { recoveryReason: 'missing_department' },
    }),
    false,
  )
  assert.equal(
    shouldAutoClaimWorkspaceMembership({
      profile: staleProfile,
      appRole: 'agent',
      activeMemberships: [],
      currentMembership: null,
      signupIntent: { id: 'signup-intent-1' },
      onboardingRequiredReason: 'no_active_membership',
    }),
    true,
  )
  assert.equal(
    shouldAutoClaimWorkspaceMembership({
      profile: staleProfile,
      appRole: 'agent',
      activeMemberships: [membership],
      currentMembership: membership,
      signupIntent: { id: 'signup-intent-1' },
      onboardingRequiredReason: 'no_active_membership',
    }),
    false,
  )
  assert.equal(
    shouldAutoClaimWorkspaceMembership({
      profile: staleProfile,
      appRole: 'agent',
      activeMemberships: [],
      currentMembership: null,
      signupIntent: null,
      onboardingRequiredReason: 'no_active_membership',
    }),
    false,
  )
  assert.equal(
    shouldAutoRepairWorkspaceOnboarding({
      appRole: 'agent',
      currentMembership: { ...membership, source: 'organisation_users' },
      currentWorkspace: workspace,
      onboardingState: { recoveryReason: 'missing_settings' },
    }),
    true,
  )
  assert.equal(
    shouldAutoRepairWorkspaceOnboarding({
      appRole: 'agent',
      currentMembership: { ...membership, source: 'organisation_users' },
      currentWorkspace: workspace,
      onboardingState: { validation: { reason: 'missing_branch' } },
    }),
    true,
  )
  assert.equal(
    shouldAutoRepairWorkspaceOnboarding({
      appRole: 'agent',
      currentMembership: { ...membership, source: 'organisation_users' },
      currentWorkspace: workspace,
      onboardingState: { recoveryReason: 'no_active_membership' },
    }),
    false,
  )
  assert.equal(
    shouldAutoRepairWorkspaceOnboarding({
      appRole: 'attorney',
      currentMembership: { ...membership, source: 'attorney_firm_members' },
      currentWorkspace: workspace,
      onboardingState: { recoveryReason: 'missing_department' },
    }),
    false,
  )

  const runtimeStatus = deriveStatusFromRuntime({
    profile: staleProfile,
    activeMemberships: [membership],
    validation: { ok: true },
    onboardingComplete: recovered.onboardingComplete,
  })
  assert.equal(runtimeStatus, 'onboarding_completed')

  const missingMembership = deriveAuthBootOnboardingState({
    profile: staleProfile,
    appRole: 'agent',
    activeMemberships: [],
    currentMembership: null,
  })
  assert.equal(missingMembership.onboardingComplete, false)
  assert.equal(missingMembership.onboardingRequiredReason, 'onboarding_incomplete')

  const unresolvedWorkspace = deriveAuthBootOnboardingState({
    profile: staleProfile,
    appRole: 'agent',
    activeMemberships: [{ ...membership, workspace: null }],
    currentMembership: { ...membership, workspace: null },
  })
  assert.equal(unresolvedWorkspace.onboardingComplete, false)
  assert.equal(unresolvedWorkspace.onboardingRequiredReason, 'onboarding_incomplete')

  console.log('auth boot onboarding recovery tests passed')
} finally {
  await server.close()
}
