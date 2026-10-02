import { buildFicaDeclarationDocumentModel } from './ficaDeclarationDocumentModel.js'
import { buildFicaDeclarationDocumentMarkup } from './ficaDeclarationDocumentMarkup.js'
import { buildSellerComplianceDocumentModel } from './sellerComplianceDocumentModel.js'

export const SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION = 'seller_fica_captured_facts_v2'

/** Print only captured, applicable facts; the same record is used for both signing routes. */
export function buildSellerFicaDueDiligenceMarkup({ model = null, formData = {}, signingPack = {}, branding = {}, generatedAt = '' } = {}) {
  const seller = signingPack.seller || {}
  const captured = Object.keys(formData).length
    ? buildSellerComplianceDocumentModel({ formData, signing: { signers: signingPack.signers || [] }, generatedAt })
    : null
  const resolved = model?.contract ? model : buildFicaDeclarationDocumentModel({
    partyType: 'seller',
    party: { ...seller, name: seller.legalOwnerName || seller.name, entityType: seller.legalType },
    property: signingPack.property || {},
    transaction: { reference: signingPack.documentReference },
    sections: captured?.ficaSections,
    signing: { signers: signingPack.signers || [] },
    branding,
    generatedAt,
  })
  const signers = Array.isArray(signingPack.signers) && signingPack.signers.length
    ? signingPack.signers.map((signer, index) => ({
        id: `signer-${index + 1}`, name: signer.name, roleLabel: signer.role || 'Seller',
        email: signer.email, status: 'Awaiting signature', signedAt: '', signature: '',
      }))
    : resolved.signers
  return buildFicaDeclarationDocumentMarkup({ ...resolved, title: 'CLIENT DUE DILIGENCE RECORD', signers,
    branding: Object.keys(branding).length ? branding : resolved.branding })
}
