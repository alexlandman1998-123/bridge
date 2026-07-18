import assert from 'node:assert/strict';import fs from 'node:fs'
const core=fs.readFileSync('src/core/documents/documentGeneratorLaunchChain.js','utf8');const migration=fs.readFileSync('../supabase/migrations/202607180023_document_generator_launch_chain_g1.sql','utf8');const api=fs.readFileSync('src/lib/documentPacketsApi.js','utf8');const verifier=fs.readFileSync('scripts/document-generator-phase-g1-verify.mjs','utf8');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'))
assert.match(core,/assessDocumentGeneratorLaunchChain/);assert.match(core,/G1_EDITABLE_DRAFT_MISSING/);assert.match(core,/G1_RECIPIENT_DELIVERY_INCOMPLETE/)
assert.match(migration,/bridge_get_document_generator_launch_chain_g1/);assert.match(migration,/legal_final_completion_receipts/);assert.match(migration,/document_signer_sessions/);assert.match(api,/getDocumentGeneratorLaunchChain/)
assert.match(verifier,/mutatedData:false/);assert.doesNotMatch(verifier,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);assert.ok(pkg.scripts['verify:document-generator:phase-g1'])
console.log('Document generator Phase G1 launch-chain assurance contract passed.')
