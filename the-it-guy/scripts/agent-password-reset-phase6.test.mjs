import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertBefore(source, earlier, later, message) {
  const earlierIndex = source.indexOf(earlier)
  const laterIndex = source.indexOf(later)
  assert.ok(earlierIndex > -1, `${message}: missing ${earlier}`)
  assert.ok(laterIndex > -1, `${message}: missing ${later}`)
  assert.ok(earlierIndex < laterIndex, message)
}

const [
  packageJsonSource,
  app,
  authPage,
  authCallback,
  resetPage,
  listingDetail,
  mobileRoutes,
  supabaseConfig,
  recoveryTemplate,
  readinessDoc,
] = await Promise.all([
  read('../package.json'),
  read('../src/App.jsx'),
  read('../src/pages/Auth.jsx'),
  read('../src/pages/AuthCallback.jsx'),
  read('../src/pages/ResetPassword.jsx'),
  read('../src/pages/AgentListingDetail.jsx'),
  read('../src/config/mobileRouteMappings.js'),
  read('../../supabase/config.toml'),
  read('../../supabase/templates/auth/recovery.html'),
  read('../docs/agent-password-reset-phase6-launch-readiness.md'),
])

const packageJson = JSON.parse(packageJsonSource)

assert.equal(
  packageJson.scripts?.['test:agent-password-reset-phase6'],
  'node scripts/agent-password-reset-phase6.test.mjs',
  'package.json should expose the Phase 6 agent reset readiness check',
)
assert.equal(
  packageJson.scripts?.['verify:agent-password-reset'],
  'npm run test:agent-password-reset-phase2 && npm run test:agent-password-reset-phase3 && npm run test:agent-password-reset-phase4 && npm run test:agent-password-reset-phase6 && npm run test:agent-password-reset-phase7 && npm run test:agent-password-reset-phase8',
  'package.json should expose the full agent reset verification chain',
)

for (const phase of [2, 3, 4, 7, 8]) {
  assert.equal(
    packageJson.scripts?.[`test:agent-password-reset-phase${phase}`],
    `node scripts/agent-password-reset-phase${phase}.test.mjs`,
    `package.json should expose Phase ${phase} agent reset checks`,
  )
}

assert.match(app, /const ResetPassword = lazy\(\(\) => import\('\.\/pages\/ResetPassword'\)\)/)
assert.match(app, /<Route path="\/auth\/callback" element=\{<AuthCallback \/>\} \/>/)
assert.match(app, /<Route path="\/auth\/reset-password" element=\{<ResetPassword \/>\} \/>/)
assertBefore(app, '<Route path="/auth/callback" element={<AuthCallback />} />', 'path="/auth"', 'Auth callback should remain registered before the generic auth route')

assert.match(authPage, /function resolvePasswordRecoveryRedirectTo\(\)/)
assert.match(authPage, /redirectUrl\.searchParams\.set\('type', 'recovery'\)/)
assert.match(authPage, /supabase\.auth\.resetPasswordForEmail\(email\.trim\(\), \{\s*redirectTo,\s*\}\)/)
assert.match(authPage, /If an Arch9 account exists for that email, a password reset link has been sent\./)
assert.match(authPage, /Password reset redirect URL is not allowed by Supabase Auth/)
assert.match(authPage, /console\.warn\('\[AUTH\] password recovery request returned a non-public error', \{/)
assert.doesNotMatch(authPage, /seller-portal-password-recovery/)

assert.match(authCallback, /function resolveCallbackType\(\{ search = '', hash = '' \} = \{\}\)/)
assert.match(authCallback, /function isPasswordRecoveryCallback/)
assert.match(authCallback, /const target = '\/auth\/reset-password'/)
assert.match(authCallback, /password_recovery_callback_restored/)
assert.match(authCallback, /clearPostLoginRedirect\(\)/)
assertBefore(
  authCallback,
  "isPasswordRecoveryCallback({ search: location.search, hash: location.hash })",
  'loadSignupIntentForUser({ user })',
  'Recovery callbacks should bypass signup and invite continuation routing',
)

assert.match(resetPage, /const MIN_PASSWORD_LENGTH = 8/)
assert.match(resetPage, /resolveAgentPasswordRecoverySession\(supabase\.auth\)/)
assert.match(resetPage, /const nextPassword = password/)
assert.doesNotMatch(resetPage, /const nextPassword = password\.trim\(\)/)
assert.match(resetPage, /validateAgentResetPassword\(\{[\s\S]*password: nextPassword,[\s\S]*confirmPassword,[\s\S]*\}\)/)
assert.match(resetPage, /updateAgentPasswordWithRecoverySession\(supabase\.auth, nextPassword\)/)
assert.match(resetPage, /This password reset link is invalid or has expired\. Request a new reset link\./)
assert.match(resetPage, /setMessage\('Password updated\.'\)/)
assert.match(resetPage, /agent_password_reset_completed/)
assert.match(resetPage, /navigate\('\/dashboard', \{ replace: true \}\)/)
assert.match(resetPage, /clearSupabaseLocalAuthState\(\)/)
assert.match(resetPage, /console\.warn\('\[AUTH\] password reset update failed', \{/)
assert.doesNotMatch(resetPage, /seller-portal-password-recovery|resetSellerPortalPassword/)

assert.match(mobileRoutes, /pathname\.startsWith\('\/auth'\)/, 'Mobile route guard should treat auth reset routes as public')

assert.match(supabaseConfig, /site_url = "https:\/\/app\.arch9\.co\.za"/)
assert.match(supabaseConfig, /"https:\/\/app\.arch9\.co\.za\/auth\/callback"/)
for (const origin of ['localhost', '127.0.0.1']) {
  for (const port of ['5173', '5175', '5177']) {
    assert.match(
      supabaseConfig,
      new RegExp(`"http://${origin}:${port}/auth/callback"`),
      `Supabase config should allow ${origin}:${port} auth callbacks`,
    )
  }
}
assert.match(supabaseConfig, /content_path = "\.\/supabase\/templates\/auth\/recovery\.html"/)
assert.match(recoveryTemplate, /Reset your password/)
assert.match(recoveryTemplate, /Arch9 password/)
assert.match(recoveryTemplate, /\{\{ \.ConfirmationURL \}\}/)

assert.match(readinessDoc, /npm run verify:agent-password-reset/)
assert.match(readinessDoc, /\/auth\/callback\?type=recovery/)
assert.match(readinessDoc, /\/auth\/reset-password/)
assert.match(readinessDoc, /Seller portal password recovery remains listing-scoped and separate\./)

assert.match(listingDetail, /resetSellerPortalPassword/)

console.log('Agent password reset Phase 6 launch-readiness checks passed.')
