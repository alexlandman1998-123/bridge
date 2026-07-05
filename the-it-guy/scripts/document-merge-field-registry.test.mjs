import assert from 'node:assert/strict'
import { createServer } from 'vite'

import {
  listCanonicalMergeFields,
  validateTemplateTokensAgainstRegistry,
} from '../src/core/documents/mergeFieldRegistry.js'

function assertNoUnknownTokens(tokens, packetType) {
  const validation = validateTemplateTokensAgainstRegistry({ tokens, packetType })
  assert.deepEqual(
    validation.unknown,
    [],
    `${packetType} should recognise ${tokens.map((token) => `{{${token}}}`).join(', ')}`,
  )
}

const otpFieldKeys = new Set(listCanonicalMergeFields({ packetType: 'otp' }).map((field) => field.key))

for (const key of ['seller_email', 'seller_phone']) {
  assert.equal(otpFieldKeys.has(key), true, `OTP merge-field registry should include ${key}.`)
}

assertNoUnknownTokens(['seller_email', 'seller_phone'], 'otp')
assertNoUnknownTokens(
  ['buyer_full_name', 'buyer_id_number', 'buyer_email', 'buyer_phone', 'buyer_domicilium_address'],
  'otp',
)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { validatePacketPlaceholders } = await server.ssrLoadModule('/src/core/documents/packetWorkflow.js')
  const mandateValidation = validatePacketPlaceholders({
    packetType: 'mandate',
    placeholders: {},
    sectionManifest: [
      {
        key: 'parties',
        label: 'Parties',
        required: true,
        placeholders: [
          ['seller_full_name', 'Seller Full Name'],
          ['seller_trust_registration_number', 'Seller Trust Registration Number'],
        ],
      },
    ],
  })

  const sellerNameWarning = mandateValidation.warnings.find((warning) => warning.placeholderKey === 'seller_full_name')
  const trustRegistrationWarning = mandateValidation.warnings.find((warning) => warning.placeholderKey === 'seller_trust_registration_number')

  assert.equal(sellerNameWarning?.message, 'Missing Seller Full Name.')
  assert.equal(sellerNameWarning?.required, true)
  assert.equal(trustRegistrationWarning?.message, 'Optional Seller Trust Registration Number.')
  assert.equal(trustRegistrationWarning?.required, false)
} finally {
  await server.close()
}

console.log('document merge-field registry audit passed')
