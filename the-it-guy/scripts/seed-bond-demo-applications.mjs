#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const TARGET_EMAIL = String(process.env.BOND_DEMO_EMAIL || 'bond.demo@bridgenine.co.za').trim().toLowerCase()
const SEED_KEY = 'bond-demo-application-layout-v1'
const UUID_NAMESPACE = 'bridge9-bond-demo-application-layout-v1'

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

const env = {
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.staging.local'),
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

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
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

const baseDate = Date.parse('2026-07-28T10:00:00.000+02:00')

function isoDays(deltaDays, hour = 10) {
  const date = new Date(baseDate)
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

function canonicalTransactionStage(scenario = {}) {
  if (scenario.registered) return 'Registered'
  if (scenario.workflowStage === 'instruction_sent') return 'Proceed to Attorneys'
  if (['bond_approved', 'grant_received', 'grant_signed', 'grant_submitted'].includes(scenario.workflowStage)) {
    return 'Bond Approved / Proof of Funds'
  }
  return 'Finance Pending'
}

function canonicalRiskStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized.includes('blocked')) return 'Blocked'
  if (normalized.includes('risk')) return 'At Risk'
  if (normalized.includes('medium') || normalized.includes('delayed')) return 'Delayed'
  return 'On Track'
}

const scenarios = [
  {
    slug: 'new-intake-fourways',
    buyer: ['Mpho Dlamini', 'mpho.dlamini.demo@example.com', '0825550101'],
    property: ['The Halyard, Unit A104', 'Fourways', 'Gauteng'],
    partner: 'Samlin Residential',
    stage: 'New bond application',
    mainStage: 'FIN',
    financeStatus: 'intake',
    workflowStage: 'intake',
    nextAction: 'Call buyer to confirm consent and affordability profile.',
    risk: 'On Track',
    purchase: 1840000,
    deposit: 92000,
    docs: [1, 7],
    bank: 'Bond Originator Intake',
    banks: [],
    createdOffset: -2,
  },
  {
    slug: 'awaiting-docs-rosebank',
    buyer: ['Candice Naidoo', 'candice.naidoo.demo@example.com', '0825550102'],
    property: ['Oxford Parks, Unit B210', 'Rosebank', 'Gauteng'],
    partner: 'Oxford Parks Sales',
    stage: 'Documents requested',
    mainStage: 'FIN',
    financeStatus: 'awaiting_documents',
    workflowStage: 'documents',
    nextAction: 'Outstanding bank statements and proof of residence.',
    risk: 'At Risk',
    purchase: 2650000,
    deposit: 175000,
    docs: [3, 9],
    bank: 'Bond Originator Intake',
    banks: [],
    createdOffset: -5,
  },
  {
    slug: 'docs-review-waterfall',
    buyer: ['Lerato Mokoena', 'lerato.mokoena.demo@example.com', '0825550103'],
    property: ['Waterfall Ridge, Unit C18', 'Midrand', 'Gauteng'],
    partner: 'Waterfall Ridge Developments',
    stage: 'Document review',
    mainStage: 'FIN',
    financeStatus: 'documents_received',
    workflowStage: 'documents',
    nextAction: 'Review uploaded payslip and latest statement.',
    risk: 'On Track',
    purchase: 3120000,
    deposit: 260000,
    docs: [7, 9],
    bank: 'Bond Originator Intake',
    banks: [],
    createdOffset: -7,
  },
  {
    slug: 'ready-submit-menlyn',
    buyer: ['Johan van der Merwe', 'johan.vdm.demo@example.com', '0825550104'],
    property: ['Menlyn Maine, Unit 608', 'Pretoria', 'Gauteng'],
    partner: 'Menlyn Maine',
    stage: 'Ready for bank submission',
    mainStage: 'FIN',
    financeStatus: 'ready_for_submission',
    workflowStage: 'submitted_to_banks',
    nextAction: 'Submit to selected lender panel.',
    risk: 'Low Risk',
    purchase: 2285000,
    deposit: 285000,
    docs: [9, 9],
    bank: 'FNB',
    banks: ['FNB', 'Nedbank'],
    createdOffset: -9,
  },
  {
    slug: 'submitted-sandton',
    buyer: ['Aisha Khan', 'aisha.khan.demo@example.com', '0825550105'],
    property: ['Sandton Gate, Unit 1203', 'Sandton', 'Gauteng'],
    partner: 'Sandton Gate',
    stage: 'Submitted to banks',
    mainStage: 'FIN',
    financeStatus: 'submitted_to_banks',
    workflowStage: 'submitted_to_banks',
    nextAction: 'Track first lender response.',
    risk: 'On Track',
    purchase: 3950000,
    deposit: 450000,
    docs: [9, 9],
    bank: 'Standard Bank',
    banks: ['Standard Bank', 'ABSA', 'Investec'],
    createdOffset: -11,
  },
  {
    slug: 'bank-feedback-bryanston',
    buyer: ['Thabo Nkosi', 'thabo.nkosi.demo@example.com', '0825550106'],
    property: ['Bryanston Place, Unit 32', 'Bryanston', 'Gauteng'],
    partner: 'Bryanston Place',
    stage: 'Bank feedback received',
    mainStage: 'FIN',
    financeStatus: 'bank_feedback',
    workflowStage: 'bank_review',
    nextAction: 'Upload updated employment confirmation for FNB.',
    risk: 'Medium Risk',
    purchase: 4750000,
    deposit: 500000,
    docs: [8, 10],
    bank: 'FNB',
    banks: ['FNB', 'Nedbank'],
    createdOffset: -14,
    feedback: true,
  },
  {
    slug: 'conditional-approval-bedfordview',
    buyer: ['Bianca Jacobs', 'bianca.jacobs.demo@example.com', '0825550107'],
    property: ['Bedford Square, Unit E7', 'Bedfordview', 'Gauteng'],
    partner: 'Bedford Square',
    stage: 'Conditional approval',
    mainStage: 'FIN',
    financeStatus: 'conditional_approval',
    workflowStage: 'quote_received',
    nextAction: 'Confirm condition acceptance with buyer.',
    risk: 'On Track',
    purchase: 2190000,
    deposit: 210000,
    docs: [10, 10],
    bank: 'ABSA',
    banks: ['ABSA', 'Standard Bank'],
    createdOffset: -16,
    quote: 'received',
    outcome: 'conditional',
  },
  {
    slug: 'approved-parkhurst',
    buyer: ['Gareth Williams', 'gareth.williams.demo@example.com', '0825550108'],
    property: ['Parkhurst Mews, Unit 9', 'Parkhurst', 'Gauteng'],
    partner: 'Parkhurst Mews',
    stage: 'Bond approved',
    mainStage: 'FIN',
    financeStatus: 'bond_approved',
    workflowStage: 'bond_approved',
    nextAction: 'Await formal grant from Investec.',
    risk: 'Low Risk',
    purchase: 5350000,
    deposit: 700000,
    docs: [10, 10],
    bank: 'Investec',
    banks: ['Investec', 'FNB'],
    createdOffset: -18,
    quote: 'approved_by_buyer',
    outcome: 'approved',
  },
  {
    slug: 'grant-received-killarney',
    buyer: ['Nomsa Khumalo', 'nomsa.khumalo.demo@example.com', '0825550109'],
    property: ['Killarney Views, Unit 44', 'Killarney', 'Gauteng'],
    partner: 'Killarney Views',
    stage: 'Grant received',
    mainStage: 'FIN',
    financeStatus: 'grant_received',
    workflowStage: 'grant_received',
    nextAction: 'Send grant pack to buyer for signature.',
    risk: 'On Track',
    purchase: 1680000,
    deposit: 120000,
    docs: [10, 10],
    bank: 'Nedbank',
    banks: ['Nedbank'],
    createdOffset: -20,
    quote: 'approved_by_buyer',
    outcome: 'approved',
  },
  {
    slug: 'grant-signed-centurion',
    buyer: ['Michael Botha', 'michael.botha.demo@example.com', '0825550110'],
    property: ['Centurion Lake, Unit 16', 'Centurion', 'Gauteng'],
    partner: 'Centurion Lake',
    stage: 'Grant signed',
    mainStage: 'FIN',
    financeStatus: 'grant_signed',
    workflowStage: 'grant_signed',
    nextAction: 'Submit signed grant for attorney instruction.',
    risk: 'Low Risk',
    purchase: 2460000,
    deposit: 246000,
    docs: [10, 10],
    bank: 'Standard Bank',
    banks: ['Standard Bank'],
    createdOffset: -22,
    quote: 'approved_by_buyer',
    outcome: 'approved',
  },
  {
    slug: 'instruction-sent-melrose',
    buyer: ['Priya Singh', 'priya.singh.demo@example.com', '0825550111'],
    property: ['Melrose Arch, Unit M403', 'Melrose', 'Gauteng'],
    partner: 'Melrose Arch',
    stage: 'Attorney instructed',
    mainStage: 'ATTY',
    financeStatus: 'instruction_sent',
    workflowStage: 'instruction_sent',
    nextAction: 'Monitor attorney acknowledgement.',
    risk: 'On Track',
    purchase: 6100000,
    deposit: 900000,
    docs: [10, 10],
    bank: 'FNB',
    banks: ['FNB'],
    createdOffset: -25,
    quote: 'approved_by_buyer',
    outcome: 'approved',
  },
  {
    slug: 'registered-lynnwood',
    buyer: ['Sipho Maseko', 'sipho.maseko.demo@example.com', '0825550112'],
    property: ['Lynnwood Lane, Unit 3', 'Lynnwood', 'Gauteng'],
    partner: 'Lynnwood Lane',
    stage: 'Registered',
    mainStage: 'REG',
    financeStatus: 'registered',
    workflowStage: 'complete',
    nextAction: 'Archive post-registration finance pack.',
    risk: 'Complete',
    purchase: 1980000,
    deposit: 250000,
    docs: [10, 10],
    bank: 'ABSA',
    banks: ['ABSA'],
    createdOffset: -32,
    quote: 'approved_by_buyer',
    outcome: 'approved',
    registered: true,
  },
]

