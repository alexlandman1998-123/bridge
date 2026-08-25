import assert from 'node:assert/strict'
import test from 'node:test'

import { buildClientPortalActivityFeedModel } from '../clientPortalActivityFeedService.js'

test('seller activity feed shows pending compliance signature instead of pretending completion', () => {
  const model = buildClientPortalActivityFeedModel({
    portalData: {
      lastUpdated: '2026-08-25T10:00:00.000Z',
      sellerComplianceSigning: {
        complete: false,
        signers: [
          {
            id: 'seller-1',
            name: 'John Smith',
            roleLabel: 'Seller 1',
            status: 'signed',
            complete: true,
            signedAt: '2026-08-25T09:00:00.000Z',
          },
          {
            id: 'spouse',
            name: 'Jane Smith',
            roleLabel: 'Spouse / co-seller',
            status: 'pending',
            complete: false,
          },
        ],
        signingState: {
          complete: false,
          requiredCount: 2,
          completedCount: 1,
          remainingCount: 1,
          percent: 50,
          waitingOn: [{ id: 'spouse', name: 'Jane Smith' }],
        },
      },
    },
  }, 'seller')

  assert.ok(model.items.some((item) => item.type === 'seller_compliance_signer_signed'))
  const required = model.items.find((item) => item.type === 'seller_compliance_signature_required')
  assert.ok(required)
  assert.equal(required.requiresAttention, true)
  assert.match(required.description, /Jane Smith/)
})

test('seller activity feed records hard-copy signed mandate uploads', () => {
  const model = buildClientPortalActivityFeedModel({
    portalData: {
      lastUpdated: '2026-08-25T10:00:00.000Z',
      sellerComplianceSigning: {
        complete: true,
        signingState: {
          complete: true,
          requiredCount: 1,
          completedCount: 1,
          remainingCount: 0,
        },
      },
      documents: [
        {
          id: 'doc-mandate',
          document_type: 'signed_mandate',
          file_path: '/documents/signed-mandate.pdf',
        },
      ],
    },
  }, 'seller')

  assert.ok(model.items.some((item) => item.type === 'signed_mandate_uploaded'))
  assert.ok(model.items.some((item) => item.type === 'seller_compliance_pack_completed'))
})

test('buyer activity feed does not include seller compliance events', () => {
  const model = buildClientPortalActivityFeedModel({
    portalData: {
      sellerComplianceSigning: {
        complete: false,
        signingState: {
          complete: false,
          requiredCount: 1,
          completedCount: 0,
          remainingCount: 1,
        },
      },
    },
  }, 'buyer')

  assert.equal(model.items.some((item) => item.type.startsWith('seller_compliance_')), false)
})
