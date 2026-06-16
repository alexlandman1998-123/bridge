import assert from 'node:assert/strict'

import {
  filterMandateSigningRows,
  getMandateSignerRoleLabel,
  mandateRequiresSpouseSignature,
  resolveMandateSecondarySignerConfig,
  resolveMandateSpouseRequirementFromFields,
} from '../mandateSignatureRules.js'

assert.equal(
  mandateRequiresSpouseSignature({
    sourceContext: {
      onboardingFormData: {
        ownershipType: 'married_anc',
        spouseName: 'Jordan Seller',
        spouseEmail: 'jordan@example.com',
      },
    },
  }),
  false,
)

assert.equal(
  mandateRequiresSpouseSignature({
    sourceContext: {
      onboardingFormData: {
        ownershipType: 'married_cop',
        spouseName: 'Jordan Seller',
      },
    },
  }),
  true,
)

assert.equal(
  mandateRequiresSpouseSignature({
    sourceContext: {
      canonicalFacts: {
        seller: {
          spouse_consent_required: true,
        },
      },
    },
  }),
  true,
)

assert.equal(resolveMandateSpouseRequirementFromFields([{ signer_role: 'purchaser_2', required: false }]), false)
assert.equal(resolveMandateSpouseRequirementFromFields([{ signer_role: 'purchaser_2', required: true }]), true)
assert.equal(resolveMandateSpouseRequirementFromFields([]), null)

assert.deepEqual(
  resolveMandateSecondarySignerConfig({
    sourceContext: {
      onboardingFormData: {
        ownershipType: 'single',
        spouseName: 'Jordan Seller',
        spouseEmail: 'jordan@example.com',
      },
    },
  }),
  {
    role: 'purchaser_2',
    kind: '',
    label: 'Co-signer',
    required: false,
    signerName: '',
    signerEmail: '',
  },
)

assert.deepEqual(
  resolveMandateSecondarySignerConfig({
    sourceContext: {
      onboardingFormData: {
        ownershipType: 'multiple_owners',
        sellerFullName: 'Alex Seller',
        sellerEmail: 'alex@example.com',
        multipleOwners: [
          { name: 'Alex Seller', email: 'alex@example.com' },
          { name: 'Jamie Coowner', email: 'jamie@example.com' },
        ],
      },
    },
  }),
  {
    role: 'purchaser_2',
    kind: 'co_owner',
    label: 'Co-owner',
    required: true,
    signerName: 'Jamie Coowner',
    signerEmail: 'jamie@example.com',
  },
)

assert.equal(getMandateSignerRoleLabel('purchaser_2', { secondarySignerLabel: 'Co-owner' }), 'Co-owner')

const filteredWithoutSpouse = filterMandateSigningRows([
  { signer_role: 'agent' },
  { signer_role: 'seller' },
  { signer_role: 'purchaser_2' },
  { signer_role: 'witness_1' },
], { requiresSpouse: false })

assert.deepEqual(filteredWithoutSpouse.map((row) => row.signer_role), ['agent', 'seller'])

const filteredWithSpouse = filterMandateSigningRows([
  { signer_role: 'agent' },
  { signer_role: 'seller' },
  { signer_role: 'purchaser_2' },
], { requiresSpouse: true })

assert.deepEqual(filteredWithSpouse.map((row) => row.signer_role), ['agent', 'seller', 'purchaser_2'])

console.log('mandateSignatureRules tests passed')
