// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dependencies = vi.hoisted(() => ({
  loadProfile: vi.fn(),
  loadContext: vi.fn(),
  resolveWorkspace: vi.fn(),
  loadOnboarding: vi.fn(),
  client: {
    from: vi.fn(() => ({
      select() { return this },
      eq() { return this },
      maybeSingle: async () => ({ data: { id: 'tuckers-user' }, error: null }),
    })),
    rpc: vi.fn(),
  },
}))

vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: dependencies.client }))
vi.mock('../profileApi', async (importOriginal) => ({
  ...await importOriginal(),
  getOrCreateUserProfile: dependencies.loadProfile,
}))
vi.mock('../signupIntent', () => ({
  loadSignupIntentForUser: async () => null,
  markSignupIntentReadyForOnboarding: vi.fn(),
}))
vi.mock('../../services/onboarding/onboardingEngine', () => ({ getOnboardingState: dependencies.loadOnboarding }))
vi.mock('../../services/workspaceResolutionService', async (importOriginal) => ({
  ...await importOriginal(),
  fetchWorkspaceResolutionContextRpc: dependencies.loadContext,
  resolveCurrentWorkspace: dependencies.resolveWorkspace,
}))

import {
  buildCachedBridgeAuthState,
  buildDegradedBridgeAuthState,
  loadBridgeAuthState,
  persistLastGoodBridgeAuthState,
} from '../authBoot.js'
import { buildWorkspaceResolution } from '../../services/workspaceResolutionService.js'

// Session metadata has the displayed names, but the saved profile owns the role
// and completion flag. This matches the existing-workspace failure scenario.
const session = {
  access_token: 'fixture-session',
  user: {
    id: 'tuckers-user',
    email: 'admin@example.test',
    user_metadata: { first_name: 'Tuckers', last_name: 'Admin' },
  },
}
const profile = {
  id: session.user.id,
  firstName: 'Tuckers',
  lastName: 'Admin',
  role: 'attorney',
  onboardingCompleted: true,
}
const firm = { id: 'tuckers-firm', name: 'Tuckers Attorneys', is_active: true }
const membership = {
  id: 'tuckers-membership', user_id: session.user.id, firm_id: firm.id,
  role: 'firm_admin', status: 'active',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  localStorage.clear()
  dependencies.loadContext.mockResolvedValue(null)
  dependencies.loadProfile.mockResolvedValue(profile)
  dependencies.resolveWorkspace.mockImplementation(async (_userId, options) => buildWorkspaceResolution({
    user: options.user,
    profile: options.profile,
    attorneyFirmRows: [firm],
    attorneyMembershipRows: [membership],
    requestedWorkspaceId: options.requestedWorkspaceId,
  }))
  dependencies.loadOnboarding.mockImplementation(async (_userId, context) => ({
    onboardingStatus: context.onboardingComplete ? 'onboarding_completed' : 'recovery_required',
    recoveryReason: context.onboardingRequiredReason,
    validation: { ok: context.onboardingComplete, reason: context.onboardingRequiredReason },
  }))
  for (const method of ['debug', 'warn', 'error']) vi.spyOn(console, method).mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function expectFailedProfileBoot(error) {
  // Observe both outcomes before advancing the timeout/retry timers.
  const result = loadBridgeAuthState({ session, selectedWorkspaceId: firm.id })
    .then((state) => ({ state }), (failure) => ({ failure }))
  await vi.runAllTimersAsync()
  expect((await result).failure).toMatchObject(error)
  expect(dependencies.resolveWorkspace).not.toHaveBeenCalled()
  expect(dependencies.loadOnboarding).not.toHaveBeenCalled()
  expect(dependencies.client.rpc).not.toHaveBeenCalled()
}

describe('existing workspace profile recovery', () => {
  it('does not turn a slow profile read into an onboarding redirect', async () => {
    dependencies.loadProfile.mockImplementation(() => new Promise(() => {}))
    await expectFailedProfileBoot({ code: 'AUTH_BOOT_STEP_TIMEOUT' })
  })

  it('does not turn exhausted schema-cache retries into incomplete onboarding', async () => {
    dependencies.loadProfile.mockRejectedValue({ code: 'PGRST002', message: 'Could not query the database for the schema cache' })
    await expectFailedProfileBoot({ code: 'PGRST002' })
    expect(dependencies.loadProfile).toHaveBeenCalledTimes(4)
  })

  it('restores the verified workspace while a profile read is unavailable and recovers on retry', async () => {
    const goodState = await loadBridgeAuthState({ session, selectedWorkspaceId: firm.id })
    expect(goodState.onboardingComplete).toBe(true)
    expect(goodState.currentWorkspace.id).toBe(firm.id)
    persistLastGoodBridgeAuthState(goodState)

    dependencies.resolveWorkspace.mockClear()
    dependencies.loadOnboarding.mockClear()
    dependencies.loadProfile.mockImplementation(() => new Promise(() => {}))
    await expectFailedProfileBoot({ code: 'AUTH_BOOT_STEP_TIMEOUT' })

    const recovered = buildDegradedBridgeAuthState({
      session, selectedWorkspaceId: firm.id, error: new Error('profile.getOrCreate timed out.'),
    })
    expect(recovered.currentWorkspace.id).toBe(firm.id)
    expect(recovered.appRole).toBe('attorney')
    expect(recovered.onboardingComplete).toBe(true)
    expect(recovered.onboardingRequiredReason).toBe('')
    expect(recovered.workspaceAccessDegraded).toBe(true)
    expect(buildCachedBridgeAuthState({ session: { user: { id: 'another-user' } } })).toBeNull()

    dependencies.loadProfile.mockResolvedValue(profile)
    const refreshed = await loadBridgeAuthState({ session, selectedWorkspaceId: firm.id })
    expect(refreshed.workspaceAccessDegraded).toBe(false)
    expect(refreshed.onboardingComplete).toBe(true)
    expect(refreshed.currentWorkspace.id).toBe(firm.id)
  })

  it('still requires profile setup when the saved profile is actually incomplete', async () => {
    dependencies.loadProfile.mockResolvedValue({ ...profile, firstName: '' })
    const state = await loadBridgeAuthState({ session, selectedWorkspaceId: firm.id })
    expect(state.onboardingComplete).toBe(false)
    expect(state.onboardingRequiredReason).toBe('profile_incomplete')
  })

  it('does not restore cached access after a successful read confirms membership was removed', async () => {
    const goodState = await loadBridgeAuthState({ session, selectedWorkspaceId: firm.id })
    persistLastGoodBridgeAuthState(goodState)
    dependencies.resolveWorkspace.mockImplementation(async (_userId, options) => buildWorkspaceResolution({
      user: options.user, profile: options.profile,
    }))
    const state = await loadBridgeAuthState({ session, selectedWorkspaceId: firm.id })
    expect(state.onboardingComplete).toBe(false)
    expect(state.onboardingRequiredReason).toBe('no_active_membership')
    expect(state.currentWorkspace).toBeNull()
  })
})
