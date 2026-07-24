import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessPlatformDefaultReleaseGate } from '../src/core/documents/platformDefaultReleaseGate.js'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url, 'Supabase URL is required.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required for the read-only Phase 7 release gate verifier.')

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: templates, error: templatesError } = await client
  .from('document_packet_templates')
  .select('id, organisation_id, module_type, packet_type, template_key, template_label, template_format, status, is_default, is_active, metadata_json, version_tag, created_at, updated_at, published_at')
  .is('organisation_id', null)
  .eq('module_type', 'agency')
  .in('packet_type', ['otp', 'mandate'])
  .in('template_key', ['otp_default_v1', 'mandate_default_v1'])
  .order('updated_at', { ascending: false })
assert.ifError(templatesError)

const templateIds = (templates || []).map((template) => template.id).filter(Boolean)
const { data: sections, error: sectionsError } = templateIds.length
  ? await client
      .from('document_template_sections')
      .select('id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at')
      .in('template_id', templateIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
  : { data: [], error: null }
assert.ifError(sectionsError)

const certificate = assessPlatformDefaultReleaseGate({
  templates: templates || [],
  sections: sections || [],
})
assert.equal(certificate.mutatedData, false, 'Phase 7 verifier must remain read-only.')

console.log(JSON.stringify(certificate, null, 2))
if (certificate.status !== 'GO') process.exitCode = 1
