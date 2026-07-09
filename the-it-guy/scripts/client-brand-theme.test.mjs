import assert from 'node:assert/strict'

import {
  buildClientBrandCssVars,
  buildClientBrandDeploymentManifest,
  buildClientBrandVerificationMatrix,
  getClientBrandReadiness,
  getClientBrandFingerprint,
  getDefaultArch9ClientTheme,
  getReadableTextColor,
  normalizeBrandColor,
  resolveClientBrandTheme,
} from '../src/lib/clientBrandTheme.js'

assert.equal(normalizeBrandColor('#abc'), '#AABBCC')
assert.equal(normalizeBrandColor('#A1B2C3'), '#A1B2C3')
assert.equal(normalizeBrandColor('not-a-colour'), '')
assert.equal(getReadableTextColor('#F7CF22'), '#001B44')
assert.equal(getReadableTextColor('#001A3D'), '#FFFFFF')

const defaultTheme = getDefaultArch9ClientTheme()
assert.equal(defaultTheme.source, 'arch9_default')
assert.equal(defaultTheme.primaryColor, '#001A3D')
assert.equal(defaultTheme.accentColor, '#F7CF22')
assert.notEqual(defaultTheme, getDefaultArch9ClientTheme(), 'default theme should be returned as a copy')

const mergedTheme = resolveClientBrandTheme({
  organisation: {
    id: 'org-1',
    display_name: 'Organisation Fallback',
    logo_url: 'https://cdn.example.test/org-logo.png',
  },
  listing: {
    coverImageUrl: 'https://cdn.example.test/listing-cover.jpg',
  },
  organisationSettings: {
    settings_json: {
      agencyOnboarding: {
        agencyInformation: {
          agencyName: 'Legacy Agency',
        },
        branding: {
          logoLight: 'https://cdn.example.test/legacy-light.png',
          primaryColour: '#123456',
          accentColour: '#ABCDEF',
          backgroundImageUrl: 'https://cdn.example.test/legacy-hero.jpg',
          suggestedColours: {
            primary: '#334455',
            accent: '#CCAA00',
          },
        },
      },
    },
  },
  organisationBranding: {
    organisation_id: 'org-1',
    organisation_display_name: 'Canonical Agency',
    logo_dark_url: 'https://cdn.example.test/canonical-dark.png',
    accent_color: '#FFD21F',
    theme_json: {
      primaryColor: '#0A2540',
      heroImageUrl: 'https://cdn.example.test/canonical-hero.jpg',
    },
    metadata_json: {
      canonicalThemeVersion: 1,
    },
    published_at: '2026-07-09T10:00:00.000Z',
  },
})

assert.equal(mergedTheme.source, 'organisation_branding')
assert.deepEqual(mergedTheme.sources, [
  'arch9_default',
  'listing',
  'organisation',
  'legacy_settings',
  'organisation_branding',
])
assert.equal(mergedTheme.organisationId, 'org-1')
assert.equal(mergedTheme.organisationName, 'Canonical Agency')
assert.equal(mergedTheme.logoUrl, 'https://cdn.example.test/canonical-dark.png')
assert.equal(mergedTheme.logoDarkUrl, 'https://cdn.example.test/canonical-dark.png')
assert.equal(mergedTheme.logoLightUrl, 'https://cdn.example.test/legacy-light.png')
assert.equal(mergedTheme.heroImageUrl, 'https://cdn.example.test/canonical-hero.jpg')
assert.equal(mergedTheme.primaryColor, '#0A2540')
assert.equal(mergedTheme.accentColor, '#FFD21F')
assert.equal(mergedTheme.suggestedPrimaryColor, '#334455')
assert.equal(mergedTheme.suggestedAccentColor, '#CCAA00')
assert.equal(mergedTheme.textOnPrimary, '#FFFFFF')
assert.equal(mergedTheme.textOnAccent, '#001B44')
assert.equal(mergedTheme.metadata.canonicalThemeVersion, 1)

const invalidColourTheme = resolveClientBrandTheme({
  organisationSettings: {
    agencyOnboarding: {
      branding: {
        primaryColor: 'chartreuse',
        accentColor: '#0f0',
        logoUrl: 'javascript:alert(1)',
        heroImageUrl: '/brand/safe-hero.jpg',
      },
    },
  },
})

assert.equal(invalidColourTheme.primaryColor, '#001A3D', 'invalid primary colour should not override default')
assert.equal(invalidColourTheme.accentColor, '#00FF00', 'short hex accent colour should be normalized')
assert.equal(invalidColourTheme.logoUrl, '', 'unsafe logo URL should be ignored')
assert.equal(invalidColourTheme.heroImageUrl, '/brand/safe-hero.jpg', 'safe relative hero URL should be retained')

