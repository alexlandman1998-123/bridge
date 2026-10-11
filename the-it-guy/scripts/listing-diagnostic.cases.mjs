import { photoDiagnostic } from './lib/listingPhotoDiagnostic.mjs'
import { buildProperty24ApiConfig } from '../server/property24/api.js'
import { verifyListingPropertyPersistenceCopies } from '../src/lib/listingPropertySaveVerification.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { categories, listingCase, portalPlans } from './lib/listingDiagnosticCases.mjs'
import { getListingFieldIssues } from '../src/services/listings/listingFieldRequirements.js'
import { createProperty24ListingPlan } from '../server/services/property24ListingMapper.js'
import { createProperty24RentalListingPlan } from '../server/services/property24RentalListingAdapter.js'
import { dispatchPublicationJob } from '../server/services/listingPublicationJobs.js'

// No test may reach a provider, hosted database, storage or email service.
globalThis.fetch = async () => { throw new Error('Network disabled in listing diagnostic') }
const cases = categories.flatMap(([category]) => ['sale', 'rental'].map(mode => {
  const fixture = listingCase(category, mode)
  return { ...fixture, plans: portalPlans(fixture), id: `${category}/${mode}` }
}))
function validate(rows) {
  const child = spawnSync('python3', [fileURLToPath(new URL('./lib/validateListingDiagnosticContracts.py', import.meta.url))], {
    input: JSON.stringify(rows), encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  })
  if (child.error || child.status !== 0) throw new Error(`Contract harness unavailable: ${child.error?.message || child.stderr}`)
  return JSON.parse(child.stdout)
}
const inputs = cases.map(c => ({ id: c.id, payload: c.plans.property24.payload, xml: c.plans.private_property.listingXml }))
const contractResults = validate(inputs)
for (const c of cases) {
  for (const portal of ['property24', 'private_property']) {
    test(`[BASE] ${c.id}/${portal} complete example is locally ready`, () => {
      assert.equal(c.plans[portal].canPreview, true, JSON.stringify(c.plans[portal].dataBlockers))
    })
    const finding = portal === 'private_property' && c.mode === 'rental' ? 'API-01' : 'BASE'
    test(`[${finding}] ${c.id}/${portal} outbound contract is valid`, () => {
      assert.deepEqual(contractResults.find(row => row.id === c.id)[portal], [])
    })
  }
  test(`[API-04] ${c.id}/private_property prohibited headline is blocked`, () => {
    const fixture = listingCase(c.category, c.mode, { title: 'Call 0821234567 at www.example.com' })
    const plan = portalPlans(fixture).private_property
    const issues = getListingFieldIssues(fixture.form, { rental: c.mode === 'rental' })
    assert.ok(!plan.canPreview && issues.some(issue => ['title', 'listingTitle', 'headline'].includes(issue.field)), 'Both server and form must reject prohibited headline content')
  })
  if (c.mode === 'sale') {
    test(`[API-02] ${c.id}/private_property POA cannot become a visible price`, () => {
      const plan = portalPlans(listingCase(c.category, 'sale', { priceOnApplication: true })).private_property
      assert.ok(!plan.canPreview || /<SalesPricePresentation>Poa<\/SalesPricePresentation>/.test(plan.listingXml), 'Send explicit POA or block; never silently publish Standard')
    })
  } else {
    test(`[API-07] ${c.id}/property24 preserves rental cents`, () => {
      const plan = portalPlans(listingCase(c.category, 'rental', { monthlyRent: '12500.75' })).property24
      assert.equal(plan.canPreview, true)
      assert.equal(plan.payload.price, 12500.75)
    })
    test(`[BASE] ${c.id}/private_property preserves rental cents`, () => {
      assert.equal(portalPlans(listingCase(c.category, 'rental', { monthlyRent: '12500.75' })).private_property.payload.price, 12500.75)
    })
    test(`[BASE] ${c.id} annual rent has channel-specific requirements`, () => {
      const fixture = listingCase(c.category, 'rental', { rentalPriceFrequency: 'annual' })
      const plans = portalPlans(fixture)
      assert.equal(plans.property24.payload.rentalInfo.rentalRate, 'Year')
      assert.equal(plans.private_property.canPreview, false)
    })
  }
}
for (const [category, expected] of [['commercial', 'Offices'], ['retail', 'Retail']]) {
  test(`[API-03] ${category}/sale/private_property preserves subtype`, () => {
    const plan = portalPlans(listingCase(category, 'sale')).private_property
    assert.equal(plan.payload.attributes.find(row => row.attributeType === 'BusinessType').value, expected)
  })
}

