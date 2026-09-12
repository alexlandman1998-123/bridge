import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const before = readFileSync(new URL('./fixtures/attorney-permission-before.sql', import.meta.url), 'utf8')
const after = readFileSync(new URL('../../supabase/migrations/20260912071751_attorney_permission_identity_initplans.sql', import.meta.url), 'utf8')
const body = (sql, name) => sql.split(`FUNCTION public.${name}(`)[1].split('$function$')[1]
const normalise = text => text.replaceAll('v_uid', 'auth.uid()')
  .replaceAll('v_email', "lower(coalesce(auth.jwt() ->> 'email', ''))")
  .replace(/\s+/g, ' ').trim()
function splitOuterOr(expression) {
  let depth = 0, quoted = false, start = 0
  const parts = []
  for (let i = 0; i < expression.length; i++) {
    const char = expression[i]
    if (char === "'") {
      if (quoted && expression[i + 1] === "'") { i++; continue }
      quoted = !quoted
    }
    if (quoted) continue
    if (char === '(') depth++
    if (char === ')') depth--
    if (!depth && expression.startsWith('or ', i) && /\s/.test(expression[i - 1])) {
      parts.push(expression.slice(start, i).trim()); start = i + 3
    }
  }
  parts.push(expression.slice(start).trim())
  return parts
}
const oldSpine = body(before, 'bridge_can_access_transaction_spine')
const newSpine = body(after, 'bridge_can_access_transaction_spine')
const originalBranches = splitOuterOr(oldSpine.slice(oldSpine.indexOf('public.bridge_transaction_scope_is_internal_user()'), oldSpine.lastIndexOf('\n      )')))
const newBranches = [...newSpine.matchAll(/  if ([\s\S]*?) then return (true|false); end if;/g)]
assert.equal(newBranches[0][1], 'v_uid is null')
assert.equal(newBranches[1][1], 'not found')
assert.deepEqual(newBranches.slice(2).map(m => normalise(m[1])), originalBranches.map(normalise))
assert.ok(newBranches.slice(2).every(m => m[2] === 'true'))
assert.equal(originalBranches.length, 13)
const legacyNormalise = text => text.replaceAll('v_uid', 'auth.uid()')
  .replaceAll('v_email', 'public.bridge_current_user_email()')
  .replaceAll('v_profile_role', 'public.bridge_current_profile_role()').replace(/\s+/g, ' ').trim()
const oldLegacy = [...body(before, 'bridge_has_transaction_access').matchAll(/      when ([\s\S]*?) then (true|false)\n/g)]
const newLegacy = [...body(after, 'bridge_has_transaction_access').matchAll(/  if ([\s\S]*?) then return (true|false); end if;/g)]
assert.deepEqual(newLegacy.map(m => [legacyNormalise(m[1]), m[2]]), oldLegacy.map(m => [legacyNormalise(m[1]), m[2]]))
assert.equal(oldLegacy.length, 6)
assert.equal((after.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 2)
assert.equal((after.match(/STABLE SECURITY DEFINER SET search_path TO 'public'/g) || []).length, 2)
assert.doesNotMatch(after, /\b(?:GRANT|REVOKE|CREATE POLICY|ALTER POLICY|DROP POLICY)\b/)
assert.match(newSpine, /v_uid uuid := auth.uid\(\)/)
assert.match(newSpine, /v_email := lower\(coalesce\(auth.jwt\(\) ->> 'email', ''\)\)/)
assert.match(after, /Permission definitions changed/)
console.log('PASS: all 19 original access branches, null/missing-matter guards and execution grants preserved')
