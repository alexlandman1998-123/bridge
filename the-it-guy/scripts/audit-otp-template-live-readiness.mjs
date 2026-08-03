import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  buildOtpTemplateCorrectiveMigrationPlan,
  buildOtpTemplateLiveAudit,
  formatOtpTemplateLiveAuditMarkdown,
} from '../src/core/documents/otpTemplateLiveAudit.js'

function text(value) {
  return String(value ?? '').trim()
}

function arg(name, fallback = '') {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback
}

function flag(name) {
  return process.argv.includes(`--${name}`)
}

async function readSnapshot() {
  const require = createRequire(import.meta.url)
  const { createClient } = require('@supabase/supabase-js')
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  assert.ok(url, 'VITE_SUPABASE_URL or SUPABASE_URL is required.')
  assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required for the read-only OTP live audit.')

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: templates, error: templatesError } = await client
    .from('document_packet_templates')
    .select('id, organisation_id, module_type, packet_type, template_key, template_label, template_format, status, is_default, is_active, version_tag, revision_number, metadata_json, created_at, updated_at, published_at')
    .eq('packet_type', 'otp')
    .order('updated_at', { ascending: false })
  assert.ifError(templatesError)

  const templateIds = (templates || []).map((template) => text(template.id)).filter(Boolean)
  const sectionsByTemplateId = {}
  if (templateIds.length) {
    const { data: sections, error: sectionsError } = await client
      .from('document_template_sections')
      .select('id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at')
      .in('template_id', templateIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    assert.ifError(sectionsError)
    for (const section of sections || []) {
      const templateId = text(section.template_id)
      if (!sectionsByTemplateId[templateId]) sectionsByTemplateId[templateId] = []
      sectionsByTemplateId[templateId].push(section)
    }
  }

  return { templates: templates || [], sectionsByTemplateId }
}

const outputPath = arg('out', 'docs/otp-template-vnext-phase9-live-audit.md')
const jsonPath = arg('json-out', '')
const snapshot = await readSnapshot()
const audit = buildOtpTemplateLiveAudit(snapshot)
const migrationPlan = buildOtpTemplateCorrectiveMigrationPlan(audit)

if (jsonPath) {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, `${JSON.stringify({ audit, migrationPlan }, null, 2)}\n`)
}

if (flag('json')) {
  console.log(JSON.stringify({ audit, migrationPlan }, null, 2))
} else {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, [
    formatOtpTemplateLiveAuditMarkdown(audit),
    '',
    '## Corrective Migration Plan',
    '',
    `Status: ${migrationPlan.status}`,
    `Can apply: ${migrationPlan.canApply ? 'true' : 'false'}`,
    `Planned steps: ${migrationPlan.steps.length}`,
    '',
  ].join('\n'))
  console.log(JSON.stringify({
    status: audit.status,
    outputPath,
    otpTemplateCount: audit.summary.otpTemplateCount,
    liveTemplateCount: audit.summary.liveTemplateCount,
    blockerCount: audit.summary.blockerCount,
    migrationPlanStatus: migrationPlan.status,
    mutatedData: false,
  }, null, 2))
}
