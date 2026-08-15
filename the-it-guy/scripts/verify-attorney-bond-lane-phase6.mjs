import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_ORIGINATOR_EVIDENCE_LINK_VERSION,
  buildBondOriginatorEvidenceDeepLinks,
} from '../src/services/attorneyWorkflow/bondOriginatorEvidenceLinks.js'
import {
  BOND_LANE_PHASE6_ORIGINATOR_EVIDENCE_VERSION,
  buildBondLanePhase6OriginatorEvidencePlan,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

function verifyPlan() {
  const plan = buildBondLanePhase6OriginatorEvidencePlan()

  assert.equal(plan.version, BOND_LANE_PHASE6_ORIGINATOR_EVIDENCE_VERSION)
  assert.equal(plan.sourceVersion, BOND_ORIGINATOR_EVIDENCE_LINK_VERSION)
  assert.equal(plan.status, 'ready_for_phase7')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.ok(plan.attorneySurfaces.includes('BondOriginatorAgentProgressView'))
  assert.ok(plan.attorneySurfaces.includes('BondOriginatorAttorneyHandoffView'))
  assert.equal(plan.links.every((link) => link.coveredByOriginatorAction), true)
  assert.equal(plan.links.length, 9)
}

function verifyDeepLinks() {
  const model = buildBondOriginatorEvidenceDeepLinks({ id: 'tx phase 6/1' })

  assert.equal(model.available, true)
  assert.equal(model.transactionId, 'tx phase 6/1')
  assert.equal(model.links.application.href, '/bond/files/tx%20phase%206%2F1?tab=application&action=review-application')
  assert.equal(model.links.documents.href, '/bond/files/tx%20phase%206%2F1?tab=documents&action=request-docs')
  assert.equal(model.links.bankFeedback.href, '/bond/files/tx%20phase%206%2F1?tab=workflow&action=update-bank-feedback')
  assert.equal(model.links.offers.href, '/bond/files/tx%20phase%206%2F1?tab=workflow&action=capture-offer')
  assert.equal(model.links.buyerDecision.href, '/bond/files/tx%20phase%206%2F1?tab=workflow&action=record-buyer-decision')
  assert.equal(model.links.grant.href, '/bond/files/tx%20phase%206%2F1?tab=workflow&action=record-grant-received')
  assert.equal(model.links.signedGrant.href, '/bond/files/tx%20phase%206%2F1?tab=workflow&action=record-grant-signed')
  assert.equal(model.links.instruction.href, '/bond/files/tx%20phase%206%2F1?tab=workflow&action=send-attorney-instruction')
  assert.equal(model.links.activity.href, '/bond/files/tx%20phase%206%2F1?tab=activity&action=monitor-registration')
  assert.equal(model.links.instruction.readOnlyForAttorney, true)
}

function verifyUiWiring() {
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const progressSource = readFileSync(new URL('../src/components/bond/BondOriginatorAgentProgressView.jsx', import.meta.url), 'utf8')
  const handoffSource = readFileSync(new URL('../src/components/bond/BondOriginatorAttorneyHandoffView.jsx', import.meta.url), 'utf8')

  assert.match(pageSource, /buildBondOriginatorEvidenceDeepLinks/)
  assert.match(pageSource, /bondOriginatorEvidenceLinks/)
  assert.match(pageSource, /openBondOriginatorEvidenceLink/)
  assert.match(pageSource, /onOpenDeepLink=\{openBondOriginatorEvidenceLink\}/)

  assert.match(progressSource, /deepLinks = null/)
  assert.match(progressSource, /sourceLinks\.bankFeedback/)
  assert.match(progressSource, /sourceLinks\.documents/)
  assert.match(progressSource, /sourceLinks\.activity/)
  assert.match(progressSource, /ExternalLink/)

  assert.match(handoffSource, /deepLinks = null/)
  assert.match(handoffSource, /sourceLinks\.instruction/)
  assert.match(handoffSource, /sourceLinks\.signedGrant/)
  assert.match(handoffSource, /Originator Activity/)
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase6-originator-evidence-links.md', import.meta.url), 'utf8')
  assert.match(docSource, /Bond Lane Phase 6 Originator Evidence Links/)
  assert.match(docSource, /send-attorney-instruction/)
  assert.match(docSource, /record-grant-signed/)
  assert.match(docSource, /read-only/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase6\.mjs/)
}

verifyPlan()
verifyDeepLinks()
verifyUiWiring()
verifyDoc()

console.log('Attorney bond lane Phase 6 originator evidence link verification passed.')
