import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import xlsx from 'xlsx'

const DEFAULT_XLSX_PATH = '/Users/alexanderlandman/Downloads/Property Search.xlsx'
const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), '..', 'output', 'imports', 'produktive-realty-listing-import-report.json')
const DEFAULT_WORKSPACE_ID = 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a'
const DEFAULT_BRANCH_ID = '531f1439-62b3-4c76-a908-e6ec906d7fdf'
const IMPORT_RUN_ID = 'produktive-realty-listing-bulk-import-2026-07-23'
const SHEET_NAME = 'Property Search'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function normalizeUuid(value = '') {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text) ? text : null
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(/[^\d.-]+/g, ''))
  return Number.isFinite(number) ? number : null
}

function parseDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseArgs(argv) {
  const options = {
    apply: false,
    workbookPath: DEFAULT_XLSX_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    workspaceId: DEFAULT_WORKSPACE_ID,
    branchId: DEFAULT_BRANCH_ID,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = (prefix) => {
      if (arg.includes('=')) return arg.slice(prefix.length)
      index += 1
      return argv[index] || ''
    }

    if (arg === '--apply') {
      options.apply = true
    } else if (arg === '--dry-run') {
      options.apply = false
    } else if (arg === '--xlsx' || arg.startsWith('--xlsx=')) {
      options.workbookPath = path.resolve(process.cwd(), readValue('--xlsx='))
    } else if (arg === '--report' || arg.startsWith('--report=')) {
      options.reportPath = path.resolve(process.cwd(), readValue('--report='))
    } else if (arg === '--workspace-id' || arg.startsWith('--workspace-id=')) {
      options.workspaceId = normalizeText(readValue('--workspace-id='))
    } else if (arg === '--branch-id' || arg.startsWith('--branch-id=')) {
      options.branchId = normalizeText(readValue('--branch-id='))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function requireConfig() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  return { supabaseUrl, serviceRoleKey }
}

function createServiceClient() {
  const { supabaseUrl, serviceRoleKey } = requireConfig()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function readWorkbookRows(workbookPath) {
  const workbook = xlsx.readFile(workbookPath, { cellDates: true })
  const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error(`No sheets found in ${workbookPath}`)

  const rows = xlsx.utils.sheet_to_json(sheet, {
    range: 2,
    defval: '',
    raw: false,
  })

  return rows
    .map((row, index) => ({
      rowNumber: index + 4,
      flagged: normalizeText(row.Flagged),
      propertyId: normalizeText(row['Property ID']),
      property24Reference: normalizeText(row['P24 Listing #']),
      branch: normalizeText(row.Branch),
      listPrice: normalizeNumber(row['List Price']),
      streetAddress: normalizeText(row['Street Address']).replace(/\s*\n\s*/g, ', '),
      ownerName: normalizeText(row['Owner Name']),
      listingAgentsRaw: normalizeText(row['Listing Agents']),
      dateUpdated: parseDate(row['Date Updated']),
      sourceStatus: normalizeText(row.Status),
      otherListings: normalizeText(row['Other Listings']),
    }))
    .filter((row) => row.propertyId || row.streetAddress || row.listingAgentsRaw)
}

function splitAgents(value = '') {
  return normalizeText(value)
    .split(';')
    .map((agent) => normalizeText(agent))
    .filter(Boolean)
}

function parseOtherListings(value = '') {
  const text = normalizeText(value)
  const refs = {}
  for (const match of text.matchAll(/\(([^)]+)\)\s*([^,\n]+)/g)) {
    const platform = normalizeKey(match[1])
    const reference = normalizeText(match[2])
    if (!reference) continue
    if (platform.includes('property24')) refs.property24Reference = refs.property24Reference || reference
    if (platform.includes('private property')) refs.privatePropertyReference = reference
    if (platform.includes('produktive')) refs.produktiveFeedReference = reference
  }
  return refs
}

function listingStatusFromSource(status = '') {
  const key = normalizeKey(status)
  if (key.includes('sold')) return 'sold'
  if (key.includes('withdraw')) return 'withdrawn'
  if (key.includes('offer')) return 'under_offer'
  if (key.includes('market') || key.includes('active')) return 'active'
  return 'active'
}

function buildMemberDirectory(members = []) {
  const directory = new Map()
  const collisions = new Map()
  for (const member of members) {
    const fullName = [member.first_name, member.last_name].map(normalizeText).filter(Boolean).join(' ')
    const keys = [
      fullName,
      member.email,
      member.profile_full_name,
      [member.profile_first_name, member.profile_last_name].map(normalizeText).filter(Boolean).join(' '),
    ].map(normalizeKey).filter(Boolean)

    for (const key of new Set(keys)) {
      if (directory.has(key) && directory.get(key).user_id !== member.user_id) {
        collisions.set(key, [directory.get(key), member])
      } else {
        directory.set(key, member)
      }
    }
  }
  return { directory, collisions }
}

async function fetchMembers(client, workspaceId) {
  const membersResult = await client
    .from('organisation_users')
    .select('id,user_id,email,first_name,last_name,role,status,membership_status,branch_id,primary_branch_id')
    .eq('organisation_id', workspaceId)
    .not('user_id', 'is', null)

  if (membersResult.error) throw new Error(`Membership lookup failed: ${membersResult.error.message}`)
  const members = membersResult.data || []
  const profileIds = [...new Set(members.map((member) => member.user_id).filter(Boolean))]
  const profilesResult = profileIds.length
    ? await client.from('profiles').select('id,email,full_name,first_name,last_name').in('id', profileIds)
    : { data: [], error: null }
  if (profilesResult.error) throw new Error(`Profile lookup failed: ${profilesResult.error.message}`)
  const profileById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]))

  return members
    .map((member) => {
      const profile = profileById.get(member.user_id) || {}
      return {
        ...member,
        profile_email: profile.email || null,
        profile_full_name: profile.full_name || null,
        profile_first_name: profile.first_name || null,
        profile_last_name: profile.last_name || null,
      }
    })
    .filter((member) => ['active', 'accepted'].includes(normalizeKey(member.status || member.membership_status)))
}

