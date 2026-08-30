import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')

assert.doesNotMatch(
  appSource,
  /from ['"]\.\/modules\/rentals['"]/,
  'The application bootstrap must not import the rentals barrel, which re-exports every rental contract and UI surface.',
)
assert.match(
  appSource,
  /from ['"]\.\/modules\/rentals\/shell\/rentalRouteLoaders['"]/,
  'Rental page routes must remain lazy route entry points.',
)
assert.match(
  appSource,
  /from ['"]\.\/services\/rentals\/rentalModuleAvailability['"]/,
  'The small availability policy should be imported without loading the rentals barrel.',
)

console.log('cold-load bootstrap boundary phase 5 checks passed')
