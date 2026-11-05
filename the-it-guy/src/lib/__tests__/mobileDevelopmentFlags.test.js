import { afterEach, expect, it, vi } from 'vitest'
import { getFeatureFlags } from '../envValidation.js'
import { resolveMobileAwareRedirect } from '../resolveMobileAwareRedirect.js'

afterEach(() => vi.unstubAllEnvs())

function flags(development, shell, redirect) {
  vi.stubEnv('DEV', development)
  vi.stubEnv('VITE_FEATURE_MOBILE_SHELL', shell)
  vi.stubEnv('VITE_FEATURE_MOBILE_LOGIN_REDIRECT', redirect)
  return getFeatureFlags()
}

it('defaults local phone navigation to the mobile shell without startup variables', () => {
  const featureFlags = flags(true, '', '')
  expect(featureFlags.enableMobileShell).toBe(true)
  expect(featureFlags.enableMobileLoginRedirect).toBe(true)
  expect(resolveMobileAwareRedirect({ intendedPath: '/dashboard', user: { role: 'agent' }, deviceType: 'mobile', featureFlags })).toBe('/mobile/home')
  expect(resolveMobileAwareRedirect({ intendedPath: '/dashboard', user: { role: 'agent' }, deviceType: 'desktop', featureFlags })).toBe('/dashboard')
})

it('keeps production opt-in when the flags are not configured', () => {
  expect(flags(false, '', '')).toMatchObject({ enableMobileShell: false, enableMobileLoginRedirect: false })
})

it('honours explicit flags in both development and production', () => {
  expect(flags(true, 'false', 'false')).toMatchObject({ enableMobileShell: false, enableMobileLoginRedirect: false })
  expect(flags(false, 'true', 'true')).toMatchObject({ enableMobileShell: true, enableMobileLoginRedirect: true })
})
