import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const matterModelSource = fs.readFileSync(path.join(root, 'src/services/documents/matterDocumentWorkspaceModel.js'), 'utf8')

assert.equal(
  packageJson.scripts['test:transaction-documents-command-centre'],
  'node scripts/transaction-documents-command-centre.test.mjs',
  'package script should expose the transaction Documents command centre regression',
)

const documentsStart = source.indexOf("(workspaceRole === 'attorney' || isAgentTransactionView) && activeWorkspaceMenu === 'documents'")
const tasksStart = source.indexOf("workspaceRole === 'attorney' && activeWorkspaceMenu === 'tasks'", documentsStart)
assert.notEqual(documentsStart, -1, 'Documents workspace tab should render explicitly')
assert.notEqual(tasksStart, -1, 'Tasks workspace tab should follow Documents tab for block extraction')

const documentsBlock = source.slice(documentsStart, tasksStart)
const archlineDocumentsStart = source.indexOf('function ArchlineDocumentsWorkspace(')
const archlineDocumentsEnd = source.indexOf('function ArchlineTasksWorkspace(', archlineDocumentsStart)
assert.notEqual(archlineDocumentsStart, -1, 'Archline documents workspace component should exist')
assert.notEqual(archlineDocumentsEnd, -1, 'Archline documents workspace block should be extractable')
const archlineDocumentsBlock = source.slice(archlineDocumentsStart, archlineDocumentsEnd)
const workflowDetailBlock = source.slice(
  source.indexOf('const openWorkspaceMenu = useCallback'),
  source.indexOf('function handleOverviewActionTarget'),
)
const matterHeaderBlock = source.slice(
  source.indexOf('const MATTER_OVERVIEW_HEADER_THEMES'),
  source.indexOf('function LegalWorkflowHubCard'),
)

assert.match(source, /buildMatterDocumentWorkspaceModel/, 'document workspace derivation should use the extracted matter document model')
assert.match(source, /const requiredDocumentRows = matterDocumentWorkspaceModel\.requiredRows/, 'required table should be built from canonical required-document rows')
assert.match(source, /const documentLibraryRows = matterDocumentWorkspaceModel\.libraryRows/, 'library table should be built from uploaded/generated document rows')
assert.match(matterModelSource, /export function filterMatterDocumentLibraryRows/, 'library table filtering should live in the pure matter document model')
assert.match(source, /documentHealthSummary/, 'Documents tab should compute the health summary from canonical rows')
assert.match(source, /visibilityScope,/, 'uploads should pass canonical document visibility into uploadDocument')
assert.match(source, /documentRequestId: uploadDraft\.documentRequestId \|\| null/, 'uploads should preserve document request linkage')
assert.match(source, /canonicalRequirementInstanceId: linkedRequirement/, 'uploads from a requirement should link canonical requirement instances')

