import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/lib/attorneyPermissions.js', import.meta.url), 'utf8')

assert.match(
  source,
  /const ATTORNEY_MEMBERSHIP_CACHE_TTL_MS = 15_000/,
  'Attorney membership reads should have a deliberately short startup cache.',
)
assert.match(
  source,
  /const attorneyMembershipInflight = new Map\(\)/,
  'Concurrent membership reads should share a single in-flight request.',
)
assert.match(
  source,
  /const inflight = attorneyMembershipInflight\.get\(cacheKey\)[\s\S]*?if \(inflight\) return inflight/,
  'A concurrent dashboard and permission gate must reuse the first membership request.',
)
assert.match(
  source,
  /attorneyMembershipCache\.set\(cacheKey,[\s\S]*?expiresAt: Date\.now\(\) \+ ATTORNEY_MEMBERSHIP_CACHE_TTL_MS/,
  'Completed membership reads should be reused only for the short TTL.',
)
assert.match(
  source,
  /\.finally\(\(\) => \{\s*attorneyMembershipInflight\.delete\(cacheKey\)/,
  'Failed requests must not remain stuck in the in-flight map.',
)
assert.match(
  source,
  /export function clearAttorneyMembershipCache/,
  'The cache must have an explicit invalidation path for membership mutations.',
)

console.log('attorney membership startup dedupe contract ok')
