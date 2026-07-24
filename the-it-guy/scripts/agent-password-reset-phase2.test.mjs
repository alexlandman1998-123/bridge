import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const authPage = await readFile(new URL('../src/pages/Auth.jsx', import.meta.url), 'utf8')
const listingDetail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

assert.match(authPage, /mode === 'forgot_password'/, 'Auth should expose a forgot-password request mode')
assert.match(authPage, /supabase\.auth\.resetPasswordForEmail/, 'Auth should request Supabase password recovery emails')
assert.match(authPage, /redirectUrl\.searchParams\.set\('type', 'recovery'\)/, 'Recovery email redirects should be marked as recovery callbacks')
assert.match(authPage, /\/auth\/callback/, 'Recovery email should land on the existing auth callback route first')
assert.match(authPage, /If an Arch9 account exists for that email, a password reset link has been sent\./, 'Password reset request should use neutral account-enumeration-safe copy')
assert.match(authPage, /Forgot your password\?/, 'Login UI should expose a forgot-password action')
assert.match(authPage, /Send reset link/, 'Forgot-password mode should have a clear submit action')
assert.doesNotMatch(authPage, /seller-portal-password-recovery/, 'Agent password reset must not use seller portal recovery')
assert.match(listingDetail, /resetSellerPortalPassword/, 'Listing password reset remains seller-portal scoped and separate')

console.log('Agent password reset Phase 2 checks passed.')
