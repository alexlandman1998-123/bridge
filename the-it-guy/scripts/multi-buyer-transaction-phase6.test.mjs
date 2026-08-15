import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  getBuyerOnboardingCompletionIdentity,
  resolveBuyerOnboardingCompletionTarget,
} from '../src/core/transactions/transactionBuyerCompletion.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const clientOnboardingSource = await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8')
const edgeClientOnboardingSource = await readFile(
  new URL('../../supabase/functions/send-email/handlers/clientOnboarding.ts', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('completion identity carries a buyer-target nonce from submitted form data', () => {
  const identity = getBuyerOnboardingCompletionIdentity({
    formData: {
      buyer_participant_id: 'participant-1',
      buyer_target_nonce: 'nonce-1',
      email: 'buyer@example.com',
    },
  })

  assert.equal(identity.participantId, 'participant-1')
  assert.equal(identity.targetNonce, 'nonce-1')

  const target = resolveBuyerOnboardingCompletionTarget({
    buyers: [
      {
        id: 'participant-1',
        role_type: 'buyer',
        participant_email: 'buyer@example.com',
        is_primary_buyer: true,
      },
    ],
    formData: {
      buyerParticipantId: 'participant-1',
      buyerTargetNonce: 'nonce-1',
    },
  })

  assert.equal(target.participantId, 'participant-1')
  assert.equal(target.targetNonce, 'nonce-1')
  assert.equal(target.matchBasis, 'participant_id')
})

test('Edge onboarding delivery builds buyer-targeted links without exposing buyer email', () => {
  assert.match(edgeClientOnboardingSource, /BUYER_TARGETED_ONBOARDING_LINK_VERSION/)
  assert.match(edgeClientOnboardingSource, /function buildBuyerTargetedOnboardingUrl/)
  assert.match(edgeClientOnboardingSource, /params\.set\("buyerParticipantId", participantId\)/)
  assert.match(edgeClientOnboardingSource, /params\.set\("buyerPartyId", buyerPartyId\)/)
  assert.match(edgeClientOnboardingSource, /params\.set\("buyerTargetNonce", targetNonce\)/)
  assert.doesNotMatch(edgeClientOnboardingSource, /params\.set\("buyerEmail"/)
  assert.match(edgeClientOnboardingSource, /const onboardingUrl = buildBuyerTargetedOnboardingUrl/)
})

test('Edge delivery persists the link nonce on the matched buyer participant', () => {
  assert.match(edgeClientOnboardingSource, /function persistBuyerOnboardingLinkTarget/)
  assert.match(edgeClientOnboardingSource, /lastBuyerOnboardingLinkNonce: targetNonce/)
  assert.match(edgeClientOnboardingSource, /lastBuyerOnboardingLinkTargetId: participant\.id/)
  assert.match(edgeClientOnboardingSource, /buyerOnboardingLinkVersion: BUYER_TARGETED_ONBOARDING_LINK_VERSION/)
  assert.match(edgeClientOnboardingSource, /targetNonce: buyerTargetNonce/)
})

test('public onboarding page carries buyer target params through save and submit', () => {
  assert.match(clientOnboardingSource, /function resolveBuyerOnboardingLinkTarget/)
  assert.match(clientOnboardingSource, /buyerParticipantId/)
  assert.match(clientOnboardingSource, /buyerTargetNonce/)
  assert.match(clientOnboardingSource, /const buyerLinkTarget = useMemo/)
  assert.match(clientOnboardingSource, /\.\.\.buyerLinkTarget,\n\s*purchaser_type: initialPurchaserType/)
  const saveAndSubmitSlices = clientOnboardingSource.match(/\.\.\.sanitizeClientFormData\(formData,[\s\S]{0,220}?\),\n\s*\.\.\.buyerLinkTarget,/g) || []
  assert.equal(saveAndSubmitSlices.length >= 2, true)
})

test('API verifies nonce before buyer participant completion updates', () => {
  assert.match(apiSource, /function verifyBuyerCompletionTargetNonce/)
  assert.match(apiSource, /lastBuyerOnboardingLinkNonce/)
  assert.match(apiSource, /buyer_target_nonce/)
  assert.match(apiSource, /buyer_target_nonce_mismatch/)
  assert.match(apiSource, /const nonceVerification = verifyBuyerCompletionTargetNonce\(matchedRow, target\)/)
})

test('package exposes the multi-buyer transaction Phase 6 targeted-link regression', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase6'],
    'node scripts/multi-buyer-transaction-phase6.test.mjs',
  )
})

console.log('multi-buyer transaction phase 6 tests passed')
