#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  ensureHomeSeekersAgencyDemoWorkspace,
  HOME_SEEKERS_DEMO_DEVELOPMENT_ID,
  HOME_SEEKERS_DEMO_EMAIL,
  HOME_SEEKERS_DEMO_PASSWORD,
  HOME_SEEKERS_DEMO_SEED_KEY,
} from './agencyDemoBootstrap.mjs'

const args = new Set(process.argv.slice(2))
const argValue = (name, fallback = '') => {
  const prefix = `${name}=`
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const ENVIRONMENT = String(argValue('--environment', process.env.AGENCY_DEMO_ENVIRONMENT || 'staging')).trim()
const TARGET_EMAIL = String(process.env.AGENCY_DEMO_EMAIL || HOME_SEEKERS_DEMO_EMAIL).trim().toLowerCase()
const TARGET_PASSWORD = String(process.env.AGENCY_DEMO_PASSWORD || HOME_SEEKERS_DEMO_PASSWORD).trim()
const SEED_KEY = HOME_SEEKERS_DEMO_SEED_KEY
const UUID_NAMESPACE = 'bridge9-agency-demo-transactions-v1'
const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .replace(/\\n/g, '')
          .trim()
        return [line.slice(0, separator), value]
      }),
  )
}

const envFileByEnvironment = {
  production: '.env.production.local',
  prod: '.env.production.local',
  staging: '.env.staging.local',
  stage: '.env.staging.local',
}

const env = {
  ...parseEnvFile('.env'),
  ...(ENVIRONMENT === 'production' || ENVIRONMENT === 'prod' ? parseEnvFile('.env.property24.local') : {}),
  ...parseEnvFile(envFileByEnvironment[ENVIRONMENT] || '.env.staging.local'),
  ...process.env,
}

function envValue(...names) {
  for (const name of names) {
    const value = String(env[name] || '').trim()
    if (value) return value
  }
  return ''
}