async function fetchExistingListings(client, workspaceId, references) {
  if (!references.length) return new Map()
  const result = await client
    .from('private_listings')
    .select('id,listing_reference,property24_reference,private_property_reference,title,address_line_1,assigned_agent_id')
    .eq('organisation_id', workspaceId)
    .in('listing_reference', references)
  if (result.error) throw new Error(`Existing listing lookup failed: ${result.error.message}`)
  return new Map((result.data || []).map((row) => [normalizeText(row.listing_reference), row]))
}

function buildListingPayload(row, context) {
  const agentNames = splitAgents(row.listingAgentsRaw)
  const primaryAgentName = agentNames[0] || ''
  const primaryAgent = context.memberDirectory.get(normalizeKey(primaryAgentName))
  const refs = parseOtherListings(row.otherListings)
  const property24Reference = row.property24Reference || refs.property24Reference || null
  const listingReference = refs.produktiveFeedReference || `WP-${row.propertyId}`
  const listingStatus = listingStatusFromSource(row.sourceStatus)
  const active = listingStatus === 'active'
  const notes = [
    `Imported from Property Search.xlsx via ${IMPORT_RUN_ID}.`,
    `Source Property ID: ${row.propertyId}.`,
    row.ownerName ? `Owner Name: ${row.ownerName}.` : '',
    row.listingAgentsRaw ? `Listing Agents: ${row.listingAgentsRaw}.` : '',
    row.otherListings ? `Other Listings: ${row.otherListings}.` : '',
    row.dateUpdated ? `Source Updated At: ${row.dateUpdated}.` : '',
  ].filter(Boolean).join('\n')

  return {
    payload: {
      organisation_id: context.workspaceId,
      branch_id: context.branchId,
      assigned_agent_id: primaryAgent?.user_id || null,
      listing_reference: listingReference,
      listing_status: listingStatus,
      listing_visibility: active ? 'active_market' : 'internal',
      property_category: 'residential',
      listing_source: 'imported_stock',
      stock_source: 'property_search_import',
      property_structure_type: 'other',
      property_type: null,
      listing_category: 'private_sale',
      title: row.streetAddress || listingReference,
      description: null,
      asking_price: row.listPrice,
      estimated_value: row.listPrice,
      address_line_1: row.streetAddress || null,
      formatted_address: row.streetAddress || null,
      street_address: row.streetAddress || null,
      country: 'South Africa',
      mandate_type: 'sole',
      mandate_status: 'not_started',
      seller_onboarding_status: 'not_started',
      is_active: active,
      created_by: primaryAgent?.user_id || null,
      property24_reference: property24Reference,
      property24_status: property24Reference ? 'published' : 'not_published',
      private_property_reference: refs.privatePropertyReference || null,
      private_property_status: refs.privatePropertyReference ? 'published' : 'not_published',
      bridge_listing_status: 'not_published',
      internal_listing_notes: notes,
      seller_canonical_facts_json: {
        source: IMPORT_RUN_ID,
        sellerName: row.ownerName || null,
        property: {
          sourcePropertyId: row.propertyId,
          sourceBranch: row.branch,
          sourceStatus: row.sourceStatus,
          streetAddress: row.streetAddress,
          listPrice: row.listPrice,
          property24Reference,
          privatePropertyReference: refs.privatePropertyReference || null,
          produktiveFeedReference: refs.produktiveFeedReference || null,
        },
        listingAgents: agentNames,
      },
      seller_canonical_fact_readiness_json: {
        imported: true,
        seller_contact_missing: true,
        property_detail_minimal: true,
        primary_agent_resolved: Boolean(primaryAgent?.user_id),
      },
      seller_canonical_facts_updated_at: new Date().toISOString(),
    },
    listingReference,
    property24Reference,
    primaryAgentName,
    primaryAgent,
    agentNames,
  }
}

function pickColumns(columns, payload) {
  if (!columns?.size) return payload
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)))
}

