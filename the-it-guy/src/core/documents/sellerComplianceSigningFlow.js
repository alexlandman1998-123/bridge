import { buildSellerCompliancePortalModel } from './sellerCompliancePortalModel.js'
import { recordSellerComplianceSignerSignature } from './sellerComplianceSignerModel.js'

export const SELLER_COMPLIANCE_SIGNING_FLOW_CONTRACT = 'arch9-seller-compliance-signing-flow-v1'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function dateForInput(value = '') {
  const raw = text(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
  return date.toISOString().slice(0, 10)
}

function findSigner(signers = [], signerId = '') {
  const target = key(signerId)
  if (!target) return null
  return array(signers).find((signer) =>
    key(signer?.id) === target ||
    key(signer?.role) === target ||
    key(signer?.email) === target,
  ) || null
}

export function resolveSellerComplianceSigner(model = {}, signerId = '') {
  const signers = array(model.signers || model.signingState?.signers)
  if (!signers.length) return null
  // The unscoped onboarding link always belongs to the primary seller. Pending
  // co-sellers must use their explicit signer link so one person's signature
  // can never advance and sign on behalf of the next party.
  return findSigner(signers, signerId) || signers[0] || null
}

export function buildSellerComplianceSigningForForm({
  formData = {},
  listing = {},
  portalData = {},
  existingSigners = null,
  token = '',
  workspacePath = '',
  signerId = '',
} = {}) {
  const model = buildSellerCompliancePortalModel({
    formData,
    listing,
    portalData,
    existingSigners,
    token,
    workspacePath,
  })
  const requestedSigner = findSigner(model.signers, signerId)
  return {
    contract: SELLER_COMPLIANCE_SIGNING_FLOW_CONTRACT,
    model,
    activeSigner: requestedSigner || resolveSellerComplianceSigner(model, ''),
    requestedSignerMatched: Boolean(text(signerId) && requestedSigner),
    requestedSignerId: text(signerId),
  }
}

export function buildDisclosureForComplianceSigner(disclosure = {}, signer = null, { preferSignerSignature = false } = {}) {
  if (!signer || !preferSignerSignature) return disclosure || {}
  const signatureValue = text(signer.signature?.value || signer.signatureValue || signer.signature_value)
  const signedAt = dateForInput(signer.signedAt || signer.signed_at)
  return {
    ...(disclosure || {}),
    signature: signatureValue || '',
    signedAt: signedAt || '',
  }
}

export function applySellerComplianceSignatureToForm({
  formData = {},
  listing = {},
  portalData = {},
  token = '',
  signerId = '',
  disclosure = {},
  audit = {},
} = {}) {
  const flow = buildSellerComplianceSigningForForm({
    formData,
    listing,
    portalData,
    token,
    signerId,
  })
  const signer = flow.activeSigner
  if (!signer?.id) return formData || {}

  const updatedSigners = recordSellerComplianceSignerSignature(flow.model.signers, signer.id, {
    signature: disclosure.signature,
    signatureValue: disclosure.signature,
    signatureType: disclosure.signature && String(disclosure.signature).startsWith('data:image/') ? 'drawn' : 'typed',
    signedAt: disclosure.signedAt || disclosure.signed_at,
    ...audit,
  })
  const updatedSigning = buildSellerCompliancePortalModel({
    formData: {
      ...(formData || {}),
      sellerComplianceSigners: updatedSigners,
      seller_compliance_signers: updatedSigners,
    },
    listing,
    portalData,
    existingSigners: updatedSigners,
    token,
  })

  return {
    ...(formData || {}),
    sellerComplianceSigners: updatedSigners,
    seller_compliance_signers: updatedSigners,
    sellerComplianceSigning: updatedSigning,
    seller_compliance_signing: updatedSigning,
    sellerComplianceActiveSignerId: signer.id,
    seller_compliance_active_signer_id: signer.id,
  }
}
