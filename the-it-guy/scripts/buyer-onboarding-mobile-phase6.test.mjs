import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const FAKE_SUPABASE_URL = 'https://phase6-buyer-onboarding.supabase.co'
const FAKE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.phase6'

function todayIso() {
  return new Date('2026-07-05T12:00:00.000Z').toISOString()
}

function uuid(number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
}

function stripPostgrestFilter(value = '') {
  return String(value || '').replace(/^(?:eq|in)\./, '').replace(/[()]/g, '')
}

function normalizeFinanceType(value = 'cash') {
  const normalized = String(value || 'cash').trim().toLowerCase()
  if (normalized === 'hybrid') return 'combination'
  return normalized || 'cash'
}

function buildPurchaser(overrides = {}) {
  return {
    first_name: 'Alex',
    last_name: 'Buyer',
    date_of_birth: '1990-01-01',
    identity_number: '9001015009087',
    passport_number: '',
    nationality: 'South African',
    residency_status: 'sa_citizen',
    tax_number: '9123456789',
    email: 'alex.buyer@example.com',
    phone: '+27821234567',
    street_address: '12 Pine Road',
    suburb: 'Bryanston',
    city: 'Johannesburg',
    postal_code: '2191',
    marital_status: 'single',
    marital_regime: '',
    spouse_full_name: '',
    spouse_identity_number: '',
    spouse_email: '',
    spouse_phone: '',
    spouse_is_co_purchaser: '',
    ownership_share: '',
    consent_to_purchase: '',
    employment_type: 'full_time',
    employer_name: 'Bridge Capital',
    job_title: 'Operations Lead',
    employment_start_date: '2020-01-01',
    business_name: '',
    years_in_business: '',
    gross_monthly_income: '85000',
    net_monthly_income: '62000',
    income_frequency: 'monthly',
    number_of_dependants: '1',
    monthly_credit_commitments: '4500',
    monthly_living_expenses: '18000',
    first_time_buyer: 'yes',
    primary_residence: 'yes',
    investment_purchase: 'no',
    under_debt_review: 'no',
    under_administration: 'no',
    ever_declared_insolvent: 'no',
    surety_obligations: 'no',
    ...overrides,
  }
}

function buildFinance(financeType) {
  const normalized = normalizeFinanceType(financeType)
  return {
    purchase_price: '2500000',
    cash_amount: normalized === 'bond' ? '' : normalized === 'combination' ? '500000' : '2500000',
    bond_amount: normalized === 'cash' ? '' : normalized === 'combination' ? '2000000' : '2500000',
    proof_of_funds_available: normalized === 'bond' ? '' : 'yes',
    source_of_funds: normalized === 'bond' ? '' : 'savings',
    cash_funds_confirmed: normalized === 'bond' ? '' : 'yes',
    cash_contribution_available: '',
    deposit_source: '',
    cash_contribution_source: '',
    bank_statements_available: normalized === 'cash' ? '' : 'yes',
    bond_readiness_consent: normalized === 'cash' ? '' : 'yes',
    affordability_confirmed: normalized === 'cash' ? '' : 'yes',
    bond_current_status: normalized === 'cash' ? '' : 'pre_approval_only',
    bond_process_started: normalized === 'cash' ? '' : 'yes',
    bond_bank_name: normalized === 'cash' ? '' : 'FNB',
    bond_help_requested: normalized === 'cash' ? '' : 'no',
    ooba_assist_requested: normalized === 'cash' ? '' : 'no',
    joint_bond_application: normalized === 'cash' ? '' : 'no',
    bond_originator_name: '',
    bond_originator_contact: '',
  }
}

function buildCompany() {
  return {
    company_name: 'Bridge Buyer Holdings Pty Ltd',
    company_registration_number: '2020/123456/07',
    company_registered_address: '1 Company Lane, Sandton',
    company_business_address: '1 Company Lane, Sandton',
    company_tax_number: '9876543210',
    vat_number: '4123456789',
    nature_of_business: 'Property investment',
    authorised_signatory_name: 'Cameron Director',
    authorised_signatory_identity_number: '8501015009084',
    authorised_signatory_email: 'cameron@example.com',
    authorised_signatory_phone: '+27829876543',
    authorised_signatory_capacity: 'Director',
    board_resolution_available: 'yes',
    directors: [
      {
        full_name: 'Cameron Director',
        id_number: '8501015009084',
        phone: '+27829876543',
        email: 'cameron@example.com',
        residential_address: '4 Director Street, Sandton',
        role_title: 'Director',
        signing_authority: 'yes',
      },
    ],
  }
}

