const text = (value) => String(value ?? '').trim()

export function buildSellerSigningPacketFingerprint({ seller = {}, mandate = {}, selectedDocuments = [] } = {}) {
  return JSON.stringify({
    sellerType: text(seller.sellerType),
    sellerName: text(seller.sellerName),
    sellerEmail: text(seller.sellerEmail).toLowerCase(),
    authorisedSignatory: text(seller.authorisedSignatory),
    propertyAddress: text(mandate.propertyAddress),
    commissionBasis: text(mandate.commissionBasis),
    commissionPercentage: text(mandate.commissionPercentage),
    commissionAmount: text(mandate.commissionAmount),
    vatHandling: text(mandate.vatHandling),
    selectedDocuments: [...selectedDocuments].map(text).sort(),
  })
}

export function sellerSigningPacketNeedsSupersession(previousFingerprint = '', nextFingerprint = '') {
  return Boolean(text(previousFingerprint) && text(nextFingerprint) && previousFingerprint !== nextFingerprint)
}
