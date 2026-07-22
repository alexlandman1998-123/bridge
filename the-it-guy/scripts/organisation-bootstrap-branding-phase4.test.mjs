import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bootstrapSource = readFileSync(path.join(PROJECT_ROOT, 'src/lib/organisationBootstrapApi.js'), 'utf8')
const organisationContextSource = readFileSync(path.join(PROJECT_ROOT, 'src/context/OrganisationContext.jsx'), 'utf8')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __organisationBootstrapApiTestUtils } = await server.ssrLoadModule('/src/lib/organisationBootstrapApi.js')
  const { hydrateAgencyOnboardingBrandingUrls } = __organisationBootstrapApiTestUtils

  const signingCalls = []
  const publicUrlCalls = []
  let activeSigningCalls = 0
  let maxConcurrentSigningCalls = 0
  const client = {
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(assetPath) {
            signingCalls.push(`${bucket}/${assetPath}`)
            activeSigningCalls += 1
            maxConcurrentSigningCalls = Math.max(maxConcurrentSigningCalls, activeSigningCalls)
            await new Promise((resolve) => setTimeout(resolve, 15))
            activeSigningCalls -= 1

            if (assetPath === 'fallback.svg') {
              return { data: { signedUrl: '' }, error: { message: 'Signing unavailable' } }
            }

            return {
              data: { signedUrl: `https://signed.example.test/${bucket}/${assetPath}` },
              error: null,
            }
          },
          getPublicUrl(assetPath) {
            publicUrlCalls.push(`${bucket}/${assetPath}`)
            return {
              data: {
                publicUrl: assetPath === 'fallback.svg' ? '' : `https://public.example.test/${bucket}/${assetPath}`,
              },
            }
          },
        }
      },
    },
  }

  const hydrated = await hydrateAgencyOnboardingBrandingUrls(client, {
    branding: {
      logoLightBucket: 'brand-assets',
      logoLightPath: 'shared.svg',
      logoLight: 'https://fallback.example.test/light.svg',
      logoIcon: 'https://project.example.test/storage/v1/object/public/icons/icon.svg',
      logoDarkBucket: 'brand-assets',
      logoDarkPath: 'shared.svg',
      logoDark: 'https://fallback.example.test/dark.svg',
      faviconBucket: 'brand-assets',
      faviconPath: 'fallback.svg',
      favicon: 'https://fallback.example.test/favicon.svg',
      portalIcon: 'https://project.example.test/storage/v1/object/public/icons/icon.svg',
      mobileIcon: 'https://fallback.example.test/mobile.png',
      browserTileBucket: 'brand-assets',
      browserTilePath: 'tile.svg',
      browserTile: 'https://fallback.example.test/tile.svg',
    },
  })

  assert.deepEqual(
    signingCalls.sort(),
    [
      'brand-assets/fallback.svg',
      'brand-assets/shared.svg',
      'brand-assets/tile.svg',
      'icons/icon.svg',
    ],
    'duplicate storage-backed branding assets should share one signing request',
  )
  assert.equal(
    maxConcurrentSigningCalls,
    4,
    'independent branding assets must begin signing concurrently rather than serially',
  )
  assert.deepEqual(
    publicUrlCalls,
    ['brand-assets/fallback.svg'],
    'a signing failure must retain the existing public/fallback resolution path',
  )
  assert.deepEqual(hydrated.branding, {
    logoLightBucket: 'brand-assets',
    logoLightPath: 'shared.svg',
    logoLight: 'https://signed.example.test/brand-assets/shared.svg',
    logoIcon: 'https://signed.example.test/icons/icon.svg',
    logoDarkBucket: 'brand-assets',
    logoDarkPath: 'shared.svg',
    logoDark: 'https://signed.example.test/brand-assets/shared.svg',
    faviconBucket: 'brand-assets',
    faviconPath: 'fallback.svg',
    favicon: 'https://fallback.example.test/favicon.svg',
    portalIcon: 'https://signed.example.test/icons/icon.svg',
    mobileIcon: 'https://fallback.example.test/mobile.png',
    browserTileBucket: 'brand-assets',
    browserTilePath: 'tile.svg',
    browserTile: 'https://signed.example.test/brand-assets/tile.svg',
  })

  assert.match(
    bootstrapSource,
    /const \[lightUrl, iconUrl, darkUrl, faviconUrl, portalIconUrl, mobileIconUrl, browserTileUrl\] = await Promise\.all\(/,
    'branding bootstrap must retain parallel asset hydration',
  )
  assert.match(
    bootstrapSource,
    /const storageUrlRequests = new Map\(\)/,
    'branding bootstrap must deduplicate shared storage sources',
  )
  assert.match(
    organisationContextSource,
    /nextState = await fetchAgencyOnboardingSettings\(\)/,
    'initial organisation hydration must retain the shared bootstrap cache/in-flight request',
  )

  console.log('organisation bootstrap branding Phase 4 tests passed')
} finally {
  await server.close()
}