const expandedScenarios = [...scenarios]
for (let index = 0; index < 12; index += 1) {
  const source = scenarios[index % scenarios.length]
  expandedScenarios.push({
    ...source,
    slug: `${source.slug}-extra-${index + 1}`,
    buyer: [
      `${source.buyer[0]} ${index + 2}`,
      source.buyer[1].replace('@', `.${index + 2}@`),
      `08255502${String(index + 1).padStart(2, '0')}`,
    ],
    property: [
      source.property[0].replace(/Unit\s+/i, `Unit ${index + 20}-`),
      source.property[1],
      source.property[2],
    ],
    purchase: source.purchase + (index + 1) * 85000,
    deposit: source.deposit + (index + 1) * 15000,
    createdOffset: source.createdOffset - index - 3,
  })
}

async function single(table, query) {
  const result = await query
  if (result.error) throw result.error
  return result.data
}

async function upsertRows(table, rows, { onConflict = 'id', select = 'id' } = {}) {
  if (!rows.length) return []
  const result = await supabase.from(table).upsert(rows, { onConflict }).select(select)
  if (result.error) throw result.error
  return result.data || []
}

async function resolveContext() {
  const membership = await single(
    'organisation_users',
    supabase
      .from('organisation_users')
      .select('*, organisation:organisations(*)')
      .eq('email', TARGET_EMAIL)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
  )
  if (!membership?.organisation_id || !membership?.user_id) {
    throw new Error(`No active bond demo membership found for ${TARGET_EMAIL}.`)
  }
  const profile = await single(
    'profiles',
    supabase.from('profiles').select('*').eq('id', membership.user_id).maybeSingle(),
  )
  return {
    membership,
    profile: profile || {},
    organisation: membership.organisation || {},
    organisationId: membership.organisation_id,
    userId: membership.user_id,
    branchId: membership.primary_branch_id || membership.branch_id || null,
  }
}

