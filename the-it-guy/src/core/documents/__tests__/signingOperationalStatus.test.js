import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSigningOperationalStatus } from '../signingOperationalStatus.js'

const signers = (statuses) => ({ signerCount: statuses.length, signers: statuses.map((status, index) => ({ id: `s${index}`, status })) })

test('does not call an all-signed packet completed before its final PDF exists', () => {
  const result = resolveSigningOperationalStatus({ packetType: 'mandate', packet: { status: 'completed' }, signingSummary: signers(['signed', 'signed']) })
  assert.equal(result.state, 'finalising')
  assert.equal(result.completionReady, false)
})

test('separates a safe final PDF from incomplete publication', () => {
  const result = resolveSigningOperationalStatus({
    packetType: 'otp',
    packet: { status: 'completed' },
    versions: [{ final_signed_file_path: 'signed/otp.pdf' }],
    signingSummary: signers(['signed']),
    finalCompletion: { ready: false, stage: 'awaiting_recipient_delivery', recipientCount: 1, deliveredRecipientCount: 0, retryable: true },
  })
  assert.equal(result.state, 'publishing')
  assert.equal(result.retryable, true)
})

test('reports completed only from verified cross-surface completion', () => {
  const result = resolveSigningOperationalStatus({
    packetType: 'otp',
    versions: [{ final_signed_file_path: 'signed/otp.pdf' }],
    signingSummary: signers(['signed', 'signed']),
    finalCompletion: { ready: true, recipientCount: 2, deliveredRecipientCount: 2 },
    viewerRole: 'attorney',
  })
  assert.equal(result.state, 'completed')
  assert.equal(result.viewerRole, 'attorney')
  assert.equal(result.progress.percent, 100)
})
