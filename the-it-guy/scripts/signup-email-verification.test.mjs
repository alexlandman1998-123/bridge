import assert from 'node:assert/strict'
import { readPendingSignupVerification, rememberSignupVerification, clearPendingSignupVerification } from '../src/lib/signupVerification.js'

const originalWindow = globalThis.window
const entries = new Map()
globalThis.window = { sessionStorage: {
  getItem: (key) => entries.get(key) || null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
} }

try {
  assert.equal(readPendingSignupVerification(), null)
  rememberSignupVerification(' Alex@Example.com ', '/setup')
  const pending = readPendingSignupVerification()
  assert.equal(pending.email, 'alex@example.com')
  assert.equal(pending.nextPath, '/setup')
  assert.deepEqual(Object.keys(pending).sort(), ['email', 'nextPath', 'requestedAt'])

  for (const unsafePath of ['//example.com', 'https://example.com', undefined]) {
    rememberSignupVerification('alex@example.com', unsafePath)
    assert.equal(readPendingSignupVerification().nextPath, '/setup')
  }
  const key = [...entries.keys()][0]
  entries.set(key, JSON.stringify({ email: 'alex@example.com', requestedAt: Date.now() - 3_600_001 }))
  assert.equal(readPendingSignupVerification(), null, 'expired signup attempts must not reopen verification')
  for (const corrupt of ['invalid-json', '{}', '{"email":"alex@example.com"}']) {
    entries.set(key, corrupt)
    assert.equal(readPendingSignupVerification(), null)
  }
  clearPendingSignupVerification()
  assert.equal(entries.size, 0)
  window.sessionStorage.getItem = () => { throw new Error('Storage unavailable') }
  assert.equal(readPendingSignupVerification(), null)
  window.sessionStorage.setItem = () => { throw new Error('Storage unavailable') }
  assert.equal(rememberSignupVerification('alex@example.com', '/setup').email, 'alex@example.com')
  console.log('signup verification state tests passed')
} finally {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
}
