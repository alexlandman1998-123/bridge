import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createProperty24ListingPlan,
  normalizeProperty24ListingText,
} from '../server/services/property24ListingMapper.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    suburbId: '',
    output: '',
    withImageBytes: false,
  }

  for (const arg of argv) {
    if (arg === '--with-image-bytes') {
      options.withImageBytes = true
    } else if (arg.startsWith('--suburb-id=')) {
      options.suburbId = normalizeProperty24ListingText(arg.slice('--suburb-id='.length))
    } else if (arg.startsWith('--output=')) {
      options.output = normalizeProperty24ListingText(arg.slice('--output='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function createMockListing() {
  return {
    id: 'mock-arch9-listing-001',
    listing_reference: 'ARCH9-MOCK-LISTING-001',
    listing_status: 'active',
    title: 'Property24 ExDev Test House',
    description: 'A safe mock listing used only to preview the Property24 payload.',
    address_line_1: '12 Preview Road',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'Gauteng',
    property_type: 'house',
    asking_price: 2450000,
  }
}

function createMockPublication() {
  return {
    title: 'Property24 ExDev Test House',
    address: '12 Preview Road, Sandton, Johannesburg, Gauteng',
    suburb: 'Sandton',
    province: 'Gauteng',
    property_type: 'House',
    listing_type: 'Sale',
    asking_price: 2450000,
    bedrooms: 3,
    bathrooms: 2,
    garages: 2,
    parking_bays: 1,
    floor_size: 180,
    erf_size: 500,
    rates_taxes: 1300,
    levies: 0,
    description: 'Modern test home with a clean Property24 preview payload. This is not published.',
    status: 'Ready',
  }
}

function createMockMedia({ withImageBytes = false } = {}) {
  return [
    {
      media_type: 'image',
      file_url: 'https://www.arch9.co.za/mock-property24-preview.jpg',
      bytes: withImageBytes ? 'base64-image-data-for-preview-test' : '',
      mimeContentType: 'image/jpeg',
      caption: 'Front view',
      is_cover: true,
    },
  ]
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-phase3-mock-preview.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const plan = createProperty24ListingPlan({
    listing: createMockListing(),
    publication: createMockPublication(),
    media: createMockMedia({ withImageBytes: options.withImageBytes }),
    agentMapping: {
      property24AgentId: 77959,
      sourceReference: 'ARCH9-AGENT-001',
    },
    catalogMapping: {
      suburbId: options.suburbId,
    },
    options: {
      expiryDate: '2026-12-31',
    },
  })

  const report = {
    phase: 'property24-syndication-phase3-mock-preview',
    generatedAt: new Date().toISOString(),
    safety: {
      property24ApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    status: plan.canPreview ? 'PREVIEW_READY' : 'BLOCKED',
    canPreview: plan.canPreview,
    canSubmit: plan.canSubmit,
    dataBlockers: plan.dataBlockers,
    technicalBlockers: plan.technicalBlockers,
    summary: plan.summary,
    previewPayload: plan.previewPayload,
    nextStep: plan.canPreview
      ? 'Use a real Arch9 listing next, then load actual image bytes before any ExDev publish.'
      : 'Resolve the listed dataBlockers before previewing the Property24 payload.',
  }

  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    canPreview: report.canPreview,
    canSubmit: report.canSubmit,
    dataBlockers: report.dataBlockers,
    technicalBlockers: report.technicalBlockers,
  }, null, 2))
}

run()
