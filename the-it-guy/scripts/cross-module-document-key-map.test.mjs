import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CROSS_MODULE_DOCUMENT_ALIAS_COLLISIONS,
  DOCUMENT_PARTY_ROLES,
  buildCrossModuleDocumentMapAudit,
  getCrossModuleDocumentDefinition,
  listCrossModuleDocumentDefinitions,
  resolveCrossModuleDocumentKey,
} from '../src/services/documents/crossModuleDocumentKeyMapService.js'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function collectQuotedStrings(block = '') {
  const values = new Set()
  const regex = /'([^']+)'/g
  let match = regex.exec(block)
  while (match) {
    values.add(match[1])
    match = regex.exec(block)
  }
  return [...values]
}

function collectKeyProperties(block = '') {
  const values = new Set()
  const regex = /\bkey:\s*'([^']+)'/g
  let match = regex.exec(block)
  while (match) {
    values.add(match[1])
    match = regex.exec(block)
  }
  return [...values]
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  if (start < 0) return ''
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1
  return source.slice(start, end > start ? end : source.length)
}

function extractBalancedBlock(source, marker, openChar, closeChar) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return ''
  const start = source.indexOf(openChar, markerIndex)
  if (start < 0) return ''
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (char === openChar) depth += 1
    if (char === closeChar) depth -= 1
    if (depth === 0) return source.slice(start + 1, index)
  }
  return ''
}

function extractObjectKeyMapStrings(source, exportName) {
  const marker = `${exportName} = Object.freeze({`
  const block = extractBalancedBlock(source, marker, '{', '}')
  const values = new Set()
  const propertyRegex = /^\s*(?:'([^']+)'|([a-zA-Z0-9_]+)):\s*'([^']+)'/gm
  let match = propertyRegex.exec(block)
  while (match) {
    values.add(match[1] || match[2])
    values.add(match[3])
    match = propertyRegex.exec(block)
  }
  return [...values]
}

function extractSetStrings(source, exportName) {
  const marker = `${exportName} = new Set([`
  return collectQuotedStrings(extractBalancedBlock(source, marker, '[', ']'))
}

function extractBuyerOnboardingDocumentTriggers(source) {
  const values = new Set()
  const triggerRegex = /documentTriggers:\s*Object\.freeze\(\[([\s\S]*?)\]\)/g
  let match = triggerRegex.exec(source)
  while (match) {
    collectQuotedStrings(match[1]).forEach((value) => values.add(value))
    match = triggerRegex.exec(source)
  }
  return [...values]
}

function extractBuyerAgencyTemplateKeys(source) {
  const sections = [
    sliceBetween(source, 'function getPurchaserDocumentDefinitions', 'function getFinanceDocumentDefinitions'),
    sliceBetween(source, 'function getFinanceDocumentDefinitions', 'function getSaleAndTransferDocuments'),
    sliceBetween(source, 'function getSaleAndTransferDocuments', 'function buildParty'),
  ]
  return [...new Set(sections.flatMap((section) => collectKeyProperties(section).filter((value) => /^[a-z0-9_]+$/.test(value))))]
}

function extractAttorneyResolverKeys(source) {
  const values = new Set()
  const regex = /\b(?:id|sourceRequirementId):\s*'([^']+)'/g
  let match = regex.exec(source)
  while (match) {
    values.add(match[1])
    match = regex.exec(source)
  }
  return [...values]
}

function extractCloseoutDefinitionKeys(source) {
  const attorneyBlock = sliceBetween(source, 'const ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS', 'const ATTORNEY_CLOSEOUT_STATUS_VALUES')
  const bondBlock = sliceBetween(source, 'const BOND_CLOSEOUT_DOCUMENT_DEFINITIONS', 'const BOND_CLOSEOUT_STATUS_VALUES')
  return [...new Set([...collectKeyProperties(attorneyBlock), ...collectKeyProperties(bondBlock)].filter((value) => /^[a-z0-9_]+$/.test(value)))]
}

