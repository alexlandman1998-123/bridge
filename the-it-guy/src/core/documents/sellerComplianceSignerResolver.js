import {
  buildSellerComplianceSigningState,
  normalizeSellerComplianceSigner,
  normalizeSellerComplianceSigners,
  SELLER_COMPLIANCE_SIGNER_ROLES,
} from './sellerComplianceSignerModel.js'

export const SELLER_COMPLIANCE_SIGNER_RESOLVER_CONTRACT = 'arch9-seller-compliance-signer-resolver-v1'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = key(value)
  if (['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'off', 'disabled'].includes(normalized)) return false
  return fallback
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function fullName(person = {}) {
  return firstText(
    person.full_name,
    person.fullName,
    person.name,
    [person.first_name || person.firstName, person.surname || person.last_name || person.lastName].filter(Boolean).join(' '),
  )
}

function emailOf(person = {}) {
  return text(person.email || person.signer_email || person.signerEmail).toLowerCase()
}

function phoneOf(person = {}) {
  return text(person.phone || person.mobile || person.signer_phone || person.signerPhone || person.signer_mobile || person.signerMobile)
}

function normalizeFactsInput(input = {}) {
  if (input?.seller || input?.seller_branch || input?.property || input?.property_disclosure) return input
  if (input?.facts) return normalizeFactsInput(input.facts)
  if (input?.canonicalSellerFacts) return normalizeFactsInput(input.canonicalSellerFacts)
  if (input?.canonical_seller_facts) return normalizeFactsInput(input.canonical_seller_facts)
  return input || {}
}

function primarySellerPerson(seller = {}) {
  return {
    name: firstText(seller.name, seller.full_name, [seller.first_name, seller.surname].filter(Boolean).join(' ')),
    email: seller.email,
    phone: seller.phone,
  }
}

function signerFromPerson({
  id,
  role,
  order,
  person = {},
  fallbackName = '',
  source = '',
  authorityRequirement = null,
} = {}) {
  return normalizeSellerComplianceSigner({
    id,
    name: fullName(person) || text(fallbackName),
    email: emailOf(person),
    mobile: phoneOf(person),
    capacity: text(person.capacity || person.role_capacity || person.roleCapacity || person.role_title || person.roleTitle),
    role,
    order,
    required: true,
    status: 'pending',
    source,
    authorityRequired: Boolean(authorityRequirement?.required),
    authorityRequirement,
  }, Math.max(Number(order || 1) - 1, 0))
}

function authorityRequirement({ key: requirementKey = '', reason = '', label = '', signerId = '' } = {}) {
  return {
    key: key(requirementKey || reason),
    reason: key(reason || requirementKey),
    label: text(label),
    signerId: text(signerId),
    required: true,
    reviewRequired: true,
  }
}

function mergeExistingState(resolvedSigners = [], existingSigners = []) {
  const existing = normalizeSellerComplianceSigners(existingSigners)
  return resolvedSigners.map((signer, index) => {
    const match = existing.find((candidate) =>
      candidate.id === signer.id ||
      (candidate.email && candidate.email === signer.email) ||
      (candidate.role === signer.role && candidate.order === signer.order),
    )
    if (!match) return normalizeSellerComplianceSigner(signer, index)
    return normalizeSellerComplianceSigner({
      ...signer,
      status: match.status,
      signedAt: match.signedAt,
      signature: match.signature,
      audit: match.audit,
      authority: match.authority,
    }, index)
  })
}

function resolveSellerBranch(facts = {}) {
  const seller = facts.seller || {}
  return key(
    facts.seller_branch ||
      seller.branch ||
      seller.owner_structure_type ||
      seller.ownership_type ||
      seller.legal_type ||
      seller.legacy_type ||
      'individual',
  )
}

function resolveIndividualSigners(seller = {}) {
  const primary = signerFromPerson({
    id: 'seller-1',
    role: SELLER_COMPLIANCE_SIGNER_ROLES.seller1,
    order: 1,
    person: primarySellerPerson(seller),
    fallbackName: 'Seller 1',
    source: 'seller',
  })
  const spouseInvolved = bool(seller.spouse_involved) || ['married', 'in_community', 'out_of_community', 'anc', 'foreign_marriage'].includes(key(seller.marital_regime))
  if (!spouseInvolved) return [primary]
  return [
    primary,
    signerFromPerson({
      id: 'spouse',
      role: SELLER_COMPLIANCE_SIGNER_ROLES.spouse,
      order: 2,
      person: seller.spouse || {},
      fallbackName: 'Spouse / co-seller',
      source: 'seller.spouse',
    }),
  ]
}

function resolveMultipleOwnerSigners(seller = {}) {
  const owners = array(seller.owners)
  if (!owners.length) return resolveIndividualSigners(seller)
  return owners.map((owner, index) => signerFromPerson({
    id: `seller-${index + 1}`,
    role: index === 0 ? SELLER_COMPLIANCE_SIGNER_ROLES.seller1 : `seller_${index + 1}`,
    order: index + 1,
    person: owner,
    fallbackName: `Seller ${index + 1}`,
    source: `seller.owners.${index}`,
  }))
}

function resolveCompanySigners(seller = {}) {
  const signerId = 'company-authorised-signatory'
  const requirement = authorityRequirement({
    key: 'company_resolution',
    reason: 'company_resolution',
    label: 'Company resolution / signing authority',
    signerId,
  })
  return {
    signers: [
      signerFromPerson({
        id: signerId,
        role: SELLER_COMPLIANCE_SIGNER_ROLES.authorisedSignatory,
        order: 1,
        person: seller.company?.authorised_signatory || {
          name: seller.company?.director_name,
          email: seller.company?.director_email,
          phone: seller.company?.director_phone,
        },
        fallbackName: 'Authorised company signatory',
        source: 'seller.company.authorised_signatory',
        authorityRequirement: requirement,
      }),
    ],
    authorityRequirements: [requirement],
  }
}

function resolveTrustSigners(seller = {}) {
  const signerId = 'trust-authorised-trustee'
  const requirement = authorityRequirement({
    key: 'trustee_resolution',
    reason: 'trustee_resolution',
    label: 'Trustee resolution / letters of authority',
    signerId,
  })
  return {
    signers: [
      signerFromPerson({
        id: signerId,
        role: SELLER_COMPLIANCE_SIGNER_ROLES.trustee,
        order: 1,
        person: seller.trust?.authorised_trustee || {
          name: seller.trust?.trustee_name,
          email: seller.trust?.trustee_email,
          phone: seller.trust?.trustee_phone,
        },
        fallbackName: 'Authorised trustee',
        source: 'seller.trust.authorised_trustee',
        authorityRequirement: requirement,
      }),
    ],
    authorityRequirements: [requirement],
  }
}

function resolveDeceasedEstateSigners(seller = {}) {
  const signerId = 'estate-executor'
  const requirement = authorityRequirement({
    key: 'letters_of_executorship',
    reason: 'executor_authority',
    label: 'Letters of executorship / estate authority',
    signerId,
  })
  return {
    signers: [
      signerFromPerson({
        id: signerId,
        role: SELLER_COMPLIANCE_SIGNER_ROLES.executor,
        order: 1,
        person: array(seller.deceased_estate?.executors)[0] || {
          name: seller.deceased_estate?.executor_name,
          email: seller.deceased_estate?.executor_email,
          phone: seller.deceased_estate?.executor_phone,
        },
        fallbackName: 'Estate executor',
        source: 'seller.deceased_estate.executor',
        authorityRequirement: requirement,
      }),
    ],
    authorityRequirements: [requirement],
  }
}

function resolvePowerOfAttorneySigners(seller = {}) {
  const signerId = 'poa-representative'
  const requirement = authorityRequirement({
    key: 'power_of_attorney_document',
    reason: 'power_of_attorney',
    label: 'Power of attorney / authority letter',
    signerId,
  })
  return {
    signers: [
      signerFromPerson({
        id: signerId,
        role: SELLER_COMPLIANCE_SIGNER_ROLES.representative,
        order: 1,
        person: array(seller.power_of_attorney?.representatives)[0] || {
          name: seller.power_of_attorney?.representative_name,
          email: seller.power_of_attorney?.representative_email,
          phone: seller.power_of_attorney?.representative_phone,
        },
        fallbackName: 'Authorised representative',
        source: 'seller.power_of_attorney.representative',
        authorityRequirement: requirement,
      }),
    ],
    authorityRequirements: [requirement],
  }
}

export function resolveSellerComplianceRequiredSigners(input = {}, options = {}) {
  const facts = normalizeFactsInput(input)
  const seller = facts.seller || {}
  const branch = resolveSellerBranch(facts)
  const existingSigners = options.existingSigners || input.existingSigners || input.existing_signers || []
  let resolved = { signers: [], authorityRequirements: [] }

  if (branch === 'multiple_owners' || branch === 'multiple_individuals') {
    resolved = { signers: resolveMultipleOwnerSigners(seller), authorityRequirements: [] }
  } else if (branch === 'company') {
    resolved = resolveCompanySigners(seller)
  } else if (branch === 'trust') {
    resolved = resolveTrustSigners(seller)
  } else if (branch === 'deceased_estate') {
    resolved = resolveDeceasedEstateSigners(seller)
  } else if (branch === 'power_of_attorney') {
    resolved = resolvePowerOfAttorneySigners(seller)
  } else {
    resolved = { signers: resolveIndividualSigners(seller), authorityRequirements: [] }
  }

  const signers = mergeExistingState(resolved.signers, existingSigners)
  const signingState = buildSellerComplianceSigningState({ signers })

  return {
    contract: SELLER_COMPLIANCE_SIGNER_RESOLVER_CONTRACT,
    sellerBranch: branch,
    signers,
    signerCount: signers.length,
    authorityRequirements: resolved.authorityRequirements,
    signingState,
  }
}
