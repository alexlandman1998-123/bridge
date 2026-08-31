import crypto from 'node:crypto'
import {
  detectCsvDelimiter,
  mapCsvRowsToImportRows,
  normalizeImportHeaderKey,
  parseCsvText,
  pickImportValue,
} from '../../src/lib/csvImport.js'

export const PROPERTY24_MIGRATION_DRY_RUN_VERSION = 'property24_migration_dry_run_v1'

export const PROPERTY24_MIGRATION_FILE_SCHEMAS = Object.freeze({
  agents: Object.freeze({
    requiredHeaders: Object.freeze([
      'AgencyId',
      'AgentId',
      'Firstname',
      'Lastname',
      'Status',
      'SourceReference',
      'CountryId',
      'MobileNumber',
      'EmailAddress',
      'Published',
    ]),
  }),
  listings: Object.freeze({
    requiredHeaders: Object.freeze([
      'AgencyId',
      'ContactAgentIds',
      'ListingNumber',
      'ListingType',
      'Status',
      'Price',
      'ListingVisibility',
      'Description',
      'DescriptionHeader',
      'SuburbId',
      'SourceReference',
      'FloorArea',
      'FloorAreaAreaUnit',
      'PropertyTypeId',
    ]),
  }),
  images: Object.freeze({
    requiredHeaders: Object.freeze([
      'ListingNumber',
      'Caption',
      'Ordinal',
      'Prop24ImageUrl',
    ]),
  }),
})

const ROLE_ORDER = Object.freeze({ agents: 0, listings: 1, images: 2, relationships: 3, import: 4 })
const LISTING_TYPES = new Set(['sale', 'rental'])
const AGENT_STATUSES = new Set(['active', 'inactive'])
const KNOWN_LISTING_STATUSES = new Set([
  'active',
  'newlisting',
  'pending',
  'sold',
  'rented',
  'withdrawn',
  'inactive',
  'expired',
  'deleted',
])
const BOOLEAN_FIELDS = Object.freeze(['Repossessed', 'ShowLocation', 'Garden', 'Pool', 'Flatlet'])
const OPTIONAL_NON_NEGATIVE_NUMERIC_FIELDS = Object.freeze([
  'MunicipalRatesAndTaxes',
  'MonthlyLevy',
  'ErfSize',
  'Bedrooms',
  'Bathrooms',
  'Garages',
  'ReceptionRooms',
  'Studies',
  'Kitchens',
  'SecureParkings',
  'NumberOfParkingSpaces',
  'DomesticRooms',
  'DomesticBathrooms',
  'OutsideToilets',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizedValue(value) {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function fileValue(row, field) {
  return pickImportValue(row, [field])
}

function createIssue({ severity = 'error', code, role, rowNumber = null, field = '', message }) {
  return {
    severity,
    code,
    file: role,
    rowNumber: Number.isSafeInteger(rowNumber) ? rowNumber : null,
    field: normalizeText(field) || null,
    message,
  }
}

function sortIssues(issues = []) {
  return [...issues].sort((left, right) => {
    const severity = (left.severity === 'error' ? 0 : 1) - (right.severity === 'error' ? 0 : 1)
    if (severity) return severity
    const role = (ROLE_ORDER[left.file] ?? 99) - (ROLE_ORDER[right.file] ?? 99)
    if (role) return role
    const row = (left.rowNumber ?? 0) - (right.rowNumber ?? 0)
    if (row) return row
    return left.code.localeCompare(right.code)
  })
}

function hasBalancedCsvQuotes(text = '') {
  let quoted = false
  const source = String(text || '')
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '"') continue
    if (quoted && source[index + 1] === '"') {
      index += 1
    } else {
      quoted = !quoted
    }
  }
  return !quoted
}

function isPositiveInteger(value) {
  if (!/^\d+$/.test(normalizeText(value))) return false
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0
}

function isNonNegativeNumber(value) {
  const text = normalizeText(value)
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) return false
  const number = Number(text)
  return Number.isFinite(number) && number >= 0
}

function isBooleanValue(value) {
  return ['0', '1', 'true', 'false', 'yes', 'no'].includes(normalizeText(value).toLowerCase())
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value))
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(normalizeText(value))
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

function isDateLike(value) {
  const text = normalizeText(value)
  if (!text) return true
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text
  return Number.isFinite(Date.parse(normalized))
}

