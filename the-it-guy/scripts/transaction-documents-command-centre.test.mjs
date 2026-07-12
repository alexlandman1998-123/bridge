import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

assert.equal(
  packageJson.scripts['test:transaction-documents-command-centre'],
  'node scripts/transaction-documents-command-centre.test.mjs',
  'package script should expose the transaction Documents command centre regression',
)

const documentsStart = source.indexOf("{activeWorkspaceMenu === 'documents' ? (")
const financeStart = source.indexOf("{activeWorkspaceMenu === 'finance' ? (", documentsStart)
assert.notEqual(documentsStart, -1, 'Documents workspace tab should render explicitly')
assert.notEqual(financeStart, -1, 'Finance workspace tab should follow Documents tab for block extraction')

const documentsBlock = source.slice(documentsStart, financeStart)

assert.match(source, /const requiredDocumentRows = useMemo/, 'required table should be built from canonical required-document rows')
assert.match(source, /const documentLibraryRows = useMemo/, 'library table should be built from uploaded/generated document rows')
assert.match(source, /const documentReadiness = useMemo/, 'Documents tab should compute readiness from canonical rows and document requests')
assert.match(
  source,
  /getDocumentReadiness\(\{[\s\S]*requiredDocumentRows,[\s\S]*documentRequests: additionalDocumentRequests,[\s\S]*documentLibraryRows: allDocumentLibraryRows/,
  'document readiness should use required rows, additional requests, and uploaded/generated library rows',
)
assert.match(source, /visibilityScope,/, 'uploads should pass canonical document visibility into uploadDocument')
assert.match(source, /documentRequestId: uploadDraft\.documentRequestId \|\| null/, 'uploads should preserve document request linkage')
assert.match(source, /canonicalRequirementInstanceId: linkedRequirement/, 'uploads from a requirement should link canonical requirement instances')

assert.match(documentsBlock, /Document Readiness/, 'Documents tab should render the readiness command centre')
assert.match(documentsBlock, /documentReadiness\.score/, 'Documents tab should render the readiness score')
assert.match(documentsBlock, /documentReadiness\.submissionReady/, 'Documents tab should render submission readiness state')
assert.match(documentsBlock, /Critical Documents/, 'Documents tab should render critical requirements')
assert.match(documentsBlock, /Documents Requested By Banks/, 'Documents tab should render bank document requests')
assert.match(documentsBlock, /Missing Documents/, 'Documents tab should render missing-document priorities')
assert.match(documentsBlock, /Recent Uploads/, 'Documents tab should render recent uploads')
assert.match(documentsBlock, /Document Library/, 'Documents tab should render one document library')
assert.match(documentsBlock, /open=\{uploadDocumentModalOpen\}/, 'Upload should be modal-driven')
assert.match(documentsBlock, /Satisfies required document\?/, 'Upload modal should support linking to required documents')
assert.match(documentsBlock, /View all requirements/, 'Required table should default to a compact first-five view')
assert.match(documentsBlock, /View all requests/, 'Bank request panel should deep-link to the bank-request filter')
assert.match(documentsBlock, /View all missing/, 'Missing panel should deep-link to the missing-document filter')
assert.match(documentsBlock, /View all uploads/, 'Recent uploads panel should deep-link to the full library')
assert.match(source, /activeFilter === 'critical'/, 'library filters should support critical documents')
assert.match(source, /activeFilter === 'missing'/, 'library filters should support missing documents')
assert.match(source, /activeFilter === 'bank_requested'/, 'library filters should support bank-requested documents')
assert.match(source, /rows = allDocumentLibraryRows\.filter\(\(row\) => row\.category === activeFilter\)/, 'category filters should only filter the document library')

assert.doesNotMatch(documentsBlock, /Upload shared or internal legal documents/, 'Documents tab should not retain the old permanent upload-form header')
assert.doesNotMatch(documentsBlock, /attorneyDocumentSections\.map/, 'Documents tab should not render category-card navigation')
assert.doesNotMatch(documentsBlock, /activeAttorneyDocumentSection/, 'Documents tab should not render category document card grids')

console.log('transaction-documents-command-centre tests passed')
