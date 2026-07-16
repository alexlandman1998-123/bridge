import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const WRITE_FLAG = 'OTP_TEMPLATE_STAGING_WRITE'
const TEMPLATE_ID = '3cec3c33-fd76-43de-9e5c-d4dff3f510a1'
const TEMPLATE_FILE = resolve(process.cwd(), 'assets/legal-templates/otp_default_v1.docx')
const TEMPLATE_BUCKET = 'documents'
const TEMPLATE_PATH = 'legal-templates/global/agency/otp/otp_default_v1/v1/otp_default_v1.docx'

function parseEnv(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

const write = process.argv.includes('--write')
const confirmed = process.argv.includes('--confirm-staging')
const env = { ...parseEnv(resolve(process.cwd(), '.env')), ...parseEnv(resolve(process.cwd(), '.env.staging.local')), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url.includes(STAGING_PROJECT_REF), 'Refusing to configure a non-staging project.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'Service role key is required for the global staging template.')
assert.ok(existsSync(TEMPLATE_FILE), 'Build the OTP default template before setup.')
if (write) assert.ok(confirmed && process.env[WRITE_FLAG] === 'true', `Write mode requires --confirm-staging and ${WRITE_FLAG}=true.`)

const require = createRequire(resolve(process.cwd(), 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const existing = await client.from('document_packet_templates').select('id, template_key, status, template_storage_bucket, template_storage_path, template_file_name, metadata_json').eq('id', TEMPLATE_ID).maybeSingle()
assert.ifError(existing.error)
assert.ok(existing.data?.id, 'The staging OTP default template was not found.')

if (!write) {
  console.log(JSON.stringify({ mode: 'dry-run', template: existing.data, intended: { bucket: TEMPLATE_BUCKET, path: TEMPLATE_PATH, file: TEMPLATE_FILE } }, null, 2))
  process.exit(0)
}

const bytes = readFileSync(TEMPLATE_FILE)
const upload = await client.storage.from(TEMPLATE_BUCKET).upload(TEMPLATE_PATH, bytes, {
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  upsert: true,
})
assert.ifError(upload.error)
const update = await client.from('document_packet_templates').update({
  template_storage_bucket: TEMPLATE_BUCKET,
  template_storage_path: TEMPLATE_PATH,
  template_file_name: 'otp_default_v1.docx',
  metadata_json: {
    ...(existing.data.metadata_json || {}),
    template_storage_bucket: TEMPLATE_BUCKET,
    template_storage_path: TEMPLATE_PATH,
    template_file_name: 'otp_default_v1.docx',
    render_mode: 'legacy_docx',
    last_render_validation: {
      renderable: true,
      sourcePresent: true,
      validatedAt: new Date().toISOString(),
      source: 'phase2_controlled_staging_setup',
    },
  },
}).eq('id', TEMPLATE_ID).select('id, template_key, status, template_storage_bucket, template_storage_path, template_file_name, metadata_json').single()
assert.ifError(update.error)
console.log(JSON.stringify({ mode: 'controlled-write', template: update.data, uploadedBytes: bytes.length }, null, 2))
