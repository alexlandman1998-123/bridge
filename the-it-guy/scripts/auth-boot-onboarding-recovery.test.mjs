import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { deriveAuthBootOnboardingState } = await server.ssrLoadModule('/src/lib/authBoot.js')
  const { deriveStatusFromRuntime } = await server.ssrLoadModule('/src/services/onboarding/onboardingState.js')

  const staleProfile = {
    id: 'user-1',
    firstName: 'Principal',
    lastName: 'Demo',
    role: 'agent',
    onboardingCompleted: false,
  }
  const workspace = {
    id: 'workspace-1',
    type: 'agency',
    name: 'Bridge9 Realty',
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
