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

const documentsStart = source.indexOf("workspaceRole === 'attorney' && activeWorkspaceMenu === 'documents'")
const tasksStart = source.indexOf("workspaceRole === 'attorney' && activeWorkspaceMenu === 'tasks'", documentsStart)
assert.notEqual(documentsStart, -1, 'Documents workspace tab should render explicitly')
assert.notEqual(tasksStart, -1, 'Tasks workspace tab should follow Documents tab for block extraction')

const documentsBlock = source.slice(documentsStart, tasksStart)
const workflowDetailBlock = source.slice(
  source.indexOf('const openWorkspaceMenu = useCallback'),
  source.indexOf('function handleOverviewActionTarget'),
)

assert.match(source, /const requiredDocumentRows = useMemo/, 'required table should be built from canonical required-document rows')
assert.match(source, /const documentLibraryRows = useMemo/, 'library table should be built from uploaded/generated document rows')
assert.match(source, /documentHealthSummary/, 'Documents tab should compute the health summary from canonical rows')
assert.match(source, /visibilityScope,/, 'uploads should pass canonical document visibility into uploadDocument')
assert.match(source, /documentRequestId: uploadDraft\.documentRequestId \|\| null/, 'uploads should preserve document request linkage')
assert.match(source, /canonicalRequirementInstanceId: linkedRequirement/, 'uploads from a requirement should link canonical requirement instances')

assert.match(documentsBlock, /ArchlineDocumentsWorkspace/, 'Documents tab should render the Archline documents workspace')
assert.match(source, /ArchlinePanel title="Required Documents"/, 'Documents workspace should render a required-documents table section')
assert.match(source, /ArchlinePanel title="Document Library"/, 'Documents workspace should render one document library')
assert.match(source, /ArchlinePanel title="Quick Actions"/, 'Documents workspace should render the right-sidebar quick actions')
assert.match(source, /ArchlinePanel title="Recent Activity"/, 'Documents workspace should render document recent activity')
assert.match(documentsBlock, /open=\{uploadDocumentModalOpen\}/, 'Upload should be modal-driven')
assert.match(documentsBlock, /Satisfies required document\?/, 'Upload modal should support linking to required documents')
assert.match(source, /requiredRows\.slice\(0, 8\)/, 'Required table should default to a compact first-eight view')
assert.match(source, /activeDocumentLibraryCategory === 'all' \|\| row\.category === activeDocumentLibraryCategory/, 'filter pills should only filter the library')
assert.match(source, /routeLegalWorkflowDetailKey \|\| localLegalWorkflowDetailKey/, 'workflow details should support route-backed and state-backed activation')
assert.match(workflowDetailBlock, /setLocalLegalWorkflowDetailKey\(normalized\)/, 'opening a workflow detail from the workspace should not require a route change')
assert.doesNotMatch(workflowDetailBlock, /navigate\(`\$\{transactionWorkspaceBasePath\}\/transfer\/\$\{normalized\}`\)/, 'opening a workflow detail should not remount the matter workspace via nested route navigation')
assert.match(workflowDetailBlock, /if \(routeLegalWorkflowDetailKey\) \{\s*navigate\(transactionWorkspaceBasePath\)/, 'direct workflow-detail URLs should still be able to return to the base matter route')

assert.doesNotMatch(documentsBlock, /Finance Documents/, 'Documents tab should not render a Finance Documents panel')
assert.doesNotMatch(documentsBlock, /Transfer \/ Attorney Documents/, 'Documents tab should not render a Transfer / Attorney Documents panel')
assert.doesNotMatch(documentsBlock, /Upload shared or internal legal documents/, 'Documents tab should not retain the old permanent upload-form header')
assert.doesNotMatch(documentsBlock, /attorneyDocumentSections\.map/, 'Documents tab should not render category-card navigation')
assert.doesNotMatch(documentsBlock, /activeAttorneyDocumentSection/, 'Documents tab should not render category document card grids')

console.log('transaction-documents-command-centre tests passed')
