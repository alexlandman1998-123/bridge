import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.resolve(appRoot, '..')
const defaultOutput = 'docs/rentals-phase0-baseline.json'
const defaultMarkdown = 'docs/rentals-phase0-baseline.md'

const requiredSources = Object.freeze([
  'src/App.jsx',
  'src/components/Sidebar.jsx',
  'src/auth/permissions/navigationPermissions.js',
  'src/auth/permissions/permissionRegistry.js',
  'src/services/rentals/rentalListingArchitecture.js',
  'src/services/rentals/rentalModuleAvailability.js',
  'src/services/rentals/rentalWorkspaceScope.js',
  'scripts/performance-baseline.mjs',
])

const rentalRoutes = Object.freeze([
  '/agent/rentals/dashboard',
  '/agent/rentals/tenancies',
  '/agent/rentals/pipeline/leads',
  '/agent/rentals/pipeline/applications',
  '/agent/rentals/pipeline/calendar',
  '/agent/rentals/listings',
])

const salesRegressionCommands = Object.freeze([
  'npm run test:sales-listing-workspace-phase3',
  'npm run test:rental-listing-workspace-phase4',
  'npm run test:performance-phase0',
  'npm run test:performance-budget',
  'npm run build',
])

function parseArgs(argv) {
  const options = { output: defaultOutput, markdown: defaultMarkdown, write: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--write') options.write = true
    else if (arg === '--json') options.json = true
    else if (arg === '--output' && next) {
      options.output = next
      index += 1
    } else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg === '--markdown' && next) {
      options.markdown = next
      index += 1
    } else if (arg.startsWith('--markdown=')) options.markdown = arg.slice('--markdown='.length)
  }
  return options
}

async function sourceText(relativePath) {
  return fs.readFile(path.join(appRoot, relativePath), 'utf8')
}

async function listFiles(directory, predicate) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return listFiles(fullPath, predicate)
      return predicate(fullPath) ? [fullPath] : []
    }))
    return nested.flat()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function relativeToWorkspace(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/')
}

function unique(values) {
  return [...new Set(values)].sort()
}

function markdownList(items) {
  return items.length ? items.map((item) => `- \`${item}\``).join('\n') : '- None found'
}

function formatMarkdown(report) {
  const checks = report.guard.checks
  return `# Rentals Phase 0 Baseline\n\nGenerated: ${report.generatedAt}\n\n## Decision\n\n\`${report.decision}\` — this report is read-only. It documents current boundaries and must pass before a Rentals schema or workflow phase begins.\n\n## Guard checks\n\n| Check | Status | Detail |\n| --- | --- | --- |\n${checks.map((check) => `| ${check.key} | ${check.passed ? 'PASS' : 'BLOCKED'} | ${check.detail} |`).join('\n')}\n\n## Existing Rental Surfaces\n\n### Routes\n\n${markdownList(report.rentals.routes)}\n\n### Source files\n\n${markdownList(report.rentals.sourceFiles)}\n\n### Existing services\n\n${markdownList(report.rentals.serviceFiles)}\n\n## Shared Infrastructure To Reuse\n\n- Workspace guard and feature flags: \`RentalWorkspaceGuard\` and \`resolveRentalModuleAvailability\`.\n- Scope contract: \`resolveRentalWorkspaceScope\`.\n- Marketing projection: \`private_listings\` with \`listing_category:rental\`.\n- Listing media, syndication, documents, activity, contacts/clients, notifications and permissions through adapters.\n\n## Confirmed Gaps\n\n- Durable Portfolio → Property → Unit → Vacancy → Application → Tenancy tables are not present in the app migration inventory.\n- Rental navigation currently reuses broad Sales-era permissions.\n- Dashboard, rental leads and calendar are placeholders.\n- Collections, maintenance, inspections, renewals and portals are not implemented as rental-owned domains.\n\n## Sales Protection Contract\n\n- Do not change Sales route behavior, default queries or status semantics.\n- Keep rental listing projection explicitly marked \`listing_category:rental\`.\n- Do not alter shared RLS without both Sales and Rentals policy tests.\n- Keep Rentals lazy-loaded and outside the initial Sales bundle.\n- Run the following checks before every next phase.\n\n${markdownList(report.salesRegressionCommands)}\n\n## Database Migration Inventory\n\nMigration files inspected: ${report.database.migrationFiles.length}\n\nRental-specific migration files found: ${report.database.rentalMigrationFiles.length}\n\n${markdownList(report.database.rentalMigrationFiles)}\n\n## Next Phase\n\nProceed to Phase 1 only after reviewing this baseline and agreeing the canonical domain contract.\n`
}

