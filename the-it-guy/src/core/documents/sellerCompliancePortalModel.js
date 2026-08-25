import { transformSellerOnboardingToFacts } from '../../services/documents/sellerOnboardingFactTransformer.js'
import { resolveSellerComplianceRequiredSigners } from './sellerComplianceSignerResolver.js'

export const SELLER_COMPLIANCE_PORTAL_MODEL_CONTRACT = 'arch9-seller-compliance-portal-model-v1'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function firstObject(...values) {
  return values.find(isPlainObject) || {}
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function oneOrManyLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function getSellerComplianceFormSigners(formData = {}, listing = {}, portalData = {}) {
  return [
    formData.sellerComplianceSigners,
    formData.seller_compliance_signers,
    formData.complianceSigners,
    formData.compliance_signers,
    firstObject(formData.sellerComplianceSigning, formData.seller_compliance_signing).signers,
    listing.sellerComplianceSigners,
    listing.seller_compliance_signers,
    firstObject(listing.sellerComplianceSigning, listing.seller_compliance_signing).signers,
    portalData.sellerComplianceSigners,
    portalData.seller_compliance_signers,
    firstObject(portalData.sellerComplianceSigning, portalData.seller_compliance_signing).signers,
  ].find(Array.isArray) || []
}

function getPropertyDisclosure(formData = {}, listing = {}, portalData = {}) {
  return firstObject(
    formData.propertyDisclosure,
    formData.property_disclosure,
    formData.sellerDeclaration,
    formData.seller_declaration,
    listing.propertyDisclosure,
    listing.property_disclosure,
    portalData.propertyDisclosure,
    portalData.property_disclosure,
    firstObject(portalData.onboardingFormData).propertyDisclosure,
    firstObject(portalData.onboardingFormData).property_disclosure,
    firstObject(firstObject(portalData.onboardingFormData).formData).propertyDisclosure,
    firstObject(firstObject(portalData.onboardingFormData).formData).property_disclosure,
  )
}

function buildPrimarySignedSignerFromDisclosure(formData = {}, listing = {}, portalData = {}) {
  const disclosure = getPropertyDisclosure(formData, listing, portalData)
  const signedAt = firstText(
    disclosure.signedAt,
    disclosure.signed_at,
    disclosure.signatureSignedAt,
    disclosure.signature_signed_at,
    disclosure.generatedDocument?.generatedAt,
    disclosure.generated_document?.generated_at,
  )
  const signatureValue = firstText(
    disclosure.signature,
    disclosure.signatureValue,
    disclosure.signature_value,
    disclosure.signatureImage,
    disclosure.signature_image,
    disclosure.signatureDataUrl,
    disclosure.signature_data_url,
  )
  if (!signedAt && !signatureValue) return null
  return {
    id: 'seller-1',
    role: 'seller_1',
    name: firstText(
      disclosure.signatureName,
      disclosure.signature_name,
      formData.sellerName,
      [formData.sellerFirstName, formData.sellerSurname].filter(Boolean).join(' '),
      listing.sellerName,
      listing.seller_name,
      'Seller 1',
    ),
    email: firstText(formData.email, formData.sellerEmail, listing.sellerEmail, listing.seller_email),
    mobile: firstText(formData.phone, formData.sellerPhone, listing.sellerPhone, listing.seller_phone),
    status: 'signed',
    signedAt,
    signature: signatureValue,
    signatureType: signatureValue ? 'drawn' : 'accepted',
    source: 'property_disclosure',
  }
}

function mergeDerivedSignerState(existingSigners = [], derivedSigners = []) {
  const rows = [...toArray(existingSigners)]
  for (const derived of toArray(derivedSigners).filter(Boolean)) {
    const matchIndex = rows.findIndex((row) =>
      text(row?.id) === text(derived.id) ||
      (text(row?.email) && text(row.email).toLowerCase() === text(derived.email).toLowerCase()) ||
      key(row?.role) === key(derived.role),
    )
    if (matchIndex >= 0) {
      rows[matchIndex] = {
        ...derived,
        ...rows[matchIndex],
        status: rows[matchIndex]?.status || derived.status,
        signedAt: rows[matchIndex]?.signedAt || rows[matchIndex]?.signed_at || derived.signedAt,
        signature: rows[matchIndex]?.signature || derived.signature,
        signatureType: rows[matchIndex]?.signatureType || rows[matchIndex]?.signature_type || derived.signatureType,
      }
    } else {
      rows.push(derived)
    }
  }
  return rows
}

function normalizeUploadTarget(requirement = null, signer = null) {
  if (!requirement?.required && !signer?.authorityRequired) return null
  return {
    key: requirement?.key || signer?.authorityRequirement?.key || 'signing_authority',
    label: requirement?.label || signer?.authorityRequirement?.label || 'Signing authority',
    signerId: requirement?.signerId || signer?.id || '',
    description: 'Upload the authority document if one person is signing for another seller or legal entity.',
  }
}

function buildSignerActionModel({ token = '', workspacePath = '', nextSigner = null, authorityRequirements = [] } = {}) {
  if (!nextSigner) return []
  const signerQuery = nextSigner.id ? `?signer=${encodeURIComponent(nextSigner.id)}` : ''
  const signHref = token ? `/seller/onboarding/${encodeURIComponent(token)}${signerQuery}` : ''
  const sendHref = nextSigner.email && signHref
    ? `mailto:${encodeURIComponent(nextSigner.email)}?subject=${encodeURIComponent('Seller compliance pack')}&body=${encodeURIComponent(`Please complete your seller compliance signature here: ${signHref}`)}`
    : ''
  const authorityRequirement = authorityRequirements.find((requirement) => requirement?.signerId === nextSigner.id) || null
  const uploadTarget = normalizeUploadTarget(authorityRequirement, nextSigner)

  return [
    {
      key: 'sign_on_this_device',
      label: 'Sign on this device',
      href: signHref,
      disabled: !signHref,
      tone: 'primary',
    },
    {
      key: 'send_link',
      label: 'Send link',
      href: sendHref,
      disabled: !sendHref,
      tone: 'secondary',
    },
    uploadTarget
      ? {
          key: 'upload_authority',
          label: 'Upload authority',
          to: 'documents',
          href: workspacePath ? `${workspacePath}#seller-compliance-pack` : '',
          uploadTarget,
          tone: 'secondary',
        }
      : null,
  ].filter(Boolean)
}

function getStatusLabel(state = {}) {
  if (state.complete) return 'All signatures complete'
  if (state.status === 'authority_review_required') return 'Authority uploaded for review'
  if (state.signedCount > 0) return `${state.signedCount} of ${state.requiredCount} signed`
  return oneOrManyLabel(state.requiredCount || 0, 'signature', 'signatures') + ' required'
}

function getNextMessage(state = {}) {
  const waiting = toArray(state.waitingOn)
  if (state.complete) return 'Seller compliance pack is complete.'
  if (state.status === 'authority_review_required') return 'Authority has been uploaded and needs agent review before this pack is complete.'
  if (state.signedCount > 0 && waiting.length) {
    return `${state.signedCount} signed. Waiting for ${waiting.map((signer) => signer.name || signer.roleLabel).join(', ')}.`
  }
  if (state.nextSigner) return `${state.nextSigner.name || state.nextSigner.roleLabel} still needs to sign.`
  return 'Required seller compliance signatures are still outstanding.'
}

function getSignerStatusLabel(signer = {}) {
  if (signer.status === 'signed') return 'Signed'
  if (signer.status === 'authority_uploaded') return 'Authority uploaded'
  if (signer.status === 'skipped_by_authority') return 'Covered by authority'
  return 'Pending signature'
}

export function buildSellerCompliancePortalModel({
  formData = {},
  listing = {},
  portalData = {},
  existingSigners = null,
  token = '',
  workspacePath = '',
} = {}) {
  const safeFormData = isPlainObject(formData) ? formData : {}
  const safeListing = isPlainObject(listing) ? listing : {}
  const safePortalData = isPlainObject(portalData) ? portalData : {}
  const baseSigners = Array.isArray(existingSigners)
    ? existingSigners
    : getSellerComplianceFormSigners(safeFormData, safeListing, safePortalData)
  const seededSigners = mergeDerivedSignerState(baseSigners, [
    buildPrimarySignedSignerFromDisclosure(safeFormData, safeListing, safePortalData),
  ])
  const facts = transformSellerOnboardingToFacts(safeFormData, safeListing, {
    source: 'seller_compliance_portal',
  })
  const resolved = resolveSellerComplianceRequiredSigners(facts, {
    existingSigners: seededSigners,
  })
  const state = resolved.signingState || {}
  const signers = toArray(resolved.signers).map((signer) => ({
    ...signer,
    statusLabel: getSignerStatusLabel(signer),
  }))
  const nextSigner = state.nextSigner || null

  return {
    contract: SELLER_COMPLIANCE_PORTAL_MODEL_CONTRACT,
    factsVersion: facts?.context?.facts_version || '',
    sellerBranch: resolved.sellerBranch,
    signers,
    authorityRequirements: resolved.authorityRequirements || [],
    signingState: {
      ...state,
      signers,
    },
    complete: Boolean(state.complete),
    status: state.status || 'pending',
    statusLabel: getStatusLabel(state),
    progressLabel: `${state.completedCount || 0} of ${state.requiredCount || signers.length} complete`,
    nextMessage: getNextMessage(state),
    nextSigner,
    actions: buildSignerActionModel({
      token,
      workspacePath,
      nextSigner,
      authorityRequirements: resolved.authorityRequirements || [],
    }),
  }
}
