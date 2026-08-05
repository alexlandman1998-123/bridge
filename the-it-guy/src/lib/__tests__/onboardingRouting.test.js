import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const { isOnboardingRoute } = await server.ssrLoadModule('/src/lib/onboardingRouting.js')

try {
  assert.equal(isOnboardingRoute('/setup'), true)
  assert.equal(isOnboardingRoute('/setup/recovery'), true)
  assert.equal(isOnboardingRoute('/onboarding/profile'), true)
  assert.equal(isOnboardingRoute('/dashboard'), false)

  console.log('onboardingRouting tests passed')
} finally {
  await server.close()
}
