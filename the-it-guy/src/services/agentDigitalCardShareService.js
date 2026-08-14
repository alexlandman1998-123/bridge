import QRCode from 'qrcode'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function escapeVcardValue(value = '') {
  return normalizeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function splitAgentName(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return { firstName: parts[0] || '', lastName: '' }
  }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

function normalizeFileName(value = 'agent-digital-card') {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agent-digital-card'
}

export function buildAgentDigitalCardFileBaseName({ agentName = '', organisationName = '' } = {}) {
  return normalizeFileName([organisationName, agentName].filter(Boolean).join('-') || agentName || 'agent-digital-card')
}

export function buildAgentDigitalCardShareText({
  agentName = '',
  organisationName = '',
  shareUrl = '',
} = {}) {
  const name = normalizeText(agentName) || 'your agent'
  const agency = normalizeText(organisationName)
  const url = normalizeText(shareUrl)
  return [agency ? `${name} at ${agency}` : name, url].filter(Boolean).join('\n')
}

export function buildAgentDigitalCardShareKit({
  agentName = '',
  agentEmail = '',
  agentPhone = '',
  agentJobTitle = '',
  organisationName = '',
  shareUrl = '',
} = {}) {
  const fileBaseName = buildAgentDigitalCardFileBaseName({ agentName, organisationName })
  return {
    fileBaseName,
    shareText: buildAgentDigitalCardShareText({ agentName, organisationName, shareUrl }),
    vcard: buildAgentDigitalCardVcard({
      agentName,
      agentEmail,
      agentPhone,
      agentJobTitle,
      organisationName,
      shareUrl,
    }),
    vcardFileName: `${fileBaseName}.vcf`,
    qrFileName: `${fileBaseName}-qr.png`,
  }
}

function escapeCsvCell(value = '') {
  const text = normalizeText(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function buildAgentDigitalCardShareKitCsv(rows = []) {
  const headers = [
    'agent_name',
    'agent_email',
    'agent_phone',
    'job_title',
    'organisation',
    'card_url',
    'intake_url',
    'buyer_url',
    'seller_url',
    'share_text',
    'qr_file_name',
    'vcf_file_name',
  ]
  const bodyRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const shareKit = buildAgentDigitalCardShareKit({
      agentName: row.agentName,
      agentEmail: row.agentEmail,
      agentPhone: row.agentPhone,
      agentJobTitle: row.agentJobTitle,
      organisationName: row.organisationName,
      shareUrl: row.cardUrl || row.shareUrl,
    })
    return [
      row.agentName,
      row.agentEmail,
      row.agentPhone,
      row.agentJobTitle,
      row.organisationName,
      row.cardUrl || row.shareUrl,
      row.intakeUrl,
      row.buyerUrl,
      row.sellerUrl,
      shareKit.shareText,
      shareKit.qrFileName,
      shareKit.vcardFileName,
    ].map(escapeCsvCell).join(',')
  })
  return `${[headers.join(','), ...bodyRows].join('\r\n')}\r\n`
}

export function buildAgentDigitalCardVcard({
  agentName = '',
  agentEmail = '',
  agentPhone = '',
  agentJobTitle = '',
  organisationName = '',
  shareUrl = '',
} = {}) {
  const { firstName, lastName } = splitAgentName(agentName)
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVcardValue(lastName)};${escapeVcardValue(firstName)};;;`,
    `FN:${escapeVcardValue(agentName || agentEmail || 'Agent')}`,
  ]

  if (organisationName) lines.push(`ORG:${escapeVcardValue(organisationName)}`)
  if (agentJobTitle) lines.push(`TITLE:${escapeVcardValue(agentJobTitle)}`)
  if (agentPhone) lines.push(`TEL;TYPE=CELL:${escapeVcardValue(agentPhone)}`)
  if (agentEmail) lines.push(`EMAIL:${escapeVcardValue(agentEmail)}`)
  if (shareUrl) lines.push(`URL:${escapeVcardValue(shareUrl)}`)

  lines.push('END:VCARD')
  return `${lines.join('\r\n')}\r\n`
}

export async function createAgentDigitalCardQrDataUrl(shareUrl = '', options = {}) {
  const url = normalizeText(shareUrl)
  if (!url) throw new Error('A digital card link is required before generating a QR code.')

  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: Number(options.margin ?? 2),
    width: Number(options.width ?? 960),
    color: {
      dark: normalizeText(options.darkColor) || '#102236',
      light: normalizeText(options.lightColor) || '#ffffff',
    },
  })
}

export function downloadAgentDigitalCardTextFile({
  fileName = 'agent-digital-card.txt',
  text = '',
  mimeType = 'text/plain;charset=utf-8',
} = {}) {
  if (typeof document === 'undefined') return false
  const blob = new Blob([text], { type: mimeType })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
  return true
}

export async function downloadAgentDigitalCardQrPng({
  shareUrl = '',
  fileName = 'agent-digital-card-qr.png',
  darkColor = '#102236',
} = {}) {
  if (typeof document === 'undefined') return false
  const dataUrl = await createAgentDigitalCardQrDataUrl(shareUrl, { darkColor })
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.click()
  return true
}

export const __agentDigitalCardShareServiceTestUtils = {
  escapeCsvCell,
  escapeVcardValue,
  splitAgentName,
  normalizeFileName,
}
