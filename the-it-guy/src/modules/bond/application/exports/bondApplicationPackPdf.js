import { jsPDF } from 'jspdf'
import { BOND_APPLICATION_QUESTIONS, BOND_APPLICATION_REPEATABLE_GROUPS } from '../flow/bondApplicationFlowContract.js'

const moneyFields = new Set([...BOND_APPLICATION_QUESTIONS, ...Object.values(BOND_APPLICATION_REPEATABLE_GROUPS).flatMap((group) => group.itemFields)].filter((field) => field.type === 'currency').map((field) => field.path.split('.').at(-1)))
const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 })

const title = (value) => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const display = (value) => value === null || value === undefined || value === '' ? 'Not provided' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)

export function flattenBondAnswers(value, prefix = '', fieldKey = '') {
  if (Array.isArray(value)) return value.length ? value.flatMap((item, index) => flattenBondAnswers(item, `${prefix} ${index + 1}`.trim())) : [[prefix, 'None recorded']]
  if (value && typeof value === 'object') return Object.keys(value).length ? Object.entries(value).flatMap(([key, item]) => flattenBondAnswers(item, [prefix, title(key)].filter(Boolean).join(' / '), key)) : [[prefix, 'Not provided']]
  const rendered = moneyFields.has(fieldKey) && value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? currency.format(Number(value)) : display(value)
  return [[prefix, rendered]]
}

