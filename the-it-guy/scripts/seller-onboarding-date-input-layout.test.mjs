import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)

const sellerOnboardingPage = await readFile(new URL('src/pages/SellerOnboarding.jsx', appRoot), 'utf8')
const appStyles = await readFile(new URL('src/index.css', appRoot), 'utf8')

assert.match(
  sellerOnboardingPage,
  /const DATE_INPUT_CLASS = `\$\{DETAIL_INPUT_CLASS\} seller-date-input/,
  'seller onboarding date inputs should use the shared mobile-safe date input class',
)

for (const label of ['Date', 'Mandate start date', 'Mandate end date', 'Lease Expiry Date']) {
  assert.match(
    sellerOnboardingPage,
    new RegExp(`<label className="grid min-w-0 gap-2 text-sm font-medium text-\\[#2a4057\\]">\\s*${label}\\s*<input className=\\{DATE_INPUT_CLASS\\} type="date"`),
    `${label} date wrapper should allow the native date input to shrink on mobile`,
  )
}

assert.match(
  appStyles,
  /\.seller-onboarding-main \.seller-date-input,[\s\S]*?inline-size: 100%;[\s\S]*?max-inline-size: 100%;[\s\S]*?min-inline-size: 0;[\s\S]*?-webkit-appearance: none;/,
  'active app CSS should constrain native seller onboarding date inputs inside mobile containers',
)

assert.match(
  appStyles,
  /\.seller-onboarding-main \.seller-date-input::-webkit-date-and-time-value,[\s\S]*?min-inline-size: 0;[\s\S]*?overflow: hidden;[\s\S]*?width: 100%;/,
  'active app CSS should constrain WebKit date text inside mobile date inputs',
)

console.log('seller onboarding date input layout verified')
