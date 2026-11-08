import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { UNSAFE_PRODUCTION_FLAG_NAMES, validateProductionConfiguration } from '../../config/productionValidation'
import { getRuntimeEnvValidation } from '../envValidation'

beforeEach(() => {
  vi.stubEnv('VITE_APP_ENV', 'production')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://configuration-fixture.supabase.co')
  for (const name of ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY']) vi.stubEnv(name, '')
  for (const name of UNSAFE_PRODUCTION_FLAG_NAMES) vi.stubEnv(name, 'false')
})
afterEach(() => vi.unstubAllEnvs())

it('starts with a publishable key without requiring a legacy alias', () => {
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_configuration_fixture')
  expect(validateProductionConfiguration().ok).toBe(true)
  expect(getRuntimeEnvValidation().ok).toBe(true)
})

it.each(['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY'])('retains the existing %s configuration path', name => {
  vi.stubEnv(name, 'sb_publishable_compatibility_fixture')
  expect(validateProductionConfiguration().ok).toBe(true)
  expect(getRuntimeEnvValidation().ok).toBe(true)
})

it('identifies every supported setting when all browser keys are missing', () => {
  expect(validateProductionConfiguration().ok).toBe(false)
  expect(getRuntimeEnvValidation().message).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
})

it('still rejects a missing URL with a publishable key', () => {
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_configuration_fixture')
  vi.stubEnv('VITE_SUPABASE_URL', '')
  expect(validateProductionConfiguration().ok).toBe(false)
  expect(getRuntimeEnvValidation().missing).toContain('VITE_SUPABASE_URL')
})

it('keeps unsafe production authentication flags blocked', () => {
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_configuration_fixture')
  vi.stubEnv('VITE_ENABLE_DEV_AUTH_BYPASS', 'true')
  expect(validateProductionConfiguration().issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unsafe_production_flags_enabled' })]))
})
