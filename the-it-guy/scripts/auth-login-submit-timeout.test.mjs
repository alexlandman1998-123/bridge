#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Auth.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /const AUTH_REQUEST_TIMEOUT_MS = 15000/,
  'auth form requests should use a bounded timeout so the submit button cannot hang forever',
)

assert.match(
  source,
  /const FOUNDER_LOGIN_TARGET_TIMEOUT_MS = 3000/,
  'post-login founder routing should have a short timeout and must not block successful login navigation',
)

assert.match(
  source,
  /function buildAuthRequestTimeoutError[\s\S]*?error\.code = 'AUTH_REQUEST_TIMEOUT'/,
  'auth form timeouts should expose a stable support error code',
)

assert.match(
  source,
  /withAuthRequestTimeout\(\s*supabase\.auth\.signInWithPassword\(/,
  'password login should be wrapped with the auth request timeout',
)

assert.match(
  source,
  /const target = pendingInvitePath \|\| await resolveFounderLoginTargetSafely\(redirectTo\)/,
  'post-login founder routing should fail open through the safe timeout wrapper',
)

assert.match(
  source,
  /withAuthRequestTimeout\(\s*supabase\.auth\.resetPasswordForEmail\(/,
  'password reset requests should also release the submit button on network stalls',
)

assert.match(
  source,
  /withAuthRequestTimeout\(\s*supabase\.auth\.signUp\(/,
  'signup requests should also release the submit button on network stalls',
)

assert.match(
  source,
  /withAuthRequestTimeout\(\s*supabase\.auth\.resend\(/,
  'verification resend requests should also release the submit button on network stalls',
)

console.log('auth login submit timeout contract ok')
