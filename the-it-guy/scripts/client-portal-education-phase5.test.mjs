import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  buildClientPortalEducationalContent,
  getEducationalContentForAction,
  getEducationalContentForDocument,
  getEducationalContentForRequirement,
  getEducationalContentForRole,
  resolvePortalStageKey,
} from '../src/content/clientPortalEducation.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('explains bond application actions in buyer language', () => {
  const content = getEducationalContentForAction('bond_application_required')
  assert.equal(content.key, 'bond_application_required')
  assert.match(content.shortExplanation, /bond application/i)
  assert.match(content.shortExplanation, /originator/i)
})

test('covers trust and company authority document requirements', () => {
  const trustAuthority = getEducationalContentForRequirement('letters_of_authority')
  const companyResolution = getEducationalContentForDocument('company_resolution')

  assert.equal(trustAuthority.title, 'Letters of Authority')
  assert.match(trustAuthority.shortExplanation, /trustees/i)
  assert.equal(companyResolution.title, 'Company Resolution')
  assert.match(companyResolution.shortExplanation, /authorised/i)
})

test('resolves practical finance and transfer stages', () => {
  assert.equal(resolvePortalStageKey({
    mainStage: 'FIN',
    stage: 'Bond Approved',
    financeType: 'bond',
    workspace: 'buying',
  }), 'bond_approval')

  assert.equal(resolvePortalStageKey({
    mainStage: 'XFER',
    stage: 'Guarantees requested',
    financeType: 'combination',
    workspace: 'buying',
  }), 'guarantees')

  assert.equal(resolvePortalStageKey({
    mainStage: 'REG',
    stage: 'Registration complete',
    financeType: 'cash',
    workspace: 'buying',
  }), 'registration')
})

test('builds buyer guidance for bond and entity purchases', () => {
  const content = buildClientPortalEducationalContent({
    stage: 'Finance',
    mainStage: 'FIN',
    financeType: 'bond',
    workspace: 'buying',
    nextActions: [
      { type: 'bond_application_required' },
    ],
    requiredDocuments: [
      { key: 'trust_deed', label: 'Trust Deed' },
      { key: 'letters_of_authority', label: 'Letters of Authority' },
      { key: 'company_resolution', label: 'Company Resolution' },
    ],
  })

  assert.equal(content.currentStage.stageKey, 'bond_application')
  assert.equal(content.guidance.some((line) => /bond application/i.test(line)), true)
  assert.equal(content.guidance.some((line) => /trust records/i.test(line)), true)
  assert.equal(content.guidance.some((line) => /company purchases/i.test(line)), true)
  assert.deepEqual(content.relatedDocumentHelp.map((item) => item.key), [
    'trust_deed',
    'letters_of_authority',
    'company_resolution',
  ])
})

test('role guidance exposes practical role-player detail', () => {
  const originator = getEducationalContentForRole('bond_originator')
  assert.equal(originator.label, 'Bond Originator')
  assert.match(originator.explanation, /finance application/i)
  assert.match(originator.clientTip, /application details/i)
})

const bundleDir = await mkdtemp(path.join(tmpdir(), 'client-portal-education-'))
const entryPath = path.join(bundleDir, 'entry.mjs')
const bundlePath = path.join(bundleDir, 'bundle.mjs')
const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')

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

test('document centre items carry practical education text', () => {
  const model = buildDocumentCenter({
    requiredDocuments: [
      {
        key: 'letters_of_authority',
        label: 'Letters of Authority',
        status: 'required',
        expectedFromRole: 'buyer',
      },
    ],
    additionalDocumentRequests: [
      {
        id: 'request-1',
        title: 'Signed Bond Offer',
        documentKey: 'bond_offer',
        status: 'requested',
        visibility: 'client_visible',
      },
    ],
    documents: [
      {
        id: 'doc-1',
        document_name: 'Company Resolution',
        document_type: 'company_resolution',
        status: 'uploaded',
        visibility: 'client',
      },
    ],
  }, 'buying')

  const trustItem = model.items.find((item) => item.sourceId === 'letters_of_authority')
  const bondOfferItem = model.items.find((item) => item.sourceType === 'additional_request')
  const uploadedItem = model.items.find((item) => item.sourceId === 'doc-1')

  assert.match(trustItem.education, /trustees/i)
  assert.match(bondOfferItem.education, /lender outcome/i)
  assert.match(uploadedItem.education, /company has approved/i)
})

console.log('client portal education phase 5 tests passed')
