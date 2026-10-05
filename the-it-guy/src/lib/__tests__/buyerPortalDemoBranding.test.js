import { afterEach, expect, it, vi } from 'vitest'
import { buildDefaultProspectDemoConfig, resolveProspectDemoConfig } from '../prospectDemoConfig.js'
import { getDemoClientPortalSeedData } from '../onboardingDemoLinks.js'

vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }))
afterEach(() => vi.unstubAllEnvs())

it.each([true, false])('keeps the Only Realty preview identity when DEV=%s', async dev => {
  vi.stubEnv('DEV', dev)
  vi.stubEnv('PROD', !dev)
  const config = await resolveProspectDemoConfig('demo-buyer-portal')
  const portal = getDemoClientPortalSeedData('demo-buyer-portal', config)
  expect(config.agencyName).toBe('Only Realty')
  expect(portal.portalData.branding.agencyName).toBe('Only Realty')
  expect(portal.portalData.branding.primaryColour).toBe('#0a173e')
  expect(portal.portalData.branding.accentColour).toBe('#ad244a')
  expect(portal.portalData.branding.logoDarkUrl).toContain('5be90d22-3ab6-4fc9-9092-a0a2857ed76a')
  expect(JSON.stringify(portal.portalData.branding).toLowerCase()).not.toContain('produktive')
})

it('keeps the agency identity when seed data is built before configuration has loaded', () => {
  for (const supplied of [null, {}, { agencyName: 'Only Realty', logoUrl: '', primaryColour: '' }]) {
    const portal = getDemoClientPortalSeedData('demo-buyer-portal', supplied)
    expect(portal.portalData.branding.agencyName).toBe('Only Realty')
    expect(portal.portalData.branding.logoUrl).toContain('5be90d22-3ab6-4fc9-9092-a0a2857ed76a')
    expect(portal.portalData.branding.primaryColour).toBe('#0a173e')
  }
})

it('preserves separately configured prospect demo identities', () => {
  const portal = getDemoClientPortalSeedData('another-prospect', { agencyName: 'Another Agency', logoUrl: '/another.svg', primaryColour: '#112233' })
  expect(portal.portalData.branding.agencyName).toBe('Another Agency')
  expect(portal.portalData.branding.logoUrl).toBe('/another.svg')
  expect(portal.portalData.branding.primaryColour).toBe('#112233')
  expect(buildDefaultProspectDemoConfig('another-prospect').agencyName).toBe('another prospect')
})