// Exercise the real dispatcher with fake clients/providers, not source-text tests.
async function dispatch(mode, channel, extra = {}) {
  let request
  const listing = { listing_category: mode === 'rental' ? 'rental' : 'private_sale', property24_expiry_date: '2099-04-30', expiry_date: '2099-04-30' }
  const client = {
    auth: { admin: { getUserById: async () => ({ data: { user: { id: 'actor' } } }) } },
    from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: listing }) }),
  }
  const provider = async value => {
    const fixture = listingCase('residential', mode, { property24ExpiryDate: listing.property24_expiry_date, mandateEndDate: listing.expiry_date })
    Object.assign(fixture.listing, listing)
    const mapper = mode === 'rental' ? createProperty24RentalListingPlan : createProperty24ListingPlan
    request = { ...value, plan: mapper({ ...fixture, agentMapping: { property24AgentId: 77959 }, catalogMapping: { suburbId: 12345 }, options: { agencyId: 31382, includeSubmitPayload: true, requirePhotoBytes: false, ...value.body } }) }
    return { status: 200, body: {} }
  }
  await dispatchPublicationJob({ id: 'job', listing_id: 'listing', requested_by: 'actor', channel, ...extra }, {
    client, env: {}, property24: provider, privateProperty: provider,
  })
  assert.ok(request, 'Expected the injected provider to be called')
  return request
}
for (const mode of ['sale', 'rental']) {
  for (const channel of ['property24', 'private_property']) {
    test(`[API-05] ${mode}/${channel} text-only update does not force photo transfer`, async () => {
      const request = await dispatch(mode, channel, { update_request_key: 'update', photosChanged: false })
      assert.equal(request.body.photosChanged, 'auto', 'Queue asks the provider plan to compare confirmed media; it cannot trust a browser flag')
      for (const [category] of categories) {
        const state = photoDiagnostic(category, mode, channel)
        const first = await state.build()
        assert.ok(state.photos(first)?.length, JSON.stringify(first.dataBlockers))
        state.accept(first)
        state.fixture.publication.description = 'Updated property description, same photographs.'
        state.fixture.publication.asking_price = 1500000
        const update = await state.build(channel === 'property24' ? { loadImageBytes: true } : {})
        assert.equal(channel === 'property24' ? update.canSubmit : update.canPreview, true, JSON.stringify([...update.dataBlockers, ...update.technicalBlockers]))
        assert.equal(state.photos(update), null, `${category}: unchanged photos must be nil`)
        if (channel === 'property24') assert.equal(update.imageByteLoad.summary.requested, 0)
        else assert.match(update.listingXml, /<PhotoUrls xsi:nil="true"/)
      }
    })
  }
  test(`[API-06] ${mode}/property24 dispatcher respects the saved expiry`, async () => {
    const request = await dispatch(mode, 'property24')
    assert.equal(request.body.expiryDate, undefined, 'Worker must not override the saved expiry')
    assert.equal(request.plan.canPreview, true, JSON.stringify(request.plan.dataBlockers))
    assert.equal(request.plan.payload.expiryDate, '2099-04-30T00:00:00.000Z')
  })
}

test('[HARNESS] vendor validators reject malformed controls', () => {
  const control = structuredClone(inputs[0])
  delete control.payload.agencyId
  control.payload.status = 'NotARealStatus'
  control.xml = control.xml.replace('<ListingType>Sale</ListingType>', '<ListingType>Invalid</ListingType>')
  const [result] = validate([control])
  assert.ok(result.property24.some(error => error.includes('agencyId')))
  assert.ok(result.property24.some(error => error.includes('enum')))
  assert.ok(result.private_property.length > 0)
})

