import assert from 'node:assert/strict'

import { __sellerJourneyServiceTestUtils } from '../sellerJourneyService.js'

const { getMandateStatus } = __sellerJourneyServiceTestUtils

const signedAgentAndSeller = [
  { signer_role: 'agent', status: 'signed' },
  { signer_role: 'seller', status: 'signed' },
  { signer_role: 'purchaser_2', status: 'pending' },
]

const ancMandateStatus = getMandateStatus({
  lead: {
    sellerOnboardingStatus: 'completed',
    mandatePacketId: 'packet-anc',
  },
  mandatePacketStatus: {
    packet: {
      id: 'packet-anc',
      packet_type: 'mandate',
      source_context_json: {
        onboardingFormData: {
          ownershipType: 'married_anc',
          spouseName: 'Jordan Seller',
          spouseEmail: 'jordan@example.com',
        },
      },
    },
    state: 'partially_signed',
    signingSummary: {
      signers: signedAgentAndSeller,
      fields: [],
    },
  },
})

assert.equal(ancMandateStatus, 'signed')

const copMandateStatus = getMandateStatus({
  lead: {
    sellerOnboardingStatus: 'completed',
    mandatePacketId: 'packet-cop',
  },
  mandatePacketStatus: {
    packet: {
      id: 'packet-cop',
      packet_type: 'mandate',
      source_context_json: {
        onboardingFormData: {
          ownershipType: 'married_cop',
          spouseName: 'Jordan Seller',
          spouseEmail: 'jordan@example.com',
        },
      },
    },
    state: 'partially_signed',
    signingSummary: {
      signers: signedAgentAndSeller,
      fields: [],
    },
  },
})

assert.equal(copMandateStatus, 'sent')

console.log('sellerJourneyService tests passed')
