function normalizeText(value) {
  return String(value ?? '').trim()
}

export function normalizeImportHeaderKey(value) {
  return normalizeText(value)
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function csvEscape(value = '') {
  const text = normalizeText(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function countCsvDelimiter(line = '', delimiter = ',') {
  let count = 0
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === delimiter && !quoted) count += 1
  }
  return count
}

export function detectCsvDelimiter(text = '') {
  const firstContentLine = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => normalizeText(line)) || ''
  const delimiterCandidates = [',', ';', '\t']
  return delimiterCandidates
    .map((delimiter) => ({ delimiter, count: countCsvDelimiter(firstContentLine, delimiter) }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter || ','
}

export function parseCsvText(text = '', delimiter = detectCsvDelimiter(text)) {
  const rows = []
  let current = []
  let cell = ''
  let quoted = false
  const source = String(text || '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (char === delimiter && !quoted) {
      current.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      current.push(cell)
      if (current.some((entry) => normalizeText(entry))) rows.push(current)
      current = []
      cell = ''
      continue
    }

    cell += char
  }

  current.push(cell)
  if (current.some((entry) => normalizeText(entry))) rows.push(current)
  return rows
}

export function mapCsvRowsToImportRows(csvRows = []) {
  const [headers = [], ...bodyRows] = csvRows
  const cleanHeaders = headers.map((header) => normalizeText(header).replace(/^\uFEFF/, ''))
  if (!cleanHeaders.some(Boolean)) throw new Error('The CSV needs a header row.')

  return bodyRows
    .map((cells, index) => {
      const row = {}
      cleanHeaders.forEach((header, cellIndex) => {
        if (header) row[header] = normalizeText(cells[cellIndex])
      })
      return {
        ...row,
        __rowNumber: index + 2,
      }
    })
    .filter((row) => Object.entries(row).some(([key, value]) => key !== '__rowNumber' && normalizeText(value)))
}

export function pickImportValue(row = {}, keys = []) {
  const aliases = new Set(keys.map(normalizeImportHeaderKey).filter(Boolean))
  for (const key of keys) {
    const value = row[key]
    if (normalizeText(value)) return normalizeText(value)
  }
  for (const [header, value] of Object.entries(row)) {
    if (aliases.has(normalizeImportHeaderKey(header)) && normalizeText(value)) {
      return normalizeText(value)
    }
  }
  return ''
}
