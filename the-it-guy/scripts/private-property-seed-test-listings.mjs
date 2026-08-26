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
  const saleId = randomUUID()
  const rentalId = randomUUID()
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

  return [
    {
      kind: 'sale',
      listing: {
        ...common,
        id: saleId,
        listing_reference: 'PP-SANDBOX-SALE-001',
        title: 'Private Property Sandbox Sale Listing',
        description: 'Controlled Arch9 sale test listing for Private Property sandbox validation.',
        property_type: 'House',
        listing_category: 'sale',
        mandate_type: 'OpenMandate',
        street_address: '12 Sandbox Sale Street',
        address_line_1: '12 Sandbox Sale Street',
        formatted_address: '12 Sandbox Sale Street, Garsfontein, Pretoria, Gauteng',
        asking_price: 2500000,
        bedrooms: 3,
        bathrooms: 2,
        erf_size_sqm: 500,
        floor_size_sqm: 180,
        rates_amount: 1200,
        levy_amount: 0,
      },
      publication: {
        listing_id: saleId,
        status: 'Ready',
        title: 'Private Property Sandbox Sale Listing',
        description: 'Controlled Arch9 sale test listing for Private Property sandbox validation.',
        listing_type: 'Sale',
        property_type: 'House',
        asking_price: 2500000,
        bedrooms: 3,
        bathrooms: 2,
        garages: 1,
        erf_size: 500,
        floor_size: 180,
        rates_taxes: 1200,
        levies: 0,
        suburb: 'Garsfontein',
        province: 'Gauteng',
        address: '12 Sandbox Sale Street, Garsfontein, Pretoria, Gauteng',
        features: ['Garden', 'Pet friendly', 'Security'],
        amenities: ['Schools', 'Shopping centres', 'Main roads'],
      },
    },
    {
      kind: 'rental',
      listing: {
        ...common,
        id: rentalId,
        listing_reference: 'PP-SANDBOX-RENTAL-001',
        title: 'Private Property Sandbox Rental Listing',
        description: 'Controlled Arch9 rental test listing for Private Property sandbox validation.',
        property_type: 'Apartment',
        listing_category: 'rental',
        mandate_type: 'Rental',
        street_address: '18 Sandbox Rental Avenue',
        address_line_1: '18 Sandbox Rental Avenue',
        formatted_address: '18 Sandbox Rental Avenue, Garsfontein, Pretoria, Gauteng',
        asking_price: 18500,
        bedrooms: 2,
        bathrooms: 2,
        erf_size_sqm: null,
        floor_size_sqm: 92,
        rates_amount: 0,
        levy_amount: 0,
        seller_canonical_facts_json: {
          rentalInfo: {
            monthlyRent: 18500,
            depositAmount: 18500,
            availableFrom: '2026-09-01',
            leasePeriodMonths: 12,
            furnishedStatus: 'Unfurnished',
            petsPolicy: 'On application',
            utilitiesPolicy: 'Prepaid electricity, water billed monthly',
            marketingApprovalStatus: 'ready',
            mandateStatus: 'signed',
          },
        },
      },
      publication: {
        listing_id: rentalId,
        status: 'Ready',
        title: 'Private Property Sandbox Rental Listing',
        description: 'Controlled Arch9 rental test listing for Private Property sandbox validation.',
        listing_type: 'Rental',
        property_type: 'Apartment',
        asking_price: 18500,
        bedrooms: 2,
        bathrooms: 2,
        garages: 1,
        erf_size: null,
        floor_size: 92,
        rates_taxes: 0,
        levies: 0,
        suburb: 'Garsfontein',
        province: 'Gauteng',
        address: '18 Sandbox Rental Avenue, Garsfontein, Pretoria, Gauteng',
        features: ['Fibre ready', 'Secure parking', 'Balcony'],
        amenities: ['Schools', 'Shopping centres', 'Public transport'],
      },
    },
  ]
}

function buildMediaRows(listingId, kind) {
  const urls = kind === 'sale'
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
        : 'Re-run with --apply to create or update these two test listings.',
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
