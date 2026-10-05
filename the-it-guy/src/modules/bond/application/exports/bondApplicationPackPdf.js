import { jsPDF } from 'jspdf'
import { BOND_APPLICATION_QUESTIONS, BOND_APPLICATION_REPEATABLE_GROUPS } from '../flow/bondApplicationFlowContract.js'
import { buildBondApplicationDocumentPresentation } from './bondApplicationDocumentPresentation.js'

const moneyFields = new Set([...BOND_APPLICATION_QUESTIONS, ...Object.values(BOND_APPLICATION_REPEATABLE_GROUPS).flatMap((group) => group.itemFields)].filter((field) => field.type === 'currency').map((field) => field.path.split('.').at(-1)))
const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 })

const title = (value) => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const display = (value) => value === null || value === undefined || value === '' ? 'Not provided' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
const displayDate = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : display(value)

export function flattenBondAnswers(value, prefix = '', fieldKey = '') {
  if (Array.isArray(value)) return value.length ? value.flatMap((item, index) => flattenBondAnswers(item, `${prefix} ${index + 1}`.trim())) : [[prefix, 'None recorded']]
  if (value && typeof value === 'object') return Object.keys(value).length ? Object.entries(value).flatMap(([key, item]) => flattenBondAnswers(item, [prefix, title(key)].filter(Boolean).join(' / '), key)) : [[prefix, 'Not provided']]
  const rendered = moneyFields.has(fieldKey) && value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? currency.format(Number(value)) : display(value)
  return [[prefix, rendered]]
}

