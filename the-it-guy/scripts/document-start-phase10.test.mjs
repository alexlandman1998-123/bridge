import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

function getFunctionBlock(source, name) {
  const declarationMatch = source.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`))
  assert.ok(declarationMatch, `${name} should remain defined.`)

  const paramsStart = source.indexOf('(', declarationMatch.index)
  let paramsDepth = 0
  let paramsEnd = -1
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(') paramsDepth += 1
    if (char === ')') paramsDepth -= 1
    if (paramsDepth === 0) {
      paramsEnd = index
      break
    }
  }
  assert.notEqual(paramsEnd, -1, `${name} should have a closed parameter list.`)

  const bodyStart = source.indexOf('{', paramsEnd)
  assert.notEqual(bodyStart, -1, `${name} should have a function body.`)

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart, index + 1)
  }
  assert.fail(`${name} should have a closed function body.`)
}

const packageJson = JSON.parse(await read('../package.json'))
const settingsPage = await read('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const studioUi = await read('../src/pages/settings/contractStudioUi.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-10.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase10'],
  'node scripts/document-start-phase10.test.mjs',
  'package.json should expose the document-start Phase 10 audit.',
)

for (const reference of [
  "import { listAgencyCrmLeadContacts } from '../../lib/agencyCrmRepository'",
  "import { getOrganisationPrivateListings } from '../../services/privateListingService'",
  'function buildDocumentClientLinkOptions',
  'function buildDocumentPropertyLinkOptions',
  'const [documentLinkOptions, setDocumentLinkOptions]',
  'const [documentLinkOptionsLoading, setDocumentLinkOptionsLoading]',
  'const [documentLinkOptionsError, setDocumentLinkOptionsError]',
  'const loadDocumentLinkOptions = useCallback',
  'listAgencyCrmLeadContacts(resolvedOrganisationId)',
  'getOrganisationPrivateListings(resolvedOrganisationId, { includeRequirementsAndDocuments: false })',
  'documentLinkOptions={documentLinkOptions}',
  'documentLinkOptionsLoading={documentLinkOptionsLoading}',
  'documentLinkOptionsError={documentLinkOptionsError}',
  'onRefreshDocumentLinkOptions={loadDocumentLinkOptions}',
]) {
  assertIncludes(settingsPage, reference, `Settings page should keep saved record picker wiring: ${reference}.`)
}

const runPayload = getFunctionBlock(settingsPage, 'buildDocumentRunPayload')
for (const reference of [
  'const privateListingId = normalizeRunReference(runForm.privateListingId)',
  'const linkedClientKey = normalizeText(runForm.linkedClientKey)',
  'const linkedPropertyKey = normalizeText(runForm.linkedPropertyKey)',
  'privateListingId: privateListingId || sourceContextOverrides.privateListingId || sourceContextOverrides.private_listing_id || \'\'',
  'private_listing_id: privateListingId || sourceContextOverrides.private_listing_id || sourceContextOverrides.privateListingId || \'\'',
  'privateListing:',
  'private_listing:',
  'linkedClientKey',
  'linkedPropertyKey',
  'privateListingId',
]) {
  assertIncludes(runPayload, reference, `Document run payload should preserve optional saved links: ${reference}.`)
}

for (const reference of [
  'documentLinkOptions = { clients: [], properties: [] }',
  'documentLinkOptionsLoading = false',
  'documentLinkOptionsError = \'\'',
  'onRefreshDocumentLinkOptions',
  'const clientLinkOptions = Array.isArray(documentLinkOptions.clients)',
  'const propertyLinkOptions = Array.isArray(documentLinkOptions.properties)',
  'function applySavedClientLink',
  'function applySavedPropertyLink',
  'Use saved records (optional)',
  'Saved client',
  'Saved property',
  'linkedClientKey',
  'linkedPropertyKey',
  'privateListingId',
]) {
  assertIncludes(studioUi, reference, `DocumentCreationPanel should keep optional picker UX: ${reference}.`)
}

for (const reference of [
  'saved-client/property pickers',
  'manual details form',
  'No schema migration',
  'No duplicate document generator',
  'Saved property links are stored in `sourceContext.privateListingId`',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 10 rollout note should keep ${reference}.`)
}

console.log('document-start-phase10 audit passed')
