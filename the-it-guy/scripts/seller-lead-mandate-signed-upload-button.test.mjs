import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencySource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const legalWorkspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')

assert.ok(agencySource.includes('Upload Signed Mandate'), 'Seller lead Mandate tab should render an Upload Signed Mandate button.')
assert.ok(agencySource.includes('function handleSelectedLeadSignedMandateUploadAction()'), 'Seller lead Mandate tab should have a dedicated signed mandate upload action.')
assert.ok(agencySource.includes("openSelectedLeadMandateWorkspace('upload_signed')"), 'Upload Signed Mandate should open the mandate workspace with upload_signed intent.')
assert.ok(agencySource.includes("const workspaceMode = normalizedAction === 'upload_signed' ? 'send' : resolveWorkspaceModeFromAction(actionKey)"), 'upload_signed intent should open the signing workspace mode.')
assert.ok(agencySource.includes('initialAction={legalWorkspaceInitialAction}'), 'Agency page should pass the initial mandate workspace action into LegalDocumentWorkspace.')
assert.ok(agencySource.includes("setLegalWorkspaceInitialAction(normalizedAction === 'upload_signed' ? 'upload_signed' : '')"), 'Agency page should only set upload_signed for the signed mandate upload action.')

assert.ok(legalWorkspaceSource.includes('initialAction = \'\''), 'LegalDocumentWorkspace should accept an initialAction prop.')
assert.ok(legalWorkspaceSource.includes("normalizeKey(initialAction) !== 'upload_signed'"), 'LegalDocumentWorkspace should react specifically to upload_signed intent.')
assert.ok(legalWorkspaceSource.includes("document.getElementById('mandate-workspace-physical-upload')?.scrollIntoView"), 'upload_signed intent should scroll to the physical signed upload panel.')
assert.ok(legalWorkspaceSource.includes("intentContext.selectSigningMethod?.('physical')"), 'upload_signed intent should switch the mandate workspace to physical signing when allowed.')

console.log('Seller lead mandate signed upload button verified.')
