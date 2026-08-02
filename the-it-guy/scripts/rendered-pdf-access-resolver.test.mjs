import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const packetApi = await readFile(resolve(root, 'src/lib/documentPacketsApi.js'), 'utf8')
const workspace = await readFile(resolve(root, 'src/components/documents/LegalDocumentWorkspace.jsx'), 'utf8')
const workspacePage = await readFile(resolve(root, 'src/pages/LegalDocumentWorkspacePage.jsx'), 'utf8')
const signerPortal = await readFile(resolve(root, 'src/pages/SignerPortal.jsx'), 'utf8')
const signingTemplatesPage = await readFile(resolve(root, 'src/pages/settings/SettingsSigningTemplatesPage.jsx'), 'utf8')
const agentLeadsPage = await readFile(resolve(root, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const packetService = await readFile(resolve(root, 'src/core/documents/packetService.js'), 'utf8')
const generationContract = await readFile(resolve(root, 'src/lib/documentGenerationContract.js'), 'utf8')

assert.match(packetApi, /export function isPersistedSupabaseSignedUrl/, 'PDF access must detect persisted Supabase signed URLs.')
assert.match(packetApi, /export async function resolveRenderedPdfAccess/, 'PDF access must be resolved through one canonical helper.')
assert.match(packetApi, /contract: 'rendered-pdf-access-v1'/, 'Rendered PDF access resolver must return a stable contract.')
assert.match(packetApi, /rendered_file_path[\s\S]+createSignedUrlAcrossBuckets/, 'Resolver must use rendered_file_path to create a fresh signed URL.')
assert.match(packetApi, /PERSISTED_SIGNED_URL_IGNORED/, 'Persisted Supabase signed URLs must be ignored, not reused.')
assert.match(packetApi, /hydrated\.rendered_file_access_url = renderedAccess\.accessUrl \|\| ''/, 'Hydration must expose fresh access URLs via rendered_file_access_url.')
assert.match(packetApi, /hydrated\.rendered_file_url = normalizeDurableDocumentUrl\(version\?\.rendered_file_url\)/, 'Hydration must strip persisted signed URLs from rendered_file_url fallbacks.')
assert.match(packetApi, /rendered_file_access_error/, 'Hydration must expose access failure details without restarting generation.')
assert.match(packetApi, /async function hydrateDocumentPacketPayloadAccessUrls/, 'Packet payload hydration must normalize nested version shapes.')
assert.match(packetApi, /versions: \[result\.version\],[\s\S]+currentVersion: result\.version,[\s\S]+\}\)/, 'Editable draft creation must return hydrated version data.')
assert.match(packetApi, /p_rendered_file_url: normalizeDurableDocumentUrl\(input\.renderedFileUrl\) \|\| null/, 'Generated version writes must not persist signed rendered_file_url values.')
assert.match(packetApi, /final_signed_file_url: normalizeDurableDocumentUrl\(finalSignedFileUrl\) \|\| null/, 'Final artifact writes must not persist signed final_signed_file_url values.')

assert.match(workspace, /function normalizeDurablePreviewUrl/, 'Workspace UI must guard preview/download fallbacks.')
assert.match(workspace, /normalizeText\(version\?\.rendered_file_access_url\) \|\| normalizeDurablePreviewUrl\(version\?\.rendered_file_url\)/, 'Workspace download URL must prefer fresh access URLs over persisted URLs.')
assert.match(workspace, /normalizeText\(latestVersion\?\.rendered_file_access_url\) \|\|\s+normalizeDurablePreviewUrl\(latestVersion\?\.rendered_file_url\)/, 'Workspace preview URL must ignore persisted signed URL fallbacks.')
assert.match(workspace, /resolveRenderedPdfAccess\(\{\s*version: latestVersion,[\s\S]+retrySignedUrl: true/, 'Workspace must refresh generated draft PDF access from the canonical resolver.')
assert.match(workspace, /latestVersion\?\.transaction_pdf_persisted === true[\s\S]+refreshCertifiedPdfAccess\('download'[\s\S]+refreshGeneratedPdfAccess\(\{ download: true \}\)/, 'Workspace download must use generated PDF access unless the version is certified/persisted.')
assert.match(workspace, /PDF is stored, but its secure link needs refreshing\./, 'Workspace must show a recovery state when the PDF exists but access is missing.')

assert.match(workspacePage, /function normalizeDurablePreviewUrl/, 'Workspace page actions must guard preview fallbacks.')
assert.match(workspacePage, /normalizeText\(latestVersion\?\.rendered_file_access_url\) \|\|\s+normalizeDurablePreviewUrl\(latestVersion\?\.rendered_file_url\)/, 'Open latest document must not use persisted Supabase signed URLs.')

assert.match(signerPortal, /function normalizeDurablePreviewUrl/, 'Signer portal must guard stored version preview fallbacks.')
assert.match(signerPortal, /normalizeDurablePreviewUrl\(session\?\.previewVersion\?\.rendered_file_url\)/, 'Signer portal must not use stored preview version signed URLs directly.')
assert.doesNotMatch(signerPortal, /previewVersion\?\.rendered_file_url\s+\|\|\s+session\?\.version\?\.rendered_file_url/, 'Signer portal must not chain raw rendered_file_url fallbacks.')

assert.match(signingTemplatesPage, /function normalizeDurableDocumentUrl/, 'Signing template settings must guard artifact URL fallbacks.')
assert.match(signingTemplatesPage, /normalizeDurableDocumentUrl\(version\?\.rendered_file_url\)/, 'Signing template settings must not open stored signed generated URLs.')
assert.doesNotMatch(signingTemplatesPage, /rendered_file_access_url\s+\|\|\s+version\?\.rendered_file_url/, 'Signing template settings must prefer fresh access URLs over raw rendered URLs.')

assert.match(agentLeadsPage, /function normalizeDurableDocumentUrl/, 'Lead mandate summaries must guard generated PDF URL fallbacks.')
assert.match(agentLeadsPage, /normalizeDurableDocumentUrl\(latestVersion\?\.rendered_file_url\)/, 'Lead summaries must not use stored signed generated URLs.')
assert.doesNotMatch(agentLeadsPage, /latestVersion\?\.rendered_file_access_url\s+\|\|\s+latestVersion\?\.rendered_file_url/, 'Lead summaries must not chain raw version rendered URLs.')

assert.match(packetService, /function normalizeDurableDocumentUrl/, 'Packet service must avoid persisting signed URLs as durable document URLs.')
assert.doesNotMatch(packetService, /renderedFileUrl:\s*normalizeNullableText\(\s*result\?\.output\?\.signedUrl/, 'Generated packet artifacts must not persist renderer signedUrl values.')

assert.match(generationContract, /function durableUrl/, 'Generation contract must distinguish durable URLs from signed access URLs.')
assert.match(generationContract, /renderedFileUrl: durableUrl\(storage\.publicUrl, documentRecord\.url, document\.url, response\.url, response\.renderedFileUrl\)/, 'Generation contract must not promote output.signedUrl into renderedFileUrl.')
assert.doesNotMatch(generationContract, /renderedFileUrl: text\(output\.signedUrl/, 'Generation contract must not reuse output.signedUrl as a stored artifact URL.')

console.log('Rendered PDF access resolver checks passed.')
