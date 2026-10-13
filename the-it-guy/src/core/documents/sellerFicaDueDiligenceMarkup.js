import { buildFicaDeclarationDocumentModel } from './ficaDeclarationDocumentModel.js'
import { buildFicaDeclarationDocumentMarkup } from './ficaDeclarationDocumentMarkup.js'
import { buildSellerComplianceDocumentModel } from './sellerComplianceDocumentModel.js'

export const SELLER_FICA_DUE_DILIGENCE_TEMPLATE_VERSION = 'seller_fica_captured_facts_v3'

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
    ? buildFicaDeclarationDocumentModel({ partyType: 'seller', signing: { signers: signingPack.signers } }).signers
    : resolved.signers
  return buildFicaDeclarationDocumentMarkup({ ...resolved, title: 'Client due diligence record', signers,
    branding: Object.keys(branding).length ? branding : resolved.branding })
}
