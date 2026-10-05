import { jsPDF } from 'jspdf'

export async function renderBondSubmissionChecklistPdf(checklist, { fontBytes, brandName = 'Bond application' } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  if (!fontBytes) {
    const response = await fetch(new URL('../../../../assets/fonts/DejaVuSans.ttf', import.meta.url))
    if (!response.ok) throw new Error('The checklist font could not be loaded.')
    fontBytes = new Uint8Array(await response.arrayBuffer())
  }
  let binary = ''
  for (const byte of fontBytes) binary += String.fromCharCode(byte)
  doc.addFileToVFS('BondChecklist.ttf', btoa(binary))
  doc.addFont('BondChecklist.ttf', 'BondChecklist', 'normal')
  doc.setFont('BondChecklist')
  doc.setProperties({ title: 'Bond application submission checklist', creator: 'Arch9' })
  let y = 22
  const line = (value, size = 10, color = '#25354a') => {
    if (size >= 12 && y > 250) { doc.addPage(); y = 22 }
    doc.setFontSize(size); doc.setTextColor(color)
    // Unsupported glyphs are replaced consistently rather than rendered as boxes.
    const text = [...String(value || '')].map(char => char.codePointAt(0) > 0xffff || (char.codePointAt(0) > 32 && !doc.getFont().metadata.characterToGlyph(char.codePointAt(0))) ? '?' : char).join('')
    for (const chunk of doc.splitTextToSize(text, 174)) {
      if (y > 273) { doc.addPage(); y = 22 }
      doc.text(chunk, 18, y); y += size * 0.45 + 1.5
    }
  }
  line(brandName, 12, '#35546c'); y += 4
  line('Application submission checklist', 19); y += 3
  line(checklist.ready ? 'Ready for bank submission' : 'INCOMPLETE - outstanding items below', 11, checklist.ready ? '#15594f' : '#9b4429')
  line(`Reference: ${checklist.reference}`)
  line(`Application version: ${checklist.submissionVersion || 'Recorded'} | Signed: ${String(checklist.signedAt).slice(0, 10)}`)
  line(`Prepared: ${new Date(checklist.generatedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC`, 8)
  y += 6
  line('Signed application', 13, '#35546c')
  line('Download the accepted signed PDF separately. Its original pages and signatures are preserved unchanged.')
  y += 4; line('Supporting documents', 13, '#35546c')
  for (const row of checklist.rows) {
    const title = `${row.title}${row.participantRole ? ` (${row.participantRole.replaceAll('_', ' ')})` : ''}`
    const status = `${row.status}${row.external ? ' - consultant supplies statements from the secure external system once connected.' : ` - ${row.included.length} approved file(s)${row.required ? `; ${row.required} required` : ''}`}`
    doc.setFontSize(10)
    const titleHeight = doc.splitTextToSize(title, 174).length * 6
    doc.setFontSize(9)
    const statusHeight = doc.splitTextToSize(status, 174).length * 5.55
    if (y + 3 + titleHeight + statusHeight > 273) { doc.addPage(); y = 22 }
    y += 3
    line(title, 10)
    line(status, 9, row.outstanding ? '#9b4429' : '#15594f')
    for (const id of row.included) {
      const file = checklist.files.find(item => item.documentId === id)
      if (file) line(file.path, 8, '#52657b')
    }
  }
  if (checklist.issues.length) {
    y += 5; line('Other outstanding application items', 13, '#35546c')
    for (const issue of checklist.issues) line(typeof issue === 'string' ? issue : issue.message || issue.title || issue.code || 'Consultant review required', 9)
  }
  y += 5; line('Consultant review', 13, '#35546c')
  line(checklist.consultantReview?.current ? `Recorded on ${String(checklist.consultantReview.reviewed_at).replace('T', ' ').slice(0, 19)} UTC for this application and its current documents. Release approvals remain separate.` : 'Current consultant review is required before bank submission. Changes to the application or documents require another review.', 9)
  y += 5; line('Bank statements', 13, '#35546c')
  line('Secure handoff is not connected. Receipt has not been verified. Statements are excluded from this archive; no statement bytes are retrieved when preparing it.', 9)
  y += 4; line('Version integrity', 13, '#35546c')
  line(`Signed snapshot SHA-256: ${checklist.snapshotHash}`, 8)
  line('This checklist reflects the documents at download time. Later evidence does not change the signed answers. Review all outstanding items before sending to a bank.', 9)
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setDrawColor('#dbe5ee'); doc.line(18, 283, 192, 283)
    doc.setFontSize(7); doc.setTextColor('#52657b'); doc.text(`Reference: ${String(checklist.reference).slice(0, 70)}`, 18, 288); doc.text(`Page ${page} of ${pages}`, 192, 288, { align: 'right' })
  }
  return new Uint8Array(doc.output('arraybuffer'))
}