function buildTrust() {
  return {
    trust_name: 'The Phase Six Family Trust',
    trust_registration_number: 'IT1234/2020',
    trust_type: 'Inter vivos',
    masters_office_reference: 'MO123456',
    trust_registered_address: '7 Trust Avenue, Rosebank',
    trust_tax_number: '1234567890',
    authorised_trustee_name: 'Taylor Trustee',
    authorised_trustee_identity_number: '8701015009085',
    authorised_trustee_email: 'taylor@example.com',
    authorised_trustee_phone: '+27827654321',
    trust_deed_available: 'yes',
    letters_of_authority_available: 'yes',
    trust_resolution_available: 'yes',
    all_trustees_signing: 'yes',
    trustees: [
      {
        full_name: 'Taylor Trustee',
        id_number: '8701015009085',
        phone: '+27827654321',
        email: 'taylor@example.com',
        residential_address: '7 Trust Avenue, Rosebank',
        role_title: 'Trustee',
        signing_authority: 'yes',
      },
    ],
  }
}

function buildFormData({ purchaserEntityType, financeType, coPurchasing = false }) {
  const normalizedFinanceType = normalizeFinanceType(financeType)
  const finance = buildFinance(normalizedFinanceType)
  const primaryPurchaser = buildPurchaser({
    ownership_share: coPurchasing ? '50' : '',
    consent_to_purchase: coPurchasing ? 'yes' : '',
  })
  const secondaryPurchaser = buildPurchaser({
    first_name: 'Sam',
    last_name: 'CoBuyer',
    identity_number: '9101015009088',
    email: 'sam.cobuyer@example.com',
    phone: '+27825551234',
    tax_number: '9234567890',
    ownership_share: '50',
    consent_to_purchase: 'yes',
  })

  return {
    purchaser_type: purchaserEntityType,
    purchaser_entity_type: purchaserEntityType,
    purchase_finance_type: normalizedFinanceType,
    natural_person_purchase_mode: coPurchasing ? 'co_purchasing' : 'individual',
    purchase_price: finance.purchase_price,
    cash_amount: finance.cash_amount,
    bond_amount: finance.bond_amount,
    purchasers: purchaserEntityType === 'individual' ? (coPurchasing ? [primaryPurchaser, secondaryPurchaser] : [primaryPurchaser]) : [],
    finance,
    company: purchaserEntityType === 'company' ? buildCompany() : undefined,
    trust: purchaserEntityType === 'trust' ? buildTrust() : undefined,
    funding_sources: [],
  }
}

function buildScenario(index, config) {
  const transactionId = uuid(100 + index)
  const developmentId = uuid(200 + index)
  const unitId = uuid(300 + index)
  const buyerId = uuid(400 + index)
  const organisationId = uuid(500 + index)
  const portalLinkId = uuid(600 + index)
  const financeType = normalizeFinanceType(config.financeType)
  const formData = buildFormData({
    purchaserEntityType: config.purchaserEntityType,
    financeType,
    coPurchasing: Boolean(config.coPurchasing),
  })

  return {
    ...config,
    financeType,
    token: `phase6-${config.key}`,
    transactionId,
    developmentId,
    unitId,
    buyerId,
    organisationId,
    portalLinkId,
    formData,
    onboarding: {
      id: uuid(700 + index),
      transaction_id: transactionId,
      token: `phase6-${config.key}`,
      status: 'In Progress',
      purchaser_type: config.purchaserEntityType,
      submitted_at: null,
      is_active: true,
      created_at: todayIso(),
      updated_at: todayIso(),
    },
    transaction: {
      id: transactionId,
      organisation_id: organisationId,
      development_id: developmentId,
      unit_id: unitId,
      buyer_id: buyerId,
      transaction_reference: `TX-PHASE6-${index}`,
      property_address_line_1: `${10 + index} Phase Six Road`,
      property_address_line_2: '',
      suburb: 'Bryanston',
      city: 'Johannesburg',
      province: 'Gauteng',
      property_description: 'Mobile smoke property',
      sales_price: Number(formData.purchase_price),
      purchase_price: Number(formData.purchase_price),
      finance_type: financeType,
      finance_managed_by: financeType === 'cash' ? 'cash' : 'bond_originator',
      cash_amount: Number(formData.cash_amount || 0) || null,
      bond_amount: Number(formData.bond_amount || 0) || null,
      deposit_amount: null,
      reservation_required: false,
      reservation_amount: null,
      reservation_status: 'not_required',
      reservation_paid_date: null,
      onboarding_status: 'in_progress',
      onboarding_completed_at: null,
      external_onboarding_submitted_at: null,
      purchaser_type: config.purchaserEntityType,
      stage: 'Available',
      current_main_stage: 'OTP',
      assigned_agent: 'Phase Six Agent',
      assigned_agent_email: 'agent@example.com',
      attorney: 'Phase Six Attorneys',
      bond_originator: 'Phase Six Bond',
      next_action: 'Complete onboarding',
      comment: '',
      updated_at: todayIso(),
      created_at: todayIso(),
    },
    unit: {
      id: unitId,
      development_id: developmentId,
      unit_number: `B${index}`,
      phase: 'Phase 1',
      status: 'Available',
      development: { id: developmentId, name: 'Phase Six Estate' },
    },
    buyer: {
      id: buyerId,
      name: config.purchaserEntityType === 'company' ? 'Bridge Buyer Holdings Pty Ltd' : 'Alex Buyer',
      phone: '+27821234567',
      email: 'alex.buyer@example.com',
    },
    organisation: {
      id: organisationId,
      name: 'Phase Six Realty',
      display_name: 'Phase Six Realty',
      logo_url: '',
    },
    onboardingFormData: {
      id: uuid(800 + index),
      transaction_id: transactionId,
      purchaser_type: config.purchaserEntityType,
      form_data: formData,
      created_at: todayIso(),
      updated_at: todayIso(),
    },
    clientPortalLink: {
      id: portalLinkId,
      token: `portal-phase6-${config.key}`,
      is_active: true,
      transaction_id: transactionId,
      updated_at: todayIso(),
      created_at: todayIso(),
    },
  }
}

