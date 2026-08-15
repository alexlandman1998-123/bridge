import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_ORIGINATOR_EVIDENCE_LINK_DEFINITIONS,
  BOND_ORIGINATOR_EVIDENCE_LINK_VERSION,
  buildBondOriginatorEvidenceDeepLinks,
  resolveBondOriginatorEvidenceTransactionId,
} from '../src/services/attorneyWorkflow/bondOriginatorEvidenceLinks.js'

function verifyTransactionResolution() {
  assert.equal(resolveBondOriginatorEvidenceTransactionId('tx-123'), 'tx-123')
  assert.equal(resolveBondOriginatorEvidenceTransactionId({ transaction_id: 'tx-456' }), 'tx-456')
  assert.equal(resolveBondOriginatorEvidenceTransactionId({ transaction: { id: 'tx-789' } }), 'tx-789')
  assert.equal(resolveBondOriginatorEvidenceTransactionId(null), '')
}

function verifyReadOnlyEvidenceLinks() {
  const bundle = buildBondOriginatorEvidenceDeepLinks({ id: 'tx-originator-1' })
  const links = Object.values(bundle.links)

  assert.equal(bundle.version, BOND_ORIGINATOR_EVIDENCE_LINK_VERSION)
  assert.equal(bundle.transactionId, 'tx-originator-1')
  assert.equal(bundle.available, true)
  assert.equal(bundle.attorneyPolicy, 'read_only_deep_link_to_originator_workspace')
  assert.equal(links.length, BOND_ORIGINATOR_EVIDENCE_LINK_DEFINITIONS.length)
  assert.equal(links.every((link) => link.readOnlyForAttorney), true)
  assert.equal(links.every((link) => link.href.includes('/bond/files/tx-originator-1')), true)
  assert.equal(links.every((link) => Array.isArray(link.evidence) && link.evidence.length > 0), true)

  assert.equal(bundle.links.application.targetWorkspaceTab, 'application')
  assert.equal(bundle.links.documents.targetWorkspaceTab, 'documents')
  assert.equal(bundle.links.bankFeedback.targetAction, 'update-bank-feedback')
  assert.equal(bundle.links.offers.targetAction, 'capture-offer')
  assert.equal(bundle.links.instruction.targetAction, 'send-attorney-instruction')
}

function verifyUnavailableWithoutTransactionId() {
  const bundle = buildBondOriginatorEvidenceDeepLinks({})
  const links = Object.values(bundle.links)

  assert.equal(bundle.available, false)
  assert.equal(bundle.transactionId, '')
  assert.equal(links.every((link) => link.href === ''), true)
  assert.equal(links.every((link) => link.readOnlyForAttorney), true)
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase6-originator-evidence-links.md', import.meta.url), 'utf8')
  assert.match(docSource, /Bond Lane Phase 6 Originator Evidence Links/)
  assert.match(docSource, /read-only/)
  assert.match(docSource, /application/)
  assert.match(docSource, /instruction/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase6\.mjs/)
}

function verifyComponentWiring() {
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const progressSource = readFileSync(new URL('../src/components/bond/BondOriginatorAgentProgressView.jsx', import.meta.url), 'utf8')
  const handoffSource = readFileSync(new URL('../src/components/bond/BondOriginatorAttorneyHandoffView.jsx', import.meta.url), 'utf8')

  assert.match(pageSource, /buildBondOriginatorEvidenceDeepLinks/)
  assert.match(pageSource, /deepLinks=\{bondOriginatorEvidenceLinks\}/)
  assert.match(pageSource, /onOpenDeepLink=\{openBondOriginatorEvidenceLink\}/)
  assert.match(progressSource, /deepLinks = null/)
  assert.match(progressSource, /onOpenDeepLink = null/)
  assert.match(progressSource, /sourceLinks\.bankFeedback/)
  assert.match(progressSource, /sourceLinks\.documents/)
  assert.match(handoffSource, /deepLinks = null/)
  assert.match(handoffSource, /sourceLinks\.instruction/)
  assert.match(handoffSource, /sourceLinks\.signedGrant/)
}

verifyTransactionResolution()
verifyReadOnlyEvidenceLinks()
verifyUnavailableWithoutTransactionId()
verifyDoc()
verifyComponentWiring()

console.log('Attorney bond lane Phase 6 originator evidence link verification passed.')
