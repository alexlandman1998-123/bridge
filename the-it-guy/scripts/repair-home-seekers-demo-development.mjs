#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DEMO_DEVELOPMENT_ID = '44ec3b4a-3f0f-4434-963a-1dca276edb1c'
const DEMO_ORGANISATION_ID = '2958d402-368e-43c9-b728-0098e10505f1'

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function stableUuid(seed) {
  const hash = crypto.createHash('sha1').update(`home-seekers-demo-units:${seed}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hash.slice(18, 20)}-${hash.slice(20, 32)}`
}

const unitFixtures = [
  ['B9-AGY-2026-001', 'A-101', '116 Ridge Road', 'Under Offer', 3_125_000],
  ['B9-AGY-2026-002', 'A-102', 'Sea Point transfer', 'In Transfer', 4_850_000],
  ['B9-AGY-2026-003', 'A-103', 'Constantia family home', 'In Transfer', 8_950_000],
  ['B9-AGY-2026-004', 'A-104', 'Woodstock finance', 'Under Offer', 2_780_000],
  ['B9-AGY-2026-005', 'A-105', 'Claremont seller documents', 'Under Offer', 3_460_000],
  ['B9-AGY-2026-006', 'A-106', 'Durbanville close-out', 'Registered', 2_250_000],
].map(([reference, unitNumber, label, status, price]) => ({
  reference,
  id: stableUuid(reference),
  development_id: DEMO_DEVELOPMENT_ID,
  unit_number: unitNumber,
  unit_label: `${unitNumber} · ${label}`,
  phase: 'Demo portfolio',
  block: 'Home Seekers',
  unit_type: 'Residential',
  bedrooms: 3,
  bathrooms: 2,
  parking_count: 1,
  size_sqm: 120,
  price,
  list_price: price,
  current_price: price,
  status,
  vat_applicable: false,
  notes: `Home Seekers demo unit linked to ${reference}.`,
}))

const env = { ...readEnv('.env'), ...readEnv('.env.local'), ...process.env }
const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim()
const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase service credentials.')

const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const development = await client
  .from('developments')
  .select('id, organisation_id, name')
  .eq('id', DEMO_DEVELOPMENT_ID)
  .eq('organisation_id', DEMO_ORGANISATION_ID)
  .maybeSingle()
if (development.error) throw development.error
if (!development.data) throw new Error('Home Seekers demo development was not found in its expected workspace.')

const transactions = await client
  .from('transactions')
  .select('id, transaction_reference, unit_id, is_demo_data')
  .eq('development_id', DEMO_DEVELOPMENT_ID)
  .eq('organisation_id', DEMO_ORGANISATION_ID)
if (transactions.error) throw transactions.error

const transactionByReference = new Map((transactions.data || []).map((row) => [row.transaction_reference, row]))
for (const fixture of unitFixtures) {
  const transaction = transactionByReference.get(fixture.reference)
  if (!transaction?.id || transaction.is_demo_data !== true) {
    throw new Error(`Expected demo transaction ${fixture.reference} was not found.`)
  }
}

const unitWrite = await client.from('units').upsert(
  unitFixtures.map(({ reference, ...unit }) => unit),
  { onConflict: 'id' },
)
if (unitWrite.error) throw unitWrite.error

const updates = await Promise.all(unitFixtures.map(async (fixture) => {
  const transaction = transactionByReference.get(fixture.reference)
  const result = await client
    .from('transactions')
    .update({ unit_id: fixture.id })
    .eq('id', transaction.id)
    .eq('development_id', DEMO_DEVELOPMENT_ID)
    .eq('organisation_id', DEMO_ORGANISATION_ID)
    .eq('is_demo_data', true)
  if (result.error) throw result.error
  return fixture.reference
}))

console.log(JSON.stringify({
  development: development.data.name,
  unitsUpserted: unitFixtures.length,
  transactionsLinked: updates.length,
}, null, 2))
