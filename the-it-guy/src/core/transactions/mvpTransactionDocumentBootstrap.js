export const MVP_TRANSACTION_DOCUMENT_BOOTSTRAP_VERSION = 'arch9_mvp_transaction_document_bootstrap_v1'

function requirement(key, label, requiredFromRole, groupKey, description, options = {}) {
  return {
    key,
    label,
    requiredFromRole,
    groupKey,
    description,
    required: true,
    requiresUpload: options.requiresUpload !== false,
    satisfactionMode: options.satisfactionMode || 'verified_upload',
  }
}

export function buildMvpTransactionDocumentBootstrap(profile = {}) {
  const rows = [
    requirement('buyer_identity', 'Buyer identity document', 'buyer', 'buyer_fica', 'Identity document for the purchaser.'),
    requirement('buyer_proof_of_address', 'Buyer proof of address', 'buyer', 'buyer_fica', 'Proof of residential address for the purchaser.'),
    requirement('seller_identity', 'Seller identity document', profile.transactionType === 'development_sale' ? 'developer' : 'seller', 'seller_fica', 'Identity or representative record for the seller.'),
    requirement('property_title_deed', 'Title deed / property ownership record', profile.transactionType === 'development_sale' ? 'developer' : 'seller', 'property', 'Property ownership record required for transfer preparation.'),
  ]
  if (profile.hasAdditionalBuyer || profile.multiBuyer || Number(profile.buyerCount || 0) > 1) {
    rows.push(requirement('additional_buyer_fica', 'Additional buyer FICA', 'additional_buyer', 'buyer_fica', 'Identity and address evidence for each co-purchaser.'))
  }
  if (profile.buyerSpouseConsentRequired || profile.hasBuyerSpouse) {
    rows.push(requirement('buyer_spouse_consent', 'Buyer spouse consent', 'buyer_spouse', 'buyer_marital', 'Spouse consent and FICA evidence where marital status requires it.'))
  }
  if (profile.sellerSpouseConsentRequired || profile.hasSellerSpouse) {
    rows.push(requirement('seller_spouse_consent', 'Seller spouse consent', 'seller_spouse', 'seller_marital', 'Spouse consent and FICA evidence where marital status requires it.'))
  }
  if (profile.foreignBuyer || profile.buyerForeign || profile.isForeignBuyer) {
    rows.push(requirement('foreign_buyer_fica', 'Foreign buyer FICA', 'foreign_buyer_signatory', 'buyer_fica', 'Passport, residency, tax and FICA evidence for the foreign purchaser.'))
  }
  if (profile.buyerEntityType === 'company') {
    rows.push(requirement('buyer_company_authority', 'Buyer company authority', 'buyer_company_signatory', 'buyer_entity', 'Company registration and signing authority.'))
    rows.push(requirement('buyer_director_fica', 'Buyer director FICA', 'buyer_company_director', 'buyer_entity', 'Director identity and FICA evidence for the purchasing company.'))
  }
  if (profile.buyerEntityType === 'trust') rows.push(requirement('buyer_trust_authority', 'Buyer trust authority', 'buyer_trustee', 'buyer_entity', 'Trust deed, letters of authority, and trustee resolution.'))
  if (profile.sellerEntityType === 'company') {
    rows.push(requirement('seller_company_authority', 'Seller company authority', 'seller_company_signatory', 'seller_entity', 'Company registration and signing authority.'))
    rows.push(requirement('seller_director_fica', 'Seller director FICA', 'seller_company_director', 'seller_entity', 'Director identity and FICA evidence for the selling company.'))
  }
  if (profile.sellerEntityType === 'trust') rows.push(requirement('seller_trust_authority', 'Seller trust authority', 'seller_trustee', 'seller_entity', 'Trust deed, letters of authority, and trustee resolution.'))
  if (profile.financeType === 'cash' || profile.financeType === 'hybrid') rows.push(requirement('proof_of_funds', 'Proof of funds', 'buyer', 'finance', 'Evidence for the cash component of the purchase.'))
  if (profile.financeType === 'bond' || profile.financeType === 'hybrid') rows.push(requirement('bond_preapproval', 'Bond pre-approval / application', 'bond_originator', 'finance', 'Bond application and approval evidence.'))
  if (profile.requiresCancellationAttorney) rows.push(requirement('bond_cancellation_figures', 'Existing bond cancellation figures', 'cancellation_attorney', 'cancellation', 'Cancellation figures for the seller’s existing bond.'))
  return Object.freeze({ version: MVP_TRANSACTION_DOCUMENT_BOOTSTRAP_VERSION, requirements: rows })
}
