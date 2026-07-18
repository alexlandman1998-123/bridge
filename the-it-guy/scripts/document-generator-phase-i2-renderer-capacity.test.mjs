import assert from 'node:assert/strict'
import fs from 'node:fs'

const renderer = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
for (const token of ['RENDERER_CONTRACT = "i2-v1"', 'capacityProbe && bearer !== SUPABASE_SERVICE_ROLE_KEY', 'RENDER_CAPACITY_FORBIDDEN', 'resolveFrozenNativeRenderInputD2', 'renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED', 'inputAuthority: "database_frozen_revision"', 'generatorContract: "i2-generator-v1"', 'frozenInput:', 'assertValidPdfBytes(outputBytes)', 'mediaType: contentType', 'mutatedData: false']) assert.match(renderer, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.doesNotMatch(renderer, /renderMode === TEMPLATE_RENDER_MODES\.NATIVE_STRUCTURED && !capacityProbe/)
const capacityExit = renderer.lastIndexOf('if (capacityProbe)')
assert.ok(capacityExit > renderer.indexOf('resolveFrozenNativeRenderInputD2'))
assert.ok(renderer.indexOf('.upload(', capacityExit) > capacityExit, 'capacity response must return before storage upload')
assert.ok(renderer.indexOf('insertMandateDocumentRecord', capacityExit) > renderer.indexOf('.upload(', capacityExit), 'capacity response must return before document persistence')

const verifier = fs.readFileSync('scripts/document-generator-phase-i2-renderer-capacity.mjs', 'utf8')
for (const token of ['STAGING_PROJECT_REF', 'document-generator-phase-i1-concurrency.mjs', 'document-generator-phase-g1-verify.mjs', "createHash('sha256'", 'stateDigest', 'capacityProbe: true', "functions/v1/generate-mandate", "renderMode: 'native_structured'", 'Promise.all(calls)', 'beforeSnapshots', 'afterSnapshots', 'RENDER_CAPACITY_FORBIDDEN', 'mutatedData: false']) assert.match(verifier, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|client[^;\n]*\.update\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-i2'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-i2'])
console.log('Document generator I2 renderer-capacity contract passed.')