export function parseProperty24ContactAgentIds(value) {
  const text = normalizeText(value).replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!text) return { valid: false, ids: [] }
  const parts = text.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean)
  if (!parts.length || parts.some((entry) => !isPositiveInteger(entry))) return { valid: false, ids: [] }
  return { valid: true, ids: [...new Set(parts.map(Number))] }
}

function parseMigrationFile(role, source = {}) {
  const issues = []
  const text = String(source.text ?? '')
  const sourcePath = normalizeText(source.path) || `${role}.csv`
  const schema = PROPERTY24_MIGRATION_FILE_SCHEMAS[role]

  if (!text.trim()) {
    issues.push(createIssue({ code: 'empty_file', role, message: `${role} CSV is empty.` }))
  }
  if (!hasBalancedCsvQuotes(text)) {
    issues.push(createIssue({ code: 'unclosed_quoted_field', role, message: `${role} CSV contains an unclosed quoted field.` }))
  }

  const delimiter = detectCsvDelimiter(text)
  const csvRows = text.trim() ? parseCsvText(text, delimiter) : []
  const headers = (csvRows[0] || []).map((header) => normalizeText(header).replace(/^\uFEFF/, ''))
  const normalizedHeaders = headers.map(normalizeImportHeaderKey)
  const duplicateHeaders = normalizedHeaders.filter((header, index) => header && normalizedHeaders.indexOf(header) !== index)
  if (duplicateHeaders.length) {
    issues.push(createIssue({
      code: 'duplicate_headers',
      role,
      message: `${role} CSV contains duplicate header names after normalization.`,
    }))
  }

  const missingHeaders = schema.requiredHeaders.filter((required) => !normalizedHeaders.includes(normalizeImportHeaderKey(required)))
  for (const field of missingHeaders) {
    issues.push(createIssue({
      code: 'missing_required_header',
      role,
      field,
      message: `${role} CSV is missing required header ${field}.`,
    }))
  }

  for (let index = 1; index < csvRows.length; index += 1) {
    const row = csvRows[index]
    if (row.length !== headers.length) {
      issues.push(createIssue({
        code: 'column_count_mismatch',
        role,
        rowNumber: index + 1,
        message: `${role} row has ${row.length} columns; expected ${headers.length}.`,
      }))
    }
  }

  let rows = []
  if (headers.length) {
    try {
      rows = mapCsvRowsToImportRows(csvRows)
    } catch (error) {
      issues.push(createIssue({ code: 'csv_parse_failed', role, message: error.message }))
    }
  }
  if (!rows.length && text.trim()) {
    issues.push(createIssue({ code: 'no_data_rows', role, message: `${role} CSV has no data rows.` }))
  }

  return {
    role,
    rows,
    issues,
    metadata: {
      path: sourcePath,
      sha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
      bytes: Buffer.byteLength(text, 'utf8'),
      delimiter: delimiter === '\t' ? 'tab' : delimiter,
      headers,
      requiredHeaders: [...schema.requiredHeaders],
      missingHeaders,
      rowCount: rows.length,
    },
  }
}

export function parseProperty24MigrationSourceRows(role, source = {}) {
  if (!PROPERTY24_MIGRATION_FILE_SCHEMAS[role]) throw new Error(`Unsupported Property24 migration file role: ${role}.`)
  return parseMigrationFile(role, source).rows
}

function requireRowValue(issues, role, row, field) {
  const value = fileValue(row, field)
  if (!value) {
    issues.push(createIssue({
      code: 'missing_required_value',
      role,
      rowNumber: row.__rowNumber,
      field,
      message: `${field} is required.`,
    }))
  }
  return value
}

function validatePositiveInteger(issues, role, row, field, value) {
  if (value && !isPositiveInteger(value)) {
    issues.push(createIssue({
      code: 'invalid_positive_integer',
      role,
      rowNumber: row.__rowNumber,
      field,
      message: `${field} must be a positive integer.`,
    }))
    return null
  }
  return value ? Number(value) : null
}

function validateNonNegativeNumber(issues, role, row, field, value, { required = false } = {}) {
  if (!value && !required) return null
  if (!isNonNegativeNumber(value)) {
    issues.push(createIssue({
      code: 'invalid_non_negative_number',
      role,
      rowNumber: row.__rowNumber,
      field,
      message: `${field} must be a non-negative number.`,
    }))
    return null
  }
  return Number(value)
}

