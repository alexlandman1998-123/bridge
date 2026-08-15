import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  buildBondApplicationBrowserE2EContract,
  buildBondApplicationPrefillConfirmationCards,
  buildBondApplicationPrefillConfirmationMetadata,
  buildBondApplicationPrefillDraft,
} from '../src/modules/bond/application/index.js'
import {
  buildBondApplicationPdfHtml,
  buildBondApplicationViewModel,
} from '../src/modules/bond/utils/bondApplicationViewModel.js'

const root = process.cwd()

function makePortal() {
  return {
    buyer: {
      name: 'Lerato Mokoena',
      email: 'lerato@example.com',
      phone: '0832222222',
    },
    onboardingFormData: {
      formData: {
        first_name: 'Lerato',
        last_name: 'Mokoena',
        email: 'lerato@example.com',
        phone: '0832222222',
        identity_number: '9001015009087',
        street_address: '44 Buyer Road',
        suburb: 'Buyer Suburb',
        city: 'Johannesburg',
        postal_code: '2196',
        purchase_price: '1900000',
        deposit_amount: '250000',
        bond_amount: '1650000',
        employment_status: 'permanent',
        employer_name: 'Arch9 Finance',
        gross_monthly_income: '65000',
        bank_name: 'FNB',
      },
    },
    transaction: {
      finance_type: 'bond',
      purchase_price: 1_900_000,
      sales_price: 1_900_000,
      bond_amount: 1_650_000,
      deposit_amount: 250_000,
      purchaser_type: 'company',
      buyer_entity_type: 'company',
      buyer_entity_name: 'Mokoena Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
      property_address_line_1: '44 Buyer Road',
      suburb: 'Buyer Suburb',
    },
    unit: {
      unit_number: 'A-101',
      price: 1_900_000,
      development: {
        name: 'Matrix Gardens',
      },
    },
  }
}

function buildConfirmedApplication() {
  const portal = makePortal()
  const { application, metadata } = buildBondApplicationPrefillDraft(portal)
  const cards = buildBondApplicationPrefillConfirmationCards(application, metadata)
  const prefillMetadata = buildBondApplicationPrefillConfirmationMetadata(metadata, cards, {
    confirmedSectionKeys: ['summary', 'contact_address', 'loan_details'],
    now: '2026-08-15T08:00:00.000Z',
  })

  return {
    portal,
    application: {
      ...application,
      prefill_metadata: prefillMetadata,
    },
  }
}

function assertContract() {
  const contract = buildBondApplicationBrowserE2EContract()

  assert.equal(contract.version, 'phase-16-v1')
  assert.equal(contract.status, 'browser_e2e_contract_locked')
  assert.equal(contract.scenarioCount, 5)
  assert.ok(contract.requiredSelectors.includes('[data-bond-ux-task-workspace="phase-10"]'))
  assert.ok(contract.requiredSelectors.includes('[data-bond-prefill-confirmation-cards="true"]'))
  assert.ok(contract.requiredSelectors.includes('[data-bond-originator-review-workspace="phase-15"]'))
  assert.ok(contract.requiredTexts.includes('Confirm Section'))
  assert.ok(contract.requiredTexts.includes('Originator Review Workspace'))
  assert.ok(contract.runtimeChecks.includes('no_vite_error_overlay'))
  assert.ok(contract.runtimeChecks.includes('originator_handoff_pdf_sections'))

  for (const scenario of contract.scenarios) {
    assert.ok(scenario.key, 'Every browser scenario needs a stable key.')
    assert.ok(scenario.actor, `${scenario.key} should define the user actor.`)
    assert.ok(scenario.routePattern, `${scenario.key} should define the route under test.`)
    assert.ok(scenario.purpose, `${scenario.key} should explain the workflow being locked.`)
    assert.ok(
      scenario.requiredSelectors.length || scenario.requiredTexts.length,
      `${scenario.key} should lock at least one selector or visible string.`,
    )
  }
}

function assertPdfHandoff() {
  const { portal, application } = buildConfirmedApplication()
  const viewModel = buildBondApplicationViewModel({
    transaction: portal.transaction,
    buyer: portal.buyer,
    unit: portal.unit,
    development: portal.unit.development,
    onboardingFormData: {
      formData: {
        ...portal.onboardingFormData.formData,
        bond_application: application,
      },
    },
    bondApplication: application,
    statusLabel: application.status,
  })

  const html = buildBondApplicationPdfHtml(viewModel, '2026-08-15T10:00:00.000Z')

  assert.match(html, /Originator Review Workspace/)
  assert.match(html, /Originator Action List/)
  assert.match(html, /Buyer Section Confirmations/)
  assert.match(html, /Buyer Portal Field Alignment/)
  assert.match(html, /Buyer-confirmed/)
  assert.match(html, /System-prefilled/)
  assert.match(html, /Missing data/)
}

async function assertStaticBrowserContracts() {
  const [appSource, clientPortalSource, attorneyDetailSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/App.jsx'), 'utf8'),
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-16-browser-e2e-testing.md'), 'utf8'),
  ])

  assert.match(appSource, /path="\/client\/:token\/bond-application"/)
  assert.match(clientPortalSource, /data-bond-ux-task-workspace="phase-10"/)
  assert.match(clientPortalSource, /data-bond-ux-next-action-bar="true"/)
  assert.match(clientPortalSource, /data-bond-ux-section-stepper="true"/)
  assert.match(clientPortalSource, /data-bond-prefill-confirmation-cards="true"/)
  assert.match(clientPortalSource, /data-bond-prefill-section-actions="true"/)
  assert.match(clientPortalSource, /Confirm Section/)
  assert.match(clientPortalSource, /Complete Missing Field/)
  assert.match(clientPortalSource, /Save Progress/)
  assert.match(attorneyDetailSource, /data-bond-originator-review-workspace="phase-15"/)
  assert.match(attorneyDetailSource, /data-bond-originator-action-list="true"/)
  assert.match(attorneyDetailSource, /Originator Review Workspace/)
  assert.match(attorneyDetailSource, /Originator Action List/)
  assert.match(docSource, /Browser-Level E2E Testing/)
  assert.match(docSource, /BOND_APPLICATION_E2E_URL/)
  assert.match(docSource, /does not mutate buyer data/)
}

async function assertOptionalBrowserSmoke() {
  const baseUrl = String(process.env.BOND_APPLICATION_E2E_URL || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    return {
      skipped: true,
      reason: 'BOND_APPLICATION_E2E_URL was not provided.',
    }
  }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    const overlayCount = await page.locator('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count()
    const bodyText = await page.locator('body').innerText({ timeout: 10000 })

    assert.equal(overlayCount, 0, 'Live browser smoke should not show a dev error overlay.')
    assert.ok(bodyText.trim().length > 0, 'Live browser smoke should render visible text.')
    assert.equal(errors.length, 0, `Live browser smoke should not emit browser errors:\n${errors.join('\n')}`)

    return {
      skipped: false,
      url: page.url(),
      visibleTextLength: bodyText.trim().length,
    }
  } finally {
    await browser.close()
  }
}

assertContract()
assertPdfHandoff()
await assertStaticBrowserContracts()
const browserSmoke = await assertOptionalBrowserSmoke()

console.log(JSON.stringify({
  phase: 16,
  status: 'bond_application_browser_e2e_contract_passed',
  mutatedData: false,
  browserSmoke,
}, null, 2))
