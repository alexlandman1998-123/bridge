import { paginateSellerMandateReview } from './sellerMandateReviewPagination.js'

// Run the app's measured layout in the sandboxed document. Document scripts
// remain blocked, and the same full copy is used by the PDF exporter.
export async function prepareSellerMandateReviewPreview(iframe) {
  const doc = iframe?.contentDocument
  const root = doc?.querySelector('[data-review-layout="seller-mandate-review"]')
  if (!root) return
  await doc.fonts?.ready
  if (iframe.contentDocument !== doc) return
  paginateSellerMandateReview(root)
  if (!doc.querySelector('[data-mandate-screen-style]')) {
    const style = doc.createElement('style')
    style.dataset.mandateScreenStyle = 'true'
    style.textContent = `@media screen and (max-width:850px){html,body{max-width:100%;overflow-x:hidden}.mandate-review-document[data-review-paginated=true]{width:100%}.mandate-review-document[data-review-paginated=true] .mandate-review-page{width:100%;height:auto;min-height:0;display:block;padding:20px 16px}.mandate-review-document .review-header{flex-wrap:wrap;gap:12px}.mandate-review-document .review-meta{text-align:left}.mandate-review-document .review-body{padding:16px 0}.mandate-review-document .review-footer{margin-top:20px}.mandate-review-document .review-field,.mandate-review-document .review-signature-detail{grid-template-columns:1fr;gap:5px}.mandate-review-document .review-signature-lines{gap:16px}.mandate-review-document h1{font-size:24px}}`
    doc.head.appendChild(style)
  }
}