const supabaseUrl = envValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY')
const projectRef = supabaseUrl.match(/^https:\/\/([^.]+)/)?.[1] || ''

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}
if (projectRef === PRODUCTION_PROJECT_REF && !args.has('--confirm-production')) {
  throw new Error('Refusing to seed production without --confirm-production.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

function stableUuid(seed) {
  const hash = crypto.createHash('sha1').update(`${UUID_NAMESPACE}:${seed}`).digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join('-')
}

const BASE_TIME = Date.parse('2026-08-21T10:00:00.000+02:00')

function isoDays(deltaDays, hour = 10) {
  const date = new Date(BASE_TIME)
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0))
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

function dateDays(deltaDays) {
  return isoDays(deltaDays).slice(0, 10)
}

function money(value) {
  return Number(value || 0)
}

function normalizeText(value) {
  return String(value || '').trim()
}

const scenarios = [
  {
    slug: 'ridge-road-otp-signed',
    reference: 'B9-AGY-2026-001',
    title: '116 Ridge Road signed OTP',
    listingHint: '116 Ridge Road',
    stage: 'OTP Signed',
    mainStage: 'OTP',
    subStage: 'Buyer and seller OTP signed; buyer onboarding underway',
    lifecycleState: 'active',
    operationalState: 'on_track',
    riskStatus: 'On Track',
    financeType: 'bond',
    financeStage: 'documents',
    financeStatus: 'active',
    financeNextAction: 'Collect buyer payslips and bank statements.',
    purchasePrice: 3125000,
    grossCommissionPercentage: 5,
    saleOffset: -8,
    expectedTransferOffset: 64,
    nextAction: 'Send buyer onboarding reminder and confirm bond originator consent.',
    buyer: ['Naledi', 'Khumalo', 'naledi.khumalo.demo@example.test', '+27 82 555 1011'],
    seller: ['Andre', 'van Rensburg', 'andre.vr.demo@example.test', '+27 72 555 2021'],
    bank: 'Nedbank',
    checklist: [
      ['otp_uploaded', 'Signed OTP uploaded', 'completed', 'required', -8],
      ['buyer_onboarding', 'Buyer onboarding pack completed', 'in_progress', 'required', 2],
      ['seller_fica', 'Seller FICA reviewed', 'pending', 'important', 5],
    ],
    events: [
      ['OfferAccepted', 'Offer accepted at asking price.', -8],
      ['BuyerOnboardingSent', 'Buyer onboarding link sent from agency workspace.', -6],
    ],
  },
  {
    slug: 'sea-point-transfer',
    reference: 'B9-AGY-2026-002',
    title: 'Sea Point transfer in progress',
    listingHint: '117 Ridge Road',
    stage: 'Transfer in Progress',
    mainStage: 'ATTY',
    subStage: 'Transfer attorney preparing guarantees and clearance requests',
    lifecycleState: 'active',
    operationalState: 'on_track',
    riskStatus: 'On Track',
    financeType: 'cash',
    purchasePrice: 4850000,
    grossCommissionPercentage: 4.5,
    saleOffset: -24,
    expectedTransferOffset: 39,
    nextAction: 'Check transfer attorney has received seller municipal account.',
    buyer: ['Mila', 'Botha', 'mila.botha.demo@example.test', '+27 83 555 1012'],
    seller: ['Priya', 'Naidoo', 'priya.naidoo.demo@example.test', '+27 71 555 2022'],
    property: ['Unit 803, The Palms, 11 Ocean View Drive', 'Sea Point', 'Cape Town', 'Western Cape', '8005'],
    checklist: [
      ['cash_pof', 'Proof of funds verified', 'completed', 'required', -18],
      ['transfer_attorney_instruction', 'Attorney instruction sent', 'completed', 'required', -16],
      ['rates_clearance', 'Rates clearance figures requested', 'in_progress', 'important', 4],
    ],
    events: [
      ['AttorneyInstructionSent', 'Transfer instruction sent to the appointed conveyancer.', -16],
      ['CashProofVerified', 'Proof of funds marked as verified.', -18],
    ],
  },
  {
    slug: 'constantia-lodged',
    reference: 'B9-AGY-2026-003',
    title: 'Constantia family home lodged',
    listingHint: '18 Constantia Road',
    stage: 'Transfer Lodged',
    mainStage: 'XFER',
    subStage: 'Transfer and bond lodged at deeds office',
    lifecycleState: 'active',
    operationalState: 'on_track',
    riskStatus: 'On Track',
    financeType: 'bond',
    financeStage: 'instruction_sent',
    financeStatus: 'completed',
    financeNextAction: 'Monitor deeds office progress.',
    purchasePrice: 8950000,
    grossCommissionPercentage: 4.25,
    saleOffset: -46,
    expectedTransferOffset: 18,
    lodgementOffset: -2,
    nextAction: 'Share lodged milestone update with buyer and seller.',
    buyer: ['Ethan', 'Jacobs', 'ethan.jacobs.demo@example.test', '+27 84 555 1013'],
    seller: ['Lara', 'Steyn', 'lara.steyn.demo@example.test', '+27 73 555 2023'],
    property: ['22 Silverhurst Avenue', 'Constantia', 'Cape Town', 'Western Cape', '7806'],
    bank: 'FNB',
    checklist: [
      ['guarantees_received', 'Guarantees received', 'completed', 'required', -9],
      ['lodgement_confirmed', 'Lodgement confirmed', 'completed', 'required', -2],
      ['registration_watch', 'Registration watch diarised', 'pending', 'important', 8],
    ],
    events: [
      ['GuaranteesReceived', 'Bond guarantees received and accepted.', -9],
      ['TransferLodged', 'Transfer lodged at deeds office.', -2],
    ],
  },
  {
    slug: 'woodstock-finance-pending',
    reference: 'B9-AGY-2026-004',
    title: 'Woodstock buyer finance pending',
    listingHint: '12 Woodstock Street',
    stage: 'Finance Pending',
    mainStage: 'FIN',
    subStage: 'Bond originator awaiting bank feedback',
    lifecycleState: 'active',
    operationalState: 'at_risk',
    waitingOnRole: 'bank',
    riskStatus: 'At Risk',
    financeType: 'bond',
    financeStage: 'bank_review',
    financeStatus: 'active',
    financeNextAction: 'Follow up with originator for first bank response.',
    purchasePrice: 2190000,
    grossCommissionPercentage: 5,
    saleOffset: -13,
    expectedTransferOffset: 72,
    nextAction: 'Call bond originator if no bank feedback by close of business.',
    buyer: ['Sibusiso', 'Maseko', 'sibusiso.maseko.demo@example.test', '+27 82 555 1014'],
    seller: ['Chloe', 'Adams', 'chloe.adams.demo@example.test', '+27 76 555 2024'],
    property: ['41 Albert Road', 'Woodstock', 'Cape Town', 'Western Cape', '7925'],
    bank: 'Standard Bank',
    checklist: [
      ['bond_application_submitted', 'Bond application submitted', 'completed', 'required', -10],
      ['bank_feedback', 'Bank feedback received', 'in_progress', 'required', 1],
      ['finance_clause', 'Finance clause tracked', 'pending', 'important', 7],
    ],
    events: [
      ['BondApplicationSubmitted', 'Bond application submitted to the originator panel.', -10],
      ['BankFeedbackPending', 'Bank feedback is still pending.', -1],
    ],
  },
  {
    slug: 'claremont-blocked-docs',
    reference: 'B9-AGY-2026-005',
    title: 'Claremont seller documents blocked',
    stage: 'Proceed to Attorneys',
    mainStage: 'ATTY',
    subStage: 'Seller compliance documents outstanding before attorney handover can complete',
    lifecycleState: 'active',
    operationalState: 'blocked',
    waitingOnRole: 'seller',
    riskStatus: 'Blocked',
    financeType: 'cash',
    purchasePrice: 3675000,
    grossCommissionPercentage: 4.75,
    saleOffset: -17,
    expectedTransferOffset: 69,
    nextAction: 'Escalate seller missing ID and rates account to principal.',
    buyer: ['Robyn', 'Williams', 'robyn.williams.demo@example.test', '+27 81 555 1015'],
    seller: ['Michael', 'Peters', 'michael.peters.demo@example.test', '+27 74 555 2025'],
    property: ['9 Grove Avenue', 'Claremont', 'Cape Town', 'Western Cape', '7708'],
    checklist: [
      ['seller_id', 'Seller ID document received', 'blocked', 'required', 0],
      ['rates_account', 'Seller rates account uploaded', 'blocked', 'required', 0],
      ['attorney_handover', 'Attorney handover completed', 'pending', 'required', 3],
    ],
    events: [
      ['SellerDocumentsRequested', 'Seller document request sent.', -14],
      ['TransactionBlocked', 'Seller documents are blocking attorney handover.', 0],
    ],
  },
  {
    slug: 'durbanville-registered',
    reference: 'B9-AGY-2026-006',
    title: 'Durbanville registered close-out',
    stage: 'Registered',
    mainStage: 'REG',
    subStage: 'Registration completed; commission close-out ready',
    lifecycleState: 'registered',
    operationalState: 'on_track',
    riskStatus: 'On Track',
    financeType: 'bond',
    financeStage: 'complete',
    financeStatus: 'completed',
    financeNextAction: 'Finance workflow complete.',
    purchasePrice: 2780000,
    grossCommissionPercentage: 5,
    saleOffset: -78,
    expectedTransferOffset: -2,
    registrationOffset: -4,
    isActive: false,
    nextAction: 'Prepare final commission close-out.',
    buyer: ['Aisha', 'Khan', 'aisha.khan.agency.demo@example.test', '+27 84 555 1016'],
    seller: ['Danie', 'Nel', 'danie.nel.demo@example.test', '+27 78 555 2026'],
    property: ['14 Palm Grove Estate', 'Durbanville', 'Cape Town', 'Western Cape', '7550'],
    bank: 'ABSA',
    checklist: [
      ['registration_confirmed', 'Registration confirmed', 'completed', 'required', -4],
      ['commission_ready', 'Commission close-out ready', 'completed', 'important', -2],
    ],
    events: [
      ['TransferRegistered', 'Transfer registered and parties notified.', -4],
      ['CommissionCloseoutReady', 'Commission close-out pack is ready.', -2],
    ],
  },
]

async function fetchDefinitions() {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) {
    throw new Error(`Could not fetch Supabase schema: ${response.status} ${await response.text()}`)
  }
  const spec = await response.json()
  return Object.fromEntries(
    Object.entries(spec.definitions || {}).map(([table, schema]) => [
      table,
      new Set(Object.keys(schema.properties || {})),
    ]),
  )
}

