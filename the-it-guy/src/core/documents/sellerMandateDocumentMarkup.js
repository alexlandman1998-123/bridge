import { buildSellerMandateWordingMarkup } from './sellerMandateWordingMarkup.js'
import { buildSellerMandateLayoutMarkup } from './sellerMandateReviewDocumentMarkup.js'
import { assertMandateWordingApproved, getFrozenMandateWordingRelease, mandateRequiredSigners } from './sellerMandateSigningApproval.js'
export { SELLER_MANDATE_DOCUMENT_CONTRACT, requireSellerMandateWording, buildSellerMandateDocumentModel } from './sellerMandateWordingMarkup.js'

export const SELLER_MANDATE_DOCUMENT_TEMPLATE_VERSION = 'seller_mandate_shared_layout_v2'
export const sellerMandateDocumentTemplateVersion = pack => pack?.mandate?.mandateCapture !== undefined
  ? assertMandateWordingApproved(pack.mandate).version : SELLER_MANDATE_DOCUMENT_TEMPLATE_VERSION

/** Keep the v1 renderer available for exact reconstruction of historical HTML. */
export function buildSellerMandateFrozenDocumentMarkup(contract) {
  const release = getFrozenMandateWordingRelease(contract)
  mandateRequiredSigners(contract.inputs)
  return buildSellerMandateLayoutMarkup({ signingPack: contract.inputs, draftMarkdown: release.markdown,
    generatedAt: contract.inputs.renderedAt, signingCopy: true, wordingVersion: release.version })
}

/** Both lead and listing preparation render the same reviewed wording and parties. */
export function buildSellerMandateDocumentMarkup(input = {}) {
  if (input.signingPack?.mandate?.mandateCapture !== undefined) {
    const release = assertMandateWordingApproved(input.signingPack.mandate)
    mandateRequiredSigners(input.signingPack)
    return buildSellerMandateLayoutMarkup({ signingPack: input.signingPack, draftMarkdown: release.markdown,
      generatedAt: input.generatedAt, signingCopy: true, wordingVersion: release.version })
  }
  return buildSellerMandateWordingMarkup({
    ...input,
    approval: input.approval || input.formalPackApproval || {},
  })
}
