import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const browser = await readFile(new URL('./workspace-branding-browser-staging-smoke.mjs', import.meta.url), 'utf8')
const certification = await readFile(new URL('./workspace-branding-release-certification.mjs', import.meta.url), 'utf8')
const authStateCreator = await readFile(new URL('./create-staging-internal-auth-state.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.match(browser, /STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'/)
assert.match(browser, /storageState: AUTH_STATE_PATH/)
assert.match(browser, /\.ui-sidebar-brand-logo/)
assert.match(browser, /\.ui-sidebar-brand-mark/)
assert.match(browser, /spa-navigation/)
assert.match(browser, /reload-\$\{index\}/)
assert.match(browser, /fallbackAfterLoaded/)
assert.match(browser, /mutatedData: false/)
assert.doesNotMatch(browser, /createClient/)
for (const forbidden of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/]) {
  assert.doesNotMatch(browser, forbidden)
  assert.doesNotMatch(certification, forbidden)
}

assert.match(certification, /workspace-branding-integrity-audit\.mjs/)
assert.match(certification, /workspace_branding_image_failed/)
assert.match(certification, /workspace-branding-browser-staging-smoke\.mjs/)
assert.match(certification, /status: audit\.code === 0 && telemetry\.ok && browser\.code === 0 \? 'GO' : 'NO_GO'/)
assert.match(certification, /mutatedData: false/)
assert.match(authStateCreator, /getByLabel\(\/\^password\$\/i\)/)
assert.match(authStateCreator, /\^\(sign in\|sign in securely\|launch workspace\)\$/)
assert.match(authStateCreator, /actorEmailPrinted: false/)
assert.doesNotMatch(authStateCreator, /\n\s*email,\n/)

assert.equal(packageJson.scripts['test:workspace-branding-release-phase8'], 'node scripts/workspace-branding-release-phase8.test.mjs')
assert.equal(packageJson.scripts['verify:workspace-branding-browser:staging'], 'node --env-file=.env --env-file=.env.staging.local scripts/workspace-branding-browser-staging-smoke.mjs')
assert.equal(packageJson.scripts['verify:workspace-branding-release:staging'], 'node --env-file=.env --env-file=.env.staging.local scripts/workspace-branding-release-certification.mjs')

console.log('workspace branding release Phase 8 tests passed')
