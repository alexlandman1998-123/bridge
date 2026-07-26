import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const content = await readFile(
  new URL('../../supabase/functions/send-email/content/sellerOnboarding.ts', import.meta.url),
  'utf8',
)
const handler = await readFile(
  new URL('../../supabase/functions/send-email/handlers/sellerOnboarding.ts', import.meta.url),
  'utf8',
)
const types = await readFile(
  new URL('../../supabase/functions/send-email/types.ts', import.meta.url),
  'utf8',
)

assert.match(content, /type SellerPortalRequiredDocument/, 'seller portal email content should type required document rows.')
assert.match(content, /function renderRequiredDocumentsHtml/, 'HTML email should render the requested document checklist.')
assert.match(content, /function renderRequiredDocumentsText/, 'Plaintext email should render the requested document checklist.')
assert.match(content, /Documents requested/, 'email copy should label the requested documents clearly.')
assert.match(content, /Based on your/, 'email copy should tie the checklist to the seller structure.')
assert.match(content, /requiredDocuments\?: SellerPortalRequiredDocument\[\]/, 'email builders should accept required documents.')
assert.match(content, /sellerStructure\?: unknown/, 'email builders should accept seller structure metadata.')

assert.match(handler, /const requiredDocuments = Array\.isArray\(payload\.requiredDocuments\)/, 'handler should normalize required document payloads.')
assert.match(handler, /sellerStructure = payload\.sellerStructure/, 'handler should forward seller structure metadata.')
assert.match(handler, /requiredDocuments,\n\s+sellerStructure,/, 'handler should pass required documents and structure into email builders.')

assert.match(types, /requiredDocuments\?: Array<\{/, 'send-email payload type should include requiredDocuments.')
assert.match(types, /sellerStructure\?: Record<string, unknown> \| string \| null/, 'send-email payload type should include sellerStructure.')
assert.match(types, /documentPackSource\?: string/, 'send-email payload type should include the document pack source.')
assert.match(types, /documentPackFingerprint\?: string/, 'send-email payload type should include the document pack fingerprint.')
assert.match(types, /workflowDedupeKey\?: string/, 'send-email payload type should include the workflow dedupe key.')

console.log('seller post-mandate document email content tests passed')
