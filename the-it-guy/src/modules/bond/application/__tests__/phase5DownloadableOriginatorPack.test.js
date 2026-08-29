import assert from 'node:assert/strict'

import {
  BOND_APPLICATION_ORIGINATOR_PACK_VERSION,
  buildBondApplicationOriginatorPackManifest,
  buildBondApplicationSubmissionSnapshot,
  buildNormalizedBondApplicationFromState,
  createEmptyBondApplicationState,
  resolveBondApplicationOriginatorBrand,
} from '../index.js'
import { buildBondApplicationPdfHtml, buildBondApplicationViewModel } from '../../utils/bondApplicationViewModel.js'

const state = createEmptyBondApplicationState()
state.application.transactionId = 'transaction-phase-5'
state.application.applicantStructure = 'surety'
state.application.buyerEntity = {
  ...state.application.buyerEntity,
  entityType: 'trust',
  name: 'Dlamini Family Trust',
  registrationNumber: 'IT1234/2026',
  trust: {
    trustees: [{ name: 'Nomsa Dlamini', idNumber: '9001010000000' }],
    authorisedSignatories: [{ name: 'Nomsa Dlamini' }],
    lettersOfAuthority: { documentId: 'loa-1' },
    trustDeed: { documentId: 'deed-1' },
    resolution: { documentId: 'resolution-1' },
  },
}
state.participants.primaryApplicant.personal = { first_name: 'Nomsa', surname: 'Dlamini' }
state.participants.sureties = [{
  participantKey: 'surety:1',
  personal: { first_name: 'Lerato', surname: 'Mokoena', id_number: '9101010000000' },
  contact: { email: 'lerato@example.test' },
  employment: { employment_type: 'permanent' },
  incomeSources: [{ type: 'salary', monthlyAmount: 30000 }],
}]
state.participantEntityCompleteness = { version: 'phase-4-v1', complete: true, blockingIssues: [] }

const snapshot = buildBondApplicationSubmissionSnapshot({ applicationState: state })
assert.equal(snapshot.purchaserEntity.name, 'Dlamini Family Trust')
assert.equal(snapshot.participants.length, 2)
assert.equal(snapshot.participants[1].participantRole, 'surety')
assert.equal(snapshot.versions.participantEntityCompletenessVersion, 'phase-4-v1')

const brand = resolveBondApplicationOriginatorBrand({
  originator: { organisationName: 'Example Home Loans', organisationLogoUrl: 'https://assets.example.test/logo.png' },
})
assert.deepEqual(brand, {
  name: 'Example Home Loans',
  logoUrl: 'https://assets.example.test/logo.png',
  branded: true,
})

const readyManifest = buildBondApplicationOriginatorPackManifest({
  applicationState: state,
  snapshot,
  brand,
  generatedAt: '2026-08-28T12:00:00.000Z',
  mode: 'originator_ready',
})
assert.equal(BOND_APPLICATION_ORIGINATOR_PACK_VERSION, 'phase-5-v1')
assert.equal(readyManifest.ready, true)
assert.equal(readyManifest.status, 'ready')
assert.match(readyManifest.fingerprint, /^phase-5-v1:/)

const blockedManifest = buildBondApplicationOriginatorPackManifest({
  applicationState: state,
  snapshot,
  brand: { name: 'Example Home Loans' },
  mode: 'originator_ready',
})
assert.equal(blockedManifest.status, 'blocked')
assert.ok(blockedManifest.blockers.some((item) => item.code === 'originator_logo_required'))

const viewModel = buildBondApplicationViewModel({
  transaction: { id: 'transaction-phase-5', bond_originator: 'Example Home Loans' },
  bondApplication: buildNormalizedBondApplicationFromState({ applicationState: state }),
})
const html = buildBondApplicationPdfHtml(viewModel, '2026-08-28T12:00:00.000Z', {
  bondBrand: brand,
  packManifest: readyManifest,
})
assert.match(html, /https:\/\/assets\.example\.test\/logo\.png/)
assert.match(html, /Example Home Loans logo/)
assert.match(html, /Purchaser Entity and Authority/)
assert.match(html, /Dlamini Family Trust/)
assert.match(html, /Lerato Mokoena/)
assert.match(html, /phase-5-v1/)
assert.doesNotMatch(html, /betterbond-mark/)

const draftHtml = buildBondApplicationPdfHtml(viewModel, '2026-08-28T12:00:00.000Z', {
  bondBrand: { name: 'Another Originator' },
  packManifest: blockedManifest,
})
assert.match(draftHtml, /Draft application pack/)
assert.match(draftHtml, /Another Originator/)
assert.doesNotMatch(draftHtml, /aria-label="BetterBond"/)

console.log('Phase 5 downloadable originator application pack passed')
