import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFile(path.join(appRoot, relativePath), 'utf8')
const [telemetry, boundary, routes, packageJson] = await Promise.all([
  read('src/modules/rentals/shared/observability/rentalPerformanceTelemetry.js'),
  read('src/modules/rentals/shell/RentalModuleBoundary.jsx'),
  read('src/modules/rentals/shell/rentalRouteLoaders.js'),
  read('package.json'),
])

for (const metric of ['rentals.route.shell_ready', 'rentals.route.first_data', 'rentals.interaction.complete', 'rentals.query.complete', 'rentals.job.complete']) {
  assert.match(telemetry, new RegExp(metric.replaceAll('.', '\\.')), `Missing ${metric} metric.`)
}
assert.match(telemetry, /requestCount: 12/, 'First-data request budget must be explicit.')
assert.match(telemetry, /payloadBytes: 800_000/, 'First-data payload budget must be explicit.')
assert.match(telemetry, /rental_performance_budget_breached/, 'Budget breaches must become a telemetry event.')
assert.doesNotMatch(telemetry, /from\(['"]private_listings['"]\)/, 'Rental telemetry must not query shared Sales listing data.')
assert.match(boundary, /scope="rentals_module"/, 'Rental errors must be classified separately from Sales errors.')
assert.match(routes, /lazy\(\(\) => import/, 'Rental routes must remain lazy loaded.')
assert.match(packageJson, /"report:rentals-phase5"/, 'Repeatable Rental performance report command is required.')
console.log('Rentals Phase 5 observability gate passed.')
