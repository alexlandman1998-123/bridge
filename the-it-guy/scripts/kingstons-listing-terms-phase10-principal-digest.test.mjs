import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPage = await readFile('src/pages/agency/AgencyPipelinePage.jsx', 'utf8')

assert.match(
  agencyPage,
  /function buildKingstonsPrincipalExceptionDigest/,
  'Phase 10 should add a reusable principal digest builder.',
)

assert.match(
  agencyPage,
  /Kingstons Seller Workflow Digest/,
  'Phase 10 digest copy should identify the Kingstons seller workflow clearly.',
)

assert.match(
  agencyPage,
  /Transfer-attorney allocations checked/,
  'Phase 10 digest should include allocation verification evidence from Phase 8.',
)

assert.match(
  agencyPage,
  /Top \$\{Math\.min\(rows\.length, maxRows\)\} exceptions/,
  'Phase 10 digest should summarize the highest priority exception rows.',
)

assert.match(
  agencyPage,
  /function copyKingstonsPrincipalExceptionDigest/,
  'Phase 10 should add a clipboard copy helper for the digest draft.',
)

assert.match(
  agencyPage,
  /onCopyDigest=\{handleCopyKingstonsPrincipalExceptionDigest\}/,
  'Phase 10 should wire the digest copy action into the principal report card.',
)

assert.match(
  agencyPage,
  /Copy Digest/,
  'Phase 10 should expose a visible Copy Digest action for principals.',
)

assert.match(
  agencyPage,
  /Wait for transfer-attorney allocation verification/,
  'Phase 10 should block digest copying while allocation verification is still loading.',
)

console.log('Kingstons listing terms Phase 10 principal digest checks passed.')
