import process from 'node:process'
import {
  buildPrivatePropertyCliConfig,
  createPrivatePropertyCliClient,
  createPrivatePropertyPhase5BaseReport,
  normalizePrivatePropertyKey,
  parsePrivatePropertyArgs,
  parsePrivatePropertyModelRows,
  writePrivatePropertyReport,
} from './private-property-cli-utils.mjs'

async function run() {
  const options = parsePrivatePropertyArgs(process.argv.slice(2), {
    country: 'South Africa',
    province: '',
    city: '',
    suburb: '',
    countryId: '',
    provinceId: '',
    cityId: '',
    output: '',
  })
  const config = buildPrivatePropertyCliConfig(options)
  const report = createPrivatePropertyPhase5BaseReport('private-property-phase5-find-suburb', config, options)
  report.criteria = {
    country: options.country,
    province: options.province,
    city: options.city,
    suburb: options.suburb,
    countryId: options.countryId || null,
    provinceId: options.provinceId || null,
    cityId: options.cityId || null,
  }

  const missing = [...config.missing]
  if (!options.province && !options.provinceId) missing.push('--province or --province-id')
  if (!options.city && !options.cityId) missing.push('--city or --city-id')
  if (!options.suburb) missing.push('--suburb')
  if (missing.length) {
    report.missingConfiguration = missing
    const output = writePrivatePropertyReport(report, options.output, 'private-property-find-suburb.json')
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createPrivatePropertyCliClient(config)
  report.safety.privatePropertyApiCalled = true

  const countries = parsePrivatePropertyModelRows((await client.getCountries()).data, 'CountryModel')
  const country = Number(options.countryId)
    ? countries.find((row) => row.id === Number(options.countryId))
    : countries.find((row) => normalizePrivatePropertyKey(row.name) === normalizePrivatePropertyKey(options.country)) || countries[0]
  if (!country) {
    report.status = 'NOT_FOUND'
    report.matches = []
    report.nextStep = 'Confirm the Private Property country name or ID.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-find-suburb.json')
    console.log(JSON.stringify({ status: report.status, output, matches: report.matches, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  const provinces = parsePrivatePropertyModelRows((await client.getProvinces({ countryId: country.id })).data, 'ProvinceModel')
  const province = Number(options.provinceId)
    ? provinces.find((row) => row.id === Number(options.provinceId))
    : provinces.find((row) => normalizePrivatePropertyKey(row.name) === normalizePrivatePropertyKey(options.province))
  if (!province) {
    report.status = 'NOT_FOUND'
    report.country = country
    report.matches = []
    report.nextStep = 'Confirm the Private Property province name or ID.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-find-suburb.json')
    console.log(JSON.stringify({ status: report.status, output, matches: report.matches, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  const cities = parsePrivatePropertyModelRows((await client.getCities({ provinceId: province?.id })).data, 'CityModel')
  const city = Number(options.cityId)
    ? cities.find((row) => row.id === Number(options.cityId))
    : cities.find((row) => normalizePrivatePropertyKey(row.name) === normalizePrivatePropertyKey(options.city))
  if (!city) {
    report.status = 'NOT_FOUND'
    report.country = country
    report.province = province
    report.matches = []
    report.nextStep = 'Confirm the Private Property city name or ID.'
    const output = writePrivatePropertyReport(report, options.output, 'private-property-find-suburb.json')
    console.log(JSON.stringify({ status: report.status, output, matches: report.matches, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  const suburbs = parsePrivatePropertyModelRows((await client.getSuburbs({ cityId: city?.id })).data, 'SuburbModel')
  const suburbKey = normalizePrivatePropertyKey(options.suburb)
  const exactMatches = suburbs.filter((row) => normalizePrivatePropertyKey(row.name) === suburbKey)
  const fuzzyMatches = exactMatches.length
    ? exactMatches
    : suburbs.filter((row) => normalizePrivatePropertyKey(row.name).includes(suburbKey) || suburbKey.includes(normalizePrivatePropertyKey(row.name)))

  report.status = fuzzyMatches.length ? 'FOUND' : 'NOT_FOUND'
  report.country = country || null
  report.province = province || null
  report.city = city || null
  report.matches = fuzzyMatches
  report.nextStep = fuzzyMatches[0]
    ? `Use --suburb-id=${fuzzyMatches[0].id} when previewing or publishing the Private Property listing.`
    : 'Confirm the spelling or search using the Private Property city/province hierarchy.'

  const output = writePrivatePropertyReport(report, options.output, 'private-property-find-suburb.json')
  console.log(JSON.stringify({ status: report.status, output, matches: report.matches, nextStep: report.nextStep }, null, 2))
  if (!fuzzyMatches.length) process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
