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
  'src/services/rentals/rentalDomainContract.js',
  'src/services/rentals/rentalLeadService.js',
  'src/services/rentals/rentalLandlordMandateRepository.js',
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
  '/agent/rentals/portfolio',
  '/agent/rentals/vacancies',
  '/agent/rentals/maintenance',
  '/agent/rentals/inspections',
])

const coreRentalTables = Object.freeze([
  'rental_portfolios',
  'rental_properties',
  'rental_units',
  'rental_property_landlords',
  'rental_property_mandates',
  'rental_vacancies',
  'rental_applications',
  'rental_tenancies',
  'rental_leases',
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
  const coreTableRows = report.database.coreTables.map((table) => `| \`${table.name}\` | ${table.present ? 'Present in SQL artifact inventory' : 'Missing'} | ${table.sources.map((source) => `\`${source}\``).join('<br>') || '—'} |`).join('\n')
  return `# Rentals Phase 0 — Reconciliation and Scope Lock\n\nGenerated: ${report.generatedAt}\n\n## Decision\n\n\`${report.decision}\` — this is a read-only implementation phase. It reconciles the current codebase, locks ownership boundaries, and adds a regression gate. It does not alter production data or business workflow behaviour.\n\n## Guard checks\n\n| Check | Status | Detail |\n| --- | --- | --- |\n${checks.map((check) => `| ${check.key} | ${check.passed ? 'PASS' : 'BLOCKED'} | ${check.detail} |`).join('\n')}\n\n## Current implementation inventory\n\n### Protected rental routes\n\n${markdownList(report.rentals.routes)}\n\n### Rental source files\n\n${markdownList(report.rentals.sourceFiles)}\n\n### Rental services\n\n${markdownList(report.rentals.serviceFiles)}\n\n### Core database entities\n\n| Entity | Inventory status | SQL source |\n| --- | --- | --- |\n${coreTableRows}\n\n## Canonical ownership boundary\n\n| Concern | System of record | Boundary |\n| --- | --- | --- |\n| Canonical people and organisations | Platform CRM | Landlord, applicant and tenant remain role relationships; no duplicate contact master. |\n| Property, unit, vacancy, application, screening, lease, tenancy | Arch9 Rentals | Rentals owns the operational lifecycle. |\n| Marketing listing | Shared Listings | A rental listing is a vacancy projection marked \`listing_category:rental\`; it is never the occupancy source of truth. |\n| Rental payments, trust accounting, reconciliation and payouts | External financial system, currently unintegrated | Do not treat Arch9's operational financial records as a trust-accounting ledger. |\n| Maintenance and inspections | Arch9 Rentals | Continue as a rental-owned workflow; benchmark externally without coupling to an unverified integration. |\n\n## Integration status\n\n| Candidate | Status | Phase 0 decision |\n| --- | --- | --- |\n| PayProp | ${report.integrations.payProp.status} | No credentials, client, webhook, or data synchronisation is present. A future integration requires a separate contract and sandbox proof. |\n| WeConnectU / RedRabbit | ${report.integrations.weConnectU.status} | No client, webhook, or data synchronisation is present. Treat it as an operational benchmark until a separate integration assessment is approved. |\n\n## Confirmed capability state\n\n| Capability | Current state | Phase 0 conclusion |\n| --- | --- | --- |\n| Rental leads | ${report.capabilities.rentalLeads} | Existing implementation is a starting point, not a replacement CRM. |\n| Landlord and mandate | ${report.capabilities.landlordMandates} | Relationship and mandate records exist; guided acquisition remains a later workflow phase. |\n| Applicant applications | ${report.capabilities.applications} | Application and applicant-link foundations exist. |\n| Tenant and landlord portals | ${report.capabilities.portals} | Portal access model/rollout flags exist, but no production rental portal route is claimed by this phase. |\n| Finance | ${report.capabilities.finance} | Operational records exist; trust accounting and PayProp synchronisation are out of scope. |\n\n## Sales protection contract\n\n- Do not change Sales route behaviour, default queries, lead-category semantics, or status enums to accommodate Rentals.\n- Keep rental marketing projections explicitly marked \`listing_category:rental\`.\n- Do not alter shared RLS without both Sales and Rentals policy tests.\n- Keep Rentals lazy-loaded and outside the initial Sales bundle.\n- Do not introduce a finance integration or financial source-of-truth change in a CRM phase.\n- Run the following checks before every next phase.\n\n${markdownList(report.salesRegressionCommands)}\n\n## Next phase\n\nProceed to the Rental CRM data-contract phase: rental lead classification, landlord/tenant roles, stage definitions, import contract, and transition rules.\n`
}

