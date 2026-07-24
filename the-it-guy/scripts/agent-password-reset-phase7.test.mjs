import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

const [packageJsonSource, smokeSource, phase6Source, readinessDoc] = await Promise.all([
  read('../package.json'),
  read('./agent-password-reset-phase7-browser-smoke.mjs'),
  read('./agent-password-reset-phase6.test.mjs'),
  read('../docs/agent-password-reset-phase6-launch-readiness.md'),
])
const packageJson = JSON.parse(packageJsonSource)

assert.equal(
  packageJson.scripts?.['test:agent-password-reset-phase7'],
  'node scripts/agent-password-reset-phase7.test.mjs',
  'package.json should expose the Phase 7 browser smoke contract check',
)
assert.equal(
  packageJson.scripts?.['smoke:agent-password-reset:browser'],
  'node scripts/agent-password-reset-phase7-browser-smoke.mjs',
  'package.json should expose the executable agent reset browser smoke',
)
assert.match(
  packageJson.scripts?.['verify:agent-password-reset'] || '',
  /test:agent-password-reset-phase7/,
  'The full agent reset verification chain should include the Phase 7 contract check',
)

assert.match(smokeSource, /import \{ chromium \} from 'playwright'/, 'Phase 7 smoke should use Playwright')
assert.match(smokeSource, /import \{ createServer \} from 'vite'/, 'Phase 7 smoke should start or target a Vite app')
assert.match(smokeSource, /AGENT_PASSWORD_RESET_BASE_URL/, 'Phase 7 smoke should allow running against an existing deployed or local base URL')
assert.match(smokeSource, /FAKE_SUPABASE_URL/, 'Phase 7 smoke should avoid relying on production Supabase for local rendering')
assert.match(smokeSource, /\/auth`/, 'Phase 7 smoke should open the agent auth route')
assert.match(smokeSource, /Forgot your password\?/, 'Phase 7 smoke should exercise the forgot-password entry point')
assert.match(smokeSource, /Send reset link/, 'Phase 7 smoke should verify the reset email request action is visible')
assert.match(smokeSource, /\/auth\/reset-password/, 'Phase 7 smoke should open the reset-password route')
assert.match(smokeSource, /This password reset link is invalid or has expired\|Password reset is not available in this environment/, 'Phase 7 smoke should verify invalid-link copy')
assert.match(smokeSource, /Return to sign in/, 'Phase 7 smoke should verify invalid-link recovery action')
assert.match(smokeSource, /input:disabled/, 'Phase 7 smoke should verify password inputs are disabled without a recovery session')
assert.match(smokeSource, /mutatedData:\s*false/, 'Phase 7 smoke should explicitly report itself as non-mutating')
assert.doesNotMatch(smokeSource, /resetPasswordForEmail\(|updateUser\(\{ password|\.insert\(|\.update\(|\.upsert\(|\.delete\(/, 'Phase 7 smoke must not mutate auth or application data')

assert.match(phase6Source, /test:agent-password-reset-phase7/, 'Phase 6 readiness should know the Phase 7 contract is part of the chain')
assert.match(readinessDoc, /smoke:agent-password-reset:browser/, 'Launch readiness doc should mention the browser smoke command')

console.log('Agent password reset Phase 7 browser smoke contract passed.')
