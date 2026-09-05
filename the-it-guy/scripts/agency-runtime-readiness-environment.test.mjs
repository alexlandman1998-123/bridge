import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = fs.readFileSync(path.join(root, 'scripts/agency-runtime-readiness.test.mjs'), 'utf8')

assert.match(source, /staging:\s*'vaszuxjeoajeuhlcnzzf'/, 'staging must use the approved staging project')
assert.match(source, /production:\s*'isdowlnollckzvltkasn'/, 'production must use the approved production project')
assert.match(source, /--environment must be one of/, 'the runner must reject unknown environments')
assert.match(source, /--allow-production-read-only/, 'production probes must require an explicit acknowledgement')
assert.match(source, /\.env\.production\.local/, 'production checks must load the production environment file')
assert.match(source, /\.env\.staging\.local/, 'staging checks must load the staging environment file')

console.log('agency runtime readiness environment guard passed')
