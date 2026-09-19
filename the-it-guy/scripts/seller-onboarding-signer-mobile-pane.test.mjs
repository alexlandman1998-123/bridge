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
  /mobilePaneIndex=\{signatureOnly \? 0 : declarationPaneIndex\}/,
  'The declaration controls must render in that signer-specific pane.',
)
assert.match(
  source,
  /if \(hasRequestedComplianceSigner\) return 1/,
  'The mobile progress model must not derive signer panes from editable disclosure questions.',
)

console.log('seller onboarding signer mobile-pane checks passed')