function filterRow(tableColumns, row) {
  if (!tableColumns) return row
  return Object.fromEntries(Object.entries(row).filter(([key]) => tableColumns.has(key)))
}

async function upsertRows(table, rows, definitions, options = {}) {
  const safeRows = rows.filter(Boolean).map((row) => filterRow(definitions[table], row))
  if (!safeRows.length) return 0
  const result = await supabase
    .from(table)
    .upsert(safeRows, {
      onConflict: options.onConflict || 'id',
      ignoreDuplicates: false,
    })
  if (result.error) {
    throw new Error(`${table} upsert failed: ${result.error.message}`)
  }
  return safeRows.length
}

async function fetchTargetContext(definitions = null) {
  return ensureHomeSeekersAgencyDemoWorkspace(supabase, {
    definitions,
    email: TARGET_EMAIL,
    password: TARGET_PASSWORD,
  })
}

function resolveAssignedUser(context, scenarioIndex) {
  const activeUsers = context.users.filter((user) => user.user_id)
  const agentUsers = activeUsers.filter((user) => ['agent', 'principal', 'branch_manager'].includes(normalizeText(user.workspace_role || user.role).toLowerCase()))
  return agentUsers[scenarioIndex % Math.max(agentUsers.length, 1)] || activeUsers[0] || context.membership
}