test('[HARNESS] changing only rental XML order repairs the schema failure', () => {
  const rows = inputs.filter(row => row.id.endsWith('/rental')).map(row => {
    const tag = row.xml.match(/<RentalPriceType>.*?<\/RentalPriceType>/)?.[0]
    assert.ok(tag, 'Rental frequency must be present')
    return { ...row, xml: row.xml.replace(tag, '').replace('</HideUnitNumber>', `</HideUnitNumber>${tag}`) }
  })
  for (const result of validate(rows.map(row => ({ payload: inputs[0].payload, ...row })))) assert.deepEqual(result.private_property, [])
})


test('[BASE] specialist readback verification rejects lost edits and failed clears', () => {
  const form = { propertyCategory: 'commercial', grossLettableArea: '1250.5', zoning: 'Business 4', parking: '18 bays', listingTerms: 'Vacant occupation' }
  const saved = { property: { specialistFacts: { ...form } } }
  assert.equal(verifyListingPropertyPersistenceCopies({ form, onboarding: { formData: form }, listing: { sellerCanonicalFacts: saved } }).ready, true)
  assert.equal(verifyListingPropertyPersistenceCopies({ form, onboarding: { formData: form }, listing: {} }).ready, false)
  const clearedForm = { ...form, grossLettableArea: '' }
  assert.equal(verifyListingPropertyPersistenceCopies({ form: clearedForm, onboarding: { formData: clearedForm }, listing: { sellerCanonicalFacts: saved } }).ready, false)
  assert.equal(verifyListingPropertyPersistenceCopies({ form: { propertyCategory: 'industrial', loadingAccess: false }, onboarding: { formData: { loadingAccess: false } }, listing: { sellerCanonicalFacts: { property: { specialistFacts: { loadingAccess: true } } } } }).ready, false)
})


test('[BASE] Property24 rent and deposit retain cents for every supported cadence', () => {
  for (const [frequency, rate] of [['monthly', 'Month'], ['weekly', 'Week'], ['daily', 'Day'], ['annual', 'Year'], ['per_square_metre', 'SquareMetre']]) {
    const fixture = listingCase('commercial', 'rental', { monthlyRent: '12500.75', depositPolicy: 'fixed_amount', depositAmount: '25001.25', rentalPriceFrequency: frequency })
    const plan = portalPlans(fixture).property24
    assert.equal(plan.payload.price, 12500.75, frequency)
    assert.equal(plan.payload.rentalInfo.rentalRate, rate, frequency)
    assert.match(plan.payload.rentalInfo.depositRequirementsComments, /25001\.25/, frequency)
  }
})


test('[BASE] decimal sales measurements reach both portal payloads in all categories', () => {
  for (const [category] of categories) {
    const plans = portalPlans(listingCase(category, 'sale'))
    assert.equal(plans.property24.payload.propertyInfo.floorArea.size, 98.5, category)
    assert.equal(plans.property24.payload.propertyInfo.erf.size, 500.5, category)
    if (plans.property24.payload.propertyFeatures?.bathrooms) assert.equal(plans.property24.payload.propertyFeatures.bathrooms.bathrooms, 2.5, category)
    const attributes = Object.fromEntries(plans.private_property.payload.attributes.map(row => [row.attributeType, row.value]))
    assert.equal(attributes.FloorArea, '98.5', category)
    assert.equal(attributes.LandArea, '500.5', category)
    if (attributes.Bathrooms) assert.equal(attributes.Bathrooms, '2.5', category)
  }
})

test('[BASE] Private Property rental frequencies validate against the official XSD', () => {
  const rows = []
  for (const [category] of categories) for (const rentalPriceFrequency of ['monthly', 'weekly', 'daily', 'per_square_metre']) {
    const fixture = listingCase(category, 'rental', { rentalPriceFrequency })
    const plan = portalPlans(fixture).private_property
    const allowed = rentalPriceFrequency !== 'per_square_metre' || ['commercial', 'industrial', 'retail', 'mixed_use'].includes(category)
    assert.equal(plan.canPreview, allowed, `${category}/${rentalPriceFrequency}: ${plan.dataBlockers}`)
    if (allowed) rows.push({ id: `${category}/${rentalPriceFrequency}`, xml: plan.listingXml })
  }
  const land = portalPlans(listingCase('vacant_land', 'rental', { propertyType: 'Commercial Land', rentalPriceFrequency: 'per_square_metre' })).private_property
  assert.equal(land.canPreview, true, JSON.stringify(land.dataBlockers))
  rows.push({ id: 'commercial-land/per_square_metre', xml: land.listingXml })
  for (const result of validate(rows.map(row => ({ payload: inputs[0].payload, ...row })))) assert.deepEqual(result.private_property, [], result.id)
})

