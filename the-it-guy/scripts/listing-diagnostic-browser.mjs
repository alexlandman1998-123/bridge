import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { startListingDiagnosticBrowserFixture } from './lib/listingDiagnosticBrowserFixture.mjs'
import { categories, listingCase } from './lib/listingDiagnosticCases.mjs'

const out = resolve(process.argv[2] || '../output/playwright/listing-diagnostic/browser')
const profile = process.argv[3] || '--profile=desktop'
if (!['--profile=desktop', '--profile=mobile-slow'].includes(profile) || process.argv.length > 4) throw new Error('Unknown browser profile')
const mobileSlow = profile === '--profile=mobile-slow'
const profileEvidence = {
  profile: mobileSlow ? 'mobile-slow' : 'desktop',
  viewport: mobileSlow ? { width: 390, height: 844 } : { width: 1280, height: 720 },
  cpuSlowdown: mobileSlow ? 4 : 1,
  fixtureRequestDelayMs: mobileSlow ? 200 : 0,
  delayedRequests: 0,
  scope: 'Local functional checks. Mobile profile uses touch, 4x CPU slowdown and 200 ms added delay per fixture data request. Vite assets are not network-throttled. This is not production latency, a physical phone test or observed human usability.',
}
await mkdir(out, { recursive: true })
const editedSaleDescription = 'Second saved description, keeping the specialist details.'
const results = []
const fixture = await startListingDiagnosticBrowserFixture(out)
let browser
function check(name, fn) {
  try { fn(); results.push({ name, status: 'passed' }) }
  catch (error) { results.push({ name, status: error.code === 'ERR_ASSERTION' ? 'failed' : 'error', message: error.message }) }
}
async function contextPage() {
  const context = await browser.newContext({ viewport: profileEvidence.viewport, isMobile: mobileSlow, hasTouch: mobileSlow, serviceWorkers: 'block' })
  // Only the isolated loopback fixture is reachable, even if a stub is missed.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== fixture.origin && !['data:', 'blob:'].includes(url.protocol)) return route.abort()
    if (mobileSlow && url.origin === fixture.origin && url.pathname.startsWith('/fixture/') && route.request().method() === 'POST') {
      profileEvidence.delayedRequests++
      await new Promise(resolve => setTimeout(resolve, profileEvidence.fixtureRequestDelayMs))
    }
    return route.continue()
  })
  const page = await context.newPage()
  // This matrix deliberately leaves creation screens to seed independent
  // scenarios. Accept browser departure warnings; the focused recovery tests
  // separately verify that unsaved changes raise them and cancellation works.
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss())
  if (mobileSlow) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profileEvidence.cpuSlowdown })
  }
  page.on('pageerror', error => console.error('[browser page error]', error.message))
  page.setDefaultTimeout(45000)
  // Cold Vite compilation is fixture startup, not a product latency assertion.
  page.setDefaultNavigationTimeout(90000)
  return { context, page }
}
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const [category, label] of categories.filter(([key]) => !process.env.LISTING_DIAGNOSTIC_CATEGORY || key === process.env.LISTING_DIAGNOSTIC_CATEGORY)) {
    console.log(`Browser: ${category} sale`)
    const { context, page } = await contextPage()
    const editorStart = fixture.events.length
    try {
      await page.goto(fixture.origin + '/listings/new', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: label, exact: true }).click()
      check(`[UX-11] ${category}/sale new editor avoids inventory and transaction loading`, () => assert.equal(fixture.events.slice(editorStart).filter(row => ['all', 'workspace-transactions', 'workspace-assignments', 'workspace-developments', 'website-status'].includes(row.kind)).length, 0))
      const optionalRooms = page.locator('details[data-listing-rooms] > summary')
      if (await optionalRooms.count()) await optionalRooms.click()
      const type = await page.getByRole('combobox', { name: 'Property type *', exact: true }).inputValue()
      if (category !== 'residential') check(`[UX-05] ${category}/sale category cannot retain House`, () => assert.notEqual(type.toLowerCase(), 'house'))
      for (const [label, value] of (category === 'vacant_land' ? [['Land size (m²)', '500.5']] : [['Bathrooms', '2.5'], ['Floor size m²', '98.5'], ['Land size (m²)', '500.5']])) {
        const input = page.getByRole(label.startsWith('Land size') ? 'spinbutton' : 'textbox', { name: label, exact: true })
        await input.fill(value)
        const actual = await input.inputValue()
        check(`[UX-02] ${category}/sale ${label} preserves decimal`, () => assert.equal(actual, value))
      }
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      const priceCorrection = page.getByRole('button', { name: 'Edit price', exact: true })
      await priceCorrection.focus()
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => document.activeElement?.name === 'listingPrice')
      const remainingPriceIssue = await page.getByRole('button', { name: 'Edit price', exact: true }).count()
      check(`[UX-09] ${category}/sale keyboard correction focuses price and retains its issue`, () => assert.equal(remainingPriceIssue, 1))
      if (category === 'vacant_land') {
        const rooms = await page.getByRole('textbox', { name: 'Bedrooms', exact: true }).count()
        check('[UX-05] vacant_land/sale hides irrelevant room controls', () => assert.equal(rooms, 0))
      }
      if (category !== 'residential') {
        const source = listingCase(category, 'sale')
        const id = randomUUID()
        const galleryImages = [1, 2, 3].map(i => ({ id: `saved-${i}`, url: fixture.origin + `/fixture/photo.png?id=${i}`, name: `photo${i}.png` }))
        const propertyType = source.form.propertyType.toLowerCase().replaceAll(' ', '_')
        const payload = {
          title: 'Saved diagnostic listing', listingCategory: 'private_sale', listingStatus: 'active',
          organisationId: fixture.org, assignedAgentId: fixture.actor, propertyCategory: category, propertyType,
          addressLine1: '10 Diagnostic Road', streetNumber: '10', streetName: 'Diagnostic Road',
          suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng', country: 'South Africa',
          askingPrice: 1250000, description: source.form.description, galleryImages,
          propertyDetails: { ...source.form, propertyType, price: 1250000, galleryImages },
          sellerCanonicalFacts: {},
        }
        const seed = await page.request.post(fixture.origin + '/fixture/create', { data: { payload, options: { creationId: id } } })
        assert.equal((await seed.json()).error, null)
        await page.goto(fixture.origin + `/listings/${id}/edit?scope=property&step=features`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: /Step .*Extra details/ }).click()
        await page.getByRole('button', { name: 'Open Category-specific details', exact: true }).click()
        const fields = category === 'industrial' ? { 'Warehouse / factory area (m²)': '2200.5', 'Yard size (m²)': '900.5', 'Power supply': '250 kVA' }
          : category === 'agricultural' ? { 'Farm size (hectares)': '42.5', 'Water supply / rights': 'Borehole and water rights', 'Agricultural use': 'Citrus orchard' }
          : category === 'vacant_land' ? { 'Zoning': 'Residential 2' }
          : { 'Rentable floor area (m²)': '1250.5', 'Zoning': 'Business 4', 'Parking details': '18 bays', 'Sale or lease terms': 'Vacant occupation' }
        for (const [name, value] of Object.entries(fields)) await page.getByLabel(name, { exact: true }).fill(value)
        const before = fixture.events.length
        await page.getByRole('button', { name: 'Done', exact: true }).click()
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByRole('heading', { name: 'Photos & description', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByRole('heading', { name: 'Where to advertise', exact: true }).waitFor()
        const saves = fixture.events.slice(before).filter(row => ['onboarding', 'update', 'distribution'].includes(row.kind))
        if (!saves.length) throw new Error('Harness did not observe a form save request')
        check(`[UX-03] ${category}/sale specialist edits cross the save boundary`, () => {
          for (const value of Object.values(fields)) assert.ok(JSON.stringify(saves).includes(value), `New specialist value missing: ${value}`)
        })
        const unchangedStart = fixture.events.length
        await page.getByRole('button', { name: /Step .*Photos & description/ }).click()
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByRole('heading', { name: 'Where to advertise', exact: true }).waitFor()
        check(`[UX-11] ${category}/sale unchanged Continue avoids repeat writes`, () => assert.equal(fixture.events.slice(unchangedStart).filter(row => ['onboarding', 'update', 'distribution'].includes(row.kind)).length, 0))
        await page.getByRole('button', { name: /Step .*Photos & description/ }).click()
        await page.getByRole('textbox', { name: 'Listing description', exact: true }).fill(editedSaleDescription)
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByRole('heading', { name: 'Where to advertise', exact: true }).waitFor()
        check(`[UX-03] ${category}/sale second save uses confirmed revision`, () => assert.equal(fixture.events.slice(before).filter(row => row.kind === 'onboarding').length, 2))
        await page.goto(fixture.origin + `/listings/${id}/edit?scope=property&step=features`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: /Step .*Extra details/ }).click()
        await page.getByRole('button', { name: 'Open Category-specific details', exact: true }).click()
        const specialistInput = name => page.getByRole(/^(Rentable floor area|Warehouse \/ factory area|Yard size|Farm size)/.test(name) ? 'spinbutton' : 'textbox', { name, exact: true })
        const reopened = await Promise.all(Object.keys(fields).map(name => specialistInput(name).inputValue()))
        check(`[UX-03] ${category}/sale reopened values match`, () => assert.deepEqual(reopened, Object.values(fields)))
        await page.getByRole('button', { name: 'Done', exact: true }).click()
        await page.getByRole('button', { name: 'Step 1: Property details', exact: true }).click()
        const reopenedRooms = page.locator('details[data-listing-rooms]')
        if (await reopenedRooms.count() && await reopenedRooms.getAttribute('open') === null) await reopenedRooms.locator('summary').click()
        const amounts = await Promise.all((category === 'vacant_land' ? ['Land size (m²)'] : ['Bathrooms', 'Floor size m²', 'Land size (m²)']).map(name => page.getByRole(name.startsWith('Land size') ? 'spinbutton' : 'textbox', { name, exact: true }).inputValue()))
        check(`[UX-02] ${category}/sale decimal measurements survive reopening`, () => assert.deepEqual(amounts, category === 'vacant_land' ? ['500.5'] : ['2.5', '98.5', '500.5']))
      }
      if (category === 'residential') {
        await page.locator('[name="listingPrice"]').fill('1250000')
        await page.getByRole('combobox', { name: /Property address/ }).fill('10 Diagnostic Road, Sandton')
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByRole('heading', { name: /Extra details/ }).waitFor()
      }
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('heading', { name: 'Photos & description', exact: true }).waitFor()
      if (category === 'residential') {
        await page.locator('[name="listingDescription"]').fill(listingCase(category, 'sale').form.description)
        const photo = await (await page.request.get(fixture.origin + '/fixture/photo.png')).body()
        await page.locator('input[name="listingImages"]').setInputFiles([1, 2, 3].map(i => ({ name: `photo${i}.png`, mimeType: 'image/png', buffer: photo })))
      }
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('heading', { name: 'Where to advertise', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      const saleReview = page.locator('[aria-label="Listing review details"]')
      const saleType = await saleReview.locator('dt', { hasText: /^Property type$/ }).evaluate(node => node.nextElementSibling.textContent)
      const saleArea = await saleReview.locator('dt', { hasText: /^Land size$/ }).evaluate(node => node.nextElementSibling.textContent)
      const saleDescription = await saleReview.locator('dt', { hasText: /^Description$/ }).evaluate(node => node.nextElementSibling.textContent)
      check(`[UX-10] ${category}/sale review shows readable type and complete measurements and description`, () => {
        assert.ok(saleType && !saleType.includes('_'))
        assert.equal(saleArea, '500.5 m²')
        assert.equal(saleDescription, category === 'residential' ? listingCase(category, 'sale').form.description : editedSaleDescription)
      })
    } catch (error) { console.error(category, error.message); await writeFile(resolve(out, `${category}-sale-error.txt`), await page.locator('body').ariaSnapshot().catch(() => 'Snapshot unavailable')); results.push({ name: `[HARNESS] ${category}/sale browser setup`, status: 'error', message: error.message }) }
    finally { await context.close(); await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2) + '\n') }
  }
  for (const [category] of categories.filter(([key]) => process.env.LISTING_DIAGNOSTIC_MODE !== 'sale' && (!process.env.LISTING_DIAGNOSTIC_CATEGORY || key === process.env.LISTING_DIAGNOSTIC_CATEGORY))) {
    console.log(`Browser: ${category} rental`)
    const { context, page } = await contextPage()
    try {
      await page.goto(fixture.origin + '/agent/rentals/listings/new', { waitUntil: 'domcontentloaded' })
      await page.getByRole('group', { name: 'Property category' }).waitFor()
      if (category === 'mixed_use') {
        const count = await page.getByRole('button', { name: /Mixed.use/i }).count()
        check('[UX-04] mixed_use/rental creation is offered', () => assert.ok(count > 0))
        // Do not bypass a missing category and describe that as a successful creation.
        if (!count) continue
      }
      const { form } = listingCase(category, 'rental')
      form.galleryImages = [1, 2, 3].map(i => ({ id: `image-${i}`, url: `https://fixture.invalid/photo${i}.png`, name: `photo${i}.png` }))
      if (category === 'mixed_use') {
        // Exercise normal creation: no injected draft and no seeded listing.
        await page.getByRole('button', { name: /Mixed.use/i }).click()
        await page.getByRole('button', { name: /Step .*Where to advertise/ }).click()
        await page.getByRole('button', { name: 'Property24', exact: true }).click()
        await page.getByRole('button', { name: 'Private Property', exact: true }).click()
        await page.getByRole('button', { name: /Step .*Property details/ }).click()
        await page.getByRole('combobox', { name: /Property address/ }).fill(form.propertyAddress)
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByRole('button', { name: 'Edit street number', exact: true }).click()
        await page.waitForFunction(() => document.activeElement?.name === 'streetNumber')
        const correctionVisible = await page.getByText('Add the street number in Address details.', { exact: false }).count()
        check('[UX-09] rental correction opens address details and retains the issue', () => assert.equal(correctionVisible, 1))
        for (const name of ['streetNumber', 'streetName', 'suburb', 'city', 'province']) await page.locator(`[name="${name}"]`).fill(form[name])
        await page.getByRole('spinbutton', { name: 'Land size (m²)', exact: true }).fill('500.5')
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByRole('heading', { name: 'Extra details (optional)', exact: true }).waitFor()
        const extrasText = await page.locator('body').innerText()
        check('[UX-08] rental extras offer a clear optional skip without unanswered totals', () => { assert.match(extrasText, /You can skip this step/); assert.doesNotMatch(extrasText, /\d+ of \d+ answered/) })
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByLabel('Rental amount', { exact: true }).fill('12500.75')
        await page.getByRole('combobox', { name: 'Deposit policy', exact: true }).selectOption('no_deposit')
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        await page.getByLabel('Listing title', { exact: true }).fill(form.title)
        await page.getByRole('textbox', { name: 'Listing description', exact: true }).fill(form.description)
        const photo = await (await page.request.get(fixture.origin + '/fixture/photo.png')).body()
        await page.locator('input[name="galleryImages"]').setInputFiles([1, 2, 3].map(i => ({ name: `photo${i}.png`, mimeType: 'image/png', buffer: photo })))
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
      } else {
        await page.goto(fixture.origin + '/fixture/blank')
        await page.evaluate(async ({ form, actor, org }) => {
          const { buildRentalListingDraftStorageKey, resolveRentalWorkspaceScope } = await import('/src/services/rentals/rentalWorkspaceScope.js')
          const key = buildRentalListingDraftStorageKey(resolveRentalWorkspaceScope({ currentWorkspace: { id: org }, profile: { id: actor }, workspaceRole: 'principal' }))
          const { saveListingRecoveryDraft } = await import('/src/services/listings/listingDraftRecovery.js')
          localStorage.setItem(key, JSON.stringify({ activeStep: 'syndication', form }))
          await saveListingRecoveryDraft(key, { form, recovery: { activeStep: 'syndication' }, photoField: 'galleryImages' })
        }, { form, actor: fixture.actor, org: fixture.org })
        await page.goto(fixture.origin + '/agent/rentals/listings/new', { waitUntil: 'domcontentloaded' })
      }
      if (category === 'residential') {
        await page.getByRole('button', { name: 'Step 1: Property details', exact: true }).click()
        await page.getByRole('button', { name: 'Studio? Set bedrooms to 0' }).click()
        await page.getByRole('spinbutton', { name: 'Bathrooms', exact: true }).fill('1.5')
        await page.getByRole('button', { name: 'Step 5: Where to advertise', exact: true }).click()
      }
      await page.getByRole('heading', { name: 'Where to advertise', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Continue', exact: true }).waitFor()
      const before = fixture.events.length
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      // Navigation click must finish without beginning a save. The observation
      // window catches the native default-submit action and asynchronous request.
      await page.waitForTimeout(800)
      const writes = fixture.events.slice(before).filter(event => ['create', 'queue'].includes(event.kind))
      check(`[UX-01] ${category}/rental Continue does not save or publish`, () => assert.equal(writes.length, 0, JSON.stringify(writes.map(row => row.kind))))
      await writeFile(resolve(out, `${category}-rental.txt`), await page.locator('body').ariaSnapshot())
      const review = page.locator('[aria-label="Listing review details"]')
      const reviewValue = async label => review.locator('dt', { hasText: new RegExp('^' + label + '$') }).evaluate(node => node.nextElementSibling.textContent)
      const description = await reviewValue('Description')
      const landSize = await reviewValue('Land size')
      check(`[UX-10] ${category}/rental review shows complete description and land size`, () => { assert.equal(description, form.description); assert.equal(landSize, '500.5 m²') })
      if (category === 'mixed_use') {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.screenshot({ path: resolve(out, 'mixed-use-rental-review-mobile.png'), fullPage: true })
        const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        check('[UX-10] rental review fits a narrow mobile screen', () => assert.ok(noOverflow))
      }

      await page.getByRole('button', { name: 'Save and publish', exact: true }).click()
      await page.getByRole('heading', { name: 'Fixture saved record' }).waitFor()
      const creations = fixture.events.slice(before).filter(event => event.kind === 'create')
      check(`[UX-01] ${category}/rental explicit submit creates one listing`, () => assert.equal(creations.length, 1))
      await page.getByRole('link', { name: 'Reopen editor' }).click()
      await page.getByRole('group', { name: 'Property category' }).waitFor()
      await page.waitForFunction(() => Boolean(document.querySelector('input[role="combobox"]')?.value))
      if (category === 'mixed_use') {
        const selected = await page.getByRole('button', { name: /Mixed.use/i }).getAttribute('aria-pressed')
        check('[UX-04] mixed_use/rental normal creation survives saved-record reopening', () => assert.equal(selected, 'true'))
      }
      if (category === 'residential') {
        const values = await Promise.all(['Bedrooms', 'Bathrooms'].map(name => page.getByRole('spinbutton', { name, exact: true }).inputValue()))
        check('[UX-06] rental studio zero and half bathroom survive database save and reopening', () => assert.deepEqual(values, ['0', '1.5']))
      }
      const beforeEdit = fixture.events.length
      await page.getByRole('button', { name: /Step.*Rent & deposit/ }).click()
      await page.getByLabel('Rental amount', { exact: true }).fill('13500.75')
      await page.getByRole('button', { name: /Step.*Check & save/ }).click()
      const warning = await page.getByText(/Saving here does not update your public adverts/).count()
      await page.getByRole('button', { name: 'Save rental changes', exact: true }).click()
      await page.getByRole('heading', { name: 'Fixture saved record' }).waitFor()
      check(`[UX-07] ${category}/rental edit clearly saves without sending`, () => { assert.ok(warning > 0); assert.equal(fixture.events.slice(beforeEdit).filter(row => row.kind === 'queue').length, 0) })
      await page.getByRole('link', { name: 'Reopen editor' }).click()
      await page.getByRole('button', { name: /Step.*Rent & deposit/ }).click()
      const rent = await page.getByLabel('Rental amount', { exact: true }).inputValue()
      check(`[UX-07] ${category}/rental saved rent survives reopening`, () => assert.equal(rent, '13500.75'))

    } catch (error) { console.error(category, error.message); await writeFile(resolve(out, `${category}-rental-error.txt`), await page.locator('body').ariaSnapshot().catch(() => 'Snapshot unavailable')); results.push({ name: `[HARNESS] ${category}/rental browser setup`, status: 'error', message: error.message }) }
    finally { await context.close(); await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2) + '\n') }
  }
} finally {
  await browser?.close()
  await fixture.close()
  await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  await writeFile(resolve(out, 'profile.json'), JSON.stringify(profileEvidence, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, errors: results.filter(r => r.status === 'error').length }))
process.exitCode = results.some(row => row.status !== 'passed') ? 1 : 0
