const text = value => String(value ?? '').trim()
const escape = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const date = value => {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : text(value)
}
const signature = row => row.signature_type === 'drawn'
  ? `<img alt="Signature of ${escape(row.signed_name)}" src="${escape(row.signature_value)}" style="max-height:18mm;max-width:100%;object-fit:contain" />`
  : `<em>${escape(row.signature_value)}</em>`

/** Annotate signature panels and append branded evidence, without changing the frozen source. */
export function applySellerDocumentSignatureEvidence(reviewedHtml, evidence, versionDigest) {
  const emails = new Set()
  for (const row of evidence) {
    const email = text(row.signer_email).toLowerCase()
    if (!email || emails.has(email) || row.document_version_digest !== versionDigest || !text(row.signed_name) || !text(row.signer_role) || !text(row.evidence_digest) ||
      !['drawn', 'typed'].includes(row.signature_type) || !text(row.signature_value) ||
      row.signature_type === 'drawn' && !/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(text(row.signature_value))) {
      throw new Error('The seller signature evidence is incomplete or does not match this version.')
    }
    emails.add(email)
  }
  if (!evidence.length) throw new Error('Every required signer must sign before producing the completed document.')
  let result = reviewedHtml
  result = result.replace(/<article class="signer-card">[\s\S]*?<\/article>/g, card => {
    const identity = card.match(/<div(?: class="signer-card-main")?>[\s\S]*?<\/div>/)?.[0] || ''
    const row = evidence.find(value => identity.toLowerCase().includes(`<span>${escape(value.signer_email).toLowerCase()}</span>`))
    if (!row) throw new Error('A frozen signature panel has no matching recorded signer.')
    const disclosure = card.includes('signer-card-main')
    return `<article class="signer-card" data-recorded-seller-signature="${escape(row.signer_email)}" style="overflow-wrap:anywhere"><div${disclosure ? ' class="signer-card-main"' : ''}><span>${escape(row.signer_role)}</span><strong>${escape(row.signed_name)}</strong><span>${escape(row.signer_email)}</span></div><div${disclosure ? ' class="signer-card-meta"' : ''}><span class="${disclosure ? 'signer-status' : 'status'}">Signature recorded</span><span>${escape(date(row.signed_date))}</span><span>${escape(row.signed_place)}</span></div><div class="${disclosure ? 'signer-card-signature' : 'signature'}">${signature(row)}</div></article>`
  })
  result = result.replace(/(<div class="compliance-summary">\s*<span>Status<\/span>\s*)<strong>[\s\S]*?<\/strong>/g,
    `$1<strong>All ${evidence.length} required signatures recorded</strong>`)
  // A combined disclosure declaration references its per-person certificate.
  // Do not leave an old captured place or an empty signature box on the final copy.
  result = result.replace(/(<span class="execution-label">(?:Date signed|Signed at)<\/span>\s*)<span class="execution-value">[\s\S]*?<\/span>/g,
    '$1<span class="execution-value">See recorded signature evidence</span>')
  result = result.replace(/<div class="signature-box">[\s\S]*?<\/div>/g,
    '<div class="signature-box">Every required signature is recorded in the signature evidence below.</div>')

  const disclosure = result.includes('class="property-disclosure-page"')
  const pageClass = disclosure ? 'property-disclosure-page' : 'page'
  const header = result.match(/<header class="(?:doc-header|header)"[\s\S]*?<\/header>/)?.[0] || ''
  const footer = result.match(/<footer class="(?:doc-footer|footer)"[\s\S]*?<\/footer>/)?.[0] || ''
  const count = (result.match(new RegExp(`<section class="${pageClass}"`, 'g')) || []).length
  const groups = []
  for (let index = 0; index < evidence.length; index += 2) groups.push(evidence.slice(index, index + 2))
  const total = count + groups.length
  const sections = groups.map((group, index) => `<section class="${pageClass} seller-portal-signature-page" style="position:relative;min-height:296mm;box-sizing:border-box;overflow-wrap:anywhere">${header}<main style="padding:8mm 18mm 20mm"><h2 style="color:var(--doc-primary-ink,var(--primary-ink,#152338));font-size:16pt">Electronic signatures</h2><p style="font-size:8pt">Recorded signature evidence. All required signatures for this document are recorded. Supporting-evidence verification is recorded separately.<br>Reviewed document version: ${escape(versionDigest)}</p>${group.map(row => `<article data-signature-evidence="${escape(row.signer_email)}" style="border:1px solid #d5ddd8;border-radius:2mm;padding:4mm;margin-top:5mm;break-inside:avoid;font-size:9pt;line-height:1.5"><strong>${escape(row.signed_name)}</strong> · ${escape(row.signer_role)}<br>${signature(row)}<p>Signed at ${escape(row.signed_place)} on ${escape(date(row.signed_date))}<br>Recorded ${escape(row.accepted_at)}<br>Evidence: ${escape(row.evidence_digest)}</p></article>`).join('')}</main>${footer.replace(/Page \d+ of \d+/, `Page ${count + index + 1} of ${total}`)}</section>`).join('')
  // Keep evidence inside the existing branded root so CSS palette variables
  // and page dimensions apply. Historical fragments retain a plain fallback.
  if (/<\/(?:div|main)>\s*<\/body>/i.test(result)) result = result.replace(/<\/(div|main)>(\s*<\/body>)/i, `${sections}</$1>$2`)
  else result = /<\/body>/i.test(result) ? result.replace(/<\/body>/i, `${sections}</body>`) : `${result}${sections}`
  return result.replace(/<footer class="(?:doc-footer|footer)"[\s\S]*?<\/footer>/g,
    markup => markup.replace(/Page (\d+) of \d+/g, (_, number) => `Page ${number} of ${total}`))
}
