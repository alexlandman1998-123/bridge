import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const [appSource, moduleSource, loadersSource, boundarySource, apiSource, docsSource] = await Promise.all([
  fs.readFile('src/App.jsx', 'utf8'),
  fs.readFile('src/modules/rentals/index.js', 'utf8'),
  fs.readFile('src/modules/rentals/shell/rentalRouteLoaders.js', 'utf8'),
  fs.readFile('src/modules/rentals/shell/RentalModuleBoundary.jsx', 'utf8'),
  fs.readFile('src/modules/rentals/shared/api/rentalModuleApi.js', 'utf8'),
  fs.readFile('docs/rentals-phase2-module-boundary.md', 'utf8'),
])

assert.match(appSource, /from '\.\/modules\/rentals'/)
assert.doesNotMatch(appSource, /lazy\(\(\) => import\('\.\/pages\/rentals\//)
assert.match(appSource, /<RentalModuleBoundary>\{children\}<\/RentalModuleBoundary>/)
assert.match(moduleSource, /rentalModuleRegistry/)
assert.match(moduleSource, /rentalRouteLoaders/)
assert.ok(loadersSource.includes("lazy(() => import('../../../pages/rentals/RentalListingsPage'))"))
assert.match(boundarySource, /AppErrorBoundary/)
assert.match(apiSource, /getRepository/)
assert.match(docsSource, /never Supabase directly/)

console.log('Rentals Phase 2 module boundary checks passed.')