async function getTableColumns(client, table) {
  const result = await client.from(table).select('*').limit(1)
  if (result.error) throw new Error(`${table} column inspection failed: ${result.error.message}`)
  if (!result.data?.[0]) return null
  return new Set(Object.keys(result.data[0]))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const rows = readWorkbookRows(options.workbookPath)
  const invalidRows = rows.filter((row) => !row.propertyId || !row.streetAddress || !row.listingAgentsRaw || row.listPrice === null)
  if (invalidRows.length) {
    throw new Error(`Workbook has ${invalidRows.length} invalid rows missing Property ID, Street Address, Listing Agents, or List Price.`)
  }

  const references = rows.map((row) => parseOtherListings(row.otherListings).produktiveFeedReference || `WP-${row.propertyId}`)
  const duplicateReferences = references.filter((reference, index) => references.indexOf(reference) !== index)
  if (duplicateReferences.length) {
    throw new Error(`Workbook would create duplicate listing references: ${[...new Set(duplicateReferences)].join(', ')}`)
  }

  const client = createServiceClient()
  const [workspaceResult, branchResult, members, listingColumns, existingByReference] = await Promise.all([
    client.from('organisations').select('id,name,display_name').eq('id', options.workspaceId).maybeSingle(),
    client.from('organisation_branches').select('id,name').eq('id', options.branchId).eq('organisation_id', options.workspaceId).maybeSingle(),
    fetchMembers(client, options.workspaceId),
    getTableColumns(client, 'private_listings'),
    fetchExistingListings(client, options.workspaceId, references),
  ])

  if (workspaceResult.error || !workspaceResult.data?.id) {
    throw new Error(`Workspace lookup failed: ${workspaceResult.error?.message || options.workspaceId}`)
  }
  if (branchResult.error || !branchResult.data?.id) {
    throw new Error(`Branch lookup failed: ${branchResult.error?.message || options.branchId}`)
  }

  const { directory, collisions } = buildMemberDirectory(members)
  if (collisions.size) {
    throw new Error(`Ambiguous agent names in member directory: ${[...collisions.keys()].join(', ')}`)
  }

  const context = {
    workspaceId: workspaceResult.data.id,
    branchId: branchResult.data.id,
    memberDirectory: directory,
  }
  const results = []
  for (const row of rows) {
    const built = buildListingPayload(row, context)
    const existing = existingByReference.get(built.listingReference) || null
    const unresolvedAgents = built.agentNames.filter((agent) => !directory.has(normalizeKey(agent)))
    const result = {
      rowNumber: row.rowNumber,
      propertyId: row.propertyId,
      listingReference: built.listingReference,
      property24Reference: built.property24Reference,
      address: row.streetAddress,
      sourceStatus: row.sourceStatus,
      primaryAgentName: built.primaryAgentName,
      primaryAgentId: built.primaryAgent?.user_id || null,
      allAgents: built.agentNames,
      unresolvedAgents,
      action: existing ? 'would_update_listing' : 'would_create_listing',
      listingId: existing?.id || null,
      ok: unresolvedAgents.length === 0,
    }

    try {
      if (!result.ok) {
        results.push(result)
        continue
      }

      if (options.apply) {
        const payload = pickColumns(listingColumns, built.payload)
        const query = existing
          ? await client.from('private_listings').update(payload).eq('id', existing.id).select('id').maybeSingle()
          : await client.from('private_listings').insert(payload).select('id').maybeSingle()
        if (query.error) throw query.error
        result.action = existing ? 'updated_listing' : 'created_listing'
        result.listingId = query.data?.id || existing?.id || null
      }
      result.ok = true
    } catch (error) {
      result.ok = false
      result.error = error.message || String(error)
    }
    results.push(result)
  }

  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    importRunId: IMPORT_RUN_ID,
    workbookPath: options.workbookPath,
    workspace: workspaceResult.data,
    branch: branchResult.data,
    rows: rows.length,
    ok: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    wouldCreate: results.filter((row) => row.action === 'would_create_listing').length,
    wouldUpdate: results.filter((row) => row.action === 'would_update_listing').length,
    created: results.filter((row) => row.action === 'created_listing').length,
    updated: results.filter((row) => row.action === 'updated_listing').length,
    multiAgentRows: results.filter((row) => row.allAgents.length > 1).length,
    unresolvedAgents: [...new Set(results.flatMap((row) => row.unresolvedAgents || []))],
    duplicateProperty24References: rows
      .map((row) => row.property24Reference)
      .filter((reference, index, all) => reference && all.indexOf(reference) !== index)
      .filter((reference, index, all) => all.indexOf(reference) === index),
    results,
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true })
  fs.writeFileSync(options.reportPath, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(JSON.stringify({
    reportPath: options.reportPath,
    mode: summary.mode,
    rows: summary.rows,
    ok: summary.ok,
    failed: summary.failed,
    wouldCreate: summary.wouldCreate,
    wouldUpdate: summary.wouldUpdate,
    created: summary.created,
    updated: summary.updated,
    multiAgentRows: summary.multiAgentRows,
    unresolvedAgents: summary.unresolvedAgents,
    duplicateProperty24References: summary.duplicateProperty24References,
  }, null, 2))
  if (summary.failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
