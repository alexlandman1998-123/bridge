import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  DEVELOPER_DOCUMENT_PORTAL_PATH,
  __developerDocumentPortalTestUtils,
  buildDeveloperDocumentPortalUrl,
} from '../src/services/developerDocumentPortalService.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migration = readFileSync(resolve(root, '../supabase/migrations/20260831113000_developer_document_portal.sql'), 'utf8')
const appSource = readFileSync(resolve(root, 'src/App.jsx'), 'utf8')
const pageSource = readFileSync(resolve(root, 'src/pages/DeveloperDocumentPortalPage.jsx'), 'utf8')
const transactionSource = readFileSync(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

assert.equal(DEVELOPER_DOCUMENT_PORTAL_PATH, '/developer/document-portal')
assert.equal(
  buildDeveloperDocumentPortalUrl('ddp_abc123', 'https://app.arch9.co.za'),
  'https://app.arch9.co.za/developer/document-portal/ddp_abc123',
)

const normalized = __developerDocumentPortalTestUtils.normalizePortalPayload({
  requirements: [
    { id: 'one', required: true, status: 'pending' },
    { id: 'two', required: true, status: 'under_review' },
    { id: 'three', required: false, status: 'pending' },
  ],
})
assert.deepEqual(normalized.summary, { required: 2, received: 1, outstanding: 1, progress: 50 })

assert.match(appSource, /path="\/developer\/document-portal\/:token"/)
assert.match(pageSource, /Buyer documents are not shown here/)
assert.match(pageSource, /Upload another developer document/)
assert.match(pageSource, /It does not provide access to buyer onboarding/)
assert.match(transactionSource, /createDeveloperDocumentPortalLink/)
assert.match(transactionSource, /type: 'transaction_document_request'/)

assert.match(migration, /token_hash text not null unique/)
assert.doesNotMatch(migration, /\baccess_token\s+text\b/)
assert.match(migration, /developer_document_portal_links_deny_direct_access/)
assert.match(migration, /using \(false\)/)
assert.match(migration, /is_client_visible,[\s\S]*false,/)
assert.match(migration, /document\.source = 'developer_document_portal'/)
assert.match(migration, /bridge_developer_document_requirement_is_visible/)
assert.match(migration, /update public\.transaction_document_requirements/)
assert.match(migration, /update public\.document_requirement_instances/)
assert.match(migration, /update public\.transaction_required_documents/)
assert.match(migration, /documents_developer_document_portal_insert/)
assert.match(migration, /documents_developer_document_portal_select/)
assert.match(migration, /grant execute on function public\.bridge_developer_document_portal_payload\(\) to anon, authenticated/)

console.log('developer document portal contract: ok')
