import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'

process.env.VITE_SUPABASE_URL = 'https://agent-password-reset-phase8.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.phase8'
process.env.VITE_SUPABASE_KEY = ''

const [packageJsonSource, resetPageSource, readinessDoc] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/ResetPassword.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../docs/agent-password-reset-phase6-launch-readiness.md', import.meta.url), 'utf8'),
])
const packageJson = JSON.parse(packageJsonSource)

assert.equal(
  packageJson.scripts?.['test:agent-password-reset-phase8'],
  'node scripts/agent-password-reset-phase8.test.mjs',
  'package.json should expose the Phase 8 successful reset state-machine check',
)
assert.match(
  packageJson.scripts?.['verify:agent-password-reset'] || '',
  /test:agent-password-reset-phase8/,
  'The full agent reset verification chain should include Phase 8',
)

assert.match(resetPageSource, /export function validateAgentResetPassword/, 'Reset page should export validation for successful reset testing')
assert.match(resetPageSource, /export async function resolveAgentPasswordRecoverySession/, 'Reset page should export recovery session resolution')
assert.match(resetPageSource, /export async function updateAgentPasswordWithRecoverySession/, 'Reset page should export successful password update helper')
assert.match(resetPageSource, /const nextPassword = password/, 'Reset page should preserve exact password text')
assert.doesNotMatch(resetPageSource, /const nextPassword = password\.trim\(\)/, 'Reset page should not trim user passwords')
assert.match(readinessDoc, /test:agent-password-reset-phase8/, 'Launch readiness doc should mention the Phase 8 success-path check')

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const {
    INVALID_RECOVERY_SESSION_MESSAGE,
    MIN_PASSWORD_LENGTH,
    getRecoverySessionError,
    resolveAgentPasswordRecoverySession,
    updateAgentPasswordWithRecoverySession,
    validateAgentResetPassword,
  } = await server.ssrLoadModule('/src/pages/ResetPassword.jsx')

  assert.equal(MIN_PASSWORD_LENGTH, 8)
  assert.equal(validateAgentResetPassword({ password: '1234567', confirmPassword: '1234567' }), 'Password must be at least 8 characters.')
  assert.equal(validateAgentResetPassword({ password: 'long-enough', confirmPassword: 'different' }), 'Passwords do not match.')
  assert.equal(validateAgentResetPassword({ password: '  exact password  ', confirmPassword: '  exact password  ' }), '')

  const missingSession = await resolveAgentPasswordRecoverySession({
    getSession: async () => ({ data: { session: null }, error: null }),
  })
  assert.deepEqual(missingSession, {
    hasSession: false,
    error: INVALID_RECOVERY_SESSION_MESSAGE,
  })

  const activeSession = await resolveAgentPasswordRecoverySession({
    getSession: async () => ({ data: { session: { user: { id: 'agent-user-1' } } }, error: null }),
  })
  assert.deepEqual(activeSession, {
    hasSession: true,
    error: '',
  })

  const expiredSession = await resolveAgentPasswordRecoverySession({
    getSession: async () => ({ data: null, error: new Error('Auth session expired') }),
  })
  assert.equal(expiredSession.hasSession, false)
  assert.equal(expiredSession.error, INVALID_RECOVERY_SESSION_MESSAGE)
  assert.ok(expiredSession.cause instanceof Error)

  const updateCalls = []
  const exactPassword = '  phase8 exact password  '
  const user = await updateAgentPasswordWithRecoverySession({
    updateUser: async (payload) => {
      updateCalls.push(payload)
      return { data: { user: { id: 'agent-user-2' } }, error: null }
    },
  }, exactPassword)
  assert.deepEqual(updateCalls, [{ password: exactPassword }])
  assert.equal(user.id, 'agent-user-2')

  await assert.rejects(
    () => updateAgentPasswordWithRecoverySession({
      updateUser: async () => ({ data: null, error: new Error('Password should be different from the old password') }),
    }, 'new-password'),
    /different from the old password/,
  )

  assert.equal(getRecoverySessionError(new Error('invalid refresh token')), INVALID_RECOVERY_SESSION_MESSAGE)
  assert.equal(getRecoverySessionError(new Error('Password should be different from the old password')), 'Password should be different from the old password')
} finally {
  await server.close()
}

console.log('Agent password reset Phase 8 successful reset state-machine checks passed.')
