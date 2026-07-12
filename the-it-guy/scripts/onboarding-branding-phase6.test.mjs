import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  smoke: await readFile(new URL('./onboarding-branding-browser-smoke.mjs', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  'ONBOARDING_BRANDING_BASE_URL',
  'ONBOARDING_BRANDING_SCREENSHOT_DIR',
  'buyer-desktop',
  'buyer-mobile',
  'seller-desktop',
  'seller-mobile',
  'Start buyer onboarding',
  'Start seller onboarding',
  '--landing-primary',
  '--landing-secondary',
  '--landing-accent',
  'onboarding-branding-${target.name}.png',
]) {
  assert(files.smoke.includes(token), `browser smoke should include ${token}`)
}

assert.match(files.packageJson, /"test:onboarding-branding-phase6": "node scripts\/onboarding-branding-phase6\.test\.mjs"/)
assert.match(files.packageJson, /"test:onboarding-branding-browser-smoke": "node scripts\/onboarding-branding-browser-smoke\.mjs"/)

console.log('Onboarding branding phase 6 contract passed.')