export async function buildRentalsPhase0Baseline() {
  const sourceContents = await Promise.all(requiredSources.map(sourceText))
  const sourceMap = Object.fromEntries(requiredSources.map((file, index) => [file, sourceContents[index]]))
  const sourceFiles = await listFiles(path.join(appRoot, 'src'), (filePath) => /rental/i.test(path.basename(filePath)))
  const rentalServices = sourceFiles.filter((filePath) => filePath.includes(`${path.sep}services${path.sep}`))
  const migrationRoots = [
    path.join(workspaceRoot, 'supabase', 'migrations'),
    path.join(appRoot, 'supabase', 'migrations'),
  ]
  const migrationFiles = unique((await Promise.all(migrationRoots.map((root) => listFiles(root, (filePath) => filePath.endsWith('.sql'))))).flat())
    .map(relativeToWorkspace)
  const migrationContents = await Promise.all(migrationFiles.map((filePath) => fs.readFile(path.join(workspaceRoot, filePath), 'utf8')))
  const rentalMigrationFiles = migrationFiles.filter((filePath, index) => /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?rental_/i.test(migrationContents[index]))

  const checks = [
    {
      key: 'rental_workspace_guard',
      passed: sourceMap['src/App.jsx'].includes('function RentalWorkspaceGuard'),
      detail: 'Rental workspace guard is present in App routing.',
    },
    {
      key: 'rental_routes_are_scoped',
      passed: rentalRoutes.every((route) => sourceMap['src/App.jsx'].includes(`path="${route}"`)),
      detail: `${rentalRoutes.length} protected rental routes are registered.`,
    },
    {
      key: 'rental_feature_flags',
      passed: sourceMap['src/services/rentals/rentalModuleAvailability.js'].includes('resolveRentalModuleAvailability'),
      detail: 'Rental module availability is centrally gated.',
    },
    {
      key: 'rental_scope_contract',
      passed: sourceMap['src/services/rentals/rentalWorkspaceScope.js'].includes('resolveRentalWorkspaceScope'),
      detail: 'Organisation, branch, department and assigned-user scope is modeled.',
    },
    {
      key: 'rental_listing_projection_marker',
      passed: sourceMap['src/services/rentals/rentalListingArchitecture.js'].includes("currentRentalMarker: 'listing_category:rental'"),
      detail: 'Rental listing projection remains explicitly marked in shared listings.',
    },
    {
      key: 'sales_and_rentals_navigation_are_separate',
      passed: sourceMap['src/components/Sidebar.jsx'].includes('isRentalsBusinessLine'),
      detail: 'Sidebar selects Rentals navigation through the business workspace boundary.',
    },
    {
      key: 'baseline_performance_tooling_exists',
      passed: sourceMap['scripts/performance-baseline.mjs'].includes('performance baseline written'),
      detail: 'Existing performance baseline tooling is available for the next phase.',
    },
  ]

  return {
    version: 'arch9_rentals_phase0_baseline_v1',
    generatedAt: new Date().toISOString(),
    decision: checks.every((check) => check.passed) ? 'PHASE_0_READY_FOR_DOMAIN_CONTRACT' : 'PHASE_0_BLOCKED',
    guard: { checks },
    rentals: {
      routes: rentalRoutes,
      sourceFiles: sourceFiles.map(relativeToWorkspace),
      serviceFiles: rentalServices.map(relativeToWorkspace),
    },
    database: { migrationFiles, rentalMigrationFiles },
    salesRegressionCommands,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await buildRentalsPhase0Baseline()
  const markdown = formatMarkdown(report)
  if (!options.write) {
    console.log(options.json ? JSON.stringify(report, null, 2) : `${report.decision}: ${report.guard.checks.filter((check) => check.passed).length}/${report.guard.checks.length} safeguards present.`)
    return
  }

  const outputPath = path.resolve(appRoot, options.output)
  const markdownPath = path.resolve(appRoot, options.markdown)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.mkdir(path.dirname(markdownPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  await fs.writeFile(markdownPath, markdown)
  console.log(`${report.decision}: baseline written to ${path.relative(appRoot, outputPath)} and ${path.relative(appRoot, markdownPath)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