function recordDuplicate(issues, role, row, field, value, seen, code) {
  if (!value) return
  if (seen.has(value)) {
    issues.push(createIssue({
      code,
      role,
      rowNumber: row.__rowNumber,
      field,
      message: `${field} must be unique within the export.`,
    }))
  } else {
    seen.add(value)
  }
}

function validateAgents(parsed) {
  const issues = [...parsed.issues]
  const records = []
  const agencyIds = new Set()
  const agentIds = new Set()
  const sourceReferences = new Set()
  const emails = new Set()

  for (const row of parsed.rows) {
    const agencyIdValue = requireRowValue(issues, 'agents', row, 'AgencyId')
    const agentIdValue = requireRowValue(issues, 'agents', row, 'AgentId')
    const firstname = requireRowValue(issues, 'agents', row, 'Firstname')
    const lastname = requireRowValue(issues, 'agents', row, 'Lastname')
    const status = requireRowValue(issues, 'agents', row, 'Status')
    const sourceReference = requireRowValue(issues, 'agents', row, 'SourceReference')
    const countryIdValue = requireRowValue(issues, 'agents', row, 'CountryId')
    requireRowValue(issues, 'agents', row, 'MobileNumber')
    const email = requireRowValue(issues, 'agents', row, 'EmailAddress')
    const published = requireRowValue(issues, 'agents', row, 'Published')
    const profilePictureUrl = fileValue(row, 'Property24ProfilePictureURL')
    const agencyId = validatePositiveInteger(issues, 'agents', row, 'AgencyId', agencyIdValue)
    const agentId = validatePositiveInteger(issues, 'agents', row, 'AgentId', agentIdValue)
    validatePositiveInteger(issues, 'agents', row, 'CountryId', countryIdValue)

    if (agencyId) agencyIds.add(agencyId)
    if (agentId) recordDuplicate(issues, 'agents', row, 'AgentId', agentId, agentIds, 'duplicate_agent_id')
    recordDuplicate(issues, 'agents', row, 'SourceReference', sourceReference.toLowerCase(), sourceReferences, 'duplicate_agent_source_reference')
    if (email && !isEmail(email)) {
      issues.push(createIssue({ code: 'invalid_email', role: 'agents', rowNumber: row.__rowNumber, field: 'EmailAddress', message: 'EmailAddress is invalid.' }))
    }
    if (email) recordDuplicate(issues, 'agents', row, 'EmailAddress', email.toLowerCase(), emails, 'duplicate_agent_email')
    if (published && !isBooleanValue(published)) {
      issues.push(createIssue({ code: 'invalid_boolean', role: 'agents', rowNumber: row.__rowNumber, field: 'Published', message: 'Published must be a boolean or 0/1 value.' }))
    }
    if (status && !AGENT_STATUSES.has(normalizedValue(status))) {
      issues.push(createIssue({ severity: 'warning', code: 'unknown_agent_status', role: 'agents', rowNumber: row.__rowNumber, field: 'Status', message: `Agent status ${status} will require a mapping rule.` }))
    }
    if (profilePictureUrl && !isHttpUrl(profilePictureUrl)) {
      issues.push(createIssue({ code: 'invalid_profile_picture_url', role: 'agents', rowNumber: row.__rowNumber, field: 'Property24ProfilePictureURL', message: 'Property24ProfilePictureURL must be an HTTP(S) URL.' }))
    }

    records.push({
      rowNumber: row.__rowNumber,
      agencyId,
      agentId,
      name: [firstname, lastname].filter(Boolean).join(' '),
      status: status || null,
      sourceReference: sourceReference || null,
      hasProfilePicture: Boolean(profilePictureUrl),
    })
  }

  return { ...parsed, issues, records, agencyIds, agentIds }
}