test('[BASE] Private Property POA retains its setting and blocks an absent asking price', () => {
  const rows = []
  for (const [category] of categories) {
    const fixture = listingCase(category, 'sale', { priceOnApplication: true })
    const plan = portalPlans(fixture).private_property
    assert.equal(plan.canPreview, true, JSON.stringify(plan.dataBlockers))
    assert.equal(plan.payload.salesPricePresentation, 'Poa')
    assert.equal(plan.summary.salesPricePresentation, 'Poa')
    assert.deepEqual(getListingFieldIssues(fixture.form), [])
    rows.push({ id: category, xml: plan.listingXml })
    for (const listingPrice of ['', '0', '-1']) {
      const empty = listingCase(category, 'sale', { priceOnApplication: true, listingPrice })
      const blocked = portalPlans(empty).private_property
      assert.equal(blocked.canPreview, false)
      assert.equal(blocked.listingXml, '')
      assert.ok(blocked.dataBlockers.includes('poa_requires_positive_asking_price'))
      assert.ok(getListingFieldIssues(empty.form).some(issue => issue.message.includes('even when it is hidden')))
    }
    assert.equal(portalPlans(listingCase(category, 'sale')).private_property.payload.salesPricePresentation, 'Standard')
  }
  for (const result of validate(rows.map(row => ({ payload: inputs[0].payload, ...row })))) assert.deepEqual(result.private_property, [], result.id)
  for (const alias of ['priceOnApplication', 'price_on_application', 'isPOA', 'is_poa', 'pricePresentation', 'salesPricePresentation', 'features']) {
    const fixture = listingCase('residential', 'sale')
    fixture.publication[alias] = alias === 'features' ? ['price_on_application'] : /Presentation/.test(alias) ? 'Poa' : true
    assert.equal(portalPlans(fixture).private_property.payload.salesPricePresentation, 'Poa', alias)
  }
})

test('[BASE] Private Property headline rules agree in capture and outgoing plans', () => {
  const invalid = ['Call 082 123 4567', 'Call +27 (82) 123-4567', 'Visit example.co.za', 'Email agent@example.com', 'Home & garden', 'Spacious home 🏡', 'A'.repeat(201)]
  const valid = ['', '3 Bedroom Home', '2.5 bathrooms - sunny, spacious home!', 'Erf 12345 - 98.5 m2', 'Sea-facing apartment. Move in!', 'Café nearby']
  for (const [category] of categories) for (const mode of ['sale', 'rental']) for (const title of [...invalid, ...valid]) {
    const fixture = listingCase(category, mode, { title })
    const plan = portalPlans(fixture).private_property
    const issues = getListingFieldIssues(fixture.form, { rental: mode === 'rental' })
    const headlineIssues = issues.filter(issue => ['listingTitle', 'title'].includes(issue.field))
    assert.equal(plan.canPreview, valid.includes(title), `${category}/${mode}/${title}: ${plan.dataBlockers}`)
    assert.equal(headlineIssues.length > 0, invalid.includes(title), title)
    assert.ok(headlineIssues.every(issue => issue.step === 'marketing' && issue.channels.join() === 'private_property'))
    assert.deepEqual(getListingFieldIssues(fixture.form, { rental: mode === 'rental', channels: ['property24'] }).filter(issue => ['listingTitle', 'title'].includes(issue.field)), [])
  }
})