function resolveListing(context, scenario) {
  const hint = normalizeText(scenario.listingHint || scenario.title).toLowerCase()
  return context.listings.find((listing) => normalizeText(listing.title || listing.address_line_1).toLowerCase().includes(hint)) || null
}

function splitName(parts) {
  const [firstName, lastName, email, phone] = parts
  return { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), email, phone }
}

function stageToDates(scenario) {
  const registered = scenario.registrationOffset != null
  const lodged = scenario.lodgementOffset != null
  return {
    saleDate: dateDays(scenario.saleOffset),
    expectedTransferDate: dateDays(scenario.expectedTransferOffset),
    targetRegistrationDate: dateDays(scenario.expectedTransferOffset),
    registrationDate: registered ? dateDays(scenario.registrationOffset) : null,
    registeredAt: registered ? isoDays(scenario.registrationOffset, 12) : null,
    lodgedAt: lodged ? isoDays(scenario.lodgementOffset, 12) : null,
    lodgementDate: lodged ? dateDays(scenario.lodgementOffset) : null,
  }
}

function commissionAmounts(scenario) {
  const gross = Math.round((money(scenario.purchasePrice) * Number(scenario.grossCommissionPercentage || 0)) / 100)
  const agent = Math.round(gross * 0.6)
  return { gross, agent, agency: gross - agent }
}

function financeStatusForScenario(scenario) {
  if (scenario.financeType === 'cash') return 'funds_secured_confirmed'
  if (scenario.financeStage === 'bank_review') return 'bank_feedback_pending'
  if (scenario.financeStatus === 'completed') return 'ready_for_transfer'
  return 'bond_application_in_progress'
}

