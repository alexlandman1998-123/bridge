import { zipSync, strToU8 } from 'fflate'
import { CAMPAIGN_PACK_DESIGNS, campaignPackText } from './campaignPackModel'

function linesFor(context, value, width) {
  const lines = []
  for (const paragraph of String(value || '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (context.measureText(word).width > width) {
        if (line) {
          lines.push(line)
          line = ''
        }
        let part = ''
        for (const character of word) {
          if (context.measureText(part + character).width > width) {
            lines.push(part)
            part = ''
          }
          part += character
        }
        line = part
      } else if (line && context.measureText(`${line} ${word}`).width > width) {
        lines.push(line)
        line = word
      } else line = line ? `${line} ${word}` : word
    }
    if (line) lines.push(line)
  }
  return lines
}
function text(
  context,
  value,
  x,
  y,
  width,
  {
    size = 38,
    min = size,
    maxLines = 2,
    bold = false,
    colour = '#17382f',
    strict = false,
  } = {},
) {
  let lines,
    fontSize = size
  do {
    context.font = `${bold ? '700' : '400'} ${fontSize}px Arial, sans-serif`
    lines = linesFor(context, value, width)
    if (lines.length <= maxLines || fontSize <= min) break
    fontSize -= 2
  } while (fontSize >= min)
  if (strict && lines.length > maxLines)
    throw new Error(
      'The enquiry contact is too long to fit on the artwork. Use a shorter public enquiry link or contact in Campaign Setup, then refresh this campaign.',
    )
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    let last = lines[maxLines - 1]
    while (context.measureText(`${last}…`).width > width && last)
      last = last.slice(0, -1)
    lines[maxLines - 1] = `${last.trimEnd()}…`
  }
  context.fillStyle = colour
  context.textBaseline = 'top'
  lines.forEach((line, index) =>
    context.fillText(line, x, y + index * fontSize * 1.18),
  )
  return lines.length * fontSize * 1.18
}
function contrast(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((part) => parseInt(part, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? '#101d16'
    : '#ffffff'
}
function cover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height)
  const sw = width / scale,
    sh = height / scale
  context.drawImage(
    image,
    (image.width - sw) / 2,
    (image.height - sh) / 2,
    sw,
    sh,
    x,
    y,
    width,
    height,
  )
}
async function imageBlob(url, cache) {
  if (cache.has(url)) return cache.get(url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('unavailable')
    if (Number(response.headers.get('content-length')) > 12 * 1024 * 1024)
      throw new Error('too large')
    const blob = await response.blob()
    if (
      !/^image\/(png|jpeg|webp)$/.test(blob.type) ||
      blob.size > 12 * 1024 * 1024 ||
      !blob.size
    )
      throw new Error('unsupported image')
    cache.set(url, blob)
    return blob
  } catch {
    throw new Error(
      'A campaign image or logo could not be loaded for download. Check the saved photo and try again. For a logo issue, choose agency-name branding below.',
    )
  } finally {
    clearTimeout(timeout)
  }
}
async function bitmap(blob) {
  try {
    return await createImageBitmap(blob, {
      resizeWidth: 1600,
      resizeQuality: 'high',
    })
  } catch {
    throw new Error(
      'This photo or logo could not be read. Use a JPG, PNG or WebP image and try again.',
    )
  }
}
export async function renderCampaignArtwork(
  pack,
  design,
  { cache = new Map(), nameOnly = false } = {},
) {
  if (!pack.images.length && !pack.allowNoPhoto)
    throw new Error(
      'The saved cover photo is missing. Add a listing photo, refresh this campaign and save it before creating artwork.',
    )
  const canvas = document.createElement('canvas')
  canvas.width = design.width
  canvas.height = design.height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error(
      'Your browser cannot create image downloads. Try a current desktop browser.',
    )
  const story = design.height > design.width
  const { source } = pack
  const af = source.language === 'af-ZA'
  const brand = /^#[0-9a-f]{6}$/i.test(source.primaryColor)
    ? source.primaryColor
    : '#326650'
  const ink = contrast(brand)
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const header = story ? 260 : 110
  const brandedGeneral = pack.general && !pack.images.length
  const photoHeight =
    pack.general && !pack.images.length
      ? story
        ? 500
        : 300
      : story
        ? 760
        : 400
  context.fillStyle = brand
  context.fillRect(0, 0, canvas.width, header)
  if (pack.images.length) {
    const photo = await bitmap(
      await imageBlob(
        pack.images[design.photo % pack.images.length].url,
        cache,
      ),
    )
    try {
      cover(context, photo, 0, header, canvas.width, photoHeight)
    } finally {
      photo.close()
    }
  } else {
    context.fillStyle = '#edf4ef'
    context.fillRect(0, header, canvas.width, photoHeight)
    if (brandedGeneral)
      text(context, pack.label, 70, header + 40, 940, {
        size: 24,
        bold: true,
        maxLines: 1,
        colour: '#456453',
      })
    text(
      context,
      brandedGeneral ? design.heading : pack.label || 'COMING SOON',
      70,
      header + (brandedGeneral ? 100 : 110),
      940,
      {
        size: brandedGeneral ? 56 : 72,
        min: brandedGeneral ? 36 : 48,
        maxLines: 3,
        bold: true,
      },
    )
    if (!brandedGeneral)
      text(context, source.location, 70, header + photoHeight - 110, 940, {
        size: 36,
        maxLines: 2,
      })
  }
  if (pack.logoUrl && !nameOnly) {
    const logo = await bitmap(await imageBlob(pack.logoUrl, cache))
    try {
      const ratio = Math.min(180 / logo.width, 64 / logo.height)
      context.fillStyle = '#ffffff'
      context.fillRect(60, header - 88, 204, 76)
      context.drawImage(
        logo,
        72,
        header - 82,
        logo.width * ratio,
        logo.height * ratio,
      )
      text(context, source.agencyName, 292, header - 73, 708, {
        size: 32,
        min: 24,
        bold: true,
        colour: ink,
        maxLines: 2,
      })
    } finally {
      logo.close()
    }
  } else
    text(context, source.agencyName, 70, header - 78, 940, {
      size: 36,
      min: 28,
      bold: true,
      colour: ink,
      maxLines: 2,
    })
  const y = header + photoHeight + (story ? 66 : 38)
  const label =
    design.kind === 'action' && pack.action
      ? pack.action
      : design.kind === 'facts' && pack.builder?.template === 'just-sold'
        ? af
          ? 'ONLANGSE PLAASLIKE VERKOOP'
          : 'RECENT LOCAL SALE'
        : design.kind === 'intro'
          ? pack.label || (af ? 'PAS GELYS' : 'JUST LISTED')
          : {
              facts: af ? 'EIENDOMSBESONDERHEDE' : 'PROPERTY DETAILS',
              description: af ? 'KYK VAN NADER' : 'TAKE A CLOSER LOOK',
              location: af ? 'DIE LIGGING' : 'THE LOCATION',
              action: af ? 'BESPREEK ’N BESIGTIGING' : 'BOOK A VIEWING',
            }[design.kind]
  text(context, brandedGeneral ? source.location : label, 70, y, 940, {
    size: story ? 28 : 22,
    bold: true,
    colour: '#456453',
    maxLines: 1,
  })
  let cursor = y + (story ? 56 : 42)
  const heading = pack.general
    ? design.heading
    : design.kind === 'location'
      ? source.location
      : pack.builder?.template === 'show-day'
        ? pack.announcement
        : design.kind === 'intro'
          ? (pack.heading || pack.content.social.title).replace(
              /^(Just listed|Pas gelys):\s*/i,
              '',
            )
          : source.title
  if (!brandedGeneral)
    cursor +=
      text(context, heading, 70, cursor, 940, {
        size: story ? 64 : 48,
        min: story ? 48 : 36,
        maxLines: 2,
        bold: true,
      }) + 18
  if (pack.general) {
    const footer = story ? 1460 : 910
    const size = story ? 36 : 29
    const maxLines = Math.floor(
      (footer - (design.note ? 100 : 24) - cursor) / (size * 1.18),
    )
    if (maxLines > 0)
      text(context, design.body || source.location, 70, cursor, 940, {
        size,
        min: size,
        maxLines: Math.min(6, maxLines),
      })
    if (design.note)
      text(context, design.note, 70, footer - 88, 940, {
        size: 22,
        min: 22,
        maxLines: 2,
        colour: '#456453',
      })
  } else if (design.kind === 'description' || design.kind === 'action') {
    cursor +=
      text(
        context,
        pack.announcement || source.description || source.facts,
        70,
        cursor,
        940,
        {
          size: story ? 36 : 29,
          min: story ? 30 : 25,
          maxLines: 3,
        },
      ) + 18
  } else if (design.kind === 'facts') {
    cursor +=
      text(context, source.facts || source.location, 70, cursor, 940, {
        size: 36,
        min: 28,
        maxLines: 3,
      }) + 18
  } else if (design.kind !== 'location') {
    cursor +=
      text(context, source.location, 70, cursor, 940, {
        size: story ? 36 : 27,
        min: 24,
        maxLines: 2,
      }) + 14
  }
  // Every design has a fixed, separate contact band so longer descriptions
  // can never push the enquiry action off the exported image.
  const footer = story ? 1460 : 910
  if (cursor + 48 < footer - 20) {
    const priceHeight = text(context, source.price, 70, cursor, 940, {
      size: story ? 56 : 42,
      bold: true,
      maxLines: 1,
    })
    if (design.kind === 'intro' && cursor + priceHeight + 64 < footer - 20)
      text(context, source.facts, 70, cursor + priceHeight + 18, 940, {
        size: story ? 30 : 25,
        maxLines: 1,
      })
  }
  context.fillStyle = brand
  context.fillRect(0, footer, canvas.width, canvas.height - footer)
  text(
    context,
    pack.action || (af ? 'Bespreek ’n besigtiging' : 'Book a viewing'),
    70,
    footer + 22,
    940,
    { size: story ? 36 : 26, bold: true, colour: ink, maxLines: 1 },
  )
  const contactY = footer + (story ? 88 : 64)
  text(context, source.destination, 70, contactY, 940, {
    size: story ? 34 : 26,
    min: story ? 26 : 20,
    maxLines: 2,
    colour: ink,
    strict: true,
  })
  text(context, source.agentName, 70, footer + (story ? 175 : 137), 940, {
    size: story ? 28 : 20,
    colour: ink,
    maxLines: 1,
  })
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        canvas.width = 0
        canvas.height = 0
        if (blob) resolve(blob)
        else reject(new Error('The artwork could not be exported. Try again.'))
      }, 'image/png')
    } catch {
      reject(
        new Error(
          'The image host does not allow downloads. Choose a supported listing photo and try again.',
        ),
      )
    }
  })
}
export async function generateCampaignPack(pack, options = {}) {
  const cache = new Map(),
    assets = []
  for (const design of pack.designs || CAMPAIGN_PACK_DESIGNS)
    assets.push({
      ...design,
      filename: `${design.id}.png`,
      blob: await renderCampaignArtwork(
        pack.members
          ? {
              ...pack,
              ...pack.members[design.member || 0],
              heading: pack.members[design.member || 0].source.title,
            }
          : pack,
        design,
        { ...options, cache },
      ),
    })
  for (const [filename, value] of Object.entries(campaignPackText(pack)))
    assets.push({
      id: filename,
      label: filename,
      filename,
      blob: new Blob([value], { type: 'text/plain;charset=utf-8' }),
    })
  return assets
}
export async function campaignPackZip(assets) {
  const files = {}
  for (const asset of assets)
    files[asset.filename] = new Uint8Array(await asset.blob.arrayBuffer())
  files['manifest.json'] = strToU8(
    JSON.stringify(
      {
        version: 1,
        assets: assets.map(({ filename, width, height }) => ({
          filename,
          ...(width ? { width, height } : {}),
        })),
      },
      null,
      2,
    ),
  )
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}
export function downloadCampaignAsset(blob, filename) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
