/** Measured A4 pagination shared by the standalone review and browser PDF export.
 * Keep this function self-contained: the review HTML embeds it without imports.
 */
export function paginateSellerMandateReview(root) {
  if (!root || root.dataset.reviewPaginated === 'true') return
  const source = root.querySelector('[data-review-source]')
  const header = root.querySelector('[data-review-header]')
  const footer = root.querySelector('[data-review-footer]')
  if (!source || !header || !footer) throw new Error('The mandate review layout is incomplete.')
  const blocks = [...source.children]
  const pages = []
  const doc = root.ownerDocument
  let body
  const newPage = () => {
    const page = doc.createElement('section')
    page.className = 'mandate-review-page'
    body = doc.createElement('main')
    body.className = 'review-body'
    page.append(header.content.cloneNode(true), body, footer.content.cloneNode(true))
    root.append(page)
    pages.push(page)
  }
  const fits = () => {
    const bounds = body.getBoundingClientRect()
    const bottom = body.lastElementChild?.getBoundingClientRect().bottom || bounds.top
    // Millimetres produce fractional pixels. Rounded scrollHeight alone can
    // admit a line below the content boundary, so also check its actual edge.
    return bottom <= bounds.bottom - 0.5 && body.scrollHeight <= Math.ceil(bounds.height)
  }
  const place = block => {
    body.append(block)
    if (fits()) return
    block.remove()
    const textNode = block.querySelector('[data-review-text]') || (block.matches('[data-review-text]') ? block : null)
    const available = body.getBoundingClientRect().bottom - (body.lastElementChild?.getBoundingClientRect().bottom || body.getBoundingClientRect().top)
    const continueParagraph = block.matches('p[data-review-text]') && available >= 64
    if (body.children.length && !continueParagraph) {
      const last = body.lastElementChild
      const precedingHeading = last?.matches('h1,h2,h3') ? last : null
      precedingHeading?.remove()
      newPage()
      if (precedingHeading) body.append(precedingHeading)
    }
    if (!continueParagraph) {
      body.append(block)
      if (fits()) return
      block.remove()
    }
    // A long captured paragraph/field can exceed an entire page. Split at word
    // boundaries, retaining its label on every continuation. Signatures stay whole.
    if (!textNode) throw new Error('A mandate review block is too large for an A4 page.')
    let remaining = textNode.textContent
    while (remaining.length) {
      let low = 1, high = remaining.length, count = 0
      const part = block.cloneNode(true)
      const target = part.querySelector('[data-review-text]') || part
      body.append(part)
      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        target.textContent = remaining.slice(0, mid)
        if (fits()) { count = mid; low = mid + 1 } else high = mid - 1
      }
      if (!count) throw new Error('The mandate review text cannot fit on an A4 page.')
      // Prefer a word boundary, but an unusually long URL/word must still fit.
      if (count < remaining.length) {
        const boundary = remaining.slice(0, count).search(/\s+\S*$/)
        if (boundary > 0) count = boundary + 1
        // Leave at least two lines on the next page rather than a lone word.
        target.textContent = remaining.slice(count)
        while (count > 100 && target.getBoundingClientRect().height < 38) {
          count = Math.max(1, count - 40)
          const boundary = remaining.slice(0, count).search(/\s+\S*$/)
          if (boundary > 0) count = boundary + 1
          target.textContent = remaining.slice(count)
        }
      }
      target.textContent = remaining.slice(0, count)
      remaining = remaining.slice(count)
      if (remaining.length) {
        newPage()
        const label = block.querySelector('.review-label')
        if (label && !label.textContent.endsWith(' (continued)')) label.textContent += ' (continued)'
      }
    }
  }
  newPage()
  blocks.forEach((block, index) => {
    block.dataset.reviewBlock = String(index)
    if (block.hasAttribute('data-review-break-before') && body.children.length) newPage()
    if (block.matches('h1,h2,h3') && blocks[index + 1]) {
      // Keep a heading with at least three lines of the following content.
      const probe = blocks[index + 1].cloneNode(true)
      body.append(block, probe)
      const headingBottom = block.getBoundingClientRect().bottom
      const available = body.getBoundingClientRect().bottom - headingBottom
      const nextHeight = probe.getBoundingClientRect().height
      const needed = Math.min(nextHeight, 64)
      block.remove(); probe.remove()
      if (available < needed && body.children.length) newPage()
    }
    place(block)
  })
  pages.forEach((page, index) => { page.querySelector('[data-review-page-number]').textContent = `Page ${index + 1} of ${pages.length}` })
  source.remove()
  root.dataset.reviewPaginated = 'true'
}