function buildRows(context) {
  const rows = {
    buyers: [],
    contacts: [],
    transactions: [],
    participants: [],
    checklist: [],
    events: [],
    financeWorkflows: [],
  }
  const orgId = context.organisation.id
  const principalUserId = context.profile.id

  scenarios.forEach((scenario, index) => {
    const transactionId = stableUuid(`transaction:${scenario.slug}`)
    const buyerId = stableUuid(`buyer:${scenario.slug}`)
    const buyerContactId = stableUuid(`contact:buyer:${scenario.slug}`)
    const sellerContactId = stableUuid(`contact:seller:${scenario.slug}`)
    const buyer = splitName(scenario.buyer)
    const seller = splitName(scenario.seller)
    const assigned = resolveAssignedUser(context, index)
    const assignedUserId = assigned?.user_id || principalUserId
    const assignedName = [assigned?.first_name, assigned?.last_name].filter(Boolean).join(' ') || context.profile.full_name || 'Demo Agent'
    const assignedEmail = assigned?.email || TARGET_EMAIL
    const listing = resolveListing(context, scenario)
    const property = scenario.property || [
      listing?.address_line_1 || scenario.title,
      listing?.suburb || '',
      listing?.city || '',
      listing?.province || '',
      listing?.postal_code || '',
    ]
    const dates = stageToDates(scenario)
    const commission = commissionAmounts(scenario)
    const isActive = scenario.isActive ?? scenario.stage !== 'Registered'
    const nowIso = isoDays(-index, 15)
    const createdAt = isoDays(-70 + index * 8, 9)

    rows.buyers.push({
      id: buyerId,
      organisation_id: orgId,
      name: buyer.fullName,
      email: buyer.email,
      phone: buyer.phone,
      age_group: '35-44',
      created_at: createdAt,
      updated_at: nowIso,
      is_demo_data: true,
      demo_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, accountEmail: TARGET_EMAIL },
    })

    rows.contacts.push(
      {
        contact_id: buyerContactId,
        organisation_id: orgId,
        assigned_agent_id: assignedUserId,
        first_name: buyer.firstName,
        last_name: buyer.lastName,
        email: buyer.email,
        phone: buyer.phone,
        contact_type: 'buyer',
        notes: `Demo buyer for ${scenario.reference}.`,
        created_at: createdAt,
        updated_at: nowIso,
        is_demo_data: true,
        demo_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, role: 'buyer' },
      },
      {
        contact_id: sellerContactId,
        organisation_id: orgId,
        assigned_agent_id: assignedUserId,
        first_name: seller.firstName,
        last_name: seller.lastName,
        email: seller.email,
        phone: seller.phone,
        contact_type: 'seller',
        notes: `Demo seller for ${scenario.reference}.`,
        created_at: createdAt,
        updated_at: nowIso,
        is_demo_data: true,
        demo_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, role: 'seller' },
      },
    )

    rows.transactions.push({
      id: transactionId,
      buyer_id: buyerId,
      buyer_contact_id: buyerContactId,
      seller_contact_id: sellerContactId,
      development_id: HOME_SEEKERS_DEMO_DEVELOPMENT_ID,
      listing_id: listing?.id || null,
      organisation_id: orgId,
      assigned_organisation_id: orgId,
      owner_user_id: assignedUserId,
      assigned_agent_id: assignedUserId,
      assigned_user_id: assignedUserId,
      created_by: principalUserId,
      assigned_branch_id: assigned?.branch_id || context.membership.branch_id || null,
      branch_id: assigned?.branch_id || context.membership.branch_id || null,
      assigned_at: createdAt,
      assignment_status: scenario.lifecycleState === 'registered' ? 'completed' : 'assigned',
      stage: scenario.stage,
      current_main_stage: scenario.mainStage,
      main_stage_key: null,
      current_sub_stage_summary: scenario.subStage,
      lifecycle_state: scenario.lifecycleState,
      operational_state: scenario.operationalState,
      waiting_on_role: scenario.waitingOnRole || null,
      risk_status: scenario.riskStatus,
      is_active: isActive,
      finance_type: scenario.financeType,
      finance_managed_by: scenario.financeType === 'cash' ? 'internal' : 'bond_originator',
      finance_status: financeStatusForScenario(scenario),
      bank: scenario.bank || null,
      attorney: 'Landman & Naidoo Conveyancing',
      bond_originator: scenario.financeType === 'cash' ? null : 'BetterBond Demo Desk',
      transaction_reference: scenario.reference,
      platform_reference: scenario.reference,
      transaction_type: 'resale',
      transaction_origin_role: 'agent',
      transaction_origin_source: 'agent',
      title: scenario.title,
      listing_title: listing?.title || scenario.title,
      property_title: listing?.title || property[0],
      property_address_line_1: property[0],
      property_address_line_2: '',
      suburb: property[1],
      city: property[2],
      province: property[3],
      postal_code: property[4],
      property_description: `${scenario.title} seeded for the agency demo workspace.`,
      property_type: listing?.property_type || 'residential',
      property_tenure: 'freehold',
      purchaser_type: 'individual',
      seller_type: 'individual',
      buyer_name: buyer.fullName,
      purchaser_name: buyer.fullName,
      client_name: buyer.fullName,
      seller_name: seller.fullName,
      seller_email: seller.email,
      seller_phone: seller.phone,
      assigned_agent: assignedName,
      assigned_agent_email: assignedEmail,
      purchase_price: money(scenario.purchasePrice),
      sales_price: money(scenario.purchasePrice),
      cash_amount: scenario.financeType === 'cash' ? money(scenario.purchasePrice) : Math.round(money(scenario.purchasePrice) * 0.1),
      bond_amount: scenario.financeType === 'cash' ? null : Math.round(money(scenario.purchasePrice) * 0.9),
      deposit_amount: Math.round(money(scenario.purchasePrice) * 0.1),
      gross_commission_percentage: Number(scenario.grossCommissionPercentage || 0),
      gross_commission_amount: commission.gross,
      agent_commission_amount: commission.agent,
      agency_commission_amount: commission.agency,
      agent_split_percentage_snapshot: 60,
      agency_split_percentage_snapshot: 40,
      next_action: scenario.nextAction,
      next_action_due_at: isoDays(index + 1, 9),
      comment: `Demo transaction seeded for ${context.organisation.name}.`,
      notes: `Seeded agency demo transaction: ${scenario.title}`,
      sale_date: dates.saleDate,
      agreement_date: dates.saleDate,
      accepted_at: isoDays(scenario.saleOffset, 14),
      offer_accepted_at: isoDays(scenario.saleOffset, 14),
      expected_transfer_date: dates.expectedTransferDate,
      target_registration_date: dates.targetRegistrationDate,
      expected_registration_date: dates.targetRegistrationDate,
      lodgement_date: dates.lodgementDate,
      lodged_at: dates.lodgedAt,
      registration_date: dates.registrationDate,
      registered_at: dates.registeredAt,
      completed_at: scenario.lifecycleState === 'registered' ? dates.registeredAt : null,
      registered_by_user_id: scenario.lifecycleState === 'registered' ? principalUserId : null,
      completed_by_user_id: scenario.lifecycleState === 'registered' ? principalUserId : null,
      last_meaningful_activity_at: isoDays(-index, 12),
      created_at: createdAt,
      updated_at: nowIso,
      is_demo_data: true,
      seller_onboarding_status: scenario.operationalState === 'blocked' ? 'blocked' : 'completed',
      onboarding_status: scenario.stage === 'OTP Signed' ? 'in_progress' : 'completed',
      documents_missing: scenario.operationalState === 'blocked',
      required_documents_missing: scenario.operationalState === 'blocked',
      missing_documents_count: scenario.operationalState === 'blocked' ? 2 : 0,
      uploaded_documents_count: scenario.operationalState === 'blocked' ? 3 : 5,
      total_required_documents: scenario.operationalState === 'blocked' ? 5 : 5,
      documents_complete: scenario.operationalState !== 'blocked',
      finance_documents_complete: scenario.financeType === 'cash' || ['instruction_sent', 'complete'].includes(scenario.financeStage),
      bank_feedback_pending: scenario.financeStage === 'bank_review',
      bank_feedback_status: scenario.financeStage === 'bank_review' ? 'pending' : null,
      demo_metadata: {
        seedKey: SEED_KEY,
        scenario: scenario.slug,
        accountEmail: TARGET_EMAIL,
        showcase: true,
      },
    })

    rows.participants.push(
      participantRow(transactionId, 'agent', assignedName, assignedEmail, null, assignedUserId, orgId, context.organisation.name, index, 'agent'),
      participantRow(transactionId, 'buyer', buyer.fullName, buyer.email, buyer.phone, null, orgId, context.organisation.name, index, 'buyer', buyerId),
      participantRow(transactionId, 'seller', seller.fullName, seller.email, seller.phone, null, orgId, context.organisation.name, index, 'seller'),
    )

    scenario.checklist.forEach(([key, label, status, priority, dueOffset], itemIndex) => {
      rows.checklist.push({
        id: stableUuid(`checklist:${scenario.slug}:${key}`),
        transaction_id: transactionId,
        stage: scenario.mainStage,
        label,
        description: `${label} for ${scenario.reference}.`,
        status,
        priority,
        owner_role: status === 'blocked' ? 'seller' : 'agent',
        owner_user_id: assignedUserId,
        is_auto_managed: false,
        completed_by: status === 'completed' ? assignedUserId : null,
        completed_at: status === 'completed' ? isoDays(dueOffset, 13) : null,
        sort_order: itemIndex + 1,
        due_date: dateDays(dueOffset),
        created_at: createdAt,
        updated_at: nowIso,
      })
    })

    scenario.events.forEach(([eventType, message, dayOffset]) => {
      rows.events.push({
        id: stableUuid(`event:${scenario.slug}:${eventType}`),
        transaction_id: transactionId,
        event_type: eventType,
        event_data: { seedKey: SEED_KEY, scenario: scenario.slug, message },
        created_by: principalUserId,
        created_by_role: 'agent',
        visibility_scope: 'shared',
        is_demo_data: true,
        created_at: isoDays(dayOffset, 14),
        updated_at: nowIso,
      })
    })

    if (scenario.financeType !== 'cash') {
      rows.financeWorkflows.push({
        id: stableUuid(`finance:${scenario.slug}`),
        transaction_id: transactionId,
        workflow_type: 'bond_hybrid',
        current_stage: scenario.financeStage || 'documents',
        status: scenario.financeStatus || 'active',
        finance_owner: 'bond_originator',
        blocker_status: scenario.operationalState === 'blocked' ? 'blocked' : null,
        next_action: scenario.financeNextAction || scenario.nextAction,
        last_updated_by: principalUserId,
        last_updated_at: nowIso,
        completed_at: scenario.financeStatus === 'completed' ? nowIso : null,
        created_at: createdAt,
        updated_at: nowIso,
      })
    }
  })

  return rows
}

