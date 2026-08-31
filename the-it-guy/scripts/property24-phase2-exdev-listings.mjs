import crypto from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../server/services/property24Client.js'
import {
  createProperty24ListingPlan,
} from '../server/services/property24ListingMapper.js'
import {
  createProperty24RentalListingPlan,
} from '../server/services/property24RentalListingAdapter.js'
import {
  createRedactedProperty24Payload,
} from '../server/property24/publishService.js'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = fileURLToPath(new URL('..', import.meta.url))
const phase2StatePath = path.join(appRoot, 'artifacts/property24-vetting/phase2/listing-state.json')

export const PHASE2 = Object.freeze({
  agencyId: 31382,
  expiryDate: '2026-11-30',
  rental: {
    key: 'rental',
    listingType: 'Rental',
    sourceReference: 'ARCH9-VET-PHASE2-RENT-NEWLANDS',
    property24ListingNumber: 100314819,
    agentId: 77970,
    agentSourceReference: 'ARCH9-VET-PAULY-SHORE',
    agentName: 'Pauly Shore',
    suburbId: 8679,
    suburb: 'Newlands',
    city: 'Cape Town',
    propertyTypeId: 5,
    propertyType: 'Apartment',
    title: 'Modern Newlands Apartment with Mountain Views',
    description: 'A bright two-bedroom apartment in Newlands offering generous open-plan living, contemporary finishes and leafy mountain outlooks. The home includes two bathrooms, secure parking and convenient access to Cape Town amenities.',
    monthlyRent: 22000,
    floorSize: 82,
    availableFrom: '2026-09-01',
    imageFiles: [
      'artifacts/property24-vetting/phase2/newlands-apartment-living-room.png',
      'artifacts/property24-vetting/phase2/newlands-apartment-kitchen.png',
    ],
    imageCaptions: ['Open-plan living and dining area', 'Contemporary kitchen'],
  },
  sale: {
    key: 'sale',
    listingType: 'Sale',
    sourceReference: 'ARCH9-VET-PHASE2-SALE-SANDTON',
    property24ListingNumber: 100314820,
    agentId: 77969,
    agentSourceReference: 'ARCH9-VET-JON-SNOW',
    agentName: 'Jon Snow',
    suburbId: 5864,
    suburb: 'Sandton',
    city: 'Sandton',
    propertyTypeId: 4,
    propertyType: 'House',
    title: 'Contemporary Sandton Family Home',
    description: 'A contemporary four-bedroom family home in Sandton offering spacious interiors, modern finishes and effortless indoor-outdoor living. The property includes three bathrooms, a double garage and a landscaped private garden.',
    price: 4950000,
    floorSize: 220,
    erfSize: 600,
    imageFiles: [
      'artifacts/property24-vetting/phase2/sandton-house-exterior.png',
      'artifacts/property24-vetting/phase2/sandton-house-living-room.png',
    ],
    imageCaptions: ['Front exterior', 'Open-plan living area'],
  },
})

