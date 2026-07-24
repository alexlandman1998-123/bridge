import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const resetPage = await readFile(new URL('../src/pages/ResetPassword.jsx', import.meta.url), 'utf8')
const authCallback = await readFile(new URL('../src/pages/AuthCallback.jsx', import.meta.url), 'utf8')
const listingDetail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

assert.match(app, /const ResetPassword = lazy\(\(\) => import\('\.\/pages\/ResetPassword'\)\)/, 'App should lazy-load the agent reset password page')
assert.match(app, /<Route path="\/auth\/reset-password" element=\{<ResetPassword \/>\} \/>/, 'App should expose the agent reset password route')
assert.match(authCallback, /const target = '\/auth\/reset-password'[\s\S]*navigate\(target, \{ replace: true \}\)/, 'Recovery callbacks should land on the reset password route')

assert.match(resetPage, /const MIN_PASSWORD_LENGTH = 8/, 'Reset page should require passwords to be at least 8 characters')
assert.match(resetPage, /resolveAgentPasswordRecoverySession\(supabase\.auth\)/, 'Reset page should verify the recovery session before accepting a new password')
assert.match(resetPage, /updateAgentPasswordWithRecoverySession\(supabase\.auth, nextPassword\)/, 'Reset page should update the Supabase user password')
assert.match(resetPage, /Password must be at least \$\{MIN_PASSWORD_LENGTH\} characters\./, 'Reset page should validate password length before calling Supabase')
assert.match(resetPage, /Passwords do not match\./, 'Reset page should require confirmation to match')
assert.match(resetPage, /This password reset link is invalid or has expired\. Request a new reset link\./, 'Reset page should handle missing or expired recovery sessions')
assert.match(resetPage, /setMessage\('Password updated\.'\)/, 'Reset page should show a success message after update')
assert.match(resetPage, /navigate\('\/dashboard', \{ replace: true \}\)/, 'Reset page should continue to the app dashboard after success')
assert.match(resetPage, /agent_password_reset_completed/, 'Reset page should audit completed agent password resets')
assert.match(resetPage, /clearSupabaseLocalAuthState\(\)/, 'Reset page should offer a clean return to sign-in for invalid links')
assert.doesNotMatch(resetPage, /seller-portal-password-recovery|resetSellerPortalPassword/, 'Agent reset page must not call seller portal reset paths')
assert.match(listingDetail, /resetSellerPortalPassword/, 'Listing password reset remains seller-portal scoped and separate')

console.log('Agent password reset Phase 4 checks passed.')