function participantRow(transactionId, roleType, name, email, phone, userId, orgId, organisationName, index, seedRole, buyerId = null) {
  return {
    id: stableUuid(`participant:${transactionId}:${roleType}:${seedRole}`),
    transaction_id: transactionId,
    role_type: roleType,
    participant_name: name,
    participant_email: email,
    participant_phone: phone,
    user_id: userId,
    can_view: true,
    can_comment: roleType === 'agent',
    can_upload_documents: roleType !== 'seller',
    can_edit_finance_workflow: roleType === 'agent',
    can_edit_attorney_workflow: roleType === 'agent',
    can_edit_core_transaction: roleType === 'agent',
    participant_scope: 'transaction',
    assignment_source: 'transaction_direct',
    is_primary: roleType === 'agent' || roleType === 'buyer',
    organisation_name: roleType === 'agent' ? organisationName : null,
    visibility_scope: roleType === 'agent' ? 'internal' : 'shared',
    is_demo_data: true,
    transaction_role: roleType,
    legal_role: 'none',
    status: 'active',
    is_internal: roleType === 'agent',
    assigned_organisation_id: roleType === 'agent' ? orgId : null,
    assigned_user_id: roleType === 'agent' ? userId : null,
    scope_level: roleType === 'agent' ? 'organisation' : null,
    scope_metadata: { seedKey: SEED_KEY, role: seedRole },
    buyer_party_id: buyerId,
    buyer_party_role: buyerId ? 'primary_buyer' : 'additional_buyer',
    buyer_party_position: buyerId ? 1 : 0,
    is_primary_buyer: Boolean(buyerId),
    buyer_profile_status: buyerId ? 'completed' : 'draft',
    buyer_onboarding_status: buyerId ? (index === 0 ? 'in_progress' : 'completed') : 'not_started',
    buyer_manual_capture_status: buyerId ? 'completed' : 'not_started',
    buyer_portal_invite_status: buyerId ? 'sent' : 'not_sent',
    buyer_source: buyerId ? 'agency_demo_seed' : 'agent',
    buyer_metadata: { seedKey: SEED_KEY, role: seedRole },
    created_at: isoDays(-60 + index * 8, 10),
    updated_at: isoDays(-index, 15),
  }
}

async function main() {
  const definitions = await fetchDefinitions()
  const context = await fetchTargetContext(definitions)
  const rows = buildRows(context)

  const counts = {
    buyers: await upsertRows('buyers', rows.buyers, definitions),
    contacts: await upsertRows('contacts', rows.contacts, definitions, { onConflict: 'contact_id' }),
    transactions: await upsertRows('transactions', rows.transactions, definitions),
    participants: await upsertRows('transaction_participants', rows.participants, definitions),
    checklist: await upsertRows('transaction_checklist_items', rows.checklist, definitions),
    events: await upsertRows('transaction_events', rows.events, definitions),
    financeWorkflows: await upsertRows('transaction_finance_workflows', rows.financeWorkflows, definitions),
  }

  console.log(JSON.stringify({
    environment: ENVIRONMENT,
    projectRef,
    targetEmail: TARGET_EMAIL,
    organisation: context.organisation.name,
    seedKey: SEED_KEY,
    counts,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
