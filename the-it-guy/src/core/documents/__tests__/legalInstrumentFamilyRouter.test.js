import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LEGAL_INSTRUMENT_FAMILIES,
  buildLegalInstrumentFamilyIssue,
  resolveLegalInstrumentFamilyProfile,
  resolveTemplateLegalInstrumentFamily,
} from '../legalInstrumentFamilyRouter.js'

test('keeps legacy OTP transactions on the residential resale family', () => {
  const profile = resolveLegalInstrumentFamilyProfile({ packetType: 'otp' })

  assert.equal(profile.familyKey, LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE)
  assert.equal(profile.generationAllowed, true)
  assert.equal(profile.compatibilityMode, true)
})

test('maps the existing private-sale transaction values to residential resale', () => {
  for (const transactionType of ['private_sale', 'private_property', 'private']) {
    const profile = resolveLegalInstrumentFamilyProfile({
      packetType: 'otp',
      transaction: { transaction_type: transactionType },
    })
    assert.equal(profile.familyKey, LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE)
    assert.equal(profile.generationAllowed, true)
  }
})

test('recognises specialist transaction families before scenario routing', () => {
  const profile = resolveLegalInstrumentFamilyProfile({
    packetType: 'otp',
    transaction: { transaction_type: 'developer_sale' },
  })

  assert.equal(profile.familyKey, LEGAL_INSTRUMENT_FAMILIES.DEVELOPER_SALE)
  assert.equal(profile.recognized, true)
  assert.equal(profile.generationAllowed, false)
  assert.equal(buildLegalInstrumentFamilyIssue(profile).code, 'LEGAL_INSTRUMENT_FAMILY_REVIEW_REQUIRED')
})

test('infers agricultural and share-block instruments from specific property signals', () => {
  const farm = resolveLegalInstrumentFamilyProfile({
    packetType: 'otp',
    transaction: { transaction_type: 'residential_sale' },
    property: { property_type: 'farm' },
  })
  const shareBlock = resolveLegalInstrumentFamilyProfile({
    packetType: 'otp',
    property: { property_title_type: 'share block' },
  })

  assert.equal(farm.familyKey, LEGAL_INSTRUMENT_FAMILIES.AGRICULTURAL_SALE)
  assert.equal(shareBlock.familyKey, LEGAL_INSTRUMENT_FAMILIES.SHARE_BLOCK_LIFE_RIGHT)
})

test('fails safe on non-empty transaction types the router does not know', () => {
  const profile = resolveLegalInstrumentFamilyProfile({
    packetType: 'otp',
    transaction: { transaction_type: 'bespoke_fractional_scheme' },
  })

  assert.equal(profile.familyKey, LEGAL_INSTRUMENT_FAMILIES.UNKNOWN)
  assert.equal(profile.recognized, false)
  assert.equal(profile.generationAllowed, false)
})

test('treats existing OTP templates as residential resale only', () => {
  const legacy = resolveTemplateLegalInstrumentFamily({ packet_type: 'otp', metadata_json: {} })
  const developer = resolveTemplateLegalInstrumentFamily({
    packet_type: 'otp',
    metadata_json: { instrument_family: 'developer_sale' },
  })

  assert.equal(legacy.familyKey, LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE)
  assert.equal(legacy.explicit, false)
  assert.equal(developer.familyKey, LEGAL_INSTRUMENT_FAMILIES.DEVELOPER_SALE)
  assert.equal(developer.explicit, true)
})
