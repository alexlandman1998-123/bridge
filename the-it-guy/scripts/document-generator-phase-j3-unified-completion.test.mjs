import assert from 'node:assert/strict'
import fs from 'node:fs'

const portal = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
for (const token of [
  'SimpleSigningShell',
  'buildSimpleSigningExperienceModel',
  'buildSigningCompletion',
  'open_completed_pdf',
  'resolveSignerFinalSignedArtifactAccess',
  'session?.completion',
]) assert.match(portal, new RegExp(token.replace(/[?.()]/g, '\\$&')))

const simpleSigningModel = fs.readFileSync('src/core/documents/simpleSigningExperienceModel.js', 'utf8')
for (const token of [
  'Open completed PDF',
  'Finalising PDF',
  'Signing recorded. The completed PDF is available now.',
  'Signing recorded. The completed PDF is being prepared and will appear here when it is ready.',
]) assert.match(simpleSigningModel, new RegExp(token.replace(/[?.()]/g, '\\$&')))

const simpleSigningShell = fs.readFileSync('src/components/documents/SimpleSigningShell.jsx', 'utf8')
for (const token of [
  'simple-signing-shell',
  'simple-signing-complete-state',
  'SimpleSigningActionCard',
]) assert.match(simpleSigningShell, new RegExp(token.replace(/[?.()]/g, '\\$&')))

const api = fs.readFileSync('src/lib/api.js', 'utf8')
for (const token of [
  'resolveLatestSignedOtpDocumentForTransaction',
  'OTP_DOCUMENT_TYPES.signedFinal',
  'buildSigningCompletion',
  'signedOtpPdfUrl',
]) assert.match(api, new RegExp(token.replace(/[.]/g, '\\.')))

const resolver = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
assert.match(resolver, /\["sent", "viewed", "signed"\]/)
assert.match(resolver, /if \(!signerAlreadyCompleted\)/)
assert.match(resolver, /SIGNING_COMPLETION_CONTRACT/)
assert.match(resolver, /buildFinalArtifactAccessDescriptor/)
assert.doesNotMatch(resolver, /const finalSignedUrl\b/)
assert.match(resolver, /completion,/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-j3'])

console.log('Document generator J3 unified completion contract passed.')
