import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const requiredSourceFiles = [
  '../supabase/migrations/20260909211500_auction_phase1_foundation.sql',
  '../supabase/migrations/20260909213000_auction_phase2_draft_edit.sql',
  '../supabase/migrations/20260909214500_auction_phase4_realtime.sql',
  '../supabase/migrations/20260909220000_auction_phase5_closeout_handoff.sql',
  'src/services/auctionRepository.js',
  'src/components/marketing/LaunchesAuctions.jsx',
]

const requiredDatabaseChecks = ['migrations_applied', 'organisation_isolation', 'unauthorised_write_denied', 'concurrent_bid_rejected', 'lifecycle_enforced', 'terminal_bid_rejected']
const requiredBrowserChecks = ['auction_list_loads', 'create_edit_persists', 'bidder_approval_enforced', 'bid_minimum_enforced', 'outcome_and_handoff_recorded', 'audit_trail_visible']

const pass = (rows, key) => (rows || []).some((row) => row?.key === key && row?.status === 'PASS')

export function evaluateAuctionPhase6Readiness({ source = {}, database = {}, browser = {}, now = new Date() } = {}) {
  const blockers = []
  for (const file of requiredSourceFiles) if (source?.files?.[file] !== true) blockers.push(`Required source file is missing: ${file}`)
  if (database.contract !== 'arch9-auction-phase6-database-acceptance-v1') blockers.push('Database acceptance evidence is missing or uses the wrong contract.')
  for (const key of requiredDatabaseChecks) if (!pass(database.checks, key)) blockers.push(`Database acceptance check is not passing: ${key}.`)
  if (browser.contract !== 'arch9-auction-phase6-browser-acceptance-v1') blockers.push('Browser/UAT evidence is missing or uses the wrong contract.')
  for (const key of requiredBrowserChecks) if (!pass(browser.checks, key)) blockers.push(`Browser/UAT check is not passing: ${key}.`)
  const capturedAt = new Date(database.capturedAt || browser.capturedAt || '')
  if (Number.isNaN(capturedAt.getTime()) || now.getTime() - capturedAt.getTime() > 72 * 60 * 60 * 1000) blockers.push('Acceptance evidence is missing, invalid, or older than 72 hours.')
  return { contract: 'arch9-auction-phase6-release-readiness-v1', evaluatedAt: now.toISOString(), status: blockers.length ? 'HOLD' : 'GO', blockers }
}

async function fileExists(filePath) {
  try { await readFile(filePath); return true } catch (error) { if (error?.code === 'ENOENT') return false; throw error }
}

async function readJson(filePath) {
  try { return JSON.parse(await readFile(filePath, 'utf8')) } catch (error) { if (error?.code === 'ENOENT') return {}; throw error }
}

async function main() {
  const source = { files: Object.fromEntries(await Promise.all(requiredSourceFiles.map(async (file) => [file, await fileExists(file)]))) }
  const databasePath = process.env.AUCTION_PHASE6_DATABASE_EVIDENCE || 'test-results/auction-phase6/database-acceptance.json'
  const browserPath = process.env.AUCTION_PHASE6_BROWSER_EVIDENCE || 'test-results/auction-phase6/browser-acceptance.json'
  const report = evaluateAuctionPhase6Readiness({ source, database: await readJson(databasePath), browser: await readJson(browserPath) })
  report.evidenceDigests = { algorithm: 'sha256', source: createHash('sha256').update(JSON.stringify(source)).digest('hex'), database: await fileExists(databasePath) ? createHash('sha256').update(await readFile(databasePath)).digest('hex') : null, browser: await fileExists(browserPath) ? createHash('sha256').update(await readFile(browserPath)).digest('hex') : null }
  const outputPath = path.resolve(process.env.AUCTION_PHASE6_OUTPUT || 'test-results/auction-phase6/release-readiness.json')
  await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2)); if (report.status !== 'GO') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
