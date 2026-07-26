import assert from 'node:assert/strict'
import fs from 'node:fs'

const resolverPath = '../supabase/functions/resolve-final-signed-document-access/index.ts'
const clientPath = 'src/core/documents/finalSignedArtifactAccess.js'
const sharedPath = '../supabase/functions/_shared/finalSignedArtifactAccess.ts'
const resolver = fs.readFileSync(resolverPath, 'utf8')
const client = fs.readFileSync(clientPath, 'utf8')
const shared = fs.readFileSync(sharedPath, 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-3.md', 'utf8')

assert.match(resolver, /async function authorizeWorkspace\(\{ url, anonKey, serviceKey, authorization, packetId \}/)
assert.match(resolver, /if \(!bearer \|\| bearer === anonKey\) return false/)
assert.match(resolver, /function isServiceRoleProjectJwt/)
assert.match(resolver, /if \(token === serviceKey\) return true/)
assert.match(resolver, /normalizeFinalArtifactText\(claims\.role\) === "service_role"/)
assert.match(resolver, /normalizeFinalArtifactText\(claims\.ref\) === expectedRef/)
assert.match(resolver, /serviceKey,\s*\n\s*authorization: req\.headers\.get\("authorization"\) \|\| ""/)

assert.match(client, /\['client_portal', 'seller_portal', 'workspace', 'signer'\]/)
assert.match(client, /signingToken = ''/)
assert.match(client, /signingToken: normalizeText\(signingToken\) \|\| null/)
assert.match(client, /export function resolveSignerFinalSignedArtifactAccess/)

for (const reference of [
  /isPhase3EvidenceExact/,
  /isPublishedFinalDocumentExact/,
  /createSignedUrl/,
  /pending_evidence/,
  /pending_publication/,
]) {
  assert.match(shared, reference, `shared final artifact fence must keep ${reference}`)
}

for (const reference of [
  'service-role workspace authorization',
  'signer-context client wrapper',
  'does not relax the final artifact fence',
  'resolvePublishedFinalSignedArtifact',
]) {
  assert.ok(audit.includes(reference), `Phase 3 audit should keep: ${reference}`)
}

console.log('document-generator final-mile Phase 3 access resolution passed.')