for (const mode of ['sale', 'rental']) test(`[BASE] ${mode}/Property24 saved expiry wins over defaults and expired dates stay blocked`, () => {
  const mapper = mode === 'sale' ? createProperty24ListingPlan : createProperty24RentalListingPlan
  for (const [category] of categories) for (const date of ['2099-06-01', '2099-09-12', '2001-01-01', 'invalid-date', '']) {
    const fixture = listingCase(category, mode, { property24ExpiryDate: date, mandateEndDate: date })
    fixture.listing.property24ExpiryDate = date
    const plan = mapper({ ...fixture, agentMapping: { property24AgentId: 77959 }, catalogMapping: { suburbId: 12345 }, options: { agencyId: 31382, includeSubmitPayload: true, requirePhotoBytes: false, defaultExpiryDate: '2099-12-31' } })
    if (date === '2001-01-01' || date === 'invalid-date') {
      assert.equal(plan.canPreview, false, `${category}/${date}`)
    } else {
      assert.equal(plan.canPreview, true, `${category}/${date}: ${plan.dataBlockers}`)
      assert.equal(plan.payload.expiryDate, `${date || '2099-12-31'}T00:00:00.000Z`, category)
    }
  }
  const empty = listingCase('residential', mode, { property24ExpiryDate: '', mandateEndDate: '' })
  const missing = mapper({ ...empty, options: { agencyId: 31382 } })
  assert.ok(missing.dataBlockers.includes('missing_expiry_date'))
})

test('[BASE] sale subtype aliases retain their closest supported portal meaning', () => {
  for (const [category, types, attribute, expected, p24] of [
    ['commercial', ['Office', 'Offices', 'Office Building', 'office_building'], 'BusinessType', 'Offices', 11],
    ['industrial', ['Warehouse', 'Factory', 'Distribution Centre', 'Industrial Park'], 'BusinessType', 'Industrial', 12],
    ['retail', ['Retail Store', 'Shopping Centre', 'Shop', 'Showroom'], 'BusinessType', 'Retail', 11],
    ['agricultural', ['Agricultural Land', 'Farm Land'], 'FarmType', 'Farm Land', 10],
    ['agricultural', ['Smallholding', 'Small Holding'], 'FarmType', 'Small Holding', 10],
    ['vacant_land', ['Vacant Land', 'Vacant Stand'], 'LandType', 'Residential Land', 8],
    ['mixed_use', ['Mixed Use Building', 'Mixed Use Estate'], 'BusinessType', 'Commercial', 11],
    ['residential', ['Penthouse'], 'HomeType', 'Penthouse', 5],
  ]) for (const propertyType of types) {
    const plans = portalPlans(listingCase(category, 'sale', { propertyType }))
    assert.equal(plans.private_property.payload.attributes.find(row => row.attributeType === attribute)?.value, expected, propertyType)
    assert.equal(plans.property24.summary.propertyTypeId, p24, propertyType)
  }
})


test('[BASE] Property24 API separates explicit expiry choices from the environment fallback', () => {
 const env = { PROPERTY24_DEFAULT_EXPIRY_DATE: '2099-12-31' }
 for (const mode of ['sale', 'rental']) {
   const route = { listingId: 'fixture', rental: mode === 'rental' }
   const config = buildProperty24ApiConfig({ env, requestUrl: 'http://localhost/', route })
   assert.equal(config.expiryDate, '')
   assert.equal(config.defaultExpiryDate, '2099-12-31')
   const explicit = buildProperty24ApiConfig({ env, requestUrl: 'http://localhost/', route, payload: { expiryDate: '2099-02-01' } })
   assert.equal(explicit.expiryDate, '2099-02-01')
 }
})

test('[API-05] vendor schemas accept unchanged-photo null payloads across categories', async () => {
  const rows = []
  for (const [category] of categories) for (const mode of ['sale', 'rental']) {
    const p24 = photoDiagnostic(category, mode, 'property24')
    const pp = photoDiagnostic(category, mode, 'private_property')
    p24.accept(await p24.build()); pp.accept(await pp.build())
    rows.push({ id: `${category}/${mode}`, payload: (await p24.build()).payload, xml: (await pp.build()).listingXml })
  }
  for (const row of validate(rows)) {
    assert.deepEqual(row.property24, [], row.id)
    assert.deepEqual(row.private_property, [], row.id)
  }
})
