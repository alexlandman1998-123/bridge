import assert from 'node:assert/strict'

const { __supabaseClientTestUtils } = await import('../src/lib/supabaseClient.js')
const { createSingleFlightAuthRead, isSupabaseAuthLockRecoveryError } = __supabaseClientTestUtils

function createAuthLockAbortError() {
  const error = new Error("Lock broken by another request with the 'steal' option.")
  error.name = 'AbortError'
  return error
}

assert.equal(isSupabaseAuthLockRecoveryError(createAuthLockAbortError()), true)
assert.equal(isSupabaseAuthLockRecoveryError(new Error('Invalid login credentials')), false)

{
  let calls = 0
  const auth = {
    async getSession() {
      calls += 1
      if (calls === 1) {
        throw createAuthLockAbortError()
      }
      return { data: { session: { access_token: 'token-after-lock-recovery' } }, error: null }
    },
  }

  createSingleFlightAuthRead(auth, 'getSession')
  const [firstResult, secondResult] = await Promise.all([auth.getSession(), auth.getSession()])

  assert.equal(calls, 2, 'concurrent auth reads should share one lock-recovery retry')
  assert.equal(firstResult.data.session.access_token, 'token-after-lock-recovery')
  assert.deepEqual(secondResult, firstResult)

  const cachedResult = await auth.getSession()
  assert.equal(calls, 2, 'successful lock recovery should populate the short auth-read cache')
  assert.deepEqual(cachedResult, firstResult)
}

{
  let calls = 0
  const auth = {
    async getUser() {
      calls += 1
      if (calls === 1) {
        return { data: { user: null }, error: createAuthLockAbortError() }
      }
      return { data: { user: { id: 'user-after-lock-recovery' } }, error: null }
    },
  }

  createSingleFlightAuthRead(auth, 'getUser')
  const result = await auth.getUser()

  assert.equal(calls, 2, 'auth result errors from Supabase lock recovery should be retried')
  assert.equal(result.data.user.id, 'user-after-lock-recovery')
}

{
  let calls = 0
  const auth = {
    async getSession() {
      calls += 1
      throw new Error('Invalid refresh token')
    },
  }

  createSingleFlightAuthRead(auth, 'getSession')
  await assert.rejects(() => auth.getSession(), /Invalid refresh token/)
  assert.equal(calls, 1, 'non-lock auth errors must not be hidden by retry logic')
}

console.log('auth read lock recovery tests passed')
