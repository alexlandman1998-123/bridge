import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLegalDocumentGenerationRecovery } from '../legalDocumentGenerationRecovery.js'

test('validation recovery reports only blocking missing fields once', () => {
  const recovery = formatLegalDocumentGenerationRecovery({
    code: 'VALIDATION_BLOCKED',
    validation: {
      critical: [
        {
          placeholderKey: 'erfNumber',
          placeholderLabel: 'Title / ERF / portion number',
          message: 'Title / ERF / portion number is required for this legal situation.',
          required: true,
        },
      ],
      missingPlaceholders: [
        { placeholderKey: 'erf_number', placeholderLabel: 'ERF Number', message: 'Missing ERF Number.', required: true },
        { placeholderKey: 'agent_phone', placeholderLabel: 'Agent Phone', message: 'Optional Agent Phone.', required: false },
        { placeholderKey: 'property_estate_name', placeholderLabel: 'Estate Name', message: 'Optional Estate Name.', required: false },
        { placeholderKey: 'transfer_attorney_email', placeholderLabel: 'Transferring Attorney Email', message: 'Optional Transferring Attorney Email.', required: false },
        { placeholderKey: 'transfer_attorney_phone', placeholderLabel: 'Transferring Attorney Phone', message: 'Optional Transferring Attorney Phone.', required: false },
      ],
    },
  }, { packetType: 'mandate' })

  assert.match(recovery, /mandate generation needs: Title \/ ERF \/ portion number\./)
  assert.doesNotMatch(recovery, /ERF Number.*ERF Number|Agent Phone|Estate Name|Transferring Attorney/i)
})