function scenarioRows(context) {
  const buyers = []
  const transactions = []
  const workflows = []
  const applications = []
  const quotes = []
  const outcomes = []

  expandedScenarios.forEach((scenario, index) => {
    const buyerId = stableUuid(`buyer:${scenario.slug}`)
    const transactionId = stableUuid(`transaction:${scenario.slug}`)
    const workflowId = stableUuid(`workflow:${scenario.slug}`)
    const intakeApplicationId = stableUuid(`application:${scenario.slug}:intake`)
    const reference = `BOND-DEMO-${String(index + 1).padStart(3, '0')}`
    const createdAt = isoDays(scenario.createdOffset, 9)
    const updatedAt = isoDays(Math.min(-1, Math.floor(scenario.createdOffset / 3)), 14)
    const dueAt = isoDays(Math.min(7, Math.abs(scenario.createdOffset)), 12)
    const bondAmount = Math.max(0, scenario.purchase - scenario.deposit)
    const [buyerName, buyerEmail, buyerPhone] = scenario.buyer
    const [propertyLabel, suburb, province] = scenario.property

    buyers.push({
      id: buyerId,
      organisation_id: context.organisationId,
      name: buyerName,
      email: buyerEmail,
      phone: buyerPhone,
      created_at: createdAt,
      updated_at: updatedAt,
      is_demo_data: true,
      demo_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, accountEmail: TARGET_EMAIL },
    })

    transactions.push({
      id: transactionId,
      organisation_id: context.organisationId,
      buyer_id: buyerId,
      transaction_reference: reference,
      transaction_type: 'residential_sale',
      property_type: 'sectional_title',
      property_description: propertyLabel,
      property_address_line_1: propertyLabel,
      suburb,
      city: suburb,
      province,
      sales_price: money(scenario.purchase),
      purchase_price: money(scenario.purchase),
      finance_type: 'bond',
      purchaser_type: 'individual',
      bond_amount: money(bondAmount),
      deposit_amount: money(scenario.deposit),
      stage: canonicalTransactionStage(scenario),
      current_main_stage: scenario.mainStage,
      current_sub_stage_summary: scenario.nextAction,
      assigned_agent: scenario.partner,
      assigned_agent_email: `agent.${index + 1}@demo.example.com`,
      bond_originator: context.organisation.name || context.profile.full_name || 'Alex Bond',
      assigned_bond_originator_email: TARGET_EMAIL,
      bank: scenario.bank,
      next_action: scenario.nextAction,
      comment: 'Seeded mock bond application for layout beta testing.',
      expected_transfer_date: dateDays(35 + index),
      bond_workspace_id: context.organisationId,
      bond_workspace_unit_id: null,
      primary_bond_consultant_user_id: context.userId,
      assigned_bond_manager_user_id: context.userId,
      bond_assignment_status: 'fully_assigned',
      bond_assignment_source: 'workflow_assignment',
      finance_status: scenario.financeStatus,
      compliance_status: scenario.risk === 'At Risk' ? 'review_required' : 'clear',
      compliance_review_required: scenario.risk === 'At Risk',
      application_prepared: scenario.docs[0] >= scenario.docs[1] || scenario.workflowStage !== 'intake',
      submitted_to_banks: ['submitted_to_banks', 'bank_review', 'quote_received', 'bond_approved', 'grant_received', 'grant_signed', 'instruction_sent', 'complete'].includes(scenario.workflowStage),
      documents_complete: scenario.docs[0] >= scenario.docs[1],
      finance_documents_complete: scenario.docs[0] >= scenario.docs[1],
      documents_missing: scenario.docs[0] < scenario.docs[1],
      required_documents_missing: scenario.docs[0] < scenario.docs[1],
      finance_documents_missing: scenario.docs[0] < scenario.docs[1],
      missing_documents_count: Math.max(scenario.docs[1] - scenario.docs[0], 0),
      uploaded_documents_count: scenario.docs[0],
      total_required_documents: scenario.docs[1],
      bank_feedback_pending: Boolean(scenario.feedback),
      bank_feedback_status: scenario.feedback ? 'additional_documents_required' : null,
      next_action_due_at: dueAt,
      finance_due_at: dueAt,
      risk_status: canonicalRiskStatus(scenario.risk),
      operational_state: scenario.risk === 'At Risk' ? 'at_risk' : 'on_track',
      gross_commission_percentage: 2,
      gross_commission_amount: Math.round(scenario.purchase * 0.02),
      is_active: true,
      lifecycle_state: scenario.registered ? 'completed' : 'active',
      registered_at: scenario.registered ? updatedAt : null,
      last_meaningful_activity_at: updatedAt,
      created_at: createdAt,
      updated_at: updatedAt,
      is_demo_data: true,
      demo_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, accountEmail: TARGET_EMAIL },
    })

    workflows.push({
      id: workflowId,
      transaction_id: transactionId,
      workflow_type: 'bond_hybrid',
      current_stage: scenario.workflowStage,
      status: scenario.registered ? 'completed' : 'active',
      last_updated_by: context.userId,
      last_updated_at: updatedAt,
      completed_at: scenario.registered ? updatedAt : null,
      created_at: createdAt,
      updated_at: updatedAt,
    })

    applications.push({
      id: intakeApplicationId,
      transaction_id: transactionId,
      workflow_id: workflowId,
      buyer_party_id: buyerId,
      application_type: 'originator_intake',
      bank_name: 'Bond Originator Intake',
      status: scenario.workflowStage === 'intake' ? 'pending' : 'submitted',
      assigned_organisation_id: context.organisationId,
      assigned_branch_id: null,
      assigned_workspace_unit_id: null,
      assigned_user_id: context.userId,
      scope_level: 'workspace_hq',
      scope_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, accountEmail: TARGET_EMAIL },
      assignment_status: 'fully_assigned',
      assignment_source: 'manual',
      submitted_at: scenario.workflowStage === 'intake' ? null : updatedAt,
      feedback_received_at: scenario.feedback ? updatedAt : null,
      reference_number: `${reference}-INTAKE`,
      notes: 'Seeded mock originator intake application.',
      metadata: { seedKey: SEED_KEY, scenario: scenario.slug, accountEmail: TARGET_EMAIL },
      created_by: context.userId,
      updated_by: context.userId,
      created_at: createdAt,
      updated_at: updatedAt,
    })

    scenario.banks.forEach((bankName, bankIndex) => {
      const applicationId = stableUuid(`application:${scenario.slug}:bank:${bankName}`)
      const applicationStatus = scenario.outcome === 'approved'
        ? 'approved'
        : scenario.outcome === 'conditional'
          ? 'feedback_received'
          : scenario.feedback
            ? 'additional_documents_required'
            : 'submitted'
      applications.push({
        id: applicationId,
        transaction_id: transactionId,
        workflow_id: workflowId,
        buyer_party_id: buyerId,
        application_type: 'bank_application',
        bank_name: bankName,
        status: applicationStatus,
        assigned_organisation_id: context.organisationId,
        assigned_branch_id: null,
        assigned_workspace_unit_id: null,
        assigned_user_id: context.userId,
        scope_level: 'workspace_hq',
        scope_metadata: { seedKey: SEED_KEY, scenario: scenario.slug, bankName, accountEmail: TARGET_EMAIL },
        assignment_status: 'fully_assigned',
        assignment_source: 'manual',
        submitted_at: isoDays(scenario.createdOffset + 2 + bankIndex, 11),
        feedback_received_at: scenario.feedback || scenario.outcome ? updatedAt : null,
        reference_number: `${reference}-${bankName.toUpperCase().replace(/\W+/g, '')}`,
        notes: `Seeded mock bank application for ${bankName}.`,
        metadata: { seedKey: SEED_KEY, scenario: scenario.slug, bankName, accountEmail: TARGET_EMAIL },
        created_by: context.userId,
        updated_by: context.userId,
        created_at: createdAt,
        updated_at: updatedAt,
      })

      if (scenario.quote && bankIndex === 0) {
        quotes.push({
          id: stableUuid(`quote:${scenario.slug}:${bankName}`),
          transaction_id: transactionId,
          workflow_id: workflowId,
          bond_application_id: applicationId,
          bank_name: bankName,
          quoted_amount: money(Math.round(bondAmount * (scenario.outcome === 'conditional' ? 0.96 : 1))),
          interest_rate: Number((10.75 - (index % 5) * 0.15).toFixed(2)),
          term_months: 240,
          quote_status: scenario.quote,
          quote_received_at: updatedAt,
          quote_expiry_at: isoDays(20, 12),
          approved_at: scenario.quote === 'approved_by_buyer' ? updatedAt : null,
          notes: 'Seeded mock lender quote.',
          created_by: context.userId,
          updated_by: context.userId,
          created_at: updatedAt,
          updated_at: updatedAt,
        })
      }

      if (scenario.outcome && bankIndex === 0) {
        outcomes.push({
          id: stableUuid(`outcome:${scenario.slug}:${bankName}`),
          transaction_id: transactionId,
          workflow_id: workflowId,
          bond_application_id: applicationId,
          bank_name: bankName,
          outcome: scenario.outcome,
          outcome_at: updatedAt,
          approved_amount: scenario.outcome === 'approved' ? money(bondAmount) : null,
          conditions: scenario.outcome === 'conditional' ? 'Subject to updated payslip and settlement letter.' : null,
          decline_reason: null,
          notes: 'Seeded mock bank outcome.',
          recorded_by: context.userId,
          created_at: updatedAt,
        })
      }
    })
  })

  return { buyers, transactions, workflows, applications, quotes, outcomes }
}

