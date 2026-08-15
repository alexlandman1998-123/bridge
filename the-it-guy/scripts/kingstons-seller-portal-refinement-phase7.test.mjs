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

for (const key of ['SIGNED_MANDATE', 'SIGNED_DISCLOSURE_FORM', 'SIGNED_FICA_DECLARATION']) {
  assertIncludes(
    documentCentre,
    `key: SELLER_BASE_PACK_KEYS.${key}`,
    `Seller portal refinement must recognise ${key} as a Kingston Seller Pack requirement.`,
  )
}

assertIncludes(
  documentCentre,
  'function isKingstonsSellerPortalPackRequirement',
  'Seller portal must identify agent-managed Seller Pack requirements.',
)
assertIncludes(
  documentCentre,
  'function getSellerPackCompletionRouteLabel',
  'Seller portal must translate Seller Pack completion routes into seller-facing labels.',
)
assertIncludes(
  documentCentre,
  'function sellerPackFicaContextCaptured',
  'Seller portal must detect whether physical FICA declaration context was captured.',
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
  documentCentre,
  'Your agent still needs to confirm the seller context for this physical FICA declaration.',
  'Seller portal must surface missing physical FICA declaration context.',
)
assertIncludes(
  documentCentre,
  'Your seller onboarding has completed this declaration.',
  'Seller portal must identify automatic FICA declaration completion from seller onboarding.',
)
assertIncludes(
  documentCentre,
  'Signed mandate, disclosure form, and FICA declaration managed by your agent.',
  'Seller Pack tab copy must reflect the standardised base document names.',
)

assertIncludes(
  row,
  "normalized === 'seller_pack'",
  'Seller document rows must render a Seller Pack category treatment.',
)
assertIncludes(
  row,
  'function documentHasOpenableArtifact',
  'Seller document rows must only show view actions for documents with an openable artifact.',
)
assertIncludes(
  row,
  'const canOpen = Boolean(documentHasOpenableArtifact(item?.linkedDocument) && typeof onOpenDocument === \'function\')',
  'Synthetic route-completed Seller Pack rows must not show a dead view action.',
)
assertIncludes(
  row,
  'Agent managed',
  'Seller Pack rows must display an agent-managed badge.',
)
assertIncludes(
  row,
  'FICA context captured',
  'Seller Pack rows must show when physical FICA declaration context has been captured.',
)
assertIncludes(
  row,
  'FICA context needed',
  'Seller Pack rows must show when physical FICA declaration context is still missing.',
)
assertIncludes(
  row,
  'Dynamic FICA docs',
  'Seller Pack rows must remind users that supporting FICA documents remain dynamic.',
)
assertIncludes(
  row,
  'Managed by your transaction team.',
  'Locked Seller Pack rows must have a seller-facing explanation.',
)

console.log('Kingstons seller portal refinement phase 7 guard passed.')
