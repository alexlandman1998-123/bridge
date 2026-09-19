import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /function getSellerComplianceSignaturePaneIndex\(\) \{\s*\/\/ A signer-specific link[\s\S]*?return 0\s*\}/,
  'A signer-specific link must open its only declaration pane on mobile.',
)
assert.match(
  source,
  /mobilePane=\{!signatureOnly\}[\s\S]*?mobilePaneIndex=\{signatureOnly \? null : declarationPaneIndex\}/,
  'A signer-only declaration must bypass mobile pane hiding so its signing controls always render.',
)
assert.match(
  source,
  /if \(hasRequestedComplianceSigner\) return 1/,
  'The mobile progress model must not derive signer panes from editable disclosure questions.',
)
assert.match(
  source,
  /fetchCurrentSellerOnboardingBranding\(token\)[\s\S]*?branding:\s*\{[\s\S]*?\.\.\.currentBranding/,
  'Disclosure downloads must refresh the current agency branding before rendering the official PDF.',
)

console.log('seller onboarding signer mobile-pane checks passed')
