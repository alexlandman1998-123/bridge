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
assert.match(source, /documentHealthSummary/, 'Documents tab should compute the health summary from canonical rows')
assert.match(source, /visibilityScope,/, 'uploads should pass canonical document visibility into uploadDocument')
assert.match(source, /documentRequestId: uploadDraft\.documentRequestId \|\| null/, 'uploads should preserve document request linkage')
assert.match(source, /canonicalRequirementInstanceId: linkedRequirement/, 'uploads from a requirement should link canonical requirement instances')

assert.match(documentsBlock, />Documents</, 'Documents tab should keep the requested page title')
assert.match(documentsBlock, /Manage all documents and requirements for this transaction\./, 'Documents tab should keep the requested subtitle')
assert.match(documentsBlock, /Required Documents/, 'Documents tab should render a required-documents table section')
assert.match(documentsBlock, /Document Library/, 'Documents tab should render one document library')
assert.match(documentsBlock, /Quick Actions/, 'Documents tab should render the right-sidebar quick actions')
assert.match(documentsBlock, /Recent Activity/, 'Documents tab should render document recent activity')
assert.match(documentsBlock, /open=\{uploadDocumentModalOpen\}/, 'Upload should be modal-driven')
assert.match(documentsBlock, /Satisfies required document\?/, 'Upload modal should support linking to required documents')
assert.match(documentsBlock, /View all requirements/, 'Required table should default to a compact first-five view')
assert.match(source, /activeDocumentLibraryCategory === 'all' \|\| row\.category === activeDocumentLibraryCategory/, 'filter pills should only filter the library')

assert.doesNotMatch(documentsBlock, /Finance Documents/, 'Documents tab should not render a Finance Documents panel')
assert.doesNotMatch(documentsBlock, /Transfer \/ Attorney Documents/, 'Documents tab should not render a Transfer / Attorney Documents panel')
assert.doesNotMatch(documentsBlock, /Upload shared or internal legal documents/, 'Documents tab should not retain the old permanent upload-form header')
assert.doesNotMatch(documentsBlock, /attorneyDocumentSections\.map/, 'Documents tab should not render category-card navigation')
assert.doesNotMatch(documentsBlock, /activeAttorneyDocumentSection/, 'Documents tab should not render category document card grids')

console.log('transaction-documents-command-centre tests passed')