const scenarios = [
  buildScenario(1, {
    key: 'individual-cash',
    label: 'individual + cash',
    purchaserEntityType: 'individual',
    financeType: 'cash',
    expectedReviewText: ['Review & Submit', 'Document Next Steps', 'Finance type', 'Cash', 'Primary buyer'],
  }),
  buildScenario(2, {
    key: 'individual-bond',
    label: 'individual + bond',
    purchaserEntityType: 'individual',
    financeType: 'bond',
    expectedReviewText: ['Review & Submit', 'Bond amount', 'Bond status', 'Originator help'],
  }),
  buildScenario(3, {
    key: 'co-purchasing-hybrid',
    label: 'co-purchasing + hybrid',
    purchaserEntityType: 'individual',
    financeType: 'combination',
    coPurchasing: true,
    expectedReviewText: ['Review & Submit', 'Co-purchaser', 'Ownership split', 'Hybrid'],
  }),
  buildScenario(4, {
    key: 'company-cash',
    label: 'company purchaser',
    purchaserEntityType: 'company',
    financeType: 'cash',
    expectedReviewText: ['Review & Submit', 'Company name', 'Directors / owners', 'Bridge Buyer Holdings'],
  }),
  buildScenario(5, {
    key: 'trust-bond',
    label: 'trust purchaser',
    purchaserEntityType: 'trust',
    financeType: 'bond',
    expectedReviewText: ['Review & Submit', 'Trust name', 'Trustees', 'The Phase Six Family Trust'],
  }),
]

const scenarioByToken = new Map(scenarios.map((scenario) => [scenario.token, scenario]))
const scenarioByTransactionId = new Map(scenarios.map((scenario) => [scenario.transactionId, scenario]))
const scenarioByDevelopmentId = new Map(scenarios.map((scenario) => [scenario.developmentId, scenario]))
const scenarioByUnitId = new Map(scenarios.map((scenario) => [scenario.unitId, scenario]))
const scenarioByBuyerId = new Map(scenarios.map((scenario) => [scenario.buyerId, scenario]))
const scenarioByOrganisationId = new Map(scenarios.map((scenario) => [scenario.organisationId, scenario]))

