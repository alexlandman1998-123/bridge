import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const crudPage = read('src/modules/commercial/components/CommercialCrudPage.jsx')
const crudConfig = read('src/modules/commercial/commercialCrudConfig.js')
const intelligence = read('src/modules/commercial/services/commercialIntelligenceApi.js')

assert.match(crudPage, /column\.render\(row, lookupOptions, lookups\)/)
assert.match(crudConfig, /renderCommercialListingQuality/)
assert.match(crudConfig, /Category ready/)
assert.match(intelligence, /context\.property \|\| context\.propertiesById/)

console.log('Property24 commercial readiness workflow wiring passed')
