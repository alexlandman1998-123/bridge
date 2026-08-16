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

test('raw postgres permission failures do not fall back to generic generation copy', () => {
  const recovery = formatLegalDocumentGenerationRecovery({
    code: '42501',
    message: 'Active organisation membership is required.',
  }, { packetType: 'mandate' })

  assert.match(recovery, /Your current organisation role cannot generate this mandate\./)
  assert.match(recovery, /legal-document access/)
  assert.doesNotMatch(recovery, /could not confirm a usable mandate draft/i)
})

test('raw postgres statement timeouts report status hydration failure', () => {
  const recovery = formatLegalDocumentGenerationRecovery({
    code: '57014',
    message: 'canceling statement due to statement timeout',
  }, { packetType: 'mandate' })

  assert.match(recovery, /database timed out/i)
  assert.match(recovery, /do not start another duplicate generation/i)
  assert.doesNotMatch(recovery, /could not confirm a usable mandate draft/i)
})

test('mandate packet version wrapper reports a saved draft failure', () => {
  const recovery = formatLegalDocumentGenerationRecovery({
    code: 'MANDATE_PACKET_VERSION_FAILED',
    message: 'Mandate packet was created, but version generation failed.',
  }, { packetType: 'mandate' })

  assert.match(recovery, /mandate generation did not produce a saved draft/i)
  assert.match(recovery, /contact support with the packet reference/i)
  assert.doesNotMatch(recovery, /could not confirm a usable mandate draft/i)
})

test('edge renderer failures report an assembly failure', () => {
  const recovery = formatLegalDocumentGenerationRecovery({
    code: 'EDGE_FUNCTION_FAILED',
    message: 'Unable to generate mandate from template right now.',
  }, { packetType: 'mandate' })

  assert.match(recovery, /mandate document could not be assembled/i)
  assert.match(recovery, /legal-template administrator/i)
  assert.doesNotMatch(recovery, /could not confirm a usable mandate draft/i)
})