export async function buildRentalsPhase0Baseline() {
  const sourceContents = await Promise.all(requiredSources.map(sourceText))
  const sourceMap = Object.fromEntries(requiredSources.map((file, index) => [file, sourceContents[index]]))
  const sourceFiles = await listFiles(path.join(appRoot, 'src'), (filePath) => /rental/i.test(path.basename(filePath)))
  const rentalServices = sourceFiles.filter((filePath) => filePath.includes(`${path.sep}services${path.sep}`))
  const sqlRoots = [
    { kind: 'migration', path: path.join(workspaceRoot, 'supabase', 'migrations') },
    { kind: 'sql_artifact', path: path.join(appRoot, 'sql') },
  ]
  const sqlFiles = unique((await Promise.all(sqlRoots.map(async ({ kind, path: root }) => (
    (await listFiles(root, (filePath) => filePath.endsWith('.sql')))).map((filePath) => ({ kind, filePath }))
  )))).flat().map((entry) => ({ ...entry, relativePath: relativeToWorkspace(entry.filePath) }))
  const sqlContents = await Promise.all(sqlFiles.map(async ({ filePath }) => fs.readFile(filePath, 'utf8')))
  const coreTables = coreRentalTables.map((name) => ({
    name,
    present: sqlContents.some((source) => new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${name}\\b`, 'i').test(source)),
    sources: sqlFiles.filter((_, index) => new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${name}\\b`, 'i').test(sqlContents[index])).map(({ relativePath }) => relativePath),
  }))
  const rentalSqlFiles = sqlFiles.filter((_, index) => /\brental_/i.test(sqlContents[index]))
  const hasIntegrationReference = async (pattern) => {
    const integrationRoots = [
      path.join(appRoot, 'src'),
      path.join(appRoot, 'server'),
      path.join(appRoot, 'api'),
      path.join(workspaceRoot, 'supabase', 'functions'),
    ]
    const integrationFiles = (await Promise.all(integrationRoots.map((root) => (
      listFiles(root, (filePath) => /\.(?:[cm]?[jt]sx?|sql)$/i.test(filePath))
    )))).flat()
    for (const filePath of integrationFiles) {
      if (pattern.test(await fs.readFile(filePath, 'utf8'))) return true
    }
    return false
  }
  const [hasPayPropReference, hasWeConnectUReference] = await Promise.all([
    hasIntegrationReference(/\bpayprop\b/i),
    hasIntegrationReference(/\b(?:weconnectu|redrabbit)\b/i),
  ])

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
    {
      key: 'core_rental_sql_inventory',
      passed: coreTables.every((table) => table.present),
      detail: `${coreTables.filter((table) => table.present).length}/${coreTables.length} core rental tables are present in the repository SQL inventory.`,
    },
    {
      key: 'rental_domain_contract',
      passed: sourceMap['src/services/rentals/rentalDomainContract.js'].includes('RENTAL_DOMAIN_ENTITIES'),
      detail: 'Canonical Rentals ownership and transition contract is present.',
    },
    {
      key: 'rental_lead_and_mandate_foundation',
      passed: sourceMap['src/services/rentals/rentalLeadService.js'].includes('createRentalLead')
        && sourceMap['src/services/rentals/rentalLandlordMandateRepository.js'].includes('createRentalPropertyMandate'),
      detail: 'Rental lead and landlord-mandate foundations are present for the subsequent CRM phase.',
    },
  ]

  return {
    version: 'arch9_rentals_phase0_baseline_v1',
    generatedAt: new Date().toISOString(),
    decision: checks.every((check) => check.passed) ? 'PHASE_0_RECONCILED' : 'PHASE_0_BLOCKED',
    guard: { checks },
    rentals: {
      routes: rentalRoutes,
      sourceFiles: sourceFiles.map(relativeToWorkspace),
      serviceFiles: rentalServices.map(relativeToWorkspace),
    },
    database: {
      sqlArtifacts: rentalSqlFiles.map(({ kind, relativePath }) => ({ kind, path: relativePath })),
      coreTables,
    },
    integrations: {
      payProp: { status: hasPayPropReference ? 'reference_detected_review_required' : 'not_integrated' },
      weConnectU: { status: hasWeConnectUReference ? 'reference_detected_review_required' : 'not_integrated' },
    },
    capabilities: {
      rentalLeads: 'implemented_foundation',
      landlordMandates: 'implemented_foundation',
      applications: 'implemented_foundation',
      portals: 'access_model_and_rollout_controls_only',
      finance: 'operational_records_only_no_external_finance_integration',
    },
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
