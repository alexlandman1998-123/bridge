import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createServer } from 'vite'
import { buildSimpleSigningExperienceModel } from '../src/core/documents/simpleSigningExperienceModel.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shellSource = fs.readFileSync('src/components/documents/SimpleSigningShell.jsx', 'utf8')
const config = JSON.parse(fs.readFileSync('config/document-generator-simple-signing-phase2-shell.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-2.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(config.phase, 'document-generator-simple-signing-ui-phase-2')
assert.equal(config.status, 'shell_ready')
assert.equal(config.inputContract, 'arch9-simple-signing-experience-model-v1')

for (const component of [
  'SimpleSigningProgressStepper',
  'SimpleSigningDocumentCard',
  'SimpleSigningActionCard',
  'SimpleSigningHelpCard',
  'SimpleSigningSecureFooter',
  'SimpleSigningCompleteState',
  'SimpleSigningShell',
]) {
  assert.ok(shellSource.includes(component), `Phase 2 shell should export ${component}`)
}

for (const testId of [
  'simple-signing-shell',
  'simple-signing-progress',
  'simple-signing-document-card',
  'simple-signing-action-card',
  'simple-signing-help-card',
  'simple-signing-secure-footer',
]) {
  assert.ok(shellSource.includes(`data-testid="${testId}"`), `Phase 2 shell should expose ${testId}`)
}

for (const forbidden of [
  'dispatch-final-signed-document',
  'send-email',
  'completeSignerSigning(',
  'applySignerField(',
  'resolveSignerFinalSignedArtifactAccess(',
  'downloadUrl:',
]) {
  assert.equal(shellSource.includes(forbidden), false, `Phase 2 shell must not own ${forbidden}`)
}

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const shellModule = await server.ssrLoadModule('/src/components/documents/SimpleSigningShell.jsx')
  const SimpleSigningShell = shellModule.default
  const model = buildSimpleSigningExperienceModel({
    session: {
      packet: { packet_type: 'mandate', title: 'Mandate' },
      signer: { signer_role: 'seller', status: 'viewed' },
      version: { rendered_file_name: 'Mandate_Seller.pdf', page_count: 6 },
      fields: [{ id: 'signature-1', field_type: 'signature', page_number: 4, required: true, status: 'pending' }],
    },
    documentPreviewUrl: 'present',
  })
  const markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(SimpleSigningShell, {
      model,
      documentPreview: React.createElement('div', { 'data-testid': 'preview-slot' }, 'Preview slot'),
    }),
  )
  assert.match(markup, /Mandate . Seller/)
  assert.match(markup, /Your signing progress/)
  assert.match(markup, /Step 2 of 3/)
  assert.match(markup, /Document/)
  assert.match(markup, /Mandate_Seller\.pdf/)
  assert.match(markup, /Add my signature/)
  assert.match(markup, /Need help/)
  assert.match(markup, /Your data is secure and encrypted/)
  assert.match(markup, /Powered by Arch9/)
} finally {
  await server.close()
}

for (const reference of [
  'visual shell',
  'Review -> Sign -> Finish',
  'document preview slot',
  'no email delivery changes',
  'not wired into SignerPortal',
]) {
  assert.ok(audit.includes(reference), `Phase 2 audit should keep ${reference}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase2'],
  'node --test src/core/documents/__tests__/simpleSigningExperienceScope.test.js src/core/documents/__tests__/simpleSigningExperienceModel.test.js && node scripts/document-generator-simple-signing-phase2-shell.test.mjs',
)

console.log('document-generator simple signing Phase 2 shell guard passed.')
