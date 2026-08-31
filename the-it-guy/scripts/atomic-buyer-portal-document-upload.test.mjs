import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const migration = readFileSync(
  resolve(root, '../supabase/migrations/20260831132002_atomic_buyer_portal_document_upload.sql'),
  'utf8',
)
const api = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')
const portal = readFileSync(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8')

const uploadFunction = api.slice(
  api.indexOf('export async function uploadClientPortalDocument'),
  api.indexOf('export async function reconcileClientPortalBondDocumentRequirements'),
)

assert.match(migration, /create or replace function public\.bridge_upload_buyer_portal_document\(/)
assert.match(migration, /security definer\s+set search_path = ''/)
assert.match(migration, /link\.token = v_request_token/)
assert.match(migration, /link\.transaction_id = p_transaction_id/)
assert.match(migration, /transaction_row\.buyer_id is not distinct from link\.buyer_id/)
assert.match(migration, /trim\(p_file_path\) not like 'client-portal\/' \|\| p_transaction_id::text/)

assert.match(migration, /insert into public\.documents/)
assert.match(migration, /canonical_requirement_instance_id/)
assert.match(migration, /update public\.document_requirement_instances/)
assert.match(migration, /satisfied_by_document_id = v_document\.id/)
assert.match(migration, /insert into public\.document_requirement_events/)
assert.match(migration, /insert into public\.transaction_events/)
assert.match(migration, /'DocumentUploaded'/)
assert.doesNotMatch(migration, /p_event_type|p_event_data|p_created_by_role|p_visibility_scope/)

assert.match(migration, /drop policy if exists documents_insert_token_scoped on public\.documents/)
assert.match(migration, /create policy documents_insert_onboarding_token_scoped/)
assert.match(migration, /bridge_storage_buyer_portal_can_delete_orphan/)
assert.match(migration, /not exists \(\s*select 1\s*from public\.documents/s)
assert.match(migration, /create policy documents_buyer_portal_orphan_delete/)

assert.match(uploadFunction, /client\.rpc\('bridge_upload_buyer_portal_document'/)
assert.match(uploadFunction, /uploadToBuyerPortalDocumentsBucket\(client, filePath, file\)/)
assert.match(uploadFunction, /p_requirement_instance_id: normalizeNullableUuid\(canonicalRequirementInstanceId\)/)
assert.match(uploadFunction, /await removeUploadedDocumentObject\(client, uploadedBucket, filePath\)/)
assert.doesNotMatch(uploadFunction, /\.from\('documents'\)\s*\n\s*\.insert/)
assert.doesNotMatch(uploadFunction, /eventType: 'DocumentUploaded'/)
assert.match(uploadFunction, /post-upload automation failed after the atomic upload completed/)
assert.match(uploadFunction, /request projection failed after the atomic upload completed/)
assert.match(uploadFunction, /const postUploadContextPromise = \(async \(\) =>/)
assert.match(uploadFunction, /void \(async \(\) =>/)
assert.ok(
  uploadFunction.indexOf('void (async () =>') < uploadFunction.indexOf('return {\n    ...result.data'),
  'post-upload projections, automation and notifications must run outside the buyer-facing response path',
)

assert.match(portal, /requiredDocumentKey: 'grant_letter',\s*documentType: 'grant_letter'/)
assert.match(portal, /canonicalRequirementInstanceId: options\.requirementInstanceId \|\| null/)

console.log('Atomic buyer portal document upload contract tests passed')