export async function renderBondApplicationPackPdf({ snapshot, manifest, brand = {}, submission, readiness, fontBytes } = {}) {
  const presentation = buildBondApplicationDocumentPresentation(snapshot)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  if (!fontBytes) {
    const result = await fetch(new URL('../../../../assets/fonts/DejaVuSans.ttf', import.meta.url))
    if (!result.ok) throw new Error('The application PDF font could not be loaded. Please retry.')
    fontBytes = new Uint8Array(await result.arrayBuffer())
  }
  let binary = ''
  for (const byte of fontBytes) binary += String.fromCharCode(byte)
  doc.addFileToVFS('BondSans.ttf', btoa(binary))
  doc.addFont('BondSans.ttf', 'BondSans', 'normal')
  doc.setFont('BondSans')
  doc.setProperties({ title: manifest.purpose === 'wet_ink_signing' ? 'Bond application for signature' : `${manifest.mode === 'final' ? 'Signed' : 'Draft'} bond application`, subject: 'Application answers and supporting document index', creator: 'Arch9' })
  const margin = 17, right = 193, bottom = 276
  let y = 25
  const text = (value, x, at, size = 9, color = '#25354a') => {
    for (const character of String(value)) {
      const code = character.codePointAt(0)
      if (code > 0xffff || (code > 32 && !doc.getFont().metadata.characterToGlyph(code))) throw new Error(`The PDF font cannot render character U+${code.toString(16).toUpperCase()}. No incomplete pack was created.`)
    }
    doc.setFontSize(size); doc.setTextColor(color); doc.text(String(value), x, at)
  }
  const page = () => { if (doc.getNumberOfPages() >= 200) throw new Error('The application exceeds 200 pages. Review unusually long answers before downloading.'); doc.addPage(); y = 23; text(doc.splitTextToSize(brand.name || 'Bond application', right - margin)[0], margin, 12, 9, '#587087') }
  const room = (height) => { if (y + height > bottom) page() }
  const section = (label) => {
    room(72); y += 5
    doc.setFillColor('#edf4f1'); doc.rect(margin, y - 5, right - margin, 10, 'F')
    doc.setFillColor('#123d38'); doc.rect(margin, y - 5, 1.2, 10, 'F')
    text(label, margin + 4, y + 1, 10, '#123d38'); y += 12
  }
  const paragraph = (value, size = 9) => {
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(String(value), right - margin)
    if (lines.length * 4.8 + 3 < bottom - 23) room(lines.length * 4.8 + 3)
    for (const line of lines) { room(5); text(line, margin, y, size); y += 4.8 }
    y += 3
  }
  const row = (label, value) => {
    doc.setFontSize(8.5)
    const leftLines = doc.splitTextToSize(label || 'Value', 58)
    const rightLines = doc.splitTextToSize(display(value), 109)
    const lineCount = Math.max(leftLines.length, rightLines.length)
    if (lineCount * 4.5 + 4 < bottom - 23) room(lineCount * 4.5 + 4)
    // Split even exceptionally long values across pages instead of clipping or shrinking them.
    for (let index = 0; index < lineCount; index++) {
      if (y + 5 > bottom && index > 0) {
        page()
        const continued = doc.splitTextToSize(`${label || 'Value'} (continued)`, 58)
        continued.slice(0, 3).forEach((line, offset) => text(line, margin + 1, y + offset * 4.5, 8.5, '#52677c'))
      }
      room(5)
      if (leftLines[index]) text(leftLines[index], margin + 1, y, 8.5, '#52677c')
      if (rightLines[index]) text(rightLines[index], margin + 64, y, 8.5)
      y += 4.5
    }
    y += 2; doc.setDrawColor('#e2e8ee'); doc.line(margin, y - 1, right, y - 1); y += 2
  }
  doc.setFillColor('#123d38'); doc.rect(0, 0, 210, 53, 'F')
  doc.setFontSize(17)
  for (const line of doc.splitTextToSize(brand.name || 'Arch9', brand.logoData ? 130 : right - margin).slice(0, 2)) { text(line, margin, y, 17, '#ffffff'); y += 8 }
  text('BOND APPLICATION', margin, 44, 10, '#c8dfd5')
  y = 65
  if (brand.logoData) {
    const properties = doc.getImageProperties(brand.logoData)
    const width = Math.min(36, 15 * properties.width / properties.height)
    const height = width * properties.height / properties.width
    doc.setFillColor('#ffffff'); doc.roundedRect(right - width - 2, 12, width + 4, height + 4, 1, 1, 'F')
    doc.addImage(brand.logoData, properties.fileType, right - width, 14, width, height)
  }
  text(manifest.mode === 'final' ? 'SIGNED APPLICATION RECORD' : manifest.purpose === 'wet_ink_signing' ? 'APPLICATION FOR SIGNATURE' : 'DRAFT / UNSIGNED - NOT FOR BANK SUBMISSION', margin, y, 10, manifest.mode === 'final' ? '#17634e' : '#925c19'); y += 8
  paragraph(manifest.mode === 'final'
    ? manifest.signingEvidence === 'captured_html_signature' ? 'This application record reproduces the saved answers and captured signature. It is not a digital signature certificate. Later supporting files are identified separately.' : 'This readable record reproduces the saved application. The original signed PDF is included unchanged in the ZIP. Later supporting files are identified separately.'
    : manifest.purpose === 'wet_ink_signing' ? 'This fixed application version is ready for your review and signature. Sign every required space, mark optional choices and upload all pages for consultant review.' : 'This draft contains the currently captured answers. It may be incomplete and is not a signed application or confirmation of bank acceptance.')
  row('Application reference', presentation.reference)
  row('Version', manifest.submissionVersion || snapshot.submissionVersion || 'Draft')
  row('Generated (South African time)', displayDate(manifest.generatedAt))
  if (manifest.signedAt) row('Signed (South African time)', displayDate(manifest.signedAt))
  if (manifest.mode === 'draft' && readiness?.issues?.length) { section('Outstanding items'); readiness.issues.forEach((issue) => paragraph(issue.message)) }
  let participantHeading = ''
  for (const item of presentation.sections) {
    if (item.participant && item.participant !== participantHeading) {
      room(100); paragraph(item.participant, 12)
      participantHeading = item.participant
    }
    section(item.title)
    for (const entry of item.rows) row(entry.label, entry.value)
  }
  if (manifest.mode === 'draft' && snapshot.draftDeclarations?.length) {
    section('Captured declaration answers - draft')
    for (const participant of snapshot.draftDeclarations) {
      paragraph(title(participant.participantRole), 10)
      flattenBondAnswers(participant.answers).forEach(([label, value]) => row(label, value))
    }
  }
  const paperSigning = manifest.purpose === 'wet_ink_signing'
  section(paperSigning ? 'Permissions to confirm when signing' : 'Declarations and acceptance evidence')
  const declarations = submission?.metadata?.signingMethod === 'wet_ink_upload' ? submission.declarations_json || presentation.declarations : presentation.declarations
  if (!declarations.length) paragraph('No declaration evidence is recorded in this snapshot.')
  for (const declaration of declarations) {
    doc.setFontSize(9)
    const height = 42 + doc.splitTextToSize(declaration.text || '', right - margin).length * 4.8
    room(Math.min(height, bottom - 23)); paragraph(declaration.title || title(declaration.key), 10)
    paragraph(declaration.text || 'Declaration text not recorded')
    if (paperSigning) {
      row('Applicant / wording version', `${snapshot.signerManifest?.find((signer) => signer.participantKey === declaration.participantKey)?.fullName || title(declaration.participantRole)} / ${declaration.version}`)
      paragraph(declaration.required ? 'Required permission: confirmed by this applicant signing below.' : 'Optional permission: mark one choice. [ ] I agree    [ ] I do not agree')
    } else {
      row('Version / accepted', `${declaration.version || 'Not recorded'} / ${display(declaration.accepted)}`)
      row('Participant / accepted at', `${declaration.participantKey || declaration.participantRole || 'Not recorded'} / ${declaration.acceptedAt || 'Not recorded'}`)
    }
  }
  const signature = snapshot.signatureEvidence || null
  if (signature?.dataUrl && manifest.mode === 'final') {
    section('Applicant signature')
    paragraph('The applicant confirmed this application in Arch9 using the drawn signature below. This is an in-app application confirmation, not a third-party digital signature certificate.')
    row('Signed by', signature.signerName || 'Primary applicant')
    row('Signed at', signature.signedAt || 'Not recorded')
    room(38)
    try {
      const properties = doc.getImageProperties(signature.dataUrl)
      const width = Math.min(78, 30 * properties.width / properties.height)
      const height = Math.min(28, width * properties.height / properties.width)
      doc.addImage(signature.dataUrl, properties.fileType, margin, y, width, height)
      y += height + 7
    } catch {
      if (manifest.mode === 'final') throw new Error('The captured signature could not be rendered. No final pack was created.')
      paragraph('The captured signature image could not be rendered in this copy.')
    }
  }
  section('Signing evidence')
  paragraph(paperSigning ? 'This application is unsigned. Each applicant must sign and date their own space below. Upload all pages for consultant review.' : manifest.mode === 'draft' ? 'This document is unsigned. Signature spaces below are provided for review; the signed upload and acceptance process must be completed separately.' : manifest.signingEvidence === 'captured_html_signature' ? 'The identities and captured signature describe the saved application confirmation. The unchanged evidence is included in application-data.json and signed-evidence/. This copy does not apply a new signature.' : 'Signer identities below describe the saved signing request. They are not newly applied signatures. Refer to the original signed PDF for the actual signed instrument.')
  const signers = submission?.signer_manifest_json || snapshot.signerManifest || []
  if (manifest.mode === 'draft') {
    section('Signature spaces - unsigned')
    if (paperSigning) paragraph('Each applicant: I have reviewed my details and the application. My signature confirms the required permissions above and the optional choices I marked. Sign and date your own space. Upload every page of this application together.')
    for (const signer of signers.length ? signers : [{ fullName: 'Applicant' }]) {
      room(30); paragraph(`${signer.fullName || 'Applicant'} - ${title(signer.participantRole || signer.role || 'applicant')}`, 10)
      doc.setDrawColor('#91a69f'); doc.line(margin, y + 10, 123, y + 10); doc.line(139, y + 10, right, y + 10)
      text('Signature', margin, y + 15, 8, '#52677c'); text('Date', 139, y + 15, 8, '#52677c'); y += 25
    }
  }
  for (const signer of signers) {
    row(title(signer.participantRole || signer.role || 'Signer'), `${signer.fullName || 'Name not recorded'} / ${signer.email || 'Email not recorded'}`)
    row('Identity reference', signer.identityReference || 'Not recorded')
  }
  if (submission?.signed_at) row('Submission signing completed', submission.signed_at)
  section('Supporting-document checklist')
  if (!presentation.documentChecklist.length) paragraph('Document requirements have not been recorded in this snapshot.')
  for (const item of presentation.documentChecklist) row(item.title, `${item.status} | ${item.fileCount} of ${item.minimumFileCount} files | ${item.requiredBefore}`)
  section('Supporting document index')
  if (!manifest.files.length) paragraph('No supporting files are included in this download.')
  for (const file of manifest.files) {
    row(file.requirements.join('; '), file.path)
    row('Evidence source', title(file.source))
    if (file.sha256) row('File SHA-256', file.sha256)
  }
  for (const warning of manifest.warnings || []) paragraph(warning)
  section('Version verification')
  row(paperSigning ? 'Application version' : 'Submission ID', paperSigning ? presentation.reference : manifest.submissionId || 'Draft')
  row('Snapshot SHA-256', manifest.snapshotHash)
  paragraph(paperSigning ? 'Keep a copy of the complete signed application. Upload every page together, including the permissions and signature spaces. Your consultant reviews it before acceptance. Bank submission is checked separately.' : 'Keep the PDF, original signed evidence and supporting files together. The ZIP includes the captured application data and a machine-readable document index. No bank submission is performed by downloading this pack.')
  const pages = doc.getNumberOfPages()
  for (let number = 1; number <= pages; number++) {
    doc.setPage(number); doc.setDrawColor('#d3dee7'); doc.line(margin, 284, right, 284)
    text(`${manifest.mode === 'final' ? 'Application record' : paperSigning ? `${presentation.reference} | COPY FOR SIGNATURE` : 'DRAFT / UNSIGNED'} | v${presentation.version}`, margin, 290, 8, '#64768a')
    text(`${number} / ${pages}`, 179, 290, 8, '#64768a')
  }
  return new Uint8Array(doc.output('arraybuffer'))
}
