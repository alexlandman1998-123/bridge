import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const authCallback = await readFile(new URL('../src/pages/AuthCallback.jsx', import.meta.url), 'utf8')

assert.match(authCallback, /function resolveCallbackType\(\{ search = '', hash = '' \} = \{\}\)/, 'Auth callback should resolve callback type from URL state')
assert.match(authCallback, /new URLSearchParams\(search\)\.get\('type'\)/, 'Auth callback should detect recovery type from query params')
assert.match(authCallback, /new URLSearchParams\(hashText\)\.get\('type'\)/, 'Auth callback should detect recovery type from hash params')
assert.match(authCallback, /function isPasswordRecoveryCallback/, 'Auth callback should expose a recovery callback guard')
assert.match(authCallback, /resolveCallbackType\(\{ search, hash \}\)\.toLowerCase\(\) === 'recovery'/, 'Recovery callback guard should match Supabase recovery links')
assert.match(authCallback, /const target = '\/auth\/reset-password'[\s\S]*password_recovery_callback_restored[\s\S]*navigate\(target, \{ replace: true \}\)/, 'Recovery callbacks should route to the reset-password screen')

const recoveryBranchIndex = authCallback.indexOf("isPasswordRecoveryCallback({ search: location.search, hash: location.hash })")
const getUserIndex = authCallback.indexOf('supabase.auth.getUser()')
const signupIntentIndex = authCallback.indexOf('loadSignupIntentForUser({ user })')
assert.ok(recoveryBranchIndex > -1, 'Recovery branch should be present')
assert.ok(getUserIndex > recoveryBranchIndex, 'Recovery branch should run before loading the user for onboarding')
assert.ok(signupIntentIndex > recoveryBranchIndex, 'Recovery branch should run before signup intent routing')

assert.match(authCallback, /rememberPendingPartnerInvitePath\(callbackInvitePath\)/, 'Normal partner invite callback preservation should remain intact')
assert.match(authCallback, /partnerInviteSignupPath \|\| callbackInvitePath/, 'Normal callback target resolution should remain intact')

console.log('Agent password reset Phase 3 checks passed.')
