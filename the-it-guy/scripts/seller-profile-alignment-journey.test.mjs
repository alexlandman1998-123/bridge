import { buildCanonicalSellerOnboardingPayload, validateSellerOnboardingFacts } from '../src/services/documents/sellerOnboardingFactTransformer.js'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { buildListingSellerInformationModel } from '../src/services/listings/listingSellerInformationModel.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../output/playwright/seller-alignment/', import.meta.url)
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['scripts/fixtures/seller-alignment-browser-server.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let browser, serverLog = '', startup = '', baseUrl
const errors = [], consoleErrors = [], abortedRequests = [], externalRequests = [], report = []
server.stderr.on('data', chunk => { serverLog += chunk })
try {
  baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated browser server startup timed out')), 30000)
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Isolated server exited ${code}: ${serverLog}`)) })
    server.stdout.on('data', chunk => {
      startup += chunk
      const line = startup.split('\n').find(line => line.startsWith('{"url"'))
      if (line) { clearTimeout(timer); resolve(JSON.parse(line).url) }
    })
  })
  assert.equal(new URL(baseUrl).hostname, '127.0.0.1')
  const request = async (path, body) => (await fetch(`${baseUrl}/api/${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})).json()
  const control = (action, fields = {}) => request('control', { action, ...fields })
  const rpc = (name, params) => request('rpc', { name, params })
  const evidence = () => request('evidence')
  const revision = row => ({ onboardingId: row.id, updatedAt: row.updated_at })
  const record = (name, details = {}) => { report.push({ name, ...details }); console.log(`ok - ${name}`) }
  browser = await chromium.launch({ headless: true })
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1440, height: 1000 } }), browser.newContext({ viewport: { width: 1440, height: 1000 } })])
  for (const context of contexts) {
    await context.route('**/*', route => { const url = route.request().url(); if (url.startsWith(baseUrl) || /^(data|blob):/.test(url)) return route.continue(); externalRequests.push(url); return route.abort() })
    context.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) }); page.on('requestfailed', request => { if (request.failure()?.errorText === 'net::ERR_ABORTED') abortedRequests.push(request.url()) }) })
  }
  const [agent, seller] = await Promise.all(contexts.map(context => context.newPage()))
  async function open(page, view) {
    await page.goto(`${baseUrl}/?view=${view}`)
    if (view === 'transaction') {
      await page.getByRole('tab', { name: 'Seller', exact: true }).click()
      await page.getByRole('textbox', { name: 'Phone', exact: true }).waitFor()
      await page.waitForFunction(() => !document.querySelector('#deal-setup-seller input[type="tel"]')?.disabled)
    } else if (view === 'portal') {
      await page.getByRole('button', { name: /^(Start|Resume) seller onboarding$/ }).click()
      await page.getByRole('button', { name: 'Save Draft', exact: true }).waitFor()
    }
    else await page.getByRole('button', { name: 'Save seller profile', exact: true }).waitFor()
  }
  async function save(page, view, expectedError = false) {
    const name = view === 'transaction' ? 'bridge_save_transaction_seller_details' : view === 'portal' ? 'bridge_update_private_listing_seller_onboarding_progress' : 'save_private_listing_seller_canonical_update'
    const response = page.waitForResponse(response => response.url().endsWith('/api/rpc') && response.request().postDataJSON()?.name === name)
    await page.getByRole('button', { name: view === 'transaction' ? 'Save seller details' : view === 'portal' ? 'Save Draft' : 'Save seller profile', exact: true }).click()
    const result = await (await response).json()
    assert.equal(Boolean(result.error), expectedError, JSON.stringify(result.error))
    if (expectedError) await page.getByRole('alert').first().waitFor()
    return result
  }
  await open(agent, 'lead')
  await agent.getByRole('combobox', { name: /^Legal owner type/ }).selectOption('individual')
  for (const [name, value] of [['First name', 'Sam'], ['Surname', 'Seller'], ['ID number', '8001015009087'], ['Phone', 'lead-phone'], ['Residential address', '1 Home Road'], ['Income tax number', 'LOCAL-TAX']]) await agent.getByRole('textbox', { name, exact: true }).fill(value)
  await save(agent, 'lead')
  let state = await evidence()
  assert.equal(state.onboarding.form_data.phone, 'lead-phone')
  assert.equal(state.onboarding.form_data.otherSavedFact, 'keep')
  record('lead profile service save preserves unrelated seller data')

  await open(agent, 'listing')
  assert.equal(await agent.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), 'lead-phone')
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('listing-phone')
  await agent.getByRole('textbox', { name: 'Residential address', exact: true }).fill('2 Home Road')
  await save(agent, 'listing')
  await open(agent, 'transaction')
  assert.equal(await agent.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), 'listing-phone')
  assert.equal(await agent.getByRole('textbox', { name: 'Seller name', exact: true }).inputValue(), 'Sam Seller')
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('transaction-phone')
  await save(agent, 'transaction')
  state = await evidence()
  assert.equal(state.transactions[0].seller_phone, 'transaction-phone')
  assert.equal(state.participants[0].participant_phone, 'transaction-phone')
  assert.equal(state.onboarding.form_data.phone, 'transaction-phone')
  assert.equal(state.forms[0].form_data.__bridge_transaction_parties.seller.people[0].identityNumber, 'saved-id')
  record('listing reopen and transaction save read the same authority and persist contact projections')

  await open(seller, 'portal')
  const portalPhone = seller.getByRole('textbox', { name: 'Phone', exact: true })
  assert.equal(await portalPhone.inputValue(), 'transaction-phone')
  await portalPhone.fill('seller-phone')
  await save(seller, 'portal')
  state = await evidence()
  assert.equal(state.onboarding.form_data.phone, 'seller-phone')
  await open(agent, 'lead')
  assert.equal(await agent.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), 'seller-phone')
  record('real seller intake draft saves back to the lead and listing profile')

  await open(agent, 'transaction')
  await portalPhone.fill('seller-wins')
  await save(seller, 'portal')
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('agent-draft-kept')
  const conflict = await save(agent, 'transaction', true)
  assert.equal(conflict.error.code, 'PT409')
  assert.equal(await agent.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), 'agent-draft-kept')
  assert.equal((await evidence()).onboarding.form_data.phone, 'seller-wins')
  await agent.screenshot({ path: fileURLToPath(new URL('retained-transaction-draft.png', output)), fullPage: true })
  record('independent seller session wins; stale transaction draft remains visible without overwriting it')

  await open(agent, 'listing')
  await open(seller, 'portal')
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('agent-wins')
  await save(agent, 'listing')
  await seller.getByRole('textbox', { name: 'Phone', exact: true }).fill('seller-draft-kept')
  const sellerConflict = await save(seller, 'portal', true)
  assert.equal(sellerConflict.error.code, 'PT409')
  assert.equal(await seller.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), 'seller-draft-kept')
  assert.equal((await evidence()).onboarding.form_data.phone, 'agent-wins')
  record('agent session wins; stale seller intake retains its draft')

  await open(agent, 'transaction')
  const beforeFailure = await evidence()
  await control('reject-projection')
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('rejected-phone')
  await save(agent, 'transaction', true)
  const afterFailure = await evidence()
  for (const key of ['onboarding', 'listing', 'transactions', 'participants', 'forms', 'receipts']) assert.deepEqual(afterFailure[key], beforeFailure[key], `Rollback must preserve ${key}`)
  assert.equal(await agent.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), 'rejected-phone')
  await control('allow-projection')
  await save(agent, 'transaction')
  record('projection failure rolls back every seller record; retry succeeds with the retained draft')

  await control('lose-next-confirmation')
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('receipt-phone')
  await save(agent, 'transaction', true)
  state = await evidence()
  assert.equal(state.onboarding.form_data.phone, 'receipt-phone')
  const originalMutation = state.requests.filter(row => row.name === 'bridge_save_transaction_seller_details').at(-1).params.p_mutation_id
  await open(seller, 'portal')
  await seller.getByRole('textbox', { name: 'Phone', exact: true }).fill('later-seller-phone')
  await save(seller, 'portal')
  await save(agent, 'transaction')
  state = await evidence()
  assert.equal(state.requests.filter(row => row.name === 'bridge_save_transaction_seller_details').at(-1).params.p_mutation_id, originalMutation)
  assert.equal(state.onboarding.form_data.phone, 'later-seller-phone')
  record('lost confirmation retry reuses the exact receipt without overwriting a subsequent seller save')

  await open(agent, 'transaction')
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('')
  await save(agent, 'transaction')
  await open(agent, 'listing')
  assert.equal(await agent.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), '')
  assert.equal(String((await evidence()).participants[0].participant_phone ?? ''), '')
  record('explicit blank clears the shared contact instead of reviving a stale fallback')

  state = await evidence()
  const staleSubmission = state.onboarding
  await agent.getByRole('textbox', { name: 'Phone', exact: true }).fill('post-capture-phone')
  await save(agent, 'listing')
  let result = await rpc('bridge_complete_private_listing_seller_onboarding', { p_token: 'token-a', p_form_data: { ...staleSubmission.form_data, __sellerSave: revision(staleSubmission) } })
  assert.equal(result.error.code, 'PT409')
  state = await evidence()
  result = await rpc('bridge_complete_private_listing_seller_onboarding', { p_token: 'token-a', p_form_data: { ...state.onboarding.form_data, __sellerSave: revision(state.onboarding) } })
  assert.equal(result.error, null)
  const completed = await evidence()
  result = await rpc('bridge_update_private_listing_seller_onboarding_progress', { p_token: 'token-a', p_form_data: { phone: 'late-draft', __sellerSave: revision(completed.onboarding) } })
  assert.equal(result.error.code, 'PT409')
  result = await rpc('save_private_listing_seller_onboarding_profile', { p_listing_id: state.listing.id, p_token: 'token-a', p_form_data: completed.onboarding.form_data, p_revision: revision(completed.onboarding), p_status: 'in_progress', p_seller_type: null, p_ownership_structure: null, p_marital_regime: null, p_reopen_for_correction: true })
  assert.equal(result.error, null)
  await open(seller, 'portal')
  await seller.getByRole('textbox', { name: 'Phone', exact: true }).fill('corrected-seller-phone')
  await save(seller, 'portal')
  assert.equal((await evidence()).onboarding.form_data.phone, 'corrected-seller-phone')
  record('SQL submission rejects stale and late drafts; explicit staff reopening permits a browser correction')


  await open(seller, 'portal')
  await control('delay-progress', { milliseconds: 1000 })
  await seller.getByRole('textbox', { name: 'Phone', exact: true }).fill('delayed-first')
  const firstResponse = seller.waitForResponse(response => response.url().endsWith('/api/rpc') && response.request().postDataJSON()?.name === 'bridge_update_private_listing_seller_onboarding_progress')
  await seller.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await seller.getByRole('textbox', { name: 'Phone', exact: true }).fill('delayed-second')
  const firstSaved = await (await firstResponse).json()
  assert.equal(firstSaved.error, null)
  assert.equal(await seller.getByRole('textbox', { name: 'Phone', exact: true }).inputValue(), 'delayed-second')
  await seller.getByRole('button', { name: 'Save Draft', exact: true }).waitFor()
  await save(seller, 'portal')
  await control('delay-progress', { milliseconds: 0 })
  state = await evidence()
  const progressSaves = state.requests.filter(row => row.name === 'bridge_update_private_listing_seller_onboarding_progress' && row.outcome === 'committed')
  assert.equal(progressSaves.at(-1).params.p_form_data.__sellerSave.updatedAt, firstSaved.data.onboarding.updated_at)
  assert.equal(state.onboarding.form_data.phone, 'delayed-second')
  record('a delayed intake save retains newer input and the next save uses its confirmed revision')

  for (const branch of ['company', 'trust', 'married', 'multiple_owners', 'power_of_attorney']) {
    await open(agent, 'listing')
    await agent.getByRole('combobox', { name: /^Legal owner type/ }).selectOption(branch)
    const fields = branch === 'company' ? [['Company / CC name', 'Local Company'], ['Registration number', 'CO-REG'], ['Authorised signatory', 'Dana Director'], ['Signatory email', 'dana@example.test'], ['Signatory ID / passport', 'DIRECTOR-ID'], ['Signatory residential address', 'Director Home']] : branch === 'trust' ? [['Trust name', 'Local Trust'], ['Trust registration number', 'TRUST-REG'], ['Authorised trustee', 'Terry Trustee'], ['Trustee email', 'terry@example.test'], ['Authorised trustee ID / passport', 'TRUSTEE-ID'], ['Authorised trustee residential address', 'Trustee Home']] : branch === 'married' ? [['First name', 'Sam'], ['Surname', 'Seller'], ['Spouse full name', 'Alex Spouse'], ['Spouse ID number', 'SPOUSE-ID'], ['Spouse email', 'spouse@example.test']] : branch === 'power_of_attorney' ? [['Legal owner / principal', 'Local Principal'], ['Principal ID number', 'PRINCIPAL-ID'], ['Authorised representative', 'Local Representative'], ['Representative email', 'representative@example.test']] : []
    for (const [name, value] of fields) await agent.getByRole('textbox', { name, exact: true }).fill(value)
    if (branch === 'married') await agent.getByRole('combobox', { name: 'Marriage regime', exact: true }).selectOption('in_community')
    const peopleKey = branch === 'company' ? 'companyDirectors' : branch === 'trust' ? 'trustees' : branch === 'multiple_owners' ? 'multipleOwners' : null
    if (peopleKey) {
      const title = branch === 'company' ? 'Directors / members' : branch === 'trust' ? 'Trustees' : 'Owners'
      const people = agent.getByRole('heading', { name: title, exact: true }).locator('..').locator('..')
      const count = branch === 'multiple_owners' ? 2 : 1
      while (await people.getByRole('textbox', { name: 'First name', exact: true }).count() < count) await people.getByRole('button', { name: 'Add', exact: true }).click()
      for (let index = 0; index < count; index++) {
        await people.getByRole('textbox', { name: 'First name', exact: true }).nth(index).fill(`${branch} Person ${index + 1}`)
        await people.getByRole('textbox', { name: 'Surname', exact: true }).nth(index).fill('Captured')
        await people.getByRole('textbox', { name: 'ID / passport', exact: true }).nth(index).fill(`LOCAL-PERSON-${index + 1}`)
        await people.getByRole('textbox', { name: 'Residential address', exact: true }).nth(index).fill(`Person Home ${index + 1}`)
      }
    }
    await save(agent, 'listing')
    state = await evidence()
    const model = buildListingSellerInformationModel(state.listing)
    const personIds = peopleKey ? model.draft[peopleKey].map(person => person.id) : []
    assert.equal(new Set(personIds).size, personIds.length)
    assert.ok(personIds.every(Boolean))
    await open(agent, 'lead')
    assert.equal(await agent.getByRole('combobox', { name: /^Legal owner type/ }).inputValue(), branch)
    await save(agent, 'lead')
    const reopened = await evidence()
    if (peopleKey) assert.deepEqual(buildListingSellerInformationModel(reopened.listing).draft[peopleKey].map(person => person.id), personIds)
    const profile = await rpc('bridge_get_transaction_seller_profile', { p_transaction_id: '00000000-0000-4000-8000-000000000801' })
    assert.equal(profile.error, null)
    assert.equal(profile.data.status, 'current')
    assert.deepEqual(buildListingSellerInformationModel(profile.data.listing).groups, buildListingSellerInformationModel(reopened.listing).groups)
    await open(agent, 'transaction')
    const shown = agent.getByRole('region', { name: 'Current seller profile', exact: true })
    // The component is a named section, exposed as a region by Chromium.
    await shown.getByText('Current saved details from the linked listing.', { exact: true }).waitFor()
    for (const row of model.groups.flatMap(group => group.rows).filter(row => /LOCAL-PERSON|Home [12]|SPOUSE-ID|PRINCIPAL-ID|Local Representative|CO-REG|TRUST-REG/.test(row.displayValue))) assert.ok((await shown.innerText()).includes(row.displayValue), `Current transaction profile must retain ${row.label}`)
    await agent.screenshot({ path: fileURLToPath(new URL(`${branch}-current-profile.png`, output)), fullPage: true })
    record(`${branch} identity, relationships and stable people agree after listing/lead reopen and current transaction read`)
  }

  // Exercise actual information submission, with no mandate dates, answers,
  // signature or document preparation. The database fixture remains isolated.
  state = await evidence()
  const informationForm = {
    ownershipType: 'individual', ownerEntityType: 'natural_person', ownerStructureType: 'individual', ownershipRouteConfirmed: true,
    sellerFirstName: 'Sam', sellerSurname: 'Seller', idNumber: '8001015009087', email: 'sam@example.test', phone: '0820000000',
    residentialAddress: '1 Seller Road', sellerTaxNumber: 'LOCAL-TAX', saResident: 'Yes', dateOfBirth: '1980-01-01', nationality: 'South African',
    occupation: 'Engineer', sourceOfFunds: 'Salary', politicallyExposedPerson: 'no',
    propertyAddress: '1 Test Road', propertyAddressLine1: '1 Test Road', suburb: 'Gardens', city: 'Cape Town', province: 'Western Cape',
    propertyCategory: 'residential', propertyType: 'house', propertyStructureType: 'freehold',
    propertyAddressDetails: { line1: '1 Test Road', suburb: 'Gardens', city: 'Cape Town', province: 'Western Cape' },
    ratesTaxes: '1000', leviesNotApplicable: true, waterBillingType: 'municipal', existingBond: false,
    mandateType: '', mandateStartDate: '', mandateEndDate: '', propertyDisclosure: { responses: {}, signature: '', declarationAccepted: false },
    currentStep: 0,
    sellerOnboardingConsents: Object.fromEntries(['privacyProcessing', 'ficaKycPermission', 'informationAccuracy'].map(key => [key, { accepted: true, acceptedAt: '2026-10-11T10:00:00Z' }])),
    // Existing accepted evidence must survive information resubmission exactly.
    sellerReviewedDocumentVersions: { documents: [{ key: 'signed_mandate', versionId: 'historical-accepted-version', immutableEvidence: 'preserve' }] },
  }
  const canonical = buildCanonicalSellerOnboardingPayload(informationForm, {})
  assert.deepEqual(validateSellerOnboardingFacts(canonical.canonicalSellerFacts, { draft: false }).required, [])
  result = await rpc('save_private_listing_seller_onboarding_profile', { p_listing_id: state.listing.id, p_token: 'token-a', p_form_data: { ...informationForm, ...canonical }, p_revision: revision(state.onboarding), p_status: 'in_progress', p_seller_type: 'natural_person', p_ownership_structure: 'individual', p_marital_regime: null, p_reopen_for_correction: true })
  assert.equal(result.error, null)
  await open(seller, 'portal')
  await seller.getByRole('button', { name: 'Save & Continue', exact: true }).click()
  await seller.getByRole('heading', { name: 'Tell us about the property', exact: true }).waitFor()
  await seller.getByRole('button', { name: 'Save & Continue', exact: true }).click()
  await seller.getByRole('heading', { name: 'Check your seller file', exact: true }).waitFor()
  assert.equal(await seller.getByRole('heading', { name: 'Declaration by Seller - Annexure A', exact: true }).count(), 0)
  assert.equal(await seller.getByRole('button', { name: 'Complete required items to continue', exact: true }).count(), 0)
  const submittedResponse = seller.waitForResponse(response => response.url().endsWith('/api/rpc') && response.request().postDataJSON()?.name === 'bridge_complete_private_listing_seller_onboarding')
  await seller.getByRole('button', { name: 'Send onboarding to agent', exact: true }).last().click()
  assert.equal((await (await submittedResponse).json()).error, null)
  await seller.getByRole('heading', { name: 'Information submitted', exact: true }).waitFor()
  state = await evidence()
  assert.equal(state.onboarding.status, 'completed')
  assert.equal(state.onboarding.form_data.sellerOnboardingCompletion.informationOnly, true)
  assert.equal(state.onboarding.form_data.propertyDisclosure.signature, '')
  assert.equal(state.onboarding.form_data.propertyDisclosure.declarationAccepted, false)
  assert.deepEqual(state.onboarding.form_data.sellerReviewedDocumentVersions, informationForm.sellerReviewedDocumentVersions)
  assert.equal(state.onboarding.form_data.sellerPostOnboardingDrafts, undefined)
  assert.equal(state.onboarding.form_data.sellerOnboardingDisclosureSnapshot, undefined)
  await seller.screenshot({ path: fileURLToPath(new URL('information-submitted-before-documents.png', output)), fullPage: true })
  record('actual seller information submission succeeds before disclosure, mandate dates or signatures; accepted versions survive')

  assert.deepEqual(errors, [], 'The browser must have no uncaught errors')
  const unexpectedConsoleErrors = consoleErrors.filter(message =>
    !message.startsWith('[Seller Onboarding] draft save failed Error: Someone else saved changes to this seller record.') &&
    !(abortedRequests.length && message.startsWith('[Seller Onboarding] draft save failed TypeError: Failed to fetch')))
  assert.deepEqual(unexpectedConsoleErrors, [], 'Only injected conflicts and cancelled navigation saves may log handled errors')
  assert.deepEqual(externalRequests, [], 'The journey must not request hosted services')
  await writeFile(new URL('result.json', output), JSON.stringify({ isolation: 'local component fixture; synthetic Auth/transport; real migration SQL', checks: report, browserErrors: errors, consoleErrors, abortedRequests, externalRequests, saved: await evidence() }, null, 2))
  const sources = ['src/pages/agency/AgencyPipelinePage.jsx', 'src/pages/SellerOnboarding.jsx', 'src/pages/AgentListingDetail.jsx', 'src/components/transaction/DealSetupPanel.jsx', 'src/services/transactionSellerSaveService.js']
  const hashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex') ])))
  await writeFile(new URL('source-hashes.json', output), JSON.stringify(hashes, null, 2))
  console.log(`Seller alignment browser journey: ${report.length} checks passed; no external requests.`)
} catch (error) {
  console.error(error.message)
  if (browser) for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
    await writeFile(new URL(`failure-page-${index}.txt`, output), await page.locator('body').innerText().catch(() => 'unavailable'))
    await page.screenshot({ path: fileURLToPath(new URL(`failure-page-${index}.png`, output)), fullPage: true }).catch(() => null)
  }
  await writeFile(new URL('failure.log', output), `${error.stack}\n${serverLog}`)
  throw error
} finally {
  await browser?.close()
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit')
    server.kill('SIGTERM')
    await exited
  }
}
