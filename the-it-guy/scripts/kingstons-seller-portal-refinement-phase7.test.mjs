import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const documentCentrePath = path.join(repoRoot, 'src/components/client-portal/documents/ClientDocumentCentre.jsx')
const rowPath = path.join(repoRoot, 'src/components/client-portal/documents/SellerDocumentRow.jsx')
const documentCentre = fs.readFileSync(documentCentrePath, 'utf8')
const row = fs.readFileSync(rowPath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

assertIncludes(
  documentCentre,
  'const KINGSTONS_SELLER_PORTAL_PACK_REQUIREMENTS = Object.freeze',
  'Seller portal must define the Kingston Seller Pack requirement set.',
)

for (const key of ['signed_mandate', 'property_condition_disclosure', 'signed_fica_form']) {
  assertIncludes(
    documentCentre,
    `key: '${key}'`,
    `Seller portal refinement must recognise ${key} as a Kingston Seller Pack requirement.`,
  )
}

assertIncludes(
  documentCentre,
  'function isKingstonsSellerPortalPackRequirement',
  'Seller portal must identify agent-managed Seller Pack requirements.',
)
assert.equal(
  documentCentre.includes('alias.includes(signal)'),
  false,
  'Seller Pack matching must not swallow ordinary seller FICA requirements through broad reverse alias matching.',
)
assertIncludes(
  documentCentre,
  'const sellerPortalRequiredItems = isSelling',
  'Seller portal must build a seller-facing required item list separate from the Seller Pack.',
)
assertIncludes(
  documentCentre,
  'sections.allRequired.filter((item) => !isKingstonsSellerPortalPackRequirement(item))',
  'Seller Pack rows must be excluded from seller upload progress and still-needed counts.',
)
assertIncludes(
  documentCentre,
  'requirements: uniqueById([...sellerPortalRequiredItems, ...sections.additionalRequests])',
  'Seller document experience must not count agent-managed Seller Pack forms as seller action items.',
)
assertIncludes(
  documentCentre,
  "key: 'seller_pack'",
  'Seller portal must expose a dedicated Signed Seller Pack tab.',
)
assertIncludes(
  documentCentre,
  "title: 'Signed Seller Pack'",
  'Seller portal must label the Kingston physical pack clearly.',
)
assertIncludes(
  documentCentre,
  'uploadSpec: null',
  'Seller Pack rows must not expose seller upload actions.',
)
assertIncludes(
  documentCentre,
  'lockedByTeam: true',
  'Seller Pack rows must be marked as team-managed.',
)
assertIncludes(
  documentCentre,
  'Your agent manages this signed Seller Pack document outside the seller portal.',
  'Seller portal must explain why sellers cannot upload missing Seller Pack documents.',
)

assertIncludes(
  row,
  "normalized === 'seller_pack'",
  'Seller document rows must render a Seller Pack category treatment.',
)
assertIncludes(
  row,
  'Agent managed',
  'Seller Pack rows must display an agent-managed badge.',
)
assertIncludes(
  row,
  'Managed by your transaction team.',
  'Locked Seller Pack rows must have a seller-facing explanation.',
)

console.log('Kingstons seller portal refinement phase 7 guard passed.')
