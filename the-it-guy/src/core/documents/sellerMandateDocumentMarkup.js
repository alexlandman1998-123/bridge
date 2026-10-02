import { buildSellerMandateWordingMarkup } from './sellerMandateWordingMarkup.js'
export { SELLER_MANDATE_DOCUMENT_CONTRACT, requireSellerMandateWording, buildSellerMandateDocumentModel } from './sellerMandateWordingMarkup.js'

export const SELLER_MANDATE_DOCUMENT_TEMPLATE_VERSION = 'seller_mandate_shared_layout_v2'

/** Both lead and listing preparation render the same reviewed wording and parties. */
export function buildSellerMandateDocumentMarkup(input = {}) {
  return buildSellerMandateWordingMarkup({
    ...input,
    approval: input.approval || input.formalPackApproval || {},
  })
}