const draftTheme = resolveClientBrandTheme({
  organisationBranding: {
    organisation_display_name: 'Published Brand',
    theme_json: {
      primaryColor: '#111111',
    },
    draft_theme_json: {
      organisationName: 'Draft Brand',
      primaryColor: '#222222',
      accentColor: '#EEEEEE',
    },
  },
}, { mode: 'draft' })

assert.equal(draftTheme.source, 'organisation_branding_draft')
assert.equal(draftTheme.organisationName, 'Draft Brand')
assert.equal(draftTheme.primaryColor, '#222222')
assert.equal(draftTheme.accentColor, '#EEEEEE')

const cssVars = buildClientBrandCssVars(mergedTheme)
assert.equal(cssVars['--client-brand-primary'], '#0A2540')
assert.equal(cssVars['--client-brand-accent'], '#FFD21F')
assert.equal(cssVars['--client-brand-primary-contrast'], '#FFFFFF')
assert.equal(cssVars['--client-brand-accent-contrast'], '#001B44')
assert.equal(cssVars['--client-brand-logo-url'], '"https://cdn.example.test/canonical-dark.png"')
assert.equal(cssVars['--client-brand-hero-image'], 'url("https://cdn.example.test/canonical-hero.jpg")')

const readyBrand = getClientBrandReadiness(mergedTheme)
assert.equal(readyBrand.version, 1)
assert.equal(readyBrand.status, 'ready')
assert.equal(readyBrand.score, 100)
assert.equal(readyBrand.summary.failedRequired, 0)
assert.equal(readyBrand.surfaces.length, 3)
assert.equal(readyBrand.surfaces.every((surface) => surface.status === 'ready'), true)
assert.equal(Number.parseFloat(readyBrand.checks.find((check) => check.key === 'primary_contrast')?.value) >= 4.5, true)

const brandFingerprint = getClientBrandFingerprint(mergedTheme)
assert.match(brandFingerprint, /^brand_[a-z0-9]{7,}$/)
assert.equal(
  getClientBrandFingerprint({ ...mergedTheme, publishedAt: '2026-08-01T00:00:00.000Z' }),
  brandFingerprint,
  'fingerprint should ignore rollout timestamps',
)
assert.notEqual(
  getClientBrandFingerprint({ ...mergedTheme, accentColor: '#00AAFF' }),
  brandFingerprint,
  'fingerprint should change when brand-defining values change',
)

const deploymentManifest = buildClientBrandDeploymentManifest(mergedTheme, {
  generatedAt: '2026-07-09T10:30:00.000Z',
  publishedAt: '2026-07-09T10:00:00.000Z',
})
assert.equal(deploymentManifest.version, 1)
assert.equal(deploymentManifest.fingerprint, brandFingerprint)
assert.equal(deploymentManifest.generatedAt, '2026-07-09T10:30:00.000Z')
assert.equal(deploymentManifest.publishedAt, '2026-07-09T10:00:00.000Z')
assert.equal(deploymentManifest.readiness.status, 'ready')
assert.deepEqual(deploymentManifest.surfaces.map((surface) => surface.key), ['onboarding', 'portal', 'email'])
assert.equal(
  deploymentManifest.surfaces.find((surface) => surface.key === 'portal')?.viewportTargets.includes('mobile'),
  true,
)
assert.equal(
  deploymentManifest.surfaces.find((surface) => surface.key === 'email')?.surfaces.includes('workspace_invite_email'),
  true,
)

const verificationMatrix = buildClientBrandVerificationMatrix(mergedTheme, {
  generatedAt: '2026-07-09T10:30:00.000Z',
  publishedAt: '2026-07-09T10:00:00.000Z',
})
assert.equal(verificationMatrix.version, 1)
assert.equal(verificationMatrix.fingerprint, brandFingerprint)
assert.equal(verificationMatrix.summary.status, 'ready')
assert.equal(verificationMatrix.summary.targetCount, 10)
assert.equal(verificationMatrix.targets.every((target) => target.status === 'ready'), true)
assert.equal(
  verificationMatrix.targets.some((target) => target.key === 'buyer_onboarding_mobile' && target.width === 390),
  true,
)
assert.equal(
  verificationMatrix.targets.some((target) => target.key === 'transaction_tracker_desktop' && target.width === 1440),
  true,
)
assert.equal(
  verificationMatrix.targets.some((target) => target.key === 'client_emails_mobile' && target.viewport === 'email_mobile'),
  true,
)

const incompleteBrand = getClientBrandReadiness({
  primaryColor: '#777777',
  secondaryColor: '#777777',
  accentColor: '#777777',
  neutralColor: '#F7F8FA',
})
assert.equal(incompleteBrand.status, 'needs_attention')
assert.equal(incompleteBrand.summary.failedRequired > 0, true)
assert.equal(
  incompleteBrand.checks.find((check) => check.key === 'logo')?.passed,
  false,
)

console.log('Client brand theme tests passed.')
