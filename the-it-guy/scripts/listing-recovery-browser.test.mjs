import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { startListingDiagnosticBrowserFixture } from './lib/listingDiagnosticBrowserFixture.mjs'
import { categories, listingCase } from './lib/listingDiagnosticCases.mjs'
import { buildRentalPrivateListingPayload } from '../src/services/rentals/rentalListingDraftModel.js'

const out = resolve(process.argv[2] || '../output/playwright/listing-recovery-browser')
await mkdir(out, { recursive: true })
const fixture = await startListingDiagnosticBrowserFixture(out, { realRentalDetail: process.argv[5] === 'publication' })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
 for (const [category, label] of categories.filter(([key]) => !process.argv[3] || process.argv[3].split(',').includes(key))) for (const kind of ['sale', 'rental'].filter(key => !process.argv[4] || key === process.argv[4])) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
   const url = new URL(route.request().url())
   return url.origin === fixture.origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort()
  })
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(180000)
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss())
   const errors = []; page.on('pageerror', error => errors.push(error.message))
  try {
   console.log(`Recovery: ${category}/${kind}`)
   const base = kind === 'sale' ? '/listings' : '/agent/rentals/listings'
   await page.goto(fixture.origin + base + '/new', { waitUntil: 'domcontentloaded' })
   const categoryLabel = kind === 'rental' ? ({ agricultural: 'Farm / agricultural', mixed_use: 'Mixed use', vacant_land: 'Vacant land' }[category] || label) : label
   await page.getByRole('button', { name: categoryLabel, exact: true }).click()
   const address = page.getByRole('combobox', { name: /Property address/i })
   await address.fill(`90 Latest ${category} Road`)
   await page.reload({ waitUntil: 'domcontentloaded' })
   await address.waitFor(); assert.equal(await address.inputValue(), `90 Latest ${category} Road`)
   results.push({ category, kind, check: 'immediate creation refresh retains last input', passed: true })
   if (process.argv[5] === 'acceptance') {
    // Exercise the same draft through recovery, a failed upload and a confirmed
    // save. A fresh context must use the saved record, not device recovery.
    const start = fixture.events.length
    await page.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change photos and description', exact: true }).click()
    const photo = await (await page.request.get(fixture.origin + '/fixture/photo.png')).body()
    const photoField = kind === 'sale' ? 'listingImages' : 'galleryImages'
    await page.locator(`input[name="${photoField}"]`).setInputFiles({ name: 'recovered.png', mimeType: 'image/png', buffer: photo })
    await page.getByRole('complementary', { name: 'Draft advert preview' }).getByAltText('Selected cover photo').waitFor()
    await page.getByText(/Photos are still saving for recovery/).waitFor({ state: 'hidden' })
    await context.setOffline(true)
    const description = page.getByRole('textbox', { name: 'Listing description', exact: true })
    await description.fill('Text entered while the connection was interrupted.')
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await page.getByText(/Could not confirm saving to Listings/).waitFor()
    assert.equal(fixture.events.slice(start).filter(row => ['create', 'queue'].includes(row.kind)).length, 0)
    await context.setOffline(false)
    results.push({ category, kind, check: 'offline saving gives no cloud success or publication claim and keeps the typed text', passed: true })
    await page.close()
    const recovered = await context.newPage()
    recovered.setDefaultTimeout(30000); recovered.setDefaultNavigationTimeout(180000)
    recovered.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss())
    recovered.on('pageerror', error => errors.push(error.message))
    try {
     await recovered.goto(fixture.origin + base + '/new', { waitUntil: 'domcontentloaded' })
     await recovered.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change photos and description', exact: true }).click()
     await recovered.getByRole('complementary', { name: 'Draft advert preview' }).getByAltText('Selected cover photo').waitFor()
     assert.equal(await recovered.getByRole('textbox', { name: 'Listing description', exact: true }).inputValue(), 'Text entered while the connection was interrupted.')
     assert.equal(fixture.events.slice(start).filter(row => ['create', 'queue'].includes(row.kind)).length, 0)
     results.push({ category, kind, check: 'closing the tab restores the unsaved photo without creating or publishing a listing', passed: true })
     await recovered.request.post(fixture.origin + '/fixture/failure', { data: { value: 'upload' } })
     await recovered.getByRole('button', { name: 'Save draft', exact: true }).click()
     await recovered.getByText(/Could not confirm saving to Listings/).waitFor()
     const created = fixture.events.slice(start).find(row => row.kind === 'create')
     assert.ok(created)
     const id = created.body.options.creationId || created.body.options.rentalCreationId
     const read = async () => (await (await recovered.request.post(fixture.origin + '/fixture/read', { data: { id } })).json()).data
     assert.equal(fixture.events.slice(start).filter(row => row.kind === 'queue').length, 0)
     results.push({ category, kind, check: 'interrupted photo upload reports an unconfirmed save and never publishes the partial draft', passed: true })
     await recovered.reload({ waitUntil: 'domcontentloaded' })
     await recovered.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change property details', exact: true }).click()
     const recoveredAddress = recovered.getByRole('combobox', { name: /Property address/i })
     await recoveredAddress.waitFor()
     assert.equal(await recoveredAddress.inputValue(), `90 Latest ${category} Road`)
     await recovered.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change photos and description', exact: true }).click()
     await recovered.getByRole('complementary', { name: 'Draft advert preview' }).getByAltText('Selected cover photo').waitFor()
     await recovered.getByRole('button', { name: 'Save draft', exact: true }).click()
     if (kind === 'sale') await recovered.waitForURL(new RegExp('/listings/' + id + '/edit'))
     else await recovered.getByText(/^Saved to Listings at/).waitFor()
     await recovered.waitForFunction(() => !document.querySelector('.listing-capture-actions button')?.disabled)
     const saved = await read()
     assert.equal(saved.id, id)
     assert.equal(saved.listingMedia.length, 1)
     assert.ok(saved.listingMedia[0].file_url.startsWith('https://'))
     assert.notEqual(saved.listingStatus, 'active')
     assert.equal(fixture.events.slice(start).filter(row => row.kind === 'create').length, 1)
     assert.equal(fixture.events.slice(start).filter(row => row.kind === 'queue').length, 0)
     results.push({ category, kind, check: 'refresh and retry upload save the same private listing with its photo and no duplicate', passed: true })
     const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
     await fresh.route('**/*', route => {
      const url = new URL(route.request().url())
      return url.origin === fixture.origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort()
     })
     try {
      const reopened = await fresh.newPage()
      reopened.setDefaultTimeout(30000); reopened.setDefaultNavigationTimeout(180000)
      reopened.on('pageerror', error => errors.push(error.message))
      await reopened.goto(fixture.origin + base + '/' + id + '/edit?step=property&scope=property', { waitUntil: 'domcontentloaded' })
      const newAddress = reopened.getByRole('combobox', { name: /Property address/i })
      await newAddress.waitFor()
      assert.equal(await newAddress.inputValue(), `90 Latest ${category} Road`)
      await reopened.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change photos and description', exact: true }).click()
      await reopened.getByRole('complementary', { name: 'Draft advert preview' }).getByAltText('Selected cover photo').waitFor()
      assert.equal(await reopened.getByRole('textbox', { name: 'Listing description', exact: true }).inputValue(), 'Text entered while the connection was interrupted.')
      results.push({ category, kind, check: 'a separate browser restores confirmed text and photos from Listings without device recovery', passed: true })
      await recovered.goto(fixture.origin + base + '/' + id + '/edit?step=property&scope=property', { waitUntil: 'domcontentloaded' })
      await recovered.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change property details', exact: true }).click()
      await recoveredAddress.waitFor()
      await recoveredAddress.fill(`91 Local ${category} Road`)
      const before = await read()
      await recovered.request.post(fixture.origin + '/fixture/update', { data: { id, payload: { title: 'Newer saved property title' } } })
      await recovered.reload({ waitUntil: 'domcontentloaded' })
      await recovered.getByText(/The saved listing changed after you started this draft/).waitFor()
      await recovered.getByRole('button', { name: 'Review my draft changes', exact: true }).click()
      assert.equal(await recoveredAddress.inputValue(), `91 Local ${category} Road`)
      const after = await read()
      assert.equal(after.title, 'Newer saved property title')
      assert.equal(after.addressLine1, before.addressLine1)
      assert.equal(fixture.events.slice(start).filter(row => row.kind === 'queue').length, 0)
      results.push({ category, kind, check: 'newer saved edits require conflict review and preserve both local input and the remote record without writing', passed: true })
      await recovered.screenshot({ path: resolve(out, category + '-' + kind + '-acceptance.png') })
     } finally { await fresh.close() }
     assert.deepEqual(errors, [])
    } catch (error) {
     await writeFile(resolve(out, category + '-' + kind + '-acceptance-error.txt'), await recovered.locator('body').ariaSnapshot().catch(() => 'No snapshot'))
     throw error
    } finally { await recovered.close() }
    continue
   }
   if (process.argv[5] === 'publication') {
    const source = listingCase(category, kind)
    const galleryImages = [1, 2, 3].map(i => ({ id: `saved-${i}`, url: `https://fixture.invalid/photo.png?id=${i}`, name: `photo${i}.png` }))
    const start = fixture.events.length
    const fail = value => page.request.post(fixture.origin + '/fixture/failure', { data: { value } })
    const rentalDraft = async () => {
     await page.goto(fixture.origin + '/fixture/blank')
     await page.evaluate(async ({ form, actor, org }) => {
      const { buildRentalListingDraftStorageKey, resolveRentalWorkspaceScope } = await import('/src/services/rentals/rentalWorkspaceScope.js')
      const { saveListingRecoveryDraft } = await import('/src/services/listings/listingDraftRecovery.js')
      const key = buildRentalListingDraftStorageKey(resolveRentalWorkspaceScope({ currentWorkspace: { id: org }, profile: { id: actor }, workspaceRole: 'principal' }))
      localStorage.setItem(key, JSON.stringify({ activeStep: 'review', form }))
      await saveListingRecoveryDraft(key, { form, recovery: { activeStep: 'review' }, photoField: 'galleryImages' })
     }, { form: { ...source.form, galleryImages, selectedSyndicationChannels: ['property24', 'private_property', 'agency_website'] }, actor: fixture.actor, org: fixture.org })
     await page.goto(fixture.origin + '/agent/rentals/listings/new', { waitUntil: 'domcontentloaded' })
    }
    let id
    if (kind === 'rental') await rentalDraft()
    else {
     id = randomUUID()
     const propertyType = source.form.propertyType.toLowerCase().replaceAll(' ', '_')
     const payload = {
      title: category.replaceAll('_', ' ') + ' result diagnostic', listingCategory: 'private_sale', listingStatus: 'active', organisationId: fixture.org, assignedAgentId: fixture.actor,
      propertyCategory: category, propertyType, propertyStructureType: 'freehold', askingPrice: 1250000,
      addressLine1: '10 Diagnostic Road', streetNumber: '10', streetName: 'Diagnostic Road', suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng', country: 'South Africa', description: source.form.description,
      propertyDetails: { ...source.form, propertyType, price: 1250000, galleryImages, propertyStructureType: 'freehold', selectedSyndicationChannels: ['property24', 'private_property', 'agency_website'] },
      sellerCanonicalFacts: { distribution: { selectedChannels: ['property24', 'private_property', 'agency_website'] } },
     }
     const seed = await page.request.post(fixture.origin + '/fixture/create', { data: { payload, options: { creationId: id } } })
     assert.equal((await seed.json()).error, null)
     await page.goto(fixture.origin + `/listings/${id}/edit?step=property&scope=listing-publication`, { waitUntil: 'domcontentloaded' })
     for (const channel of ['Property24', 'Private Property', 'Website']) await page.getByRole('checkbox', { name: channel === 'Website' ? /website/i : channel, exact: true }).check()
     await page.getByRole('button', { name: /Step 4: Check/ }).click()
    }
    await fail('private_property')
    await page.getByRole('button', { name: kind === 'sale' ? 'Save and publish changes' : 'Save and publish', exact: true }).click()
    const summary = page.getByRole('region', { name: 'Saved listing and advertising' })
    await summary.getByRole('button', { name: 'Retry failed channels', exact: true }).waitFor()
    const requests = fixture.events.slice(start).filter(row => row.kind === 'queue')
    assert.equal(requests.length, 1)
    assert.deepEqual([...requests[0].body.channels].sort(), ['agency_website', 'private_property', 'property24'])
    id = requests[0].body.listingId
    assert.equal((await (await page.request.post(fixture.origin + '/fixture/read', { data: { id } })).json()).data.id, id)
    assert.equal(await summary.getByText(/Check the public advert before treating it as live/).count(), 2)
    results.push({ category, kind, check: 'verified save retains the property and exposes partial website failures without claiming accepted requests are live', passed: true })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await summary.getByRole('button', { name: 'Retry failed channels', exact: true }).waitFor()
    assert.equal(await summary.getByText(/Successful channels will not be resent/).count(), 1)
    results.push({ category, kind, check: 'partial results reload from durable receipts', passed: true })
    await fail('')
    await summary.getByRole('button', { name: 'Retry failed channels', exact: true }).click()
    await summary.getByRole('button', { name: 'Retry failed channels', exact: true }).waitFor({ state: 'hidden' })
    const retry = fixture.events.slice(start).filter(row => row.kind === 'queue').at(-1)
    assert.equal(retry.body.listingId, id)
    assert.deepEqual(retry.body.channels, ['private_property'])
    assert.equal(fixture.events.slice(start).filter(row => row.kind === 'create').length, 1)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await summary.getByText(/Check the public advert before treating it as live/).first().waitFor()
    assert.equal(await summary.getByText(/Check the public advert before treating it as live/).count(), 3)
    results.push({ category, kind, check: 'retry resends only the confirmed failed destination and keeps successful receipts and the same property', passed: true })
    await summary.screenshot({ path: resolve(out, category + '-' + kind + '-results-desktop.png') })
    await page.setViewportSize({ width: 390, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    results.push({ category, kind, check: 'saved result and actions fit a narrow screen', passed: true })
    await page.setViewportSize({ width: 1280, height: 900 })
    const lostStart = fixture.events.length
    if (kind === 'rental') await rentalDraft()
    else {
     await page.getByRole('button', { name: 'Step 2: Photos & description', exact: true }).click()
     await page.locator('[name="listingDescription"]').fill('Updated saved description for lost-response check.')
     await page.getByRole('button', { name: /Step 4: Check/ }).click()
    }
    await fail('queue-response')
    await page.getByRole('button', { name: kind === 'sale' ? 'Save and publish changes' : 'Save and publish', exact: true }).click()
    await summary.getByText(/An unconfirmed request will not be retried/).waitFor()
    assert.equal(await summary.getByRole('button', { name: 'Retry failed channels', exact: true }).count(), 0)
    assert.equal(await page.getByText(/Could not confirm saving to Listings/).count(), 0)
    const lostRequest = fixture.events.slice(lostStart).find(row => row.kind === 'queue')
    assert.ok(lostRequest)
    assert.equal(fixture.events.slice(lostStart).filter(row => row.kind === 'create').length, kind === 'rental' ? 1 : 0)
    await summary.screenshot({ path: resolve(out, category + '-' + kind + '-unconfirmed-desktop.png') })
    results.push({ category, kind, check: 'lost publishing response remains a saved listing with no unsafe retry or false save failure', passed: true })
    const lostJobs = (await (await page.request.post(fixture.origin + '/fixture/jobs', { data: { id: lostRequest.body.listingId } })).json()).data
    await page.request.post(fixture.origin + '/fixture/seed-jobs', { data: { id: lostRequest.body.listingId, jobs: lostJobs.map(job => ({ ...job, state: 'accepted' })) } })
    await summary.getByRole('button', { name: 'Check status', exact: true }).click()
    await summary.getByText(/An unconfirmed request will not be retried/).waitFor({ state: 'hidden' })
    assert.equal(fixture.events.slice(lostStart).filter(row => row.kind === 'queue').length, 1)
    assert.equal(await summary.getByText(/Check the public advert before treating it as live/).count(), 3)
    results.push({ category, kind, check: 'checking the lost response finds accepted receipts without resubmission or duplication', passed: true })
    assert.deepEqual(errors, [])
    continue
   }
   if (process.argv[5] === 'completion') {
    const checklist = page.getByRole('region', { name: 'Listing completion checklist' })
    await checklist.getByText('No websites selected. This listing will stay private.').waitFor()
    results.push({ category, kind, check: 'incomplete private draft has no website blockers', passed: true })
    const start = fixture.events.length
    for (const channel of ['Property24', 'Private Property', 'Website']) await page.getByRole('checkbox', { name: channel === 'Website' ? /website/i : channel, exact: true }).check()
    for (const channel of ['Property24', 'Private Property', 'Website']) await checklist.getByText(new RegExp('^' + channel + ': [1-9]')).waitFor()
    await checklist.locator('summary').click()
    await checklist.screenshot({ path: resolve(out, category + '-' + kind + '-desktop-checklist.png') })
    assert.equal(await checklist.getByRole('button', { name: 'Edit photos', exact: true }).count(), 1)
    assert.equal(await checklist.getByRole('button', { name: kind === 'sale' ? 'Edit price' : 'Edit rent', exact: true }).count(), 1)
    results.push({ category, kind, check: 'selected websites share one correction per field with individual counts', passed: true })
    if (kind === 'sale') await checklist.getByRole('button', { name: 'Edit price', exact: true }).click()
    else await checklist.getByRole('button', { name: 'Edit rent', exact: true }).click()
    const priceName = kind === 'sale' ? 'listingPrice' : 'monthlyRent'
    await page.waitForFunction(name => document.activeElement?.name === name, priceName)
    await page.locator('[name="' + priceName + '"]').fill(kind === 'sale' ? '1250000' : '12500')
    await checklist.getByRole('button', { name: kind === 'sale' ? 'Edit price' : 'Edit rent', exact: true }).waitFor({ state: 'hidden' })
    results.push({ category, kind, check: 'price correction focuses exact field and disappears once fixed', passed: true })
    await checklist.getByRole('button', { name: 'Edit street number', exact: true }).click()
    await page.waitForFunction(() => document.activeElement?.name === 'streetNumber')
    assert.equal(await page.locator('[name="streetNumber"]').evaluate(node => node.closest('details').open), true)
    results.push({ category, kind, check: 'address correction opens collapsed details and focuses street number', passed: true })
    await checklist.getByRole('button', { name: 'Edit photos', exact: true }).click()
    await page.waitForFunction(name => document.activeElement?.name === name, kind === 'sale' ? 'listingImages' : 'galleryImages')
    assert.equal(fixture.events.slice(start).filter(event => ['create', 'update', 'onboarding', 'queue'].includes(event.kind)).length, 0)
    results.push({ category, kind, check: 'future-section photo correction focuses upload without saving or publishing', passed: true })
    await page.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change property details', exact: true }).click()
    for (const channel of ['Property24', 'Private Property', 'Website']) await page.getByRole('checkbox', { name: channel === 'Website' ? /website/i : channel, exact: true }).uncheck()
    await checklist.getByText('No websites selected. This listing will stay private.').waitFor()
    assert.equal(await checklist.getByRole('button', { name: 'Edit photos', exact: true }).count(), 0)
    assert.equal(await checklist.locator('details').count(), 0)
    results.push({ category, kind, check: 'removing destinations immediately removes their requirements', passed: true })
    if (kind === 'rental') {
     await page.getByRole('complementary', { name: 'Draft advert preview' }).getByRole('button', { name: 'Change rent', exact: true }).click()
     await page.locator('[name="monthlyRent"]').fill('-1')
     await checklist.getByText('1 field to finish', { exact: true }).waitFor()
     await checklist.getByRole('button', { name: 'Edit rent', exact: true }).waitFor()
     await page.locator('[name="monthlyRent"]').fill('12500')
     await checklist.getByText('Listing details ready', { exact: true }).waitFor()
     assert.equal(fixture.events.slice(start).filter(event => ['create', 'update', 'onboarding', 'queue'].includes(event.kind)).length, 0)
     results.push({ category, kind, check: 'invalid private rental amount has a correction and becomes ready only when fixed', passed: true })
    }
    await page.setViewportSize({ width: 390, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    results.push({ category, kind, check: 'completion summary fits narrow screens', passed: true })
    await page.screenshot({ path: resolve(out, category + '-' + kind + '-completion.png') })
    assert.deepEqual(errors, [])
    continue
   }
   if (process.argv[5] === 'capture') {
    // Match the application's viewport-height .ui-page-scroll container.
    await page.evaluate(() => Object.assign(document.getElementById('root').style, { height: '100dvh', overflowY: 'auto' }))
    const preview = page.getByRole('complementary', { name: 'Draft advert preview' })
    await preview.getByRole('heading', { name: 'Draft advert preview' }).waitFor()
    const fieldsBox = await page.locator('.listing-capture-fields').boundingBox()
    const previewBox = await preview.boundingBox()
    assert.ok(previewBox.x >= fieldsBox.x + fieldsBox.width, 'Wide desktop must put the preview beside the form')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    results.push({ category, kind, check: 'wide desktop has side-by-side capture and preview without overflow', passed: true })
    if (['commercial', 'industrial', 'retail'].includes(category)) {
     const rooms = page.locator('details[data-listing-rooms]')
     assert.equal(await rooms.getAttribute('open'), null)
     assert.equal(await page.getByRole(kind === 'sale' ? 'textbox' : 'spinbutton', { name: 'Bedrooms', exact: true }).count(), 0)
    }
    if (category === 'vacant_land') assert.equal(await page.getByRole(kind === 'sale' ? 'textbox' : 'spinbutton', { name: /Floor size/ }).count(), 0)
    results.push({ category, kind, check: 'irrelevant rooms and land floor-size controls do not dominate capture', passed: true })
    const start = fixture.events.length
    await preview.getByRole('button', { name: kind === 'sale' ? 'Change price' : 'Change rent', exact: true }).click()
    if (kind === 'sale') await page.locator('[name="listingPrice"]').fill('1250000')
    else {
     await page.getByLabel('Rental amount', { exact: true }).fill('12500.75')
     await page.getByRole('combobox', { name: 'How is rent charged?', exact: true }).selectOption('weekly')
    }
    await preview.getByText(kind === 'sale' ? 'R 1 250 000' : 'R 12 500,75 per week', { exact: true }).waitFor()
    results.push({ category, kind, check: 'preview updates current price with clear sale or rental units', passed: true })
    await preview.getByRole('button', { name: 'Change photos and description', exact: true }).click()
    const description = page.getByRole('textbox', { name: 'Listing description', exact: true })
    await description.fill('Current unsaved description for ' + category)
    await preview.getByText('Current unsaved description for ' + category, { exact: true }).waitFor()
    const photo = await (await page.request.get(fixture.origin + '/fixture/photo.png')).body()
    await page.locator('input[name="' + (kind === 'sale' ? 'listingImages' : 'galleryImages') + '"]').setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer: photo })
    await preview.getByAltText('Selected cover photo').waitFor()
    assert.equal(fixture.events.slice(start).filter(event => ['create', 'update', 'onboarding', 'queue'].includes(event.kind)).length, 0)
    assert.ok(!(await preview.innerText()).includes('90 Latest'), 'Private free-typed address must not leak into the preview')
    results.push({ category, kind, check: 'preview mirrors selected photos and unsaved description without writing or leaking hidden address', passed: true })
    const desktopFooter = await page.locator('.listing-capture-actions').boundingBox()
    assert.ok(desktopFooter && desktopFooter.y >= 0 && desktopFooter.y + desktopFooter.height <= 901, 'Desktop actions must stay visible during capture')
    await page.screenshot({ path: resolve(out, category + '-' + kind + '-desktop-preview.png') })
    for (const width of [1024, 390]) {
     await page.setViewportSize({ width, height: 900 })
     const toggle = preview.getByRole('button', { name: 'Show draft preview', exact: true })
     await toggle.waitFor()
     await toggle.click()
     await preview.getByText('Current unsaved description for ' + category, { exact: true }).waitFor()
     assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
     const footer = page.locator('.listing-capture-actions')
     await footer.scrollIntoViewIfNeeded()
     const box = await footer.boundingBox()
     assert.ok(box && box.y >= 0 && box.y + box.height <= 901, 'Navigation actions must remain usable in the viewport')
     if (width === 390) await page.screenshot({ path: resolve(out, category + '-' + kind + '-narrow-preview.png') })
     await preview.getByRole('button', { name: 'Hide draft preview', exact: true }).click()
     results.push({ category, kind, check: width + 'px preview expands and navigation remains usable without horizontal overflow', passed: true })
    }
    assert.deepEqual(errors, [])
    continue
   }
   if (process.argv[5] === 'progress') {
    const eventOffset = fixture.events.length
    await page.getByRole('checkbox', { name: 'Property24', exact: true }).check()
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    if (kind === 'sale') await page.waitForURL(/\/listings\/[^/]+\/edit/)
    else await page.getByText(/^Saved to Listings at/).waitFor()
    if (kind === 'sale') {
     await page.getByText(/^Saved to Listings at/).waitFor()
     assert.equal(await page.getByText('Your unsaved listing changes were restored on this device.', { exact: true }).count(), 0)
     assert.equal(await page.getByText(/Changes in this form have not been saved/).count(), 0)
    }
    const created = fixture.events.slice(eventOffset).find(event => event.kind === 'create')
    assert.ok(created, 'Save draft must create a durable record')
    const savedId = created.body.options.creationId || created.body.options.rentalCreationId
    const saved = (await (await page.request.post(fixture.origin + '/fixture/read', { data: { id: savedId } })).json()).data
    assert.ok(saved?.id)
    assert.notEqual(saved.listingStatus, 'active')
    assert.equal(saved.listingPublicationData?.status, 'Draft')
    assert.equal(fixture.events.slice(eventOffset).filter(event => event.kind === 'queue').length, 0)
    results.push({ category, kind, check: 'incomplete draft saved without activation or publishing', passed: true })
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
    try {
     await fresh.route('**/*', route => {
      const url = new URL(route.request().url())
      return url.origin === fixture.origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort()
     })
     const reopened = await fresh.newPage()
     await reopened.goto(fixture.origin + base + '/' + savedId + '/edit?step=property', { waitUntil: 'domcontentloaded' })
     const reopenedAddress = reopened.getByRole('combobox', { name: /Property address/i })
     await reopenedAddress.waitFor()
     assert.equal(await reopenedAddress.inputValue(), `90 Latest ${category} Road`)
     assert.equal(await reopened.getByRole('checkbox', { name: 'Property24', exact: true }).isChecked(), true)
     if (kind === 'rental') {
      assert.equal(await reopened.getByRole('heading', { name: 'Continue rental draft' }).count(), 1)
      await reopened.getByRole('button', { name: /Step.*Rent & deposit/ }).click()
      assert.equal(await reopened.getByLabel('Rental amount', { exact: true }).inputValue(), '')
      await reopened.getByRole('combobox', { name: 'Lease length', exact: true }).selectOption('month_to_month')
      assert.equal(await reopened.getByLabel('Number of months', { exact: true }).count(), 0)
      await reopened.getByRole('combobox', { name: 'Lease length', exact: true }).selectOption('fixed')
      await reopened.getByLabel('Number of months', { exact: true }).fill('18')
      await reopened.getByRole('button', { name: 'Save draft', exact: true }).click()
      await reopened.getByText(/^Saved to Listings at/).waitFor()
      await reopened.reload({ waitUntil: 'domcontentloaded' })
      await reopened.getByRole('button', { name: /Step.*Rent & deposit/ }).click()
      assert.equal(await reopened.getByLabel('Number of months', { exact: true }).inputValue(), '18')
      results.push({ category, kind, check: 'lease length uses one choice, hides irrelevant months and retains a custom 18-month private draft after reload', passed: true })
     }
     await reopened.screenshot({ path: resolve(out, category + '-' + kind + '-continued-draft.png') })
     results.push({ category, kind, check: 'draft resumes in a fresh browser with unanswered fields and advertising choices retained', passed: true })
    } finally { await fresh.close() }
    continue
   }
   const source = listingCase(category, kind); const id = randomUUID()
   const payload = kind === 'rental' ? buildRentalPrivateListingPayload(source.form, { organisationId: fixture.org, assignedAgentId: fixture.actor }) : {
    title: 'Recovery diagnostic listing', listingCategory: 'private_sale', listingStatus: 'draft', organisationId: fixture.org, assignedAgentId: fixture.actor,
    propertyCategory: category, propertyType: source.form.propertyType.toLowerCase().replaceAll(' ', '_'),
    addressLine1: '10 Saved Road', streetNumber: '10', streetName: 'Saved Road', suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng', country: 'South Africa',
    askingPrice: 1250000, description: 'Saved description', propertyDetails: { ...source.form, propertyAddress: '10 Saved Road', price: 1250000 }, sellerCanonicalFacts: {},
   }
   const seeded = await page.request.post(fixture.origin + '/fixture/create', { data: { payload, options: { creationId: id } } })
   assert.equal((await seeded.json()).error, null)
   const read = async () => (await (await page.request.post(fixture.origin + '/fixture/read', { data: { id } })).json()).data
   const before = await read()
   await page.goto(fixture.origin + base + '/' + id + '/edit?scope=property&step=property', { waitUntil: 'domcontentloaded' })
   await address.waitFor()
   await address.fill(`91 Recovered ${category} Road`)
   await page.reload({ waitUntil: 'domcontentloaded' })
   await address.waitFor(); assert.equal(await address.inputValue(), `91 Recovered ${category} Road`)
   const after = await read()
   assert.equal(after.updatedAt, before.updatedAt)
   assert.equal(after.addressLine1, before.addressLine1)
   results.push({ category, kind, check: 'edit draft reopens without a server write', passed: true })
   if (kind === 'sale') {
    await page.getByRole('button', { name: 'Step 2: Photos & description', exact: true }).click()
    await page.locator('[name="listingDescription"]').fill('')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Step 2: Photos & description', exact: true }).click()
    assert.equal(await page.locator('[name="listingDescription"]').inputValue(), '')
    results.push({ category, kind, check: 'deliberate description clear survives refresh', passed: true })
   }
   assert.deepEqual(errors, [])
  } catch (error) {
   results.push({ category, kind, check: 'browser recovery journey', passed: false, message: error.message })
   await writeFile(resolve(out, category + '-' + kind + '-error.txt'), await page.locator('body').ariaSnapshot().catch(() => 'No snapshot'))
   console.error(category, kind, error.message)
  } finally { await context.close(); await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2)) }
 }
} finally { await browser.close(); await fixture.close() }
const failed = results.filter(row => !row.passed)
console.log(`${results.length - failed.length} recovery checks passed; ${failed.length} failed`)
if (failed.length) process.exitCode = 1