function parseArgs(argv) {
  const options = {
    apply: false,
    update: false,
    listing: '',
    title: '',
    description: '',
    price: null,
    floorSize: null,
    status: '',
    images: [],
  }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--update') options.update = true
    else if (arg.startsWith('--listing=')) options.listing = normalizeProperty24Text(arg.slice('--listing='.length)).toLowerCase()
    else if (arg.startsWith('--title=')) options.title = normalizeProperty24Text(arg.slice('--title='.length))
    else if (arg.startsWith('--description=')) options.description = normalizeProperty24Text(arg.slice('--description='.length))
    else if (arg.startsWith('--price=')) options.price = normalizeProperty24Text(arg.slice('--price='.length))
    else if (arg.startsWith('--floor-size=')) options.floorSize = normalizeProperty24Text(arg.slice('--floor-size='.length))
    else if (arg.startsWith('--status=')) options.status = normalizeProperty24Text(arg.slice('--status='.length))
    else if (arg.startsWith('--image=')) options.images.push(normalizeProperty24Text(arg.slice('--image='.length)))
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function parsePositiveNumber(value, label) {
  if (value === null) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive number.`)
  }
  return number
}

function validateUpdateOptions(options) {
  if (!['rental', 'sale'].includes(options.listing)) {
    throw new Error('Update mode requires exactly one target: --listing=rental or --listing=sale.')
  }
  if (options.images.some((imagePath) => !imagePath)) {
    throw new Error('--image requires a file path.')
  }

  const price = parsePositiveNumber(options.price, '--price')
  const floorSize = parsePositiveNumber(options.floorSize, '--floor-size')
  const allowedStatuses = new Map([
    ['active', 'Active'],
    ['withdrawn', 'Withdrawn'],
    ['pending', 'Pending'],
    ['sold', 'Sold'],
    ['expired', 'Expired'],
    ['cancelled', 'Cancelled'],
    ['canceled', 'Cancelled'],
    ['backonmarket', 'BackOnMarket'],
    ['back_on_market', 'BackOnMarket'],
    ['back-on-market', 'BackOnMarket'],
  ])
  const normalizedStatus = options.status
    ? allowedStatuses.get(options.status.toLowerCase().replace(/\s+/g, '_'))
    : ''
  if (options.status && !normalizedStatus) {
    throw new Error('--status must be Active, Withdrawn, Pending, Sold, Expired, Cancelled or BackOnMarket.')
  }

  const changes = {
    ...(options.title ? { title: options.title } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(price !== null ? { price } : {}),
    ...(floorSize !== null ? { floorSize } : {}),
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
    ...(options.images.length ? { replacementImages: [...options.images] } : {}),
  }
  if (!Object.keys(changes).length) {
    throw new Error('Update mode requires at least one change: --title, --description, --price, --floor-size, --status or --image.')
  }
  return changes
}

function applyUpdateChanges(definition, changes) {
  const updated = {
    ...definition,
    ...(changes.title ? { title: changes.title } : {}),
    ...(changes.description ? { description: changes.description } : {}),
    ...(changes.floorSize !== undefined ? { floorSize: changes.floorSize } : {}),
  }
  if (changes.price !== undefined) {
    if (definition.key === 'rental') updated.monthlyRent = changes.price
    else updated.price = changes.price
  }
  if (changes.replacementImages) {
    updated.imageFiles = [...changes.replacementImages]
    updated.imageCaptions = changes.replacementImages.map((_, index) => `Updated listing image ${index + 1}`)
  }
  return updated
}

function selectMutableListingState(definition, status = '') {
  return {
    property24ListingNumber: definition.property24ListingNumber,
    agentId: definition.agentId,
    agentSourceReference: definition.agentSourceReference,
    agentName: definition.agentName,
    title: definition.title,
    description: definition.description,
    floorSize: definition.floorSize,
    ...(definition.key === 'rental'
      ? { monthlyRent: definition.monthlyRent }
      : { price: definition.price }),
    imageFiles: [...definition.imageFiles],
    imageCaptions: [...definition.imageCaptions],
    status: status || definition.status || 'NewListing',
  }
}

async function readPhase2State() {
  let parsed
  try {
    parsed = JSON.parse(await fsPromises.readFile(phase2StatePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, agencyId: PHASE2.agencyId, listings: {} }
    throw new Error(`Could not read Phase 2 listing state: ${error.message}`)
  }
  if (!parsed || parsed.version !== 1 || Number(parsed.agencyId) !== PHASE2.agencyId || !parsed.listings) {
    throw new Error(`Invalid Phase 2 listing state at ${phase2StatePath}.`)
  }
  return parsed
}

export async function loadCurrentDefinition(key) {
  const base = PHASE2[key]
  const state = await readPhase2State()
  const saved = state.listings[key]
  if (!saved) return { definition: { ...base }, state }
  if (Number(saved.property24ListingNumber) !== base.property24ListingNumber) {
    throw new Error(`Phase 2 ${key} state does not match Property24 listing ${base.property24ListingNumber}.`)
  }
  const definition = {
    ...base,
    title: normalizeProperty24Text(saved.title) || base.title,
    description: normalizeProperty24Text(saved.description) || base.description,
    floorSize: parsePositiveNumber(saved.floorSize, `saved ${key} floorSize`),
    imageFiles: Array.isArray(saved.imageFiles) && saved.imageFiles.length ? [...saved.imageFiles] : [...base.imageFiles],
    imageCaptions: Array.isArray(saved.imageCaptions) ? [...saved.imageCaptions] : [...base.imageCaptions],
    status: normalizeProperty24Text(saved.status) || 'NewListing',
    agentId: Number.isSafeInteger(Number(saved.agentId)) && Number(saved.agentId) > 0 ? Number(saved.agentId) : base.agentId,
    agentSourceReference: normalizeProperty24Text(saved.agentSourceReference) || base.agentSourceReference,
    agentName: normalizeProperty24Text(saved.agentName) || base.agentName,
  }
  if (key === 'rental') definition.monthlyRent = parsePositiveNumber(saved.monthlyRent, 'saved rental monthlyRent')
  else definition.price = parsePositiveNumber(saved.price, 'saved sale price')
  return { definition, state }
}

export async function persistCurrentDefinition({ definition, state, status }) {
  const nextState = {
    version: 1,
    agencyId: PHASE2.agencyId,
    updatedAt: new Date().toISOString(),
    listings: {
      ...state.listings,
      [definition.key]: selectMutableListingState(definition, status),
    },
  }
  const temporaryPath = `${phase2StatePath}.${process.pid}.tmp`
  await fsPromises.mkdir(path.dirname(phase2StatePath), { recursive: true })
  try {
    await fsPromises.writeFile(temporaryPath, `${JSON.stringify(nextState, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fsPromises.rename(temporaryPath, phase2StatePath)
  } finally {
    await fsPromises.unlink(temporaryPath).catch(() => {})
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadConfig() {
  const files = ['.env', '.env.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)))
  const env = { ...fromFiles, ...processOverrides }
  const config = {
    baseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    userGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
  }
  config.missing = []
  if (!config.username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  return config
}

async function prepareListingImage(filePath, caption) {
  const resolvedPath = path.resolve(appRoot, filePath)
  const stats = await fsPromises.stat(resolvedPath)
  if (!stats.isFile()) throw new Error(`Listing image is not a file: ${resolvedPath}`)
  if (!stats.size || stats.size > 12 * 1024 * 1024) {
    throw new Error(`Listing image must be between 1 byte and 12 MB: ${resolvedPath}`)
  }

  const input = await fsPromises.readFile(resolvedPath)
  const metadata = await sharp(input, { animated: false, limitInputPixels: 50_000_000 }).metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new Error(`Unsupported listing image format at ${resolvedPath}: ${metadata.format || 'unknown'}`)
  }
  if (!metadata.width || !metadata.height || metadata.width < 600 || metadata.height < 400) {
    throw new Error(`Listing image must be at least 600x400 pixels: ${resolvedPath}`)
  }

  const { data, info } = await sharp(input, { animated: false, limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 86, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true })

  if (!data.length || data.length > 3 * 1024 * 1024) {
    throw new Error(`Normalized listing image is empty or exceeds 3 MB: ${resolvedPath}`)
  }

  return {
    media: {
      mediaType: 'image',
      bytes: data.toString('base64'),
      mimeContentType: 'image/jpeg',
      caption,
    },
    summary: {
      sourcePath: resolvedPath,
      sourceFormat: metadata.format,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceBytes: input.length,
      outputMimeType: 'image/jpeg',
      outputWidth: info.width,
      outputHeight: info.height,
      outputBytes: data.length,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      caption,
    },
  }
}

async function prepareImages(definition) {
  const prepared = await Promise.all(definition.imageFiles.map((file, index) => (
    prepareListingImage(file, definition.imageCaptions[index] || null)
  )))
  return {
    media: prepared.map((item) => item.media),
    summaries: prepared.map((item) => item.summary),
  }
}

export function buildRentalPlan(definition, preparedImages, update = {}) {
  return createProperty24RentalListingPlan({
    listing: {
      id: definition.sourceReference,
      listingReference: definition.sourceReference,
      listingCategory: 'Rental',
      title: definition.title,
      formattedAddress: `${definition.suburb}, ${definition.city}`,
      suburb: definition.suburb,
      city: definition.city,
      province: 'Western Cape',
      propertyType: definition.propertyType,
      property24AgencyId: String(PHASE2.agencyId),
      property24ContactAgentIds: [String(definition.agentId)],
      property24SuburbId: String(definition.suburbId),
      property24PropertyTypeId: String(definition.propertyTypeId),
      floorSize: definition.floorSize,
      bedrooms: 2,
      bathrooms: 2,
      parkingBays: 1,
      garages: 0,
      garden: false,
      pool: false,
      flatlet: false,
      mandateEndDate: PHASE2.expiryDate,
      description: definition.description,
      photos: definition.imageFiles,
      sellerCanonicalFacts: {
        rentalInfo: {
          monthlyRent: definition.monthlyRent,
          depositAmount: definition.monthlyRent * 2,
          availableFrom: definition.availableFrom,
          leasePeriodMonths: 12,
          furnishedStatus: 'unfurnished',
          petsPolicy: 'not_allowed',
          utilitiesPolicy: 'tenant_pays',
          mandateStatus: 'signed_uploaded',
          marketingApprovalStatus: 'approved',
        },
      },
    },
    media: preparedImages.media,
    existingSync: update.listingNumber ? { listingNumber: update.listingNumber } : {},
    agentMapping: {
      property24AgentId: definition.agentId,
      sourceReference: definition.agentSourceReference,
    },
    catalogMapping: {
      suburbId: definition.suburbId,
      propertyTypeId: definition.propertyTypeId,
    },
    options: {
      agencyId: PHASE2.agencyId,
      environment: 'exdev',
      sandboxPayloadTestMode: false,
      includeSubmitPayload: true,
      requirePhotoBytes: update.photosChanged !== false,
      photosChanged: update.photosChanged,
      ...(update.status ? { status: update.status } : {}),
    },
  })
}

export function buildSalePlan(definition, preparedImages, update = {}) {
  return createProperty24ListingPlan({
    listing: {
      id: definition.sourceReference,
      listing_reference: definition.sourceReference,
      listing_type: 'Sale',
      listing_status: 'active',
      title: definition.title,
      property_type: definition.propertyType,
      asking_price: definition.price,
      floorSize: definition.floorSize,
      erfSize: definition.erfSize,
      bedrooms: 4,
      bathrooms: 3,
      garages: 2,
      parkingBays: 2,
      garden: true,
      pool: false,
      flatlet: false,
    },
    publication: {
      title: definition.title,
      listing_type: 'Sale',
      property_type: definition.propertyType,
      asking_price: definition.price,
      floor_size: definition.floorSize,
      erf_size: definition.erfSize,
      bedrooms: 4,
      bathrooms: 3,
      garages: 2,
      parking_bays: 2,
      garden: true,
      pool: false,
      flatlet: false,
      description: definition.description,
    },
    media: preparedImages.media,
    existingSync: update.listingNumber ? { listingNumber: update.listingNumber } : {},
    agentMapping: {
      property24AgentId: definition.agentId,
      sourceReference: definition.agentSourceReference,
    },
    catalogMapping: {
      suburbId: definition.suburbId,
      propertyTypeId: definition.propertyTypeId,
    },
    options: {
      agencyId: PHASE2.agencyId,
      environment: 'exdev',
      expiryDate: PHASE2.expiryDate,
      includeSubmitPayload: true,
      requirePhotoBytes: update.photosChanged !== false,
      photosChanged: update.photosChanged,
      ...(update.status ? { status: update.status } : {}),
    },
  })
}

export function extractListingNumber(value) {
  if (Number.isSafeInteger(Number(value)) && Number(value) > 0) return Number(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  for (const key of ['listingNumber', 'ListingNumber']) {
    const number = Number(value[key])
    if (Number.isSafeInteger(number) && number > 0) return number
  }
  for (const key of ['data', 'result', 'value']) {
    const number = extractListingNumber(value[key])
    if (number) return number
  }
  return null
}

function findObjectBySourceReference(value, sourceReference) {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findObjectBySourceReference(item, sourceReference)
      if (match) return match
    }
    return null
  }
  if (String(value.sourceReference || value.SourceReference || '').trim() === sourceReference) return value
  for (const nested of Object.values(value)) {
    const match = findObjectBySourceReference(nested, sourceReference)
    if (match) return match
  }
  return null
}

function findObjectByListingNumber(value, listingNumber) {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findObjectByListingNumber(item, listingNumber)
      if (match) return match
    }
    return null
  }
  if (extractListingNumber(value) === listingNumber) return value
  for (const nested of Object.values(value)) {
    const match = findObjectByListingNumber(nested, listingNumber)
    if (match) return match
  }
  return null
}

async function findExistingListing(property24, definition) {
  const result = await property24.fetchListingReconciliation({
    agentId: definition.agentId,
  })
  const rows = Array.isArray(result.data) ? result.data : []
  const expectedListingNumber = extractListingNumber(definition.property24ListingNumber)
  const match = (expectedListingNumber
    ? findObjectByListingNumber(result.data, expectedListingNumber)
    : findObjectBySourceReference(result.data, definition.sourceReference)) ||
    (!expectedListingNumber && rows.length === 1 && extractListingNumber(rows[0]) ? rows[0] : null)
  return match ? {
    listingNumber: extractListingNumber(match),
    reconciliationHttpStatus: result.status,
  } : null
}

async function checkPortal(property24, listingNumber) {
  if (!listingNumber) return null
  try {
    const result = await property24.checkListingOnPortal(listingNumber)
    return {
      httpStatus: result.status,
      isOnPortal: typeof result.data === 'boolean'
        ? result.data
        : Boolean(result.data?.isOnPortal ?? result.data?.IsOnPortal),
      response: summarizeProperty24Payload(result.data),
    }
  } catch (error) {
    return {
      status: 'CHECK_FAILED',
      message: error.message,
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }
  }
}

async function submitListing(property24, definition, plan) {
  const existing = await findExistingListing(property24, definition)
  if (existing?.listingNumber) {
    return {
      key: definition.key,
      status: 'ALREADY_EXISTS',
      listingNumber: existing.listingNumber,
      agentId: definition.agentId,
      sourceReference: definition.sourceReference,
      portal: await checkPortal(property24, existing.listingNumber),
    }
  }

  const result = await property24.saveListing(plan.payload)
  const listingNumber = extractListingNumber(result.data)
  if (!listingNumber) {
    const error = new Error(`Property24 accepted the ${definition.key} request but did not return a listing number.`)
    error.responseBody = result.data
    throw error
  }
  return {
    key: definition.key,
    status: 'CREATED',
    httpStatus: result.status,
    listingNumber,
    agentId: definition.agentId,
    sourceReference: definition.sourceReference,
    response: summarizeProperty24Payload(result.data),
    portal: await checkPortal(property24, listingNumber),
  }
}

function createPreflightEntry({ definition, images, plan }) {
  return {
    key: definition.key,
    listingType: definition.listingType,
    agent: { id: definition.agentId, name: definition.agentName },
    sourceReference: definition.sourceReference,
    title: definition.title,
    floorSizeSquareMetres: definition.floorSize,
    summary: plan.summary,
    dataBlockers: plan.dataBlockers,
    technicalBlockers: plan.technicalBlockers,
    images: images.summaries,
    payload: createRedactedProperty24Payload(plan.payload),
  }
}

async function runUpdate({ options, config }) {
  const changes = validateUpdateOptions(options)
  const { definition: originalDefinition, state } = await loadCurrentDefinition(options.listing)
  const property24 = createProperty24Client(config)
  const existing = await findExistingListing(property24, originalDefinition)
  if (!existing?.listingNumber) {
    console.log(JSON.stringify({
      status: 'BLOCKED',
      environment: 'exdev',
      listing: options.listing,
      sourceReference: originalDefinition.sourceReference,
      message: 'The existing Phase 2 listing could not be resolved from Property24 reconciliation; no write was made.',
    }, null, 2))
    process.exitCode = 1
    return
  }

  const definition = applyUpdateChanges(originalDefinition, changes)
  const photosChanged = Boolean(changes.replacementImages)
  const images = photosChanged
    ? await prepareImages(definition)
    : { media: [], summaries: [] }
  const updateContext = {
    listingNumber: existing.listingNumber,
    photosChanged,
    status: changes.status || originalDefinition.status,
  }
  const plan = definition.key === 'rental'
    ? buildRentalPlan(definition, images, updateContext)
    : buildSalePlan(definition, images, updateContext)
  const preflight = createPreflightEntry({ definition, images, plan })

  if (!plan.canSubmit) {
    console.log(JSON.stringify({
      status: 'BLOCKED',
      environment: 'exdev',
      operation: 'update',
      changes,
      listing: preflight,
    }, null, 2))
    process.exitCode = 1
    return
  }
  if (!options.apply) {
    console.log(JSON.stringify({
      status: 'UPDATE_DRY_RUN_READY',
      environment: 'exdev',
      operation: 'update',
      message: 'The existing listing was resolved and the update payload passed validation. No Property24 write was made.',
      listingNumber: existing.listingNumber,
      reconciliationHttpStatus: existing.reconciliationHttpStatus,
      changes,
      photoBehavior: photosChanged
        ? 'The supplied images would replace the complete Property24 photo gallery.'
        : 'Existing Property24 photos would be preserved because payload.photos is null.',
      listing: preflight,
    }, null, 2))
    return
  }

  const result = await property24.saveListing(plan.payload)
  const returnedListingNumber = extractListingNumber(result.data)
  if (returnedListingNumber && returnedListingNumber !== existing.listingNumber) {
    const error = new Error(`Property24 returned unexpected listing number ${returnedListingNumber}; expected ${existing.listingNumber}.`)
    error.responseBody = result.data
    throw error
  }
  await persistCurrentDefinition({ definition, state, status: plan.summary.status })
  console.log(JSON.stringify({
    status: 'UPDATED',
    environment: 'exdev',
    operation: 'update',
    httpStatus: result.status,
    listingNumber: existing.listingNumber,
    agentId: definition.agentId,
    sourceReference: definition.sourceReference,
    changes,
    response: summarizeProperty24Payload(result.data),
    portal: await checkPortal(property24, existing.listingNumber),
  }, null, 2))
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  if (config.missing.length) {
    console.log(JSON.stringify({ status: 'BLOCKED', missingConfiguration: config.missing }, null, 2))
    process.exitCode = 1
    return
  }
  if (config.baseUrl.replace(/\/+$/g, '') !== PROPERTY24_EXDEV_BASE_URL) {
    throw new Error(`Phase 2 vetting runner is locked to Property24 ExDev; received ${config.baseUrl}`)
  }
  if (options.update) {
    await runUpdate({ options, config })
    return
  }
  if (options.listing || options.title || options.description || options.price !== null || options.floorSize !== null || options.status || options.images.length) {
    throw new Error('Listing changes require --update. No Property24 write was made.')
  }

  const [rentalImages, saleImages] = await Promise.all([
    prepareImages(PHASE2.rental),
    prepareImages(PHASE2.sale),
  ])
  const entries = [
    { definition: PHASE2.rental, images: rentalImages, plan: buildRentalPlan(PHASE2.rental, rentalImages) },
    { definition: PHASE2.sale, images: saleImages, plan: buildSalePlan(PHASE2.sale, saleImages) },
  ]
  const blocked = entries.filter(({ plan }) => !plan.canSubmit)
  const preflight = entries.map(createPreflightEntry)

  if (blocked.length) {
    console.log(JSON.stringify({ status: 'BLOCKED', environment: 'exdev', listings: preflight }, null, 2))
    process.exitCode = 1
    return
  }
  if (!options.apply) {
    console.log(JSON.stringify({
      status: 'DRY_RUN_READY',
      environment: 'exdev',
      message: 'Both listing payloads passed local validation. No Property24 write was made.',
      submissionOrder: ['rental', 'sale'],
      listings: preflight,
    }, null, 2))
    return
  }

  const property24 = createProperty24Client(config)
  const results = []
  for (const entry of entries) {
    try {
      results.push(await submitListing(property24, entry.definition, entry.plan))
    } catch (error) {
      console.error(JSON.stringify({
        status: results.length ? 'PARTIAL_FAILURE' : 'FAILED',
        environment: 'exdev',
        completed: results,
        failedListing: entry.definition.key,
        error: {
          name: error.name,
          message: error.message,
          httpStatus: error.status || null,
          response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
        },
      }, null, 2))
      process.exitCode = 1
      return
    }
  }

  console.log(JSON.stringify({
    status: 'COMPLETE',
    environment: 'exdev',
    agencyId: PHASE2.agencyId,
    results,
  }, null, 2))
}

if (path.resolve(process.argv[1] || '') === scriptPath) {
  run().catch((error) => {
    console.error(JSON.stringify({
      status: 'FAILED',
      name: error.name,
      message: error.message,
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }, null, 2))
    process.exitCode = 1
  })
}
