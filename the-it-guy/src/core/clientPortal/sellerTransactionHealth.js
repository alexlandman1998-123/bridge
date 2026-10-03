/** Document status comes from the same summary used by the seller checklist. */
export function buildSellerTransactionHealth({ documentSummary = {}, available = false, loadError = '' } = {}) {
  if (!available || loadError) return {
    label: 'Status unavailable', tone: 'neutral', available: false,
    summary: 'Your document status could not be confirmed. Open your document centre to check or try again shortly.',
  }

  const count = (value) => Math.max(0, Math.floor(Number(value) || 0))
  const actionCount = count(documentSummary.actionRequired)
  const reviewCount = count(documentSummary.reviewRequired)
  const approvedCount = count(documentSummary.approved)
  return {
    available: true, actionCount, reviewCount, approvedCount,
    label: actionCount ? 'Action needed' : reviewCount ? 'Awaiting review' : 'Up to date',
    tone: actionCount ? 'action' : reviewCount ? 'review' : 'success',
    summary: actionCount
      ? `${actionCount} required item${actionCount === 1 ? ' needs' : 's need'} your attention.`
      : reviewCount
        ? `${reviewCount} submitted item${reviewCount === 1 ? ' is' : 's are'} awaiting your team’s review. No upload is needed for these items.`
        : documentSummary.total
          ? 'Your document checklist is up to date. No document action is required from you.'
          : 'No document items are currently requested from you.',
  }
}
