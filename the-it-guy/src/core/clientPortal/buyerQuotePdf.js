export async function fetchBuyerQuotePdf({ offer, resolveQuote, fetchFile = fetch }) {
  // Always obtain a fresh URL; an earlier popup URL may have expired or the
  // consultant may have replaced/withdrawn the document since it was opened.
  const document = await resolveQuote(offer)
  if (!/^https?:\/\//i.test(document?.url || '')) throw new Error('This quote PDF is not available.')
  const response = await fetchFile(document.url, { credentials: 'omit' })
  if (!response.ok) throw new Error('The quote could not be downloaded. Please retry.')
  const blob = await response.blob()
  const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())
  if (signature !== '%PDF-') throw new Error('The shared file could not be read as a PDF. Ask your consultant to check it.')
  const name = document.name || `${offer.bankName}-quote.pdf`
  return { blob, name: /\.pdf$/i.test(name) ? name : `${name}.pdf` }
}
