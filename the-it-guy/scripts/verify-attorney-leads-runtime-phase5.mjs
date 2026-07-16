import assert from 'node:assert/strict'

const projectRef = process.env.SUPABASE_PROJECT_REF || 'isdowlnollckzvltkasn'
const slug = process.env.ATTORNEY_INTAKE_SMOKE_SLUG || process.argv[2] || 'canonical-qa-attorney-firm-mrnwetyv'
const endpoint = `https://${projectRef}.supabase.co/functions/v1/attorney-public-intake`

async function post(body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  assert.equal(response.ok, true, payload.error || `Public runtime returned HTTP ${response.status}`)
  return payload
}

const health = await post({ action: 'health', slug })
assert.equal(health.healthy, true, `Public runtime health failed: ${health.code || 'unknown'}`)
assert.equal(health.intake_active, true, `Journey ${slug} is not active through the deployed runtime`)
assert.match(String(health.runtime_version || ''), /^attorney-public-intake-phase5-/)

const resolved = await post({ action: 'resolve', slug })
assert.equal(resolved.intake?.slug, slug)
assert.equal(resolved.intake?.status, 'active')

console.log(JSON.stringify({
  status: 'passed',
  projectRef,
  slug,
  runtimeVersion: health.runtime_version,
  serviceCount: Array.isArray(resolved.intake?.service_types) ? resolved.intake.service_types.length : 0,
}, null, 2))
