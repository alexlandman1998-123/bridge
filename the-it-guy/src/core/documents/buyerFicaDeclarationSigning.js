import {
  FICA_DECLARATION_WORDING_VERSION,
  buildFicaDeclarationDocumentModel,
  getBuyerFicaDeclarationRequirement,
} from './ficaDeclarationDocumentModel.js'

export const BUYER_FICA_DECLARATION_SIGNING_CONTRACT = 'arch9-buyer-fica-declaration-signing-v1'

function text(value) {
  return String(value ?? '').trim()
}

function fullName(person = {}) {
  return text(person.name || person.full_name || [person.first_name, person.last_name].filter(Boolean).join(' '))
}

function address(person = {}) {
  return text(person.address || person.residential_address || [person.street_address, person.suburb, person.city, person.postal_code].filter(Boolean).join(', '))
}

function signer(id, name, roleLabel, source = {}) {
  return {
    id,
    name: text(name) || roleLabel,
    roleLabel,
    email: text(source.email),
    mobile: text(source.phone || source.mobile),
    status: 'Pending',
    signature: '',
    signedAt: '',
  }
}

export function getBuyerFicaDeclarationSigners({ purchaserEntityType = 'individual', purchasers = [], company = {}, trust = {} } = {}) {
  const entityType = text(purchaserEntityType).toLowerCase()
  if (entityType === 'company') {
    return [signer('authorised-signatory', company.authorised_signatory_name, 'Authorised signatory', {
      email: company.authorised_signatory_email,
      phone: company.authorised_signatory_phone,
    })]
  }
  if (entityType === 'trust') {
    return [signer('authorised-trustee', trust.authorised_trustee_name, 'Authorised trustee', {
      email: trust.authorised_trustee_email,
      phone: trust.authorised_trustee_phone,
    })]
  }
  return (Array.isArray(purchasers) ? purchasers : []).map((purchaser, index) =>
    signer(`purchaser-${index + 1}`, fullName(purchaser), index === 0 ? 'Purchaser' : 'Co-purchaser', purchaser),
  )
}

export function buildBuyerFicaDeclarationSigningState(context = {}, existing = {}) {
  const expectedSigners = getBuyerFicaDeclarationSigners(context)
  const previous = Array.isArray(existing?.signers) ? existing.signers : []
  const signers = expectedSigners.map((item) => {
    const saved = previous.find((candidate) => text(candidate?.id) === item.id) || {}
    const signature = text(saved.signature)
    return {
      ...item,
      signature,
      signedAt: signature ? text(saved.signedAt) : '',
      status: signature ? 'Signed' : 'Pending',
    }
  })
  return {
    contract: BUYER_FICA_DECLARATION_SIGNING_CONTRACT,
    wordingVersion: FICA_DECLARATION_WORDING_VERSION,
    acknowledgementAccepted: Boolean(existing?.acknowledgementAccepted),
    acknowledgedAt: existing?.acknowledgementAccepted ? text(existing?.acknowledgedAt) : '',
    signers,
  }
}

export function isBuyerFicaDeclarationSigned(state = {}) {
  return Boolean(state?.acknowledgementAccepted) && Array.isArray(state?.signers) && state.signers.length > 0 && state.signers.every((item) => text(item.signature))
}

export function buildBuyerFicaDeclarationSnapshot({
  purchaserEntityType,
  purchasers,
  company,
  trust,
  signingState,
  transaction,
  property,
  branding,
} = {}) {
  const entityType = text(purchaserEntityType).toLowerCase()
  const primary = Array.isArray(purchasers) ? purchasers[0] || {} : {}
  const entity = entityType === 'company' ? company || {} : entityType === 'trust' ? trust || {} : {}
  const party = entityType === 'company'
    ? {
        name: entity.company_name,
        entityType: 'company',
        entity: { name: entity.company_name, registrationNumber: entity.company_registration_number, authorityBasis: entity.authorised_signatory_capacity },
      }
    : entityType === 'trust'
      ? {
          name: entity.trust_name,
          entityType: 'trust',
          entity: { name: entity.trust_name, registrationNumber: entity.trust_registration_number, authorityBasis: 'Authorised trustee' },
        }
      : {
          name: fullName(primary),
          entityType: entityType || 'individual',
          idNumber: primary.identity_number || primary.passport_number,
          email: primary.email,
          phone: primary.phone,
          residentialAddress: address(primary),
        }
  return buildFicaDeclarationDocumentModel({
    partyType: 'buyer',
    party,
    transaction,
    property,
    signing: { signers: signingState?.signers || [] },
    documentRequirements: [getBuyerFicaDeclarationRequirement()],
    branding,
    declaration: { wordingVersion: signingState?.wordingVersion || FICA_DECLARATION_WORDING_VERSION },
  })
}
