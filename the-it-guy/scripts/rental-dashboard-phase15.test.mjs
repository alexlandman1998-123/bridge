import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const [app, page, model] = await Promise.all(['src/App.jsx', 'src/pages/rentals/RentalDashboardPage.jsx', 'src/services/rentals/rentalDashboardModel.js'].map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))
assert.match(app, /<RentalDashboardPage\s*\/>/)
assert.match(page, /Rentals Dashboard/)
assert.match(page, /listRentalManagementWorkspace/)
assert.match(model, /openManagement/)
console.log('Rental dashboard phase 15 integration checks passed.')
