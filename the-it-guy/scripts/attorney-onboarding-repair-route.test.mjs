import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

assert.match(
  appSource,
  /function isAttorneyFirmRepairPath\(pathname = '', search = ''\)[\s\S]*pathname !== '\/attorney\/onboarding'[\s\S]*new URLSearchParams\(search \|\| ''\)\.get\('repair'\) === 'firm'/,
  'App auth gate should recognize the attorney firm repair route.',
)

assert.match(
  appSource,
  /const isAttorneyFirmRepairRoute = isAttorneyFirmRepairPath\(location\.pathname, location\.search\)/,
  'AuthGate should evaluate the current route search params before onboarding redirects.',
)

assert.match(
  appSource,
  /if \(onAnyOnboardingRoute && onboardingCompleted && !isAttorneyFirmRepairRoute\)/,
  'Completed onboarding should still redirect from normal onboarding, but not from repair=firm.',
)

console.log('Attorney onboarding repair route guard checks passed.')