async function deleteExistingSeedRows() {
  const transactionQuery = await supabase
    .from('transactions')
    .select('id')
    .eq('is_demo_data', true)
    .contains('demo_metadata', { seedKey: SEED_KEY })
  if (transactionQuery.error) throw transactionQuery.error
  const transactionIds = (transactionQuery.data || []).map((row) => row.id).filter(Boolean)
  if (!transactionIds.length) return { transactionIds: [] }

  await supabase.from('transaction_bond_bank_outcomes').delete().in('transaction_id', transactionIds)
  await supabase.from('transaction_bond_quotes').delete().in('transaction_id', transactionIds)
  await supabase.from('transaction_bond_applications').delete().in('transaction_id', transactionIds)
  await supabase.from('transaction_finance_workflows').delete().in('transaction_id', transactionIds)
  await supabase.from('transactions').delete().in('id', transactionIds)
  return { transactionIds }
}

async function main() {
  const context = await resolveContext()
  const rows = scenarioRows(context)
  const deleted = await deleteExistingSeedRows()

  const insertedBuyers = await upsertRows('buyers', rows.buyers)
  const insertedTransactions = await upsertRows('transactions', rows.transactions, {
    select: 'id, transaction_reference',
  })
  const insertedWorkflows = await upsertRows('transaction_finance_workflows', rows.workflows)
  const insertedApplications = await upsertRows('transaction_bond_applications', rows.applications)
  const insertedQuotes = await upsertRows('transaction_bond_quotes', rows.quotes)
  const insertedOutcomes = await upsertRows('transaction_bond_bank_outcomes', rows.outcomes)

  const verification = await supabase
    .from('transactions')
    .select('id, transaction_reference, finance_status, current_main_stage, buyer:buyers(name)')
    .eq('is_demo_data', true)
    .contains('demo_metadata', { seedKey: SEED_KEY })
    .order('created_at', { ascending: false })

  if (verification.error) throw verification.error

  console.log(JSON.stringify({
    accountEmail: TARGET_EMAIL,
    workspaceId: context.organisationId,
    deletedTransactions: deleted.transactionIds.length,
    inserted: {
      buyers: insertedBuyers.length,
      transactions: insertedTransactions.length,
      workflows: insertedWorkflows.length,
      applications: insertedApplications.length,
      quotes: insertedQuotes.length,
      outcomes: insertedOutcomes.length,
    },
    sample: (verification.data || []).slice(0, 5),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
