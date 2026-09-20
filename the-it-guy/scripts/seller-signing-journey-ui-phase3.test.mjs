import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/ListingMandateSigning.jsx', import.meta.url), 'utf8')

assert.match(source, /function SigningProgressRail/)
assert.match(source, /aria-label="Signing progress"/)
assert.match(source, /gridTemplateColumns: `repeat\(\$\{Math\.max\(stepKeys\.length, 1\)\}, minmax\(0, 1fr\)\)`/)
assert.match(source, /function signingStepLabel/)
assert.match(source, /Your signing journey/)
assert.match(source, /<SigningProgressRail stepKeys=\{stepKeys\} activeStepIndex=\{activeStepIndex\} \/>/)
assert.doesNotMatch(source, /<ol className="mt-5 flex flex-wrap gap-2">/)

console.log('seller signing journey UI phase 3 checks passed')
