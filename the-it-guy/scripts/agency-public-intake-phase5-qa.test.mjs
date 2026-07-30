import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const APP_ROOT = new URL('../', import.meta.url)
const DEFAULT_PORT = 5198
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(baseUrl, outputRef) {
  const deadline = Date.now() + 45_000
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
  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError?.message || 'no response'}\nVite output:\n${outputRef.value}`)
}

async function startViteServer() {
  const providedUrl = String(process.env.AGENCY_PUBLIC_INTAKE_QA_BASE_URL || '').trim().replace(/\/$/, '')
  if (providedUrl) {
    await waitForServer(providedUrl, { value: 'Provided base URL did not respond.' })
    return { baseUrl: providedUrl, stop: async () => {} }
  }

  const outputRef = { value: '' }
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(DEFAULT_PORT), '--strictPort'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      VITE_APP_ENV: 'development',
      VITE_ENABLE_LOCAL_FALLBACKS: 'true',
      VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })

  try {
    await waitForServer(DEFAULT_BASE_URL, outputRef)
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }

  return {
    baseUrl: DEFAULT_BASE_URL,
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

function intakeContract() {
  return {
    agency: {
      name: 'Produktive Realty',
      logoUrl: '/brand/produktive-realty-logo-white.svg',
      primaryColour: '#25284f',
      secondaryColour: '#394071',
      accentColour: '#d7b45a',
      website: 'https://produktive.co.za',
      contactEmail: 'hello@produktive.test',
    },
    intake: {
      heading: 'What can we help you with?',
      introduction: 'Choose the path that fits you and share a few details.',
      enabledIntents: ['buy', 'sell'],
      buyerCtaLabel: 'I am looking to buy',
      sellerCtaLabel: 'I am looking to sell',
      privacyPolicyVersion: 'agency-public-intake-v1',
      consentCopy: 'I consent to Produktive Realty collecting and using these details to respond to my enquiry.',
    },
  }
}

function listingFixtures() {
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'modern-waterkloof-home',
      title: 'Modern Waterkloof Home',
      propertyType: 'House',
      suburb: 'Waterkloof',
      city: 'Pretoria',
      askingPrice: 3450000,
      bedrooms: 4,
      bathrooms: 3,
      coverImageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=70',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'brooklyn-apartment',
      title: 'Brooklyn Apartment',
      propertyType: 'Apartment',
      suburb: 'Brooklyn',
      city: 'Pretoria',
      askingPrice: 1850000,
      bedrooms: 2,
      bathrooms: 2,
      coverImageUrl: '',
    },
  ]
}

async function installPublicApiMocks(page, state) {
  await page.route('**/api/public/agency-intake?**', async (route) => {
    const request = route.request()
    if (request.method().toUpperCase() === 'POST') {
      state.submissions.push(JSON.parse(request.postData() || '{}'))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accepted: true,
          duplicate: false,
          lead: {
            created: true,
            automation: {
              prepared: true,
              created: true,
              taskCreated: true,
              activityCreated: true,
              listingInterestCount: state.submissions.at(-1)?.selectedListings?.length || 0,
            },
          },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intake: intakeContract() }),
    })
  })

  await page.route('**/api/public/listings?**', async (route) => {
    const requestUrl = new URL(route.request().url())
    state.listingRequests.push(Object.fromEntries(requestUrl.searchParams.entries()))
    const empty = requestUrl.searchParams.get('q') === 'empty' || state.forceEmptyListings
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: empty ? [] : listingFixtures(),
        count: empty ? 0 : listingFixtures().length,
      }),
    })
  })
}

async function clickNext(page) {
  await page.getByRole('button', { name: /^Next/ }).click()
}

async function runLandingJourney(page, baseUrl) {
  await page.goto(`${baseUrl}/intake/produktive-realty?utm_source=instagram`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: "What's your next move?" }).waitFor()
  await page.getByText('Welcome to Produktive').waitFor()
  assert.equal(await page.getByText('Agency Intake').count(), 0, 'landing page should not show internal Agency Intake wording')
  await page.getByRole('button', { name: /Find a home/ }).waitFor()
  await page.getByRole('button', { name: /Sell my property/ }).waitFor()
  const contactCard = page.getByRole('link', { name: /Speak to the team/ })
  await contactCard.waitFor()
  assert.equal(await contactCard.getAttribute('href'), 'mailto:hello@produktive.test')
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  assert.equal(hasHorizontalOverflow, false, 'landing page should not horizontally overflow on mobile')
  await page.getByRole('button', { name: /Find a home/ }).click()
  await page.getByText('Step 1 of 4').waitFor()
}

async function runResponsiveLandingChecks(page, baseUrl) {
  const viewports = [
    { width: 320, height: 740 },
    { width: 360, height: 780 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto(`${baseUrl}/intake/produktive-realty`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: "What's your next move?" }).waitFor()
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    assert.equal(hasHorizontalOverflow, false, `landing page should not horizontally overflow at ${viewport.width}px`)

    const logoBox = await page.locator('img[alt="Produktive Realty logo"]').first().boundingBox()
    assert.ok(logoBox, `logo should be visible at ${viewport.width}px`)
    assert.ok(logoBox.width <= Math.min(viewport.width - 40, 290), `logo should not clip or overflow at ${viewport.width}px`)

    const firstCardBox = await page.getByRole('button', { name: /Find a home/ }).boundingBox()
    assert.ok(firstCardBox, `first intake card should be visible at ${viewport.width}px`)
    assert.ok(firstCardBox.y < viewport.height, `first intake card should begin in the first viewport at ${viewport.width}px`)
  }
}

async function runSelectedListingJourney(page, baseUrl, state) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/intake/produktive-realty?intent=buy&listing=preselected-home&listingId=33333333-3333-4333-8333-333333333333&utm_source=instagram`, { waitUntil: 'networkidle' })
  await page.getByText('Step 1 of 4').waitFor()

  const heroVisible = await page.getByText('Tell us what you want to buy.').isVisible().catch(() => false)
  assert.equal(heroVisible, false, 'mobile buyer flow should hide the hero copy')

  await clickNext(page)
  await page.getByText('Please enter your name.').waitFor()
  assert.equal(state.submissions.length, 0, 'contact validation should block submission')

  await page.getByLabel('Full name').fill('Avery Buyer')
  await page.getByLabel('Email address').fill('not-an-email')
  await clickNext(page)
  await page.getByText('Please enter a valid email address.').waitFor()

  await page.getByLabel('Email address').fill('')
  await page.getByLabel('Mobile number').fill('0821234567')
  await clickNext(page)
  await page.getByText('Step 2 of 4').waitFor()

  await page.getByLabel('Minimum budget').fill('5000000')
  await page.getByLabel('Maximum budget').fill('1000000')
  await clickNext(page)
  await page.getByText('Minimum budget cannot be greater than maximum budget.').waitFor()

  await page.getByLabel('Minimum budget').fill('1500000')
  await page.getByLabel('Maximum budget').fill('4000000')
  await page.getByLabel('Preferred areas').fill('Waterkloof, Brooklyn')
  await page.getByLabel('Bedrooms').selectOption('3')
  await clickNext(page)
  await page.getByText('Step 3 of 4').waitFor()
  assert.equal(state.listingRequests.at(-1)?.minPrice, '1500000', 'listing API should receive budget min filter')
  assert.equal(state.listingRequests.at(-1)?.maxPrice, '4000000', 'listing API should receive budget max filter')
  assert.equal(state.listingRequests.at(-1)?.bedrooms, '3', 'listing API should receive bedroom filter')

  await page.getByText('1 selected').waitFor()
  await page.getByRole('button', { name: /Modern Waterkloof Home/ }).click()
  await page.getByText('2 selected').waitFor()
  await clickNext(page)
  await page.getByText('2 listings selected').waitFor()
  await page.getByLabel('Notes').fill('Please send similar options too.')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Send enquiry/ }).click()
  await page.getByText('Enquiry received').waitFor()

  const payload = state.submissions.at(-1)
  assert.equal(payload.intent, 'buy')
  assert.equal(payload.contact.name, 'Avery Buyer')
  assert.equal(payload.contact.phone, '0821234567')
  assert.equal(payload.sourceChannel, 'instagram')
  assert.equal(payload.requirement.budgetMin, 1500000)
  assert.equal(payload.requirement.budgetMax, 4000000)
  assert.equal(payload.requirement.bedroomsMin, '3')
  assert.equal(payload.selectedListings.length, 2, 'submit should include URL-attributed and buyer-selected listings')
  assert.equal(payload.selectedListings[0].id, '33333333-3333-4333-8333-333333333333')
  assert.equal(payload.selectedListings[1].title, 'Modern Waterkloof Home')
}

