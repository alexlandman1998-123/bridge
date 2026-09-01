import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const bundleDir = await mkdtemp(path.join(tmpdir(), 'client-portal-canonical-document-request-phase5-'))
const entryPath = path.join(bundleDir, 'entry.mjs')
const bundlePath = path.join(bundleDir, 'bundle.mjs')
const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')
const apiPath = path.join(process.cwd(), 'src/lib/api.js')
const apiSource = await readFile(apiPath, 'utf8')

await writeFile(
  entryPath,
  `export { buildDocumentCenter } from ${JSON.stringify(servicePath)}\n`,
)

await build({
  entryPoints: [entryPath],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  define: {
    'import.meta.env': '{}',
  },
  logLevel: 'silent',
})

const { buildDocumentCenter } = await import(pathToFileURL(bundlePath).href)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function keySet(items = []) {
  return new Set(items.map((item) => item.key || item.sourceId).filter(Boolean))
}

function assertIncludes(keys, expected, label) {
  for (const key of expected) {
    assert.equal(keys.has(key), true, `${label}: expected ${key}`)
  }
}

function assertExcludes(keys, excluded, label) {
  for (const key of excluded) {
    assert.equal(keys.has(key), false, `${label}: did not expect ${key}`)
  }
}

const portalData = {
  transaction: {
    id: 'transaction-phase5',
    purchaser_type: 'trust',
    finance_type: 'hybrid',
  },
  canonicalDocumentRequestScenario: {
    buyerEntityType: 'trust',
    sellerEntityType: 'company',
    financeType: 'hybrid',
    sellerHasExistingBond: true,
    propertyType: 'sectional_title',
    gasInstallation: true,
  },
  requiredDocuments: [
    {
      key: 'legacy_trust_deed',
      label: 'Trust Deed',
      expectedFromRole: 'buyer',
      status: 'required',
      canonicalDocumentRequestKey: 'buyer_trust_deed',
    },
  ],
  documents: [],
  additionalDocumentRequests: [],
}

test('buying document centre overlays buyer canonical document requests', () => {
  const model = buildDocumentCenter(portalData, 'buying')
  const keys = keySet(model.requiredDocuments)
  const itemKeys = keySet(model.items)

  assertIncludes(keys, ['legacy_trust_deed', 'buyer_letters_of_authority', 'buyer_trustee_resolution', 'bond_approval', 'grant_signed'], 'buyer requirements')
  assertExcludes(keys, ['buyer_trust_deed', 'seller_company_registration', 'bond_statement', 'bond_cancellation_figures'], 'buyer requirements')
  assertIncludes(itemKeys, ['legacy_trust_deed', 'buyer_letters_of_authority', 'bond_approval'], 'buyer items')
  assert.equal(model.canonicalDocumentRequestPlan.audience, 'buyer')
  assert.equal(model.requiredDocuments.filter((item) => item.canonicalDocumentRequestKey === 'buyer_trust_deed').length, 1)
})

test('selling document centre overlays seller canonical document requests', () => {
  const model = buildDocumentCenter(portalData, 'selling')
  const keys = keySet(model.requiredDocuments)
  const companyRegistrationItem = model.items.find((item) => item.sourceId === 'seller_company_registration')

  assertIncludes(
    keys,
    ['seller_company_registration', 'seller_company_resolution', 'seller_director_fica', 'bond_statement', 'levy_statement', 'gas_compliance_certificate'],
    'seller requirements',
  )
  assertExcludes(keys, ['buyer_letters_of_authority', 'bond_approval', 'bond_cancellation_figures'], 'seller requirements')
  assert.equal(model.canonicalDocumentRequestPlan.audience, 'seller')
  assert.equal(companyRegistrationItem?.canonicalDocumentRequestKey, 'seller_company_registration')
})

test('shared document centre can show buyer and seller client-visible canonical requests', () => {
  const model = buildDocumentCenter(portalData, 'shared')
  const keys = keySet(model.requiredDocuments)

  assertIncludes(keys, ['buyer_letters_of_authority', 'seller_company_registration', 'bond_approval', 'bond_statement'], 'shared requirements')
  assertExcludes(keys, ['bond_cancellation_figures'], 'shared requirements')
  assert.equal(model.canonicalDocumentRequestPlan.audience, 'client')
})

test('canonical overlay is not added for generic document centre payloads without transaction context', () => {
  const model = buildDocumentCenter({
    requiredDocuments: [],
    documents: [],
    additionalDocumentRequests: [],
  }, 'buying')

  assert.equal(model.canonicalDocumentRequestPlan, null)
  assert.equal(model.requiredDocuments.length, 0)
})

