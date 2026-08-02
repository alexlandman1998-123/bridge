import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const packetApi = await readFile(resolve(root, 'src/lib/documentPacketsApi.js'), 'utf8')
const workspace = await readFile(resolve(root, 'src/components/documents/LegalDocumentWorkspace.jsx'), 'utf8')
const workspacePage = await readFile(resolve(root, 'src/pages/LegalDocumentWorkspacePage.jsx'), 'utf8')

assert.match(packetApi, /export function isPersistedSupabaseSignedUrl/, 'PDF access must detect persisted Supabase signed URLs.')
assert.match(packetApi, /export async function resolveRenderedPdfAccess/, 'PDF access must be resolved through one canonical helper.')
assert.match(packetApi, /contract: 'rendered-pdf-access-v1'/, 'Rendered PDF access resolver must return a stable contract.')
assert.match(packetApi, /rendered_file_path[\s\S]+createSignedUrlAcrossBuckets/, 'Resolver must use rendered_file_path to create a fresh signed URL.')
assert.match(packetApi, /PERSISTED_SIGNED_URL_IGNORED/, 'Persisted Supabase signed URLs must be ignored, not reused.')
assert.match(packetApi, /hydrated\.rendered_file_access_url = renderedAccess\.accessUrl \|\| ''/, 'Hydration must expose fresh access URLs via rendered_file_access_url.')
assert.match(packetApi, /hydrated\.rendered_file_url = normalizeDurableDocumentUrl\(version\?\.rendered_file_url\)/, 'Hydration must strip persisted signed URLs from rendered_file_url fallbacks.')
assert.match(packetApi, /rendered_file_access_error/, 'Hydration must expose access failure details without restarting generation.')

assert.match(workspace, /function normalizeDurablePreviewUrl/, 'Workspace UI must guard preview/download fallbacks.')
assert.match(workspace, /normalizeText\(version\?\.rendered_file_access_url\) \|\| normalizeDurablePreviewUrl\(version\?\.rendered_file_url\)/, 'Workspace download URL must prefer fresh access URLs over persisted URLs.')
assert.match(workspace, /normalizeText\(latestVersion\?\.rendered_file_access_url\) \|\|\s+normalizeDurablePreviewUrl\(latestVersion\?\.rendered_file_url\)/, 'Workspace preview URL must ignore persisted signed URL fallbacks.')

assert.match(workspacePage, /function normalizeDurablePreviewUrl/, 'Workspace page actions must guard preview fallbacks.')
assert.match(workspacePage, /normalizeText\(latestVersion\?\.rendered_file_access_url\) \|\|\s+normalizeDurablePreviewUrl\(latestVersion\?\.rendered_file_url\)/, 'Open latest document must not use persisted Supabase signed URLs.')

console.log('Rendered PDF access resolver checks passed.')
