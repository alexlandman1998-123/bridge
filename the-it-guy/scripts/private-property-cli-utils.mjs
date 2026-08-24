import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRIVATE_PROPERTY_SANDBOX_BASE_URL,
  createPrivatePropertyClient,
  extractPrivatePropertyXmlBlocks,
  extractPrivatePropertyXmlTag,
  normalizePrivatePropertyText,
} from '../server/services/privatePropertyClient.js'

export const appRoot = fileURLToPath(new URL('..', import.meta.url))

export function parsePrivatePropertyArgs(argv = [], defaults = {}) {
  const options = { ...defaults }
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = normalizePrivatePropertyText(match[2])
  }
  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

export function loadPrivatePropertyEnv() {
  const files = ['.env', '.env.local', '.env.private-property.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizePrivatePropertyText(value)),
  )
  return { ...fromFiles, ...processOverrides }
}

export function buildPrivatePropertyCliConfig(options = {}, { requireCredentials = true } = {}) {
  const env = loadPrivatePropertyEnv()
  const config = {
    baseUrl: normalizePrivatePropertyText(options.baseUrl || env.PRIVATE_PROPERTY_BASE_URL) || PRIVATE_PROPERTY_SANDBOX_BASE_URL,
    username: normalizePrivatePropertyText(options.username || env.PRIVATE_PROPERTY_USERNAME || env.PRIVATE_PROPERTY_USER_NAME),
    password: normalizePrivatePropertyText(options.password || env.PRIVATE_PROPERTY_PASSWORD),
    branchGuid: normalizePrivatePropertyText(options.branchGuid || options.branchId || env.PRIVATE_PROPERTY_BRANCH_GUID || env.PRIVATE_PROPERTY_GUID),
    vendor: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_VENDOR),
    environment: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_ENVIRONMENT || env.PRIVATE_PROPERTY_ENV || 'sandbox'),
    missing: [],
  }
  if (requireCredentials) {
    if (!config.username) config.missing.push('PRIVATE_PROPERTY_USERNAME')
    if (!config.password) config.missing.push('PRIVATE_PROPERTY_PASSWORD')
  }
  return config
}

export function createPrivatePropertyCliClient(config = {}) {
  return createPrivatePropertyClient({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
  })
}

export function writePrivatePropertyReport(report, outputArg, defaultName) {
  const output = outputArg || path.join(appRoot, 'outputs', defaultName)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

export function createPrivatePropertyPhase5BaseReport(phase, config = {}, options = {}) {
  return {
    phase,
    generatedAt: new Date().toISOString(),
    environment: config.environment,
    baseUrl: config.baseUrl,
    vendor: config.vendor || null,
    username: config.username || null,
    branchGuid: config.branchGuid || null,
    apply: Boolean(options.apply),
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingStatusChanged: false,
    },
    status: 'BLOCKED',
  }
}

export function parsePrivatePropertyModelRows(xml = '', tagName = '') {
  return extractPrivatePropertyXmlBlocks(xml, tagName).map((block) => ({
    id: Number(extractPrivatePropertyXmlTag(block, 'Id')) || null,
    name: extractPrivatePropertyXmlTag(block, 'Name'),
    countryId: Number(extractPrivatePropertyXmlTag(block, 'CountryId')) || null,
    provinceId: Number(extractPrivatePropertyXmlTag(block, 'ProvinceId')) || null,
    cityId: Number(extractPrivatePropertyXmlTag(block, 'CityId')) || null,
  }))
}

export function parsePrivatePropertyActiveListings(xml = '') {
  return extractPrivatePropertyXmlBlocks(xml, 'ActiveListing').map((block) => ({
    listingType: extractPrivatePropertyXmlTag(block, 'ListingType'),
    privatePropertyRef: extractPrivatePropertyXmlTag(block, 'PrivatePropertyRef'),
    uniqueId: extractPrivatePropertyXmlTag(block, 'UniqueId'),
  }))
}

export function parsePrivatePropertyListingEvents(xml = '') {
  const blocks = [
    ...extractPrivatePropertyXmlBlocks(xml, 'LisitngEventFeedData'),
    ...extractPrivatePropertyXmlBlocks(xml, 'ListingEventFeedData'),
  ]
  return blocks.map((block) => {
    const eventDescription = extractPrivatePropertyXmlTag(block, 'EventDescription') || extractPrivatePropertyXmlTag(block, 'Description')
    const referenceFromDescription = /^T\d+/i.test(eventDescription) ? eventDescription : ''
    return {
      listingFeedEventType: extractPrivatePropertyXmlTag(block, 'ListingFeedEventType'),
      eventType: extractPrivatePropertyXmlTag(block, 'EventType'),
      propertyId: extractPrivatePropertyXmlTag(block, 'PropertyId') || extractPrivatePropertyXmlTag(block, 'ListingFeedRef') || extractPrivatePropertyXmlTag(block, 'UniqueListingId') || extractPrivatePropertyXmlTag(block, 'UniqueListingID'),
      privatePropertyRef: extractPrivatePropertyXmlTag(block, 'PrivatePropertyRef') || extractPrivatePropertyXmlTag(block, 'ReferenceNumber') || referenceFromDescription,
      eventDescription,
      eventStatus: extractPrivatePropertyXmlTag(block, 'ListingFeedEventStatus'),
      eventDate: extractPrivatePropertyXmlTag(block, 'EventDate') || extractPrivatePropertyXmlTag(block, 'TimeStamp') || extractPrivatePropertyXmlTag(block, 'CreatedDate'),
    }
  })
}

export function normalizePrivatePropertyKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