async function isServerReachable(baseUrl) {
  try {
    const response = await fetch(baseUrl)
    return response.ok
  } catch {
    return false
  }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 45000
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }

  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError?.message || 'no response'}`)
}

async function startViteServer() {
  if (process.env.BUYER_ONBOARDING_PHASE6_BASE_URL) {
    return {
      baseUrl: process.env.BUYER_ONBOARDING_PHASE6_BASE_URL.replace(/\/$/, ''),
      stop: async () => {},
    }
  }

  for (const candidateUrl of ['http://127.0.0.1:5177', 'http://127.0.0.1:5175', 'http://127.0.0.1:5173']) {
    if (await isServerReachable(candidateUrl)) {
      return {
        baseUrl: candidateUrl,
        stop: async () => {},
      }
    }
  }

  const port = 5186
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      VITE_SUPABASE_URL: FAKE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
      VITE_SUPABASE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  try {
    await waitForServer(baseUrl)
  } catch (error) {
    child.kill('SIGTERM')
    throw new Error(`${error.message}\nVite output:\n${output}`)
  }

  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(3000),
      ])
      if (child.exitCode === null) child.kill('SIGKILL')
    },
  }
}

function getScenarioForRequest(url) {
  const token = stripPostgrestFilter(url.searchParams.get('token') || '')
  if (scenarioByToken.has(token)) return scenarioByToken.get(token)

  const transactionId = stripPostgrestFilter(url.searchParams.get('transaction_id') || url.searchParams.get('id') || '')
  if (scenarioByTransactionId.has(transactionId)) return scenarioByTransactionId.get(transactionId)

  const developmentId = stripPostgrestFilter(url.searchParams.get('development_id') || url.searchParams.get('id') || '')
  if (scenarioByDevelopmentId.has(developmentId)) return scenarioByDevelopmentId.get(developmentId)

  const unitId = stripPostgrestFilter(url.searchParams.get('unit_id') || url.searchParams.get('id') || '')
  if (scenarioByUnitId.has(unitId)) return scenarioByUnitId.get(unitId)

  const buyerId = stripPostgrestFilter(url.searchParams.get('buyer_id') || url.searchParams.get('id') || '')
  if (scenarioByBuyerId.has(buyerId)) return scenarioByBuyerId.get(buyerId)

  const organisationId = stripPostgrestFilter(url.searchParams.get('organisation_id') || url.searchParams.get('id') || '')
  if (scenarioByOrganisationId.has(organisationId)) return scenarioByOrganisationId.get(organisationId)

  return scenarios[0]
}

function resolveRestPayload(table, url) {
  const scenario = getScenarioForRequest(url)

  switch (table) {
    case 'transaction_onboarding':
      return scenario.onboarding
    case 'transactions':
      return scenario.transaction
    case 'units':
      return scenario.unit
    case 'buyers':
      return scenario.buyer
    case 'organisations':
      return scenario.organisation
    case 'developments':
      return {
        id: scenario.developmentId,
        name: 'Phase Six Estate',
        snag_tracking_enabled: true,
        alterations_enabled: false,
      }
    case 'development_settings':
      return null
    case 'onboarding_form_data':
      return scenario.onboardingFormData
    case 'client_portal_links':
      return scenario.clientPortalLink
    case 'transaction_funding_sources':
    case 'transaction_required_documents':
    case 'documents':
    case 'document_requirement_rules':
    case 'document_requirements':
    case 'canonical_document_requirements':
    case 'canonical_requirement_instances':
      return []
    default:
      return []
  }
}

async function installSupabaseMocks(page) {
  await page.route('**/auth/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: null, session: null }),
    })
  })

  await page.route('**/functions/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sent: true, ok: true }),
    })
  })

  await page.route('**/rest/v1/rpc/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').filter(Boolean).pop()
    const payload = resolveRestPayload(table, url)

    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-range': '0-0/1',
      },
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

async function clickLastButtonByName(page, name, timeout = 10000) {
  const buttons = page.getByRole('button', { name })
  await buttons.first().waitFor({ state: 'visible', timeout })
  const count = await buttons.count()
  await buttons.nth(count - 1).click()
}

async function advanceScenarioToReview(page, baseUrl, scenario) {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await installSupabaseMocks(page)
  await page.goto(`${baseUrl}/client/onboarding/${scenario.token}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })

  await clickLastButtonByName(page, /Start buyer onboarding|Resume buyer onboarding/, 20000)

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const bodyText = await page.locator('body').innerText()
    if (bodyText.includes('You are almost ready to submit') && bodyText.includes('Document Next Steps')) {
      assert.equal(
        await page.locator('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(),
        0,
        `${scenario.label} should not render a Vite/browser error overlay.`,
      )
      assert.deepEqual(errors, [], `${scenario.label} should not emit browser errors.`)
      for (const expectedText of scenario.expectedReviewText) {
        assert.match(bodyText, new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${scenario.label} review should include "${expectedText}".`)
      }
      return
    }

    if (bodyText.includes('Please complete') || bodyText.includes('is required.')) {
      throw new Error(`${scenario.label} hit validation before review:\n${bodyText.slice(0, 1200)}`)
    }

    await clickLastButtonByName(page, /^Continue$/)
    await page.waitForTimeout(150)
  }

  const finalText = await page.locator('body').innerText()
  throw new Error(`${scenario.label} did not reach review.\n${finalText.slice(0, 1200)}`)
}

const server = await startViteServer()
const browser = await chromium.launch({ headless: true })

try {
  for (const scenario of scenarios) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    })
    await advanceScenarioToReview(page, server.baseUrl, scenario)
    await page.close()
    console.log(`ok - mobile buyer onboarding reaches review for ${scenario.label}`)
  }
} finally {
  await browser.close()
  await server.stop()
}

console.log('buyer onboarding mobile phase 6 smoke passed')