async function runOptionalSkipJourney(page, baseUrl, state) {
  await page.setViewportSize({ width: 390, height: 844 })
  state.forceEmptyListings = true
  await page.goto(`${baseUrl}/intake/produktive-realty?intent=buy`, { waitUntil: 'networkidle' })
  await page.getByText('Step 1 of 4').waitFor()
  await page.getByLabel('Full name').fill('Skipper Buyer')
  await page.getByLabel('Email address').fill('skip@example.com')
  await clickNext(page)
  await page.getByText('Step 2 of 4').waitFor()
  await clickNext(page)
  await page.getByText('No matching listings available').waitFor()
  await clickNext(page)
  await page.getByText('Step 4 of 4').waitFor()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Send enquiry/ }).click()
  await page.getByText('Enquiry received').waitFor()

  const payload = state.submissions.at(-1)
  assert.equal(payload.contact.email, 'skip@example.com')
  assert.deepEqual(payload.selectedListings, [], 'optional listing step should allow empty selections')
  state.forceEmptyListings = false
}

const server = await startViteServer()
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  })
  const page = await context.newPage()
  const state = {
    submissions: [],
    listingRequests: [],
    forceEmptyListings: false,
  }
  await installPublicApiMocks(page, state)
  await runResponsiveLandingChecks(page, server.baseUrl)
  await runLandingJourney(page, server.baseUrl)
  await runSelectedListingJourney(page, server.baseUrl, state)
  await runOptionalSkipJourney(page, server.baseUrl, state)
  await context.close()
} finally {
  await browser.close()
  await server.stop()
}

console.log('agency public intake Phase 5 QA tests passed')