assert.match(documentsBlock, /ArchlineDocumentsWorkspace/, 'Documents tab should render the Archline documents workspace')
assert.match(documentsBlock, /workspaceRole === 'attorney' \|\| isAgentTransactionView/, 'Agent transaction documents should use the same Archline buyer and seller document workspace')
assert.match(source, /activeWorkspaceMenu === 'documents' && workspaceRole !== 'attorney' && !isAgentTransactionView/, 'Legacy non-attorney documents command centre should not catch the agent transaction portal')
assert.match(source, /ATTORNEY_DOCUMENT_DASHBOARD_PARTIES/, 'Documents workspace should derive buyer and seller document parties')
assert.match(source, /Buyer Documents/, 'Documents workspace should expose buyer document categories')
assert.match(source, /Seller Documents/, 'Documents workspace should expose seller document categories')
for (const categoryLabel of ['Property Documents', 'Sales Documents', 'FICA Documents', 'Finance Documents', 'Additional Requests']) {
  assert.match(source, new RegExp(categoryLabel), `Documents workspace should align to the shared ${categoryLabel} category label`)
}
assert.match(source, /<h3 className="text-sm font-semibold text-slate-950">Required Documents<\/h3>/, 'Documents workspace category modal should render required documents')
assert.match(source, /<h3 className="text-sm font-semibold text-slate-950">Uploaded Files<\/h3>/, 'Documents workspace category modal should render uploaded files')
assert.doesNotMatch(archlineDocumentsBlock, /ArchlinePanel title="Document Health"/, 'Documents workspace should not render the removed right-sidebar document health')
assert.doesNotMatch(archlineDocumentsBlock, /ArchlinePanel title="Quick Actions"/, 'Documents workspace should not render the removed right-sidebar quick actions')
assert.doesNotMatch(archlineDocumentsBlock, /Document Activity/, 'Documents workspace should not render the removed bottom document activity panel')
assert.match(archlineDocumentsBlock, /<h2 className="text-xl font-semibold tracking-\[-0\.02em\] text-slate-950">Documents<\/h2>[\s\S]*Request Document[\s\S]*Upload Document/, 'Documents workspace actions should sit in the page heading row')
assert.doesNotMatch(archlineDocumentsBlock, /Search documents\.\.\./, 'Documents workspace should not render the clipped in-card search bar')
assert.match(documentsBlock, /open=\{uploadDocumentModalOpen\}/, 'Upload should be modal-driven')
assert.match(documentsBlock, /Satisfies required document\?/, 'Upload modal should support linking to required documents')
assert.match(source, /activeCategoryRequirements\.map/, 'Required document rows should be navigable from the category modal')
assert.match(matterModelSource, /row\.category === normalizedFilter \|\| row\.canonicalCategory === normalizedFilter/, 'filter pills should only filter the library')
assert.match(source, /routeLegalWorkflowDetailKey \|\| localLegalWorkflowDetailKey/, 'workflow details should support route-backed and state-backed activation')
assert.match(workflowDetailBlock, /setLocalLegalWorkflowDetailKey\(normalized\)/, 'opening a workflow detail from the workspace should not require a route change')
assert.doesNotMatch(workflowDetailBlock, /navigate\(`\$\{transactionWorkspaceBasePath\}\/transfer\/\$\{normalized\}`\)/, 'opening a workflow detail should not remount the matter workspace via nested route navigation')
assert.match(workflowDetailBlock, /if \(routeLegalWorkflowDetailKey\) \{\s*navigate\(transactionWorkspaceBasePath\)/, 'direct workflow-detail URLs should still be able to return to the base matter route')
assert.match(source, /MATTER_OVERVIEW_HEADER_THEMES/, 'Matter overview header should use explicit role-aware themes')
assert.match(source, /rgba\(13,92,163,0\.96\)/, 'Buyer-focused transaction headers should use the blue contrast theme')
assert.match(source, /rgba\(7,120,87,0\.96\)/, 'Seller-focused transaction headers should use the green contrast theme')
assert.match(source, /getMatterOverviewHeaderTheme/, 'Matter overview header should resolve the contrast theme from the current transaction context')
assert.doesNotMatch(matterHeaderBlock, /border border-\[#d8e4ef\] bg-\[#f8fbfd\]/, 'Matter overview command header should not regress to the pale white treatment')

assert.doesNotMatch(documentsBlock, /Finance Documents/, 'Documents tab should not render a Finance Documents panel')
assert.doesNotMatch(documentsBlock, /Transfer \/ Attorney Documents/, 'Documents tab should not render a Transfer / Attorney Documents panel')
assert.doesNotMatch(documentsBlock, /Upload shared or internal legal documents/, 'Documents tab should not retain the old permanent upload-form header')
assert.doesNotMatch(documentsBlock, /attorneyDocumentSections\.map/, 'Documents tab should not render category-card navigation')
assert.doesNotMatch(documentsBlock, /activeAttorneyDocumentSection/, 'Documents tab should not render category document card grids')

console.log('transaction-documents-command-centre tests passed')
