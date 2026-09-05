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
  const {
    hydrateAgencyOnboardingBrandingUrls,
    resolveBrandingAssetSource,
  } = __organisationBootstrapApiTestUtils

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
    ],
    'only assets without a public URL should be signed',
  )
  assert.equal(
    maxConcurrentSigningCalls,
    1,
    'a single non-public asset should have one in-flight signing request',
  )
  assert.deepEqual(
    publicUrlCalls,
    [
      'brand-assets/shared.svg',
      'icons/icon.svg',
      'brand-assets/fallback.svg',
      'brand-assets/tile.svg',
    ],
    'every storage-backed asset should prefer its public URL before falling back to signing',
  )
  assert.deepEqual(hydrated.branding, {
    logoLightBucket: 'brand-assets',
    logoLightPath: 'shared.svg',
    logoLight: 'https://public.example.test/brand-assets/shared.svg',
    logoIcon: 'https://public.example.test/icons/icon.svg',
    logoDarkBucket: 'brand-assets',
    logoDarkPath: 'shared.svg',
    logoDark: 'https://public.example.test/brand-assets/shared.svg',
    faviconBucket: 'brand-assets',
    faviconPath: 'fallback.svg',
    favicon: 'https://fallback.example.test/favicon.svg',
    portalIcon: 'https://public.example.test/icons/icon.svg',
    mobileIcon: 'https://fallback.example.test/mobile.png',
    browserTileBucket: 'brand-assets',
    browserTilePath: 'tile.svg',
    browserTile: 'https://public.example.test/brand-assets/tile.svg',
  })

  const signedSource = resolveBrandingAssetSource({
    fallbackUrl: 'https://project.example.test/storage/v1/object/sign/private-brand/logo.svg?token=old-token',
  })
  assert.deepEqual(signedSource, {
    bucket: 'private-brand',
    path: 'logo.svg',
    fallbackUrl: 'https://project.example.test/storage/v1/object/sign/private-brand/logo.svg?token=old-token',
    preferSignedUrl: true,
  })

  const signedPublicUrlCalls = []
  const signedUrlCalls = []
  const signedHydrated = await hydrateAgencyOnboardingBrandingUrls({
    storage: {
      from(bucket) {
        return {
          getPublicUrl(path) {
            signedPublicUrlCalls.push(`${bucket}/${path}`)
            return { data: { publicUrl: `https://public.example.test/${bucket}/${path}` } }
          },
          async createSignedUrl(path) {
            signedUrlCalls.push(`${bucket}/${path}`)
            return { data: { signedUrl: `https://signed.example.test/${bucket}/${path}` }, error: null }
          },
        }
      },
    },
  }, {
    branding: {
      logoLight: 'https://project.example.test/storage/v1/object/sign/private-brand/logo.svg?token=old-token',
    },
  })
  assert.deepEqual(signedPublicUrlCalls, [], 'a previously signed private URL must not be downgraded to a public URL')
  assert.deepEqual(signedUrlCalls, ['private-brand/logo.svg'])
  assert.equal(signedHydrated.branding.logoLight, 'https://signed.example.test/private-brand/logo.svg')

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