function validateListings(parsed) {
  const issues = [...parsed.issues]
  const records = []
  const agencyIds = new Set()
  const listingNumbers = new Set()
  const sourceReferences = new Set()

  for (const row of parsed.rows) {
    const agencyIdValue = requireRowValue(issues, 'listings', row, 'AgencyId')
    const contactAgentIdsValue = requireRowValue(issues, 'listings', row, 'ContactAgentIds')
    const listingNumberValue = requireRowValue(issues, 'listings', row, 'ListingNumber')
    const listingType = requireRowValue(issues, 'listings', row, 'ListingType')
    const status = requireRowValue(issues, 'listings', row, 'Status')
    const priceValue = requireRowValue(issues, 'listings', row, 'Price')
    requireRowValue(issues, 'listings', row, 'ListingVisibility')
    requireRowValue(issues, 'listings', row, 'Description')
    requireRowValue(issues, 'listings', row, 'DescriptionHeader')
    const suburbIdValue = requireRowValue(issues, 'listings', row, 'SuburbId')
    const sourceReference = requireRowValue(issues, 'listings', row, 'SourceReference')
    const floorAreaValue = requireRowValue(issues, 'listings', row, 'FloorArea')
    requireRowValue(issues, 'listings', row, 'FloorAreaAreaUnit')
    const propertyTypeIdValue = requireRowValue(issues, 'listings', row, 'PropertyTypeId')
    const agencyId = validatePositiveInteger(issues, 'listings', row, 'AgencyId', agencyIdValue)
    const listingNumber = validatePositiveInteger(issues, 'listings', row, 'ListingNumber', listingNumberValue)
    const suburbId = validatePositiveInteger(issues, 'listings', row, 'SuburbId', suburbIdValue)
    const propertyTypeId = validatePositiveInteger(issues, 'listings', row, 'PropertyTypeId', propertyTypeIdValue)
    const price = validateNonNegativeNumber(issues, 'listings', row, 'Price', priceValue, { required: true })
    const floorArea = validateNonNegativeNumber(issues, 'listings', row, 'FloorArea', floorAreaValue, { required: true })
    const contacts = parseProperty24ContactAgentIds(contactAgentIdsValue)

    if (agencyId) agencyIds.add(agencyId)
    if (listingNumber) recordDuplicate(issues, 'listings', row, 'ListingNumber', listingNumber, listingNumbers, 'duplicate_listing_number')
    recordDuplicate(issues, 'listings', row, 'SourceReference', sourceReference.toLowerCase(), sourceReferences, 'duplicate_listing_source_reference')
    if (contactAgentIdsValue && !contacts.valid) {
      issues.push(createIssue({ code: 'invalid_contact_agent_ids', role: 'listings', rowNumber: row.__rowNumber, field: 'ContactAgentIds', message: 'ContactAgentIds must contain one or more positive integer IDs separated by commas, semicolons, or pipes.' }))
    }
    if (listingType && !LISTING_TYPES.has(normalizedValue(listingType))) {
      issues.push(createIssue({ code: 'unsupported_listing_type', role: 'listings', rowNumber: row.__rowNumber, field: 'ListingType', message: `ListingType ${listingType} is not supported by the migration importer.` }))
    }
    if (status && !KNOWN_LISTING_STATUSES.has(normalizedValue(status))) {
      issues.push(createIssue({ severity: 'warning', code: 'unknown_listing_status', role: 'listings', rowNumber: row.__rowNumber, field: 'Status', message: `Listing status ${status} will require a mapping rule.` }))
    }
    for (const field of ['OccupationDate', 'ExpiryDate', 'AuctionDate']) {
      const value = fileValue(row, field)
      if (value && !isDateLike(value)) {
        issues.push(createIssue({ code: 'invalid_date', role: 'listings', rowNumber: row.__rowNumber, field, message: `${field} is not a valid date.` }))
      }
    }
    for (const field of OPTIONAL_NON_NEGATIVE_NUMERIC_FIELDS) {
      const value = fileValue(row, field)
      if (value) validateNonNegativeNumber(issues, 'listings', row, field, value)
    }
    for (const field of BOOLEAN_FIELDS) {
      const value = fileValue(row, field)
      if (value && !isBooleanValue(value)) {
        issues.push(createIssue({ code: 'invalid_boolean', role: 'listings', rowNumber: row.__rowNumber, field, message: `${field} must be a boolean or 0/1 value.` }))
      }
    }

    records.push({
      rowNumber: row.__rowNumber,
      agencyId,
      listingNumber,
      listingType: listingType || null,
      status: status || null,
      sourceReference: sourceReference || null,
      contactAgentIds: contacts.ids,
      price,
      floorArea,
      suburbId,
      propertyTypeId,
    })
  }

  return { ...parsed, issues, records, agencyIds, listingNumbers }
}

