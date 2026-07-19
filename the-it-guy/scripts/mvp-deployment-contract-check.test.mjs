import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('scripts/mvp-deployment-contract-check.mjs', 'utf8')

assert.match(source, /body: JSON\.stringify\(\{ p_payload: \{\} \}\)/)
assert.match(source, /rpcParameter: 'p_payload'/)
assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
assert.doesNotMatch(source, /body: '\{\}'/)

console.log('mvp-deployment-contract-check: passed')
