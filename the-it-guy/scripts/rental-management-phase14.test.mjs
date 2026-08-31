import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [app, nav, page, service, model] = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/roles.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/rentals/RentalManagementPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalManagementService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalManagementModel.js', import.meta.url), 'utf8'),
])

assert.match(app, /path="\/agent\/rentals\/management"/)
assert.match(nav, /rental_management/)
assert.match(page, /Rental Management/)
assert.match(service, /rental_management_event/)
assert.match(model, /arrears_follow_up/)
console.log('Rental management phase 14 integration checks passed.')
