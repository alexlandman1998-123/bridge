import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const source = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

function declarationIndex(name) {
  const index = source.indexOf(`const ${name}`)
  assert.notEqual(index, -1, `${name} should be declared in AgencyPipelinePage.jsx`)
  return index
}

const checklistIndex = declarationIndex('selectedLeadOfferStageChecklist')

for (const dependencyName of [
  'selectedLeadAcceptedOfferConversionPreflight',
  'selectedLeadActiveOfferPortalStatus',
]) {
  assert.ok(
    declarationIndex(dependencyName) < checklistIndex,
    `${dependencyName} must be declared before selectedLeadOfferStageChecklist to avoid render-time TDZ crashes.`,
  )
}

assert.match(
  source,
  /const BUYER_LEAD_WORKSPACE_TAB_KEYS = new Set\(\['overview', 'properties', 'appointments', 'documents', 'activity', 'offers'\]\)/,
  'Buyer lead workspaces should expose the documents tab.',
)

assert.match(
  source,
  /if \(\['insights', 'mapping'\]\.includes\(normalized\)\) return 'overview'/,
  'Buyer documents tab should not be remapped back to overview.',
)

for (const expectedSnippet of [
  'handleUploadLeadWorkspaceDocument',
  'leadDocumentUploadingKey',
  'selectedBuyerDocumentRows',
  'seller_lead_agent_document_tab_upload',
  "leadType: 'seller'",
  "leadType: 'buyer'",
  'handleUploadBuyerOfferDocument(event).finally(hideDocumentUploadOverlay)',
]) {
  assert.ok(
    source.includes(expectedSnippet),
    `AgencyPipelinePage.jsx should include ${expectedSnippet}.`,
  )
}

console.log('pipeline leads render-order checks passed')
