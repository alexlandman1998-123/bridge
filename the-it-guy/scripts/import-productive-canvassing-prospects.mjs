import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const DEFAULT_WORKBOOK_PATH = '/Users/alexanderlandman/Desktop/Area Agent Leads.xlsx'
const PRODUCTIVE_ORGANISATION_ID = 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a'
const IMPORT_SOURCE = 'Property24'
const IMPORT_NOTE_PREFIX = 'Property24 Listing Number:'

function readEnv(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value.replace(/\\n/g, '')
  }
  return env
}

function text(value) {
  return String(value ?? '').trim()
}

function rowValue(row = {}, names = []) {
  const requested = new Set(names.map((name) => text(name).toLowerCase()))
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = text(key).replace(/_1$/, '.1').toLowerCase()
    if (requested.has(normalizedKey)) return value
  }
  return ''
}

function lower(value) {
  return text(value).toLowerCase()
}

function cleanNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = text(value).replace(/[^\d.-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function excelDateText(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  return text(value)
}

function normalizeListingNumber(row) {
  return text(rowValue(row, ['Listing Number', 'Listing Number.1'])).replace(/\.0$/, '')
}

function normalizeAgentName(row) {
  return text(rowValue(row, ['Agent']))
}

function buildNote(row) {
  const listingNumber = normalizeListingNumber(row)
  const lines = [
    listingNumber ? `${IMPORT_NOTE_PREFIX} ${listingNumber}` : '',
    text(rowValue(row, ['web-scraper-start-url'])) ? `Property24 URL: ${text(rowValue(row, ['web-scraper-start-url']))}` : '',
    cleanNumber(rowValue(row, ['ListingPice'])) ? `Listing price: ${cleanNumber(rowValue(row, ['ListingPice']))}` : '',
    excelDateText(rowValue(row, ['Listing Date'])) ? `Listing date: ${excelDateText(rowValue(row, ['Listing Date']))}` : '',
    text(rowValue(row, ['Monthly Repayment'])) ? `Monthly repayment: ${text(rowValue(row, ['Monthly Repayment']))}` : '',
    text(rowValue(row, ['Total Once-off Costs'])) ? `Total once-off costs: ${text(rowValue(row, ['Total Once-off Costs']))}` : '',
    text(rowValue(row, ['Min Gross Monthly Income'])) ? `Min gross monthly income: ${text(rowValue(row, ['Min Gross Monthly Income']))}` : '',
    text(rowValue(row, ['Notes'])) ? `Scrape notes: ${text(rowValue(row, ['Notes']))}` : '',
    text(rowValue(row, ['Main Picture-src'])) ? `Image: ${text(rowValue(row, ['Main Picture-src']))}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

function getFullName(user = {}) {
  return text(user.full_name) || [user.first_name, user.last_name].map(text).filter(Boolean).join(' ') || text(user.email) || 'Agent'
}

function buildProspectRow(sourceRow, { organisationId, assignedAgent, createdBy }) {
  const address = text(rowValue(sourceRow, ['Address']))
  const suburb = text(rowValue(sourceRow, ['Suburb']))
  const price = cleanNumber(rowValue(sourceRow, ['ListingPice']))
  const bedrooms = text(rowValue(sourceRow, ['Total Bedrooms'])).replace(/\.0$/, '')
  return {
    organisation_id: organisationId,
    assigned_agent_id: assignedAgent?.user_id || null,
    assigned_user_id: assignedAgent?.user_id || null,
    branch_id: assignedAgent?.branch_id || null,
    assigned_agent_name: assignedAgent ? getFullName(assignedAgent) : normalizeAgentName(sourceRow),
    assigned_agent_email: lower(rowValue(sourceRow, ['Email'])),
    first_name: 'Prospect',
    last_name: null,
    phone: null,
    email: null,
    prospect_type: 'Seller Prospect',
    area: suburb || text(sourceRow.City) || null,
    area_suburb: suburb || null,
    street_address: address || null,
    formatted_address: address || null,
    city: text(rowValue(sourceRow, ['City'])) || null,
    province: text(rowValue(sourceRow, ['Province'])) || null,
    country: 'South Africa',
    property_type: text(rowValue(sourceRow, ['Type of Property', 'Type of Property.1'])) || null,
    source: IMPORT_SOURCE,
    canvassing_method: IMPORT_SOURCE,
    status: 'New',
    follow_up_priority: 'Medium',
    estimated_value: price || null,
    estimated_property_value: price ? String(price) : null,
    selling_intent: 'Listed on Property24',
    notes: buildNote(sourceRow),
    bedrooms: bedrooms || null,
    created_by: createdBy || null,
  }
}

async function fetchAll(supabase, table, select, apply) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).order('id', { ascending: true }).range(from, from + pageSize - 1)
    query = apply(query)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

function readListingNumberFromNotes(notes = '') {
  const match = text(notes).match(/Property24 Listing Number:\s*([^\n]+)/i)
  return match ? match[1].trim() : ''
}

async function insertChunks(supabase, table, rows, chunkSize = 500, selectColumns = 'id') {
  let inserted = 0
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { data, error } = await supabase.from(table).insert(chunk).select(selectColumns)
    if (error) throw error
    inserted += data?.length || 0
    process.stdout.write(`Inserted ${inserted}/${rows.length} ${table}\r`)
    if (table === 'canvassing_prospects') {
      rows.insertedProspects = [...(rows.insertedProspects || []), ...(data || [])]
    }
  }
  process.stdout.write('\n')
}

async function upsertChunks(supabase, table, rows, chunkSize = 500) {
  let updated = 0
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { data, error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: 'id' })
      .select('id')
    if (error) throw error
    updated += data?.length || 0
    process.stdout.write(`Updated ${updated}/${rows.length} ${table}\r`)
  }
  process.stdout.write('\n')
  return updated
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = !args.has('--commit')
  const workbookPathArg = process.argv.find((arg) => arg.startsWith('--workbook='))
  const workbookPath = workbookPathArg ? workbookPathArg.split('=').slice(1).join('=') : DEFAULT_WORKBOOK_PATH
  if (!fs.existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`)

  const env = {
    ...readEnv(path.resolve('the-it-guy/.env')),
    ...readEnv(path.resolve('the-it-guy/.env.production.local')),
    ...process.env,
  }
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase URL or service-role key.')
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const workbook = XLSX.readFile(workbookPath, { cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
  const dataRows = rows.filter((row) => normalizeListingNumber(row) || text(row.Address) || text(row.Suburb))

  const usersResult = await supabase
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, first_name, last_name, email, role, workspace_role, organisation_role, status')
    .eq('organisation_id', PRODUCTIVE_ORGANISATION_ID)
    .eq('status', 'active')
  if (usersResult.error) throw usersResult.error
  const users = usersResult.data || []
  const userByEmail = new Map(users.map((user) => [lower(user.email), user]))
  const principalUsers = users.filter((user) => [user.role, user.workspace_role, user.organisation_role].some((role) => lower(role) === 'principal'))
  const createdBy = principalUsers.find((user) => lower(user.email).includes('alex'))?.user_id || principalUsers[0]?.user_id || users[0]?.user_id || null

  const existingProspects = await fetchAll(
    supabase,
    'canvassing_prospects',
    'id, notes',
    (query) => query.eq('organisation_id', PRODUCTIVE_ORGANISATION_ID),
  )
  const existingListingNumbers = new Set()
  for (const prospect of existingProspects) {
    const match = text(prospect.notes).match(/Property24 Listing Number:\s*([^\n]+)/i)
    if (match) existingListingNumbers.add(match[1].trim())
  }

  const seenListingNumbers = new Set()
  const prospects = []
  const skippedDuplicates = []
  const unmatchedAgentEmails = new Map()
  for (const row of dataRows) {
    const listingNumber = normalizeListingNumber(row)
    if (listingNumber && (existingListingNumbers.has(listingNumber) || seenListingNumbers.has(listingNumber))) {
      skippedDuplicates.push(listingNumber)
      continue
    }
    if (listingNumber) seenListingNumbers.add(listingNumber)
    const assignedAgentEmail = lower(rowValue(row, ['Email']))
    const assignedAgent = userByEmail.get(assignedAgentEmail) || null
    if (!assignedAgent && assignedAgentEmail) {
      unmatchedAgentEmails.set(assignedAgentEmail, (unmatchedAgentEmails.get(assignedAgentEmail) || 0) + 1)
    }
    prospects.push(buildProspectRow(row, {
      organisationId: PRODUCTIVE_ORGANISATION_ID,
      assignedAgent,
      createdBy,
    }))
  }

  const byAgent = new Map()
  for (const prospect of prospects) {
    const key = prospect.assigned_agent_email || 'unassigned'
    byAgent.set(key, (byAgent.get(key) || 0) + 1)
  }

  console.log(JSON.stringify({
    dryRun,
    workbook: workbookPath,
    sheetName,
    sourceRows: rows.length,
    usableRows: dataRows.length,
    existingProspects: existingProspects.length,
    existingProperty24ListingNumbers: existingListingNumbers.size,
    skippedDuplicates: skippedDuplicates.length,
    prospectsToInsert: prospects.length,
    activeUsers: users.length,
    principals: principalUsers.map((user) => ({ email: user.email, name: getFullName(user), userId: user.user_id })),
    matchedAssignedRows: prospects.filter((prospect) => prospect.assigned_agent_id).length,
    unmatchedAssignedRows: prospects.filter((prospect) => !prospect.assigned_agent_id).length,
    unmatchedAgentEmails: [...unmatchedAgentEmails.entries()].map(([email, count]) => ({ email, count })).sort((a, b) => b.count - a.count).slice(0, 20),
    topAgentRowCounts: [...byAgent.entries()].map(([email, count]) => ({ email, count })).sort((a, b) => b.count - a.count).slice(0, 20),
  }, null, 2))

  if (dryRun) return

  await insertChunks(supabase, 'canvassing_prospects', prospects, 500, 'id, notes')
  const insertedProspects = prospects.insertedProspects || []
  let activityProspects = insertedProspects.map((prospect, index) => ({
    ...prospects[index],
    id: prospect.id,
    notes: prospect.notes || prospects[index]?.notes || '',
  }))
  if (!activityProspects.length) {
    const allProductiveProspects = await fetchAll(
      supabase,
      'canvassing_prospects',
      'id, assigned_agent_id, assigned_agent_name, assigned_agent_email, area_suburb, notes',
      (query) => query.eq('organisation_id', PRODUCTIVE_ORGANISATION_ID),
    )
    const importActivities = await fetchAll(
      supabase,
      'canvassing_activities',
      'prospect_id, activity_type, activity_note',
      (query) => query.eq('organisation_id', PRODUCTIVE_ORGANISATION_ID).eq('activity_type', 'Prospect Created'),
    )
    const alreadyLoggedProspectIds = new Set(
      importActivities
        .filter((activity) => text(activity.activity_note) === 'Seller prospect imported from Area Agent Leads.xlsx')
        .map((activity) => text(activity.prospect_id))
        .filter(Boolean),
    )
    activityProspects = allProductiveProspects
      .filter((prospect) => readListingNumberFromNotes(prospect.notes))
      .filter((prospect) => !alreadyLoggedProspectIds.has(text(prospect.id)))
  }
  const activityRows = activityProspects.map((prospect) => ({
    organisation_id: PRODUCTIVE_ORGANISATION_ID,
    prospect_id: prospect.id,
    agent_id: prospect.assigned_agent_id || createdBy,
    agent_name: prospect.assigned_agent_name || null,
    activity_type: 'Prospect Created',
    activity_note: 'Seller prospect imported from Area Agent Leads.xlsx',
    outcome: 'New',
    metadata: {
      source: IMPORT_SOURCE,
      importWorkbook: path.basename(workbookPath),
      property24ListingNumber: readListingNumberFromNotes(prospect.notes),
      assignedAgentEmail: prospect.assigned_agent_email || '',
      areaSuburb: prospect.area_suburb || '',
    },
    created_by: createdBy,
  }))
  await insertChunks(supabase, 'canvassing_activities', activityRows)

  const workbookRowByListingNumber = new Map()
  for (const row of dataRows) {
    const listingNumber = normalizeListingNumber(row)
    if (!listingNumber || workbookRowByListingNumber.has(listingNumber)) continue
    workbookRowByListingNumber.set(listingNumber, row)
  }
  const importedProspectsForRepair = await fetchAll(
    supabase,
    'canvassing_prospects',
    'id, organisation_id, first_name, prospect_type, canvassing_method, status, follow_up_priority, notes',
    (query) => query.eq('organisation_id', PRODUCTIVE_ORGANISATION_ID),
  )
  const repairRows = importedProspectsForRepair
    .map((prospect) => {
      const listingNumber = readListingNumberFromNotes(prospect.notes)
      const workbookRow = workbookRowByListingNumber.get(listingNumber)
      if (!workbookRow) return null
      const price = cleanNumber(rowValue(workbookRow, ['ListingPice']))
      if (!price) return null
      return {
        id: prospect.id,
        organisation_id: prospect.organisation_id || PRODUCTIVE_ORGANISATION_ID,
        first_name: prospect.first_name || 'Prospect',
        prospect_type: prospect.prospect_type || 'Seller Prospect',
        canvassing_method: prospect.canvassing_method || IMPORT_SOURCE,
        status: prospect.status || 'New',
        follow_up_priority: prospect.follow_up_priority || 'Medium',
        estimated_value: price,
        estimated_property_value: String(price),
        notes: buildNote(workbookRow),
      }
    })
    .filter(Boolean)
  const repairedProspects = repairRows.length
    ? await upsertChunks(supabase, 'canvassing_prospects', repairRows)
    : 0

  const verify = await supabase
    .from('canvassing_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', PRODUCTIVE_ORGANISATION_ID)
    .eq('source', IMPORT_SOURCE)
  if (verify.error) throw verify.error
  console.log(JSON.stringify({
    committed: true,
    insertedProspects: insertedProspects.length,
    insertedActivities: activityRows.length,
    repairedProspects,
    productiveProperty24ProspectCount: verify.count,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