test('buyer-only transaction context does not fabricate seller canonical requests', () => {
  const portalData = {
    transaction: {
      id: 'transaction-buyer-only',
      purchaser_type: 'trust',
      finance_type: 'cash',
    },
    requiredDocuments: [],
    documents: [],
    additionalDocumentRequests: [],
  }
  const model = buildDocumentCenter(portalData, 'shared')
  const sellingModel = buildDocumentCenter({
    ...portalData,
    canonicalDocumentRequestScenario: {
      buyerEntityType: 'trust',
      financeType: 'cash',
      sellerHasExistingBond: false,
    },
  }, 'selling')
  const keys = keySet(model.requiredDocuments)
  const sellingKeys = keySet(sellingModel.requiredDocuments)

  assertIncludes(keys, ['buyer_trust_deed', 'buyer_letters_of_authority', 'proof_of_funds'], 'buyer-only requirements')
  assertExcludes(keys, ['seller_id_document', 'seller_fica_pack', 'rates_clearance'], 'buyer-only requirements')
  assert.equal(sellingModel.canonicalDocumentRequestPlan.audience, 'seller')
  assert.equal(sellingModel.canonicalDocumentRequestPlan.requiredDocuments.length, 0)
  assertExcludes(sellingKeys, ['seller_id_document', 'seller_fica_pack', 'rates_clearance'], 'buyer-only selling requirements')
})

test('buyer document centre hides containers and collapses semantic duplicates', () => {
  const model = buildDocumentCenter({
    transaction: {
      id: 'transaction-buyer-documents',
      purchaser_type: 'individual',
      finance_type: 'cash',
    },
    requiredDocuments: [
      { key: 'buyer_fica_pack', label: 'Buyer FICA Pack', status: 'required', expectedFromRole: 'buyer' },
      { key: 'buyer_id_document', label: 'Buyer ID Document', status: 'under_review', expectedFromRole: 'buyer' },
      { key: 'id_document', label: 'ID Document', status: 'required', expectedFromRole: 'buyer' },
      { key: 'buyer_proof_of_address', label: 'Buyer Proof of Address', status: 'required', expectedFromRole: 'buyer' },
      { key: 'proof_of_address', label: 'Proof of Address', status: 'required', expectedFromRole: 'buyer' },
      { key: 'buyer_marital_status_details', label: 'Buyer Marital Status Declaration', status: 'required', expectedFromRole: 'buyer' },
      { key: 'buyer_source_of_funds', label: 'Buyer Source of Funds', status: 'required', expectedFromRole: 'buyer' },
      { key: 'proof_of_funds', label: 'Proof of Funds', status: 'required', expectedFromRole: 'buyer' },
    ],
    documents: [],
    additionalDocumentRequests: [],
  }, 'buying')

  assert.equal(model.summary.total, 4)
  assert.equal(model.summary.underReview, 1)
  assert.equal(model.summary.outstanding, 3)
  assert.equal(model.items.some((item) => item.title === 'Buyer FICA Pack'), false)
  assert.equal(model.items.some((item) => item.title === 'Buyer Marital Status Declaration'), false)
  assert.equal(model.items.some((item) => /Signed OTP \/ Sale Agreement/i.test(item.title)), true)
  assert.equal(model.items.find((item) => /Signed OTP \/ Sale Agreement/i.test(item.title))?.uploadSpec?.type, 'requirement')
  assert.equal(model.items.filter((item) => item.title === 'Proof of Funds').length, 1)
  assert.equal(model.items.filter((item) => item.title === 'Buyer ID / Passport').length, 1)
})

test('client portal payload resolves organisation branding in core and full loaders', () => {
  const portalLoaderSource = apiSource.slice(
    apiSource.indexOf('export async function fetchClientPortalByToken'),
    apiSource.indexOf('export async function fetchClientPortalJourneySnapshotByToken'),
  )
  const coreLoaderSource = apiSource.slice(
    apiSource.indexOf('export async function fetchClientPortalCoreByToken'),
    apiSource.indexOf('function mapClientPortalContextRow'),
  )

  for (const [name, source] of [['full', portalLoaderSource], ['core', coreLoaderSource]]) {
    assert.match(source, /organisation_id, development_id/,
      `${name} portal loader should fetch the transaction organisation`)
    assert.match(source, /resolveClientPortalBranding\(client, transaction, link\)/,
      `${name} portal loader should resolve organisation branding`)
    assert.match(source, /branding,/,
      `${name} portal payload should expose branding`)
  }
})

console.log('client portal canonical document request phase 5 tests passed')