export async function renderBondApplicationPackPdf({ snapshot, manifest, brand = {}, submission, readiness, fontBytes } = {}) {
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
  doc.setProperties({ title: `${manifest.mode === 'final' ? 'Signed' : 'Draft'} bond application`, subject: 'Application answers and supporting document index', creator: 'Arch9' })
  const margin = 17, right = 193, bottom = 276
  let y = 22
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
    room(19); y += 5
    doc.setFillColor('#eaf0f5'); doc.rect(margin, y - 5, right - margin, 10, 'F')
    text(label, margin + 3, y + 1, 11, '#16324f'); y += 12
  }
  const paragraph = (value, size = 9) => {
    doc.setFontSize(size)
    for (const line of doc.splitTextToSize(String(value), right - margin)) { room(5); text(line, margin, y, size); y += 4.8 }
    y += 3
  }
  const row = (label, value) => {
    doc.setFontSize(8.5)
    const leftLines = doc.splitTextToSize(label || 'Value', 58)
    const rightLines = doc.splitTextToSize(display(value), 109)
    const lineCount = Math.max(leftLines.length, rightLines.length)
    // Split even exceptionally long values across pages instead of clipping or shrinking them.
    for (let index = 0; index < lineCount; index++) {
      room(5)
      if (leftLines[index]) text(leftLines[index], margin + 1, y, 8.5, '#52677c')
      if (rightLines[index]) text(rightLines[index], margin + 64, y, 8.5)
      y += 4.5
    }
    y += 2; doc.setDrawColor('#e2e8ee'); doc.line(margin, y - 1, right, y - 1); y += 2
  }
  doc.setFontSize(18)
  for (const line of doc.splitTextToSize(brand.name || 'Bond application', brand.logoData ? 132 : right - margin)) { text(line, margin, y, 18, '#16324f'); y += 9 }
  y += 1
  if (brand.logoData) {
    const properties = doc.getImageProperties(brand.logoData)
    const width = Math.min(36, 15 * properties.width / properties.height)
    const height = width * properties.height / properties.width
    doc.addImage(brand.logoData, properties.fileType, right - width, 14, width, height)
  }
  text(manifest.mode === 'final' ? 'SIGNED APPLICATION RECORD' : 'DRAFT - NOT FOR SUBMISSION', margin, y, 12, manifest.mode === 'final' ? '#17634e' : '#925c19'); y += 8
  paragraph(manifest.mode === 'final'
    ? 'This readable application record reproduces the saved signing snapshot. The original signed PDF is included unchanged in the ZIP. Files added after signing are identified separately in the document index.'
    : 'This draft contains the currently captured answers. It may be incomplete and is not a signed application or confirmation of bank acceptance.')
  row('Application reference', manifest.transactionId)
  row('Version', manifest.submissionVersion || snapshot.submissionVersion || 'Draft')
  row('Generated', manifest.generatedAt)
  if (manifest.signedAt) row('Signed', manifest.signedAt)
  if (manifest.mode === 'draft' && readiness?.issues?.length) { section('Outstanding items'); readiness.issues.forEach((issue) => paragraph(issue.message)) }
  section('Property, purchaser and loan')
  const shared = snapshot.shared || { property: snapshot.property, purchaserEntity: snapshot.purchaserEntity, finance: snapshot.finance }
  flattenBondAnswers(shared).forEach(([label, value]) => row(label, value))
  row('Application intent', snapshot.applicationIntent || 'Bond application')
  row('Selected banks', (snapshot.selectedBanks || []).join(', ') || 'Not selected')
  for (const [index, participant] of (snapshot.participants || []).entries()) {
    section(`${title(participant.participantRole || participant.role || 'Applicant')} ${index + 1}`)
    for (const [group, answers] of Object.entries(participant.answers || {})) {
      room(15); text(title(group), margin, y, 10, '#16324f'); y += 7
      flattenBondAnswers(answers).forEach(([label, value]) => row(label, value))
    }
  }
  if (manifest.mode === 'draft' && snapshot.draftDeclarations?.length) {
    section('Captured declaration answers - draft')
    for (const participant of snapshot.draftDeclarations) {
      paragraph(title(participant.participantRole), 10)
      flattenBondAnswers(participant.answers).forEach(([label, value]) => row(label, value))
    }
  }
  section('Declarations and acceptance evidence')
  const declarations = snapshot.declarations?.length ? snapshot.declarations : (snapshot.participants || []).flatMap((participant) => participant.declarations || [])
  if (!declarations.length) paragraph('No declaration evidence is recorded in this snapshot.')
  for (const declaration of declarations) {
    room(18); paragraph(declaration.title || title(declaration.key), 10)
    paragraph(declaration.text || 'Declaration text not recorded')
    row('Version / accepted', `${declaration.version || 'Not recorded'} / ${display(declaration.accepted)}`)
    row('Participant / accepted at', `${declaration.participantKey || declaration.participantRole || 'Not recorded'} / ${declaration.acceptedAt || 'Not recorded'}`)
  }
  section('Signing evidence')
  paragraph('Signer identities below describe the saved signing request. They are not newly applied signatures. Refer to the original signed PDF for the actual signed instrument.')
  const signers = submission?.signer_manifest_json || snapshot.signerManifest || []
  for (const signer of signers) {
    row(title(signer.participantRole || signer.role || 'Signer'), `${signer.fullName || 'Name not recorded'} / ${signer.email || 'Email not recorded'}`)
    row('Identity reference', signer.identityReference || 'Not recorded')
  }
  if (submission?.signed_at) row('Submission signing completed', submission.signed_at)
  section('Supporting document index')
  if (!manifest.files.length) paragraph('No supporting files are included in this download.')
  for (const file of manifest.files) {
    row(file.requirements.join('; '), file.path)
    row('Evidence source', title(file.source))
    if (file.sha256) row('File SHA-256', file.sha256)
  }
  for (const warning of manifest.warnings || []) paragraph(warning)
  section('Version verification')
  row('Submission ID', manifest.submissionId || 'Draft')
  row('Snapshot SHA-256', manifest.snapshotHash)
  paragraph('Keep the PDF, original signed evidence and supporting files together. The ZIP includes the captured application data and a machine-readable document index. No bank submission is performed by downloading this pack.')
  const pages = doc.getNumberOfPages()
  for (let number = 1; number <= pages; number++) {
    doc.setPage(number); doc.setDrawColor('#d3dee7'); doc.line(margin, 284, right, 284)
    text(manifest.mode === 'final' ? 'Signed application record | Arch9' : 'DRAFT | Arch9', margin, 290, 8, '#64768a')
    text(`${number} / ${pages}`, 179, 290, 8, '#64768a')
  }
  return new Uint8Array(doc.output('arraybuffer'))
}