function validateImages(parsed) {
  const issues = [...parsed.issues]
  const records = []
  const identityKeys = new Set()
  const urlKeys = new Set()

  for (const row of parsed.rows) {
    const listingNumberValue = requireRowValue(issues, 'images', row, 'ListingNumber')
    const caption = fileValue(row, 'Caption')
    const ordinalValue = requireRowValue(issues, 'images', row, 'Ordinal')
    const imageUrl = requireRowValue(issues, 'images', row, 'Prop24ImageUrl')
    const listingNumber = validatePositiveInteger(issues, 'images', row, 'ListingNumber', listingNumberValue)
    const ordinal = validatePositiveInteger(issues, 'images', row, 'Ordinal', ordinalValue)

    if (!caption) {
      issues.push(createIssue({ severity: 'warning', code: 'missing_image_caption', role: 'images', rowNumber: row.__rowNumber, field: 'Caption', message: 'Image caption is blank.' }))
    }
    if (imageUrl && !isHttpUrl(imageUrl)) {
      issues.push(createIssue({ code: 'invalid_image_url', role: 'images', rowNumber: row.__rowNumber, field: 'Prop24ImageUrl', message: 'Prop24ImageUrl must be an HTTP(S) URL.' }))
    }
    if (listingNumber && ordinal) {
      recordDuplicate(issues, 'images', row, 'Ordinal', `${listingNumber}:${ordinal}`, identityKeys, 'duplicate_image_ordinal')
    }
    if (listingNumber && imageUrl) {
      recordDuplicate(issues, 'images', row, 'Prop24ImageUrl', `${listingNumber}:${imageUrl}`, urlKeys, 'duplicate_listing_image_url')
    }

    records.push({
      rowNumber: row.__rowNumber,
      listingNumber,
      ordinal,
      caption: caption || null,
      hasValidUrl: Boolean(imageUrl && isHttpUrl(imageUrl)),
    })
  }

  return { ...parsed, issues, records }
}

function validateRelationships(agents, listings, images, expectedAgencyId) {
  const issues = []
  const detectedAgencyIds = [...new Set([...agents.agencyIds, ...listings.agencyIds])].sort((left, right) => left - right)
  const agentIds = new Set(agents.records.map((record) => record.agentId).filter(Boolean))
  const listingNumbers = new Set(listings.records.map((record) => record.listingNumber).filter(Boolean))
  const listingAgentLinks = listings.records.flatMap((listing) => listing.contactAgentIds.map((agentId) => ({
    listingNumber: listing.listingNumber,
    listingRowNumber: listing.rowNumber,
    agentId,
  })))
  const missingAgentLinks = listingAgentLinks.filter((link) => !agentIds.has(link.agentId))
  const orphanImages = images.records.filter((record) => record.listingNumber && !listingNumbers.has(record.listingNumber))
  const imageCounts = images.records.reduce((counts, record) => {
    if (record.listingNumber) counts.set(record.listingNumber, (counts.get(record.listingNumber) || 0) + 1)
    return counts
  }, new Map())
  const listingsWithoutImages = listings.records.filter((record) => record.listingNumber && !imageCounts.has(record.listingNumber))

  if (detectedAgencyIds.length > 1) {
    issues.push(createIssue({ code: 'agency_id_mismatch_between_files', role: 'relationships', message: `Agents and listings contain multiple agency IDs: ${detectedAgencyIds.join(', ')}.` }))
  }
  if (expectedAgencyId && detectedAgencyIds.some((agencyId) => agencyId !== expectedAgencyId)) {
    issues.push(createIssue({ code: 'unexpected_agency_id', role: 'relationships', field: 'AgencyId', message: `Export contains an agency ID that does not match expected agency ${expectedAgencyId}.` }))
  }
  for (const link of missingAgentLinks) {
    issues.push(createIssue({ code: 'listing_agent_not_found', role: 'relationships', rowNumber: link.listingRowNumber, field: 'ContactAgentIds', message: `Listing ${link.listingNumber || 'with invalid number'} references missing agent ${link.agentId}.` }))
  }
  for (const image of orphanImages) {
    issues.push(createIssue({ code: 'orphan_image', role: 'relationships', rowNumber: image.rowNumber, field: 'ListingNumber', message: `Image references missing listing ${image.listingNumber}.` }))
  }
  for (const listing of listingsWithoutImages) {
    issues.push(createIssue({ severity: 'warning', code: 'listing_without_images', role: 'relationships', rowNumber: listing.rowNumber, field: 'ListingNumber', message: `Listing ${listing.listingNumber} has no image rows.` }))
  }

  return {
    issues,
    detectedAgencyIds,
    resolvedAgencyId: detectedAgencyIds.length === 1 ? detectedAgencyIds[0] : null,
    listingAgentLinkCount: listingAgentLinks.length,
    matchedListingAgentLinkCount: listingAgentLinks.length - missingAgentLinks.length,
    missingListingAgentLinks: missingAgentLinks.map(({ listingNumber, agentId }) => ({ listingNumber, agentId })),
    orphanImages: orphanImages.map(({ listingNumber, ordinal }) => ({ listingNumber, ordinal })),
    listingsWithoutImages: listingsWithoutImages.map(({ listingNumber }) => listingNumber),
    listingsWithImages: listings.records.filter((record) => record.listingNumber && imageCounts.has(record.listingNumber)).length,
    imageCounts: Object.fromEntries([...imageCounts.entries()].sort(([left], [right]) => left - right)),
  }
}

