import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')

assert.doesNotMatch(
  source,
  /^import '\.\/styles\/premiumSaaS\.css'$/m,
  'The non-critical presentation layer must not block application startup.',
)
assert.match(
  source,
  /void import\('\.\/styles\/premiumSaaS\.css'\)/,
  'The presentation layer should still load as a separate on-demand stylesheet.',
)
assert.match(
  source,
  /window\.requestIdleCallback\(loadDeferredPresentationStyles, \{ timeout: 2000 \}\)/,
  'The presentation layer should be scheduled after the initial render is idle.',
)
assert.match(
  source,
  /window\.setTimeout\(loadDeferredPresentationStyles, 0\)/,
  'Browsers without requestAnimationFrame need a non-blocking fallback.',
)
assert.ok(
  source.indexOf("import './index.css'") < source.indexOf('root.render('),
  'Base styles must remain available before the application renders.',
)

console.log('phase 3 render-blocking styles contract ok')
