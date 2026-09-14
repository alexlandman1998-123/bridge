import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(appRoot, path), 'utf8')
const properties = await read('src/pages/rentals/RentalPropertiesPage.jsx')
const units = await read('src/modules/rentals/shared/units/RentalUnitsPanel.jsx')
const vacancy = await read('src/pages/rentals/RentalVacancyCreatePage.jsx')

for (const token of ['useNavigate', 'const property = await createRentalProperty', 'navigate(`/agent/rentals/portfolio/properties/${property.id}`)']) {
  assert.ok(properties.includes(token), `Property onboarding does not continue to the property workspace: ${token}`)
}

for (const token of ['depositAmount', 'Create draft vacancy', 'propertyId=${encodeURIComponent(property.id)}', 'unitId=${encodeURIComponent(unit.id)}', "unit.status === 'vacant'"]) {
  assert.ok(units.includes(token), `Unit-to-vacancy handoff is incomplete: ${token}`)
}

for (const token of ['useSearchParams', 'requestedPropertyId', 'requestedUnitId', 'applyUnitTerms', 'Asking rent', 'Lease term (months)', 'This unit may already have an open vacancy.']) {
  assert.ok(vacancy.includes(token), `Vacancy setup is incomplete: ${token}`)
}

console.log('Rentals portfolio-to-vacancy flow checks passed.')
