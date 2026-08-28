import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(appRoot, '..')
const read = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

test('retired legal-document autonomous schedules are removed', () => {
  assert.equal(existsSync(path.join(repositoryRoot, '.github/workflows/legal-document-watchdog.yml')), false)
  assert.equal(existsSync(path.join(appRoot, 'api/cron/document-request-canonical-automation.js')), false)

  const vercel = JSON.parse(read('the-it-guy/vercel.json'))
  assert.equal(vercel.crons.some(({ path: cronPath }) => cronPath.includes('document')), false)
  assert.equal(vercel.env.VITE_LEGAL_DOCUMENT_RUNTIME_ENABLED, 'false')
  assert.equal(vercel.env.VITE_LEGAL_DOCUMENT_BACKGROUND_GENERATION_ENABLED, 'false')
  assert.equal(vercel.env.VITE_LEGAL_DOCUMENT_SERVER_PDF_GENERATION_JOB_ENABLED, 'false')
  assert.equal(vercel.env.VITE_LEGAL_DOCUMENT_BROWSER_BACKGROUND_GENERATION_ENABLED, 'false')
})

test('legal-document routes render the retired screen without loading the workspace bundle', () => {
  const app = read('the-it-guy/src/App.jsx')
  const routePrefetch = read('the-it-guy/src/lib/routePrefetch.js')

  assert.doesNotMatch(app, /lazy\(\(\) => import\('\.\/pages\/LegalDocumentWorkspacePage'\)\)/)
  assert.match(app, /function LegalDocumentsUnavailable\(\)/)
  assert.equal((app.match(/<LegalDocumentsUnavailable \/>/g) || []).length, 4)
  assert.doesNotMatch(routePrefetch, /import\('\.\.\/pages\/LegalDocumentWorkspacePage'\)/)
  assert.match(routePrefetch, /isRetiredLegalDocumentRoute/)
})

test('legal-document generation defaults fail closed and database schedules are removed idempotently', () => {
  const packetService = read('the-it-guy/src/core/documents/packetService.js')
  const supabaseClient = read('the-it-guy/src/lib/supabaseClient.js')
  const documentPacketsApi = read('the-it-guy/src/lib/documentPacketsApi.js')
  const migration = read('supabase/migrations/20260828134501_retired_legal_document_runtime_shutdown_phase1.sql')

  assert.match(packetService, /VITE_LEGAL_DOCUMENT_BACKGROUND_GENERATION_ENABLED,[\s\S]{0,40}?false/)
  assert.match(packetService, /VITE_LEGAL_DOCUMENT_SERVER_PDF_GENERATION_JOB_ENABLED, false/)
  assert.match(supabaseClient, /LEGAL_DOCUMENT_SYSTEM_RETIRED/)
  assert.match(supabaseClient, /isLegalDocumentEdgeFunctionRetired\(functionName\)/)
  assert.match(documentPacketsApi, /isLegalDocumentEdgeFunctionRetired\('generate-final-signed-document'\)/)
  assert.match(documentPacketsApi, /status: 'retired'/)
  assert.match(migration, /cron\.unschedule\(target_job\.jobid\)/)
  assert.match(migration, /drop function if exists public\.bridge_run_legal_document_job_watchdog_phase9\(\)/)
  assert.match(migration, /drop function if exists public\.bridge_queue_legal_document_signing_reminders_phase1/)
})
