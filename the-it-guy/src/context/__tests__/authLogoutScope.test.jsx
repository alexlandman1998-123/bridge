// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { AuthSessionProvider, useAuthSession } from '../AuthSessionContext'
import { supabase } from '../../lib/supabaseClient'
import { trackAuthMetric } from '../../services/observability/monitoring'

vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: false,
  isUnsupportedJwtAlgorithmError: vi.fn(),
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } },
}))
vi.mock('../../lib/devAuth', () => ({
  clearStoredDevAuthRole: vi.fn(), createDevAuthSession: vi.fn(), getStoredDevAuthRole: () => null, isDevAuthBypassEnabled: () => false,
}))
vi.mock('../../lib/authBoot', () => ({
  buildDegradedBridgeAuthState: vi.fn(), buildCachedBridgeAuthState: vi.fn(), getActiveAuthBootStepDiagnostics: vi.fn(),
  loadBridgeAuthState: vi.fn(), persistLastGoodBridgeAuthState: vi.fn(),
}))
vi.mock('../../lib/envValidation', () => ({ getProductionSafetyViolation: () => null }))
vi.mock('../../services/observability/monitoring', () => ({ trackAuthMetric: vi.fn(), trackWorkspaceBrandingMetric: vi.fn() }))
vi.mock('../../services/workspaceScopedCache', () => ({ clearWorkspaceScopedRuntimeCaches: vi.fn() }))
vi.mock('../../services/workspaceResolutionService', () => ({ setActiveWorkspacePreference: vi.fn() }))
vi.mock('../../services/observability/errorTracking', () => ({ reportError: vi.fn() }))
vi.mock('../../services/observability/dashboardPerformanceTelemetry', () => ({
  DASHBOARD_PERFORMANCE_METRICS: {}, createDashboardPerformanceTrace: vi.fn(), persistDashboardPerformanceTrace: vi.fn(),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

function mountLogout() {
  const { result } = renderHook(() => useAuthSession(), { wrapper: AuthSessionProvider })
  return (...args) => act(async () => { await result.current.logout(...args) })
}

it.each([false, true])('manual logout retains its global scope (click event=%s)', async fromClick => {
  const logout = mountLogout()
  await logout(...(fromClick ? [new MouseEvent('click')] : []))
  expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
  expect(supabase.auth.signOut.mock.calls[0][0]?.scope || 'global').toBe('global')
  expect(trackAuthMetric.mock.invocationCallOrder[0]).toBeLessThan(supabase.auth.signOut.mock.invocationCallOrder[0])
  expect(trackAuthMetric).toHaveBeenCalledWith('logout_requested', expect.objectContaining({
    metadata: expect.objectContaining({ source: 'user_initiated' }),
  }))
})