const buyerOnboardingSource = read('src/lib/buyerOnboardingFlowContract.js')
const buyerAgencySource = read('src/lib/purchaserPersonas.js')
const attorneyResolverSource = read('src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js')
const canonicalAdapterSource = read('src/services/documents/canonicalDocumentAdapterService.js')
const transactionDocumentSource = read('src/services/documents/transactionCanonicalDocumentRequirementService.js')
const apiSource = read('src/lib/api.js')

const groups = {
  buyerOnboardingTriggers: extractBuyerOnboardingDocumentTriggers(buyerOnboardingSource),
  buyerAgencyTemplates: extractBuyerAgencyTemplateKeys(buyerAgencySource),
  attorneyResolverKeys: extractAttorneyResolverKeys(attorneyResolverSource),
  attorneyCloseoutDefinitions: extractCloseoutDefinitionKeys(apiSource),
  canonicalAdapterKeys: [
    ...extractObjectKeyMapStrings(canonicalAdapterSource, 'CANONICAL_TO_LEGACY_REQUIREMENT_KEYS'),
    ...extractObjectKeyMapStrings(canonicalAdapterSource, 'LEGACY_TO_CANONICAL_REQUIREMENT_KEYS'),
  ],
  transactionAdapterKeys: [
    ...extractObjectKeyMapStrings(transactionDocumentSource, 'BUYER_ADAPTER_CANONICAL_KEY_OVERRIDES'),
    ...extractSetStrings(transactionDocumentSource, 'PRE_COLLECTION_ALLOWED_KEYS'),
  ],
}

const audit = buildCrossModuleDocumentMapAudit(groups)

assert.deepEqual(CROSS_MODULE_DOCUMENT_ALIAS_COLLISIONS, [], 'Cross-module document aliases should not collide.')
assert.deepEqual(audit.duplicateAliases, [], 'Cross-module document map audit should not report alias collisions.')
assert.deepEqual(
  audit.unknownKeys,
  [],
  `All harvested document keys should resolve through the cross-module map: ${JSON.stringify(audit.unknownKeys, null, 2)}`,
)

assert.equal(resolveCrossModuleDocumentKey('id_document'), 'buyer_id_document')
assert.equal(resolveCrossModuleDocumentKey('proof_of_address'), 'buyer_proof_of_address')
assert.equal(resolveCrossModuleDocumentKey('seller_fica'), 'seller_id_document')
assert.equal(resolveCrossModuleDocumentKey('buyer_fica'), 'buyer_id_document')
assert.equal(resolveCrossModuleDocumentKey('bond_grant_letter'), 'grant_letter')
assert.equal(resolveCrossModuleDocumentKey('cancellation_instruction'), 'bond_cancellation_notice')
assert.equal(resolveCrossModuleDocumentKey('seller_company_resolution'), 'company_resolution_to_sell')
assert.equal(resolveCrossModuleDocumentKey('income_tax_number'), 'seller_tax_number')
assert.equal(resolveCrossModuleDocumentKey('alteration_approvals'), 'alteration_approvals')

const definitions = listCrossModuleDocumentDefinitions()
for (const role of DOCUMENT_PARTY_ROLES) {
  assert.equal(
    definitions.some((definition) => definition.ownerRole === role || definition.responsibleRoles.includes(role)),
    true,
    `Document role map should cover ${role}.`,
  )
}

assert.equal(getCrossModuleDocumentDefinition('buyer_id_document')?.ownerRole, 'buyer')
assert.equal(getCrossModuleDocumentDefinition('seller_id_document')?.ownerRole, 'seller')
assert.equal(getCrossModuleDocumentDefinition('transfer_documents')?.ownerRole, 'transfer_attorney')
assert.equal(getCrossModuleDocumentDefinition('bond_documents')?.ownerRole, 'bond_attorney')
assert.equal(getCrossModuleDocumentDefinition('cancellation_instruction')?.ownerRole, 'cancellation_attorney')
assert.equal(getCrossModuleDocumentDefinition('bond_instruction')?.ownerRole, 'bond_originator')
assert.equal(getCrossModuleDocumentDefinition('alteration_approvals')?.packKey, 'property_compliance')

const totalHarvestedKeys = Object.values(groups).reduce((total, values) => total + values.length, 0)
console.log(`cross-module document key map audit passed (${totalHarvestedKeys} harvested keys across ${Object.keys(groups).length} groups)`)