function publicInputMetadata(parsed) {
  return parsed.metadata
}

export function createProperty24MigrationDryRun({
  agents: agentsSource = {},
  listings: listingsSource = {},
  images: imagesSource = {},
  expectedAgencyId = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalizedExpectedAgencyId = expectedAgencyId === null || expectedAgencyId === ''
    ? null
    : Number(expectedAgencyId)
  const importIssues = []
  if (normalizedExpectedAgencyId !== null && (!Number.isSafeInteger(normalizedExpectedAgencyId) || normalizedExpectedAgencyId <= 0)) {
    importIssues.push(createIssue({ code: 'invalid_expected_agency_id', role: 'import', field: 'expectedAgencyId', message: 'Expected agency ID must be a positive integer.' }))
  }

  const agents = validateAgents(parseMigrationFile('agents', agentsSource))
  const listings = validateListings(parseMigrationFile('listings', listingsSource))
  const images = validateImages(parseMigrationFile('images', imagesSource))
  const relationships = validateRelationships(agents, listings, images, normalizedExpectedAgencyId)
  const issues = sortIssues([
    ...importIssues,
    ...agents.issues,
    ...listings.issues,
    ...images.issues,
    ...relationships.issues,
  ])
  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const status = errorCount ? 'BLOCKED' : warningCount ? 'READY_WITH_WARNINGS' : 'READY'
  const sales = listings.records.filter((record) => normalizedValue(record.listingType) === 'sale').length
  const rentals = listings.records.filter((record) => normalizedValue(record.listingType) === 'rental').length

  return {
    version: PROPERTY24_MIGRATION_DRY_RUN_VERSION,
    phase: 'property24-migration-import-phase1-dry-run',
    mode: 'dry-run',
    status,
    generatedAt,
    safety: {
      property24WritesPerformed: false,
      databaseWritesPerformed: false,
      imageDownloadsPerformed: false,
      reportFileOnly: true,
    },
    agency: {
      expectedAgencyId: normalizedExpectedAgencyId,
      detectedAgencyIds: relationships.detectedAgencyIds,
      resolvedAgencyId: relationships.resolvedAgencyId,
      consistent: relationships.detectedAgencyIds.length === 1 && (
        !normalizedExpectedAgencyId || relationships.resolvedAgencyId === normalizedExpectedAgencyId
      ),
    },
    inputs: {
      agents: publicInputMetadata(agents),
      listings: publicInputMetadata(listings),
      images: publicInputMetadata(images),
    },
    summary: {
      agentCount: agents.records.length,
      agentProfilePictureCount: agents.records.filter((record) => record.hasProfilePicture).length,
      listingCount: listings.records.length,
      saleListingCount: sales,
      rentalListingCount: rentals,
      imageCount: images.records.length,
      listingsWithImages: relationships.listingsWithImages,
      listingAgentLinkCount: relationships.listingAgentLinkCount,
      matchedListingAgentLinkCount: relationships.matchedListingAgentLinkCount,
      errorCount,
      warningCount,
    },
    relationships: {
      missingListingAgentLinks: relationships.missingListingAgentLinks,
      orphanImages: relationships.orphanImages,
      listingsWithoutImages: relationships.listingsWithoutImages,
      imageCounts: relationships.imageCounts,
    },
    inventory: {
      agents: agents.records.map(({ rowNumber, ...record }) => record),
      listings: listings.records.map(({ rowNumber, ...record }) => ({
        ...record,
        imageCount: relationships.imageCounts[record.listingNumber] || 0,
      })),
    },
    issues,
    nextPhase: status === 'BLOCKED'
      ? 'Correct the reported CSV issues and rerun the dry run.'
      : 'Review this report before implementing field mapping or any database apply path.',
  }
}
