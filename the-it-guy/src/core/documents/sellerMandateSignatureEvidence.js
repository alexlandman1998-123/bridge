const text = value => String(value ?? '').trim()
const escape = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const regexp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const dateLabel = value => {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : text(value)
}
const recordedLabel = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? `${date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Johannesburg' })} SAST` : text(value)
}

/** Fill each frozen seller/agency signature block before measured pagination. */
export function applyMandateSignatureEvidence(html, evidence, versionDigest) {
  let result = html
  const emails = new Set()
  for (const row of evidence) {
    const email = text(row.signer_email).toLowerCase()
    if (!email || emails.has(email) || row.document_version_digest !== versionDigest || row.signature_type !== 'drawn' ||
        !/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(text(row.signature_value))) throw new Error('The mandate signature evidence is incomplete or does not match this version.')
    emails.add(email)
    const pattern = new RegExp(`(<section class="review-signature" data-mandate-signer="${regexp(escape(email))}"[\\s\\S]*?)<div class="review-signature-lines">[\\s\\S]*?</div></div></section>`, 'g')
    let matched = 0
    result = result.replace(pattern, (_, prefix) => {
      matched++
      return `${prefix}<div class="mandate-recorded-signature"><img alt="Signature of ${escape(row.signed_name)}" src="${escape(row.signature_value)}" style="display:block;max-width:65mm;max-height:18mm;margin:3mm 0"><p>Signed by ${escape(row.signed_name)} as ${escape(row.signer_role)}<br>At ${escape(row.signed_place)} on ${escape(dateLabel(row.signed_date))}<br>Recorded ${escape(recordedLabel(row.accepted_at))}</p><p style="font-size:8pt">Document version: ${escape(versionDigest)}<br>Evidence: ${escape(row.evidence_digest)}</p></div></section>`
    })
    if (matched !== 1) throw new Error('Every mandate signature must match exactly one frozen signature block.')
  }
  if ((result.match(/class="review-signature-lines"/g) || []).length) throw new Error('All sellers and contracting agencies must sign this mandate before review.')
  return result
}
