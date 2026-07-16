import assert from 'node:assert/strict'

const baseUrl = String(process.env.INTAKE_SMOKE_BASE_URL || '').replace(/\/$/, '')
if (!baseUrl) {
  console.error('Set INTAKE_SMOKE_BASE_URL to the deployed Arch9 origin.')
  process.exit(2)
}

const publicUrl = `${baseUrl}/api/public/demo-enquiries`
const adminUrl = `${baseUrl}/api/admin/demo-enquiries`

const optionsResponse = await fetch(publicUrl, { method: 'OPTIONS' })
assert.equal(optionsResponse.status, 204, 'Public intake CORS preflight must succeed')

const invalidResponse = await fetch(publicUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    intakeKind: 'new_business_partner',
    formKey: 'arch9-new-business-intake',
    formVersion: '2026-07-16',
    website: '',
  }),
})
assert.equal(invalidResponse.status, 422, 'Invalid public intake must be rejected before any write')
const invalidBody = await invalidResponse.json()
assert.equal(invalidBody.error, 'validation_failed', 'Invalid public intake must return the validation contract')

const unauthenticatedAdmin = await fetch(adminUrl, { headers: { Accept: 'application/json' } })
assert.equal(unauthenticatedAdmin.status, 401, 'The admin lead API must reject anonymous access')

console.log(`Admin intake launch smoke passed against ${baseUrl}`)

