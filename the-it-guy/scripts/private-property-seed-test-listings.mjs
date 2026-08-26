import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

const WORKSPACES = {
  produktive: {
    organisationId: 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a',
    branchId: '531f1439-62b3-4c76-a908-e6ec906d7fdf',
    assignedAgentId: '763b2e6b-909d-42ef-9303-ff2dd64e6ade',
    assignedAgentEmail: 'alex.produktive.training@arch9.test',
  },
  kingstons: {
    organisationId: 'ec19d0a6-bcba-4eef-aa72-9972de88204d',
    branchId: '9e5fa77e-3c4f-4dcc-a394-08b4e76c3683',
    assignedAgentId: '89dce065-51e2-4afc-9d27-a9cdba7ab40b',
    assignedAgentEmail: 'alex.kingstons.training@arch9.test',
  },
}

function parseArgs(argv) {
  const options = {
    apply: false,
    workspace: '',
    organisationId: '',
    branchId: '',
    assignedAgentId: '',
    assignedAgentEmail: '',
    output: '',
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
    } else if (arg.startsWith('--workspace=')) {
      options.workspace = normalizePrivatePropertyText(arg.slice('--workspace='.length)).toLowerCase()
    } else if (arg.startsWith('--organisation-id=')) {
      options.organisationId = normalizePrivatePropertyText(arg.slice('--organisation-id='.length))
    } else if (arg.startsWith('--branch-id=')) {
      options.branchId = normalizePrivatePropertyText(arg.slice('--branch-id='.length))
    } else if (arg.startsWith('--assigned-agent-id=')) {
      options.assignedAgentId = normalizePrivatePropertyText(arg.slice('--assigned-agent-id='.length))
    } else if (arg.startsWith('--assigned-agent-email=')) {
      options.assignedAgentEmail = normalizePrivatePropertyText(arg.slice('--assigned-agent-email='.length))
    } else if (arg.startsWith('--output=')) {
      options.output = normalizePrivatePropertyText(arg.slice('--output='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
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

function loadEnv() {
  const files = ['.env', '.env.local', '.env.private-property.local', '../.env.production.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizePrivatePropertyText(value)),
  )
  return { ...fromFiles, ...processOverrides }
}

function resolveTarget(options = {}) {
  const workspaceDefaults = WORKSPACES[options.workspace] || {}
  return {
    workspace: options.workspace || 'custom',
    organisationId: normalizePrivatePropertyText(options.organisationId || workspaceDefaults.organisationId),
    branchId: normalizePrivatePropertyText(options.branchId || workspaceDefaults.branchId),
    assignedAgentId: normalizePrivatePropertyText(options.assignedAgentId || workspaceDefaults.assignedAgentId),
    assignedAgentEmail: normalizePrivatePropertyText(options.assignedAgentEmail || workspaceDefaults.assignedAgentEmail),
  }
}

function buildListingRows(target = {}) {
  const now = new Date().toISOString()
  const common = {
    organisation_id: target.organisationId,
    branch_id: target.branchId || null,
    assigned_agent_id: target.assignedAgentId || null,
    assigned_agent_email: target.assignedAgentEmail || null,
    listing_status: 'active',
    listing_visibility: 'active_market',
    mandate_status: 'signed',
    seller_onboarding_status: 'completed',
    listing_source: 'private_property_sandbox_seed',
    is_demo_data: true,
    property_category: 'residential',
    property_structure_type: 'freehold',
    country: 'South Africa',
    province: 'Gauteng',
    city: 'Pretoria',
    suburb: 'Garsfontein',
    created_at: now,
    updated_at: now,
  }

  function createListing({
    kind,
    reference,
    title,
    description,
    listingType,
    propertyType,
    propertyCategory,
    mandateType,
    streetNumber,
    streetName,
    price,
    bedrooms = null,
    bathrooms = null,
    erfSize = null,
    floorSize = null,
    rates = 0,
    levies = 0,
    garages = 0,
    parkingBays = 0,
    features = [],
    amenities = [],
    facts = {},
  }) {
    const id = randomUUID()
    const streetAddress = `${streetNumber} ${streetName}`
    const rentalInfo = listingType === 'Rental'
      ? {
        monthlyRent: price,
        depositAmount: price,
        availableFrom: '2026-09-01',
        leasePeriodMonths: 12,
        furnishedStatus: 'Unfurnished',
        petsPolicy: 'On application',
        utilitiesPolicy: 'Prepaid electricity, water billed monthly',
        marketingApprovalStatus: 'ready',
        mandateStatus: 'signed',
      }
      : null

    return {
      kind,
      listing: {
        ...common,
        id,
        listing_reference: reference,
        title,
        description,
        property_type: propertyType,
        property_category: propertyCategory,
        listing_category: listingType.toLowerCase(),
        mandate_type: mandateType,
        street_address: streetAddress,
        address_line_1: streetAddress,
        formatted_address: `${streetAddress}, Garsfontein, Pretoria, Gauteng`,
        asking_price: price,
        bedrooms,
        bathrooms,
        erf_size_sqm: erfSize,
        floor_size_sqm: floorSize,
        rates_amount: rates,
        levy_amount: levies,
        seller_canonical_facts_json: rentalInfo || Object.keys(facts).length ? {
          ...(rentalInfo ? { rentalInfo } : {}),
          ...facts,
        } : {},
      },
      publication: {
        listing_id: id,
        status: 'Ready',
        title,
        description,
        listing_type: listingType,
        property_type: propertyType,
        asking_price: price,
        bedrooms,
        bathrooms,
        garages,
        erf_size: erfSize,
        floor_size: floorSize,
        rates_taxes: rates,
        levies,
        parking_bays: parkingBays,
        suburb: 'Garsfontein',
        province: 'Gauteng',
        address: `${streetAddress}, Garsfontein, Pretoria, Gauteng`,
        features,
        amenities,
      },
    }
  }

  return [
    createListing({
      kind: 'rental-residential',
      reference: 'PP-SANDBOX-RENTAL-RES-001',
      title: 'Private Property Sandbox Rental Residential',
      description: 'Controlled Arch9 residential rental test listing for Private Property sandbox validation.',
      listingType: 'Rental',
      propertyType: 'Apartment',
      propertyCategory: 'residential',
      mandateType: 'Rental',
      streetNumber: '18',
      streetName: 'Sandbox Rental Avenue',
      price: 18500,
      bedrooms: 2,
      bathrooms: 2,
      floorSize: 92,
      garages: 1,
      features: ['Fibre ready', 'Secure parking', 'Balcony'],
      amenities: ['Schools', 'Shopping centres', 'Public transport'],
    }),
    createListing({
      kind: 'rental-commercial-m2',
      reference: 'PP-SANDBOX-RENTAL-COM-M2-001',
      title: 'Private Property Sandbox Commercial Rental Per M2',
      description: 'Controlled Arch9 commercial rental per square metre test listing for Private Property sandbox validation.',
      listingType: 'Rental',
      propertyType: 'Offices',
      propertyCategory: 'commercial',
      mandateType: 'Rental',
      streetNumber: '22',
      streetName: 'Sandbox Commercial M2 Road',
      price: 220,
      floorSize: 320,
      parkingBays: 8,
      features: ['Access control', 'Reception area', 'Backup power'],
      amenities: ['Main roads', 'Public transport', 'Retail nodes'],
    }),
    createListing({
      kind: 'rental-commercial-day',
      reference: 'PP-SANDBOX-RENTAL-COM-DAY-001',
      title: 'Private Property Sandbox Commercial Rental Per Day',
      description: 'Controlled Arch9 commercial rental per day test listing for Private Property sandbox validation.',
      listingType: 'Rental',
      propertyType: 'Commercial',
      propertyCategory: 'commercial',
      mandateType: 'Rental',
      streetNumber: '24',
      streetName: 'Sandbox Commercial Day Road',
      price: 2500,
      floorSize: 180,
      parkingBays: 4,
      features: ['Flexible tenancy', 'Access control', 'Visitor parking'],
      amenities: ['Main roads', 'Public transport', 'Retail nodes'],
    }),
    createListing({
      kind: 'sale-residential-video',
      reference: 'PP-SANDBOX-SALE-RES-VIDEO-001',
      title: 'Private Property Sandbox Sale Residential Video',
      description: 'Controlled Arch9 residential sale test listing with video for Private Property sandbox validation.',
      listingType: 'Sale',
      propertyType: 'House',
      propertyCategory: 'residential',
      mandateType: 'OpenMandate',
      streetNumber: '12',
      streetName: 'Sandbox Sale Street',
      price: 2500000,
      bedrooms: 3,
      bathrooms: 2,
      erfSize: 500,
      floorSize: 180,
      rates: 1200,
      garages: 1,
      features: ['Garden', 'Pet friendly', 'Security'],
      amenities: ['Schools', 'Shopping centres', 'Main roads'],
    }),
    createListing({
      kind: 'sale-commercial-showday',
      reference: 'PP-SANDBOX-SALE-COM-SHOWDAY-001',
      title: 'Private Property Sandbox Commercial Sale Show Day',
      description: 'Controlled Arch9 commercial sale listing with a show day for Private Property sandbox validation.',
      listingType: 'Sale',
      propertyType: 'Offices',
      propertyCategory: 'commercial',
      mandateType: 'OpenMandate',
      streetNumber: '30',
      streetName: 'Sandbox Showday Boulevard',
      price: 3850000,
      floorSize: 410,
      erfSize: 650,
      rates: 3100,
      parkingBays: 12,
      features: ['Reception area', 'Boardroom', 'Backup power'],
      amenities: ['Main roads', 'Retail nodes', 'Public transport'],
    }),
    createListing({
      kind: 'sale-farm-auction',
      reference: 'PP-SANDBOX-SALE-FARM-AUCTION-001',
      title: 'Private Property Sandbox Farm Auction',
      description: 'Controlled Arch9 farm auction listing for Private Property sandbox validation.',
      listingType: 'Sale',
      propertyType: 'Farm',
      propertyCategory: 'farm',
      mandateType: 'AuctionOnly',
      streetNumber: '44',
      streetName: 'Sandbox Farm Road',
      price: 4500000,
      erfSize: 120000,
      floorSize: 280,
      rates: 1800,
      features: ['Borehole', 'Irrigation', 'Paddocks'],
      amenities: ['Main roads', 'Agricultural access'],
      facts: { farmName: 'Arch9 Test Farm' },
    }),
    createListing({
      kind: 'sale-land-rates-levies',
      reference: 'PP-SANDBOX-SALE-LAND-001',
      title: 'Private Property Sandbox Sale Land',
      description: 'Controlled Arch9 vacant land sale listing with land area, rates and levies for Private Property sandbox validation.',
      listingType: 'Sale',
      propertyType: 'Residential Land',
      propertyCategory: 'land',
      mandateType: 'OpenMandate',
      streetNumber: '52',
      streetName: 'Sandbox Land Crescent',
      price: 1450000,
      erfSize: 850,
      rates: 950,
      levies: 650,
      features: ['Walled', 'Services available', 'North facing'],
      amenities: ['Schools', 'Shopping centres', 'Main roads'],
    }),
  ]
}

function buildMediaRows(listingId, kind) {
  const urls = kind.startsWith('sale')
    ? [
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
    ]
    : [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1600&q=80',
    ]
  return urls.map((url, index) => ({
    listing_id: listingId,
    media_type: 'image',
    file_url: url,
    caption: `Private Property sandbox ${kind} image ${index + 1}`,
    sort_order: index + 1,
    is_cover: index === 0,
  }))
}

async function findExistingListing(client, listingReference) {
  const { data, error } = await client
    .from('private_listings')
    .select('id, listing_reference, title')
    .eq('listing_reference', listingReference)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function upsertPublication(client, publication) {
  const { data: existing, error: existingError } = await client
    .from('listing_publication_data')
    .select('id')
    .eq('listing_id', publication.listing_id)
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError

  const query = existing
    ? client.from('listing_publication_data').update(publication).eq('id', existing.id)
    : client.from('listing_publication_data').insert(publication)
  const { data, error } = await query.select('id, listing_id, listing_type, status').single()
  if (error) throw error
  return data
}

async function ensureMedia(client, listingId, kind) {
  const { data: existing, error: existingError } = await client
    .from('listing_media')
    .select('id')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true })
    .limit(3)
  if (existingError) throw existingError
  const rows = buildMediaRows(listingId, kind)
  if ((existing || []).length >= 3) {
    const updated = []
    for (const [index, row] of rows.entries()) {
      const target = existing[index]
      const { data, error } = await client
        .from('listing_media')
        .update(row)
        .eq('id', target.id)
        .select('id, listing_id, media_type, sort_order, is_cover')
        .single()
      if (error) throw error
      updated.push(data)
    }
    return { inserted: 0, updated: updated.length, skipped: 0 }
  }

  const { data, error } = await client
    .from('listing_media')
    .insert(rows)
    .select('id, listing_id, media_type, sort_order, is_cover')
  if (error) throw error
  return { inserted: data.length, updated: 0, skipped: 0 }
}

async function seedListing(client, item) {
  const existing = await findExistingListing(client, item.listing.listing_reference)
  const listingPayload = existing ? { ...item.listing, id: existing.id } : item.listing
  const query = existing
    ? client.from('private_listings').update(listingPayload).eq('id', existing.id)
    : client.from('private_listings').insert(listingPayload)
  const { data: listing, error } = await query
    .select('id, listing_reference, title, organisation_id, branch_id, assigned_agent_id, assigned_agent_email')
    .single()
  if (error) throw error

  const publication = await upsertPublication(client, {
    ...item.publication,
    listing_id: listing.id,
  })
  const media = await ensureMedia(client, listing.id, item.kind)

  return {
    kind: item.kind,
    action: existing ? 'updated' : 'inserted',
    listing,
    publication,
    media,
  }
}

function buildReport({ target, options, rows, result = [] }) {
  const blockers = []
  if (!target.organisationId) blockers.push('missing_organisation_id')
  if (!target.assignedAgentId && !target.assignedAgentEmail) blockers.push('missing_assigned_agent')
  return {
    phase: 'private-property-seed-test-listings',
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    status: blockers.length ? 'BLOCKED' : options.apply ? 'SEEDED' : 'DRY_RUN_READY',
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: options.apply && blockers.length === 0,
      rawCredentialsStored: false,
      listingPublished: false,
    },
    target,
    blockers,
    candidates: rows.map((item) => ({
      kind: item.kind,
      listingReference: item.listing.listing_reference,
      title: item.listing.title,
      listingType: item.publication.listing_type,
      propertyType: item.publication.property_type,
      price: item.publication.asking_price,
    })),
    result,
    nextStep: blockers.length
      ? 'Provide --organisation-id plus --assigned-agent-id or --assigned-agent-email, then re-run.'
      : options.apply
        ? 'Run Private Property readiness for each listing, then preview/publish to sandbox.'
        : 'Re-run with --apply to create or update these Private Property sandbox test listings.',
  }
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-seed-test-listings.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const target = resolveTarget(options)
  const rows = buildListingRows(target)
  const initialReport = buildReport({ target, options, rows })

  if (initialReport.blockers.length || !options.apply) {
    const output = writeReport(initialReport, options.output)
    console.log(JSON.stringify({
      status: initialReport.status,
      output,
      blockers: initialReport.blockers,
      candidates: initialReport.candidates,
      nextStep: initialReport.nextStep,
    }, null, 2))
    if (initialReport.blockers.length) process.exitCode = 1
    return
  }

  const env = loadEnv()
  const supabaseUrl = normalizePrivatePropertyText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizePrivatePropertyText(env.SUPABASE_SERVICE_ROLE_KEY)
  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) {
    const report = {
      ...initialReport,
      status: 'BLOCKED',
      safety: { ...initialReport.safety, databaseWritten: false },
      blockers: missing.map((item) => `missing_configuration:${item}`),
      missingConfiguration: missing,
      nextStep: 'Add the missing database configuration, then re-run this seed command.',
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = []
  for (const item of rows) {
    result.push(await seedListing(client, item))
  }
  const report = buildReport({ target, options, rows, result })
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    listings: result.map((item) => ({
      kind: item.kind,
      id: item.listing.id,
      listingReference: item.listing.listing_reference,
      action: item.action,
    })),
    nextStep: report.nextStep,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  }, null, 2))
  process.exitCode = 1
})
