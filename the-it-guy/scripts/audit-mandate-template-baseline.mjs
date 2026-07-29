import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  buildMandateTemplateBaselineAudit,
  formatMandateTemplateBaselineAuditMarkdown,
} from '../src/core/documents/mandateTemplateBaselineAudit.js'

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

function selectLiveMandateTemplate(templates = []) {
  return [...templates].sort((left, right) => {
    const score = (template) => [
      text(template.status).toLowerCase() === 'published' ? 1 : 0,
      template.is_active === true ? 1 : 0,
      template.is_default === true ? 1 : 0,
      Number(template.revision_number || 0),
      Date.parse(template.updated_at || template.created_at || '') || 0,
    ]
    const leftScore = score(left)
    const rightScore = score(right)
    for (let index = 0; index < leftScore.length; index += 1) {
      if (leftScore[index] !== rightScore[index]) return rightScore[index] - leftScore[index]
    }
    return text(left.id).localeCompare(text(right.id))
  })[0] || null
}

async function readSnapshot() {
  const require = createRequire(import.meta.url)
  const { createClient } = require('@supabase/supabase-js')
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  assert.ok(url, 'VITE_SUPABASE_URL or SUPABASE_URL is required.')
  assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required for the read-only mandate baseline audit.')

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: templates, error: templatesError } = await client
    .from('document_packet_templates')
    .select('id, organisation_id, module_type, packet_type, template_key, template_label, template_format, status, is_default, is_active, version_tag, revision_number, metadata_json, created_at, updated_at, published_at')
    .is('organisation_id', null)
    .eq('module_type', 'agency')
    .eq('packet_type', 'mandate')
    .eq('template_key', 'mandate_default_v1')
    .order('updated_at', { ascending: false })
  assert.ifError(templatesError)

  const template = selectLiveMandateTemplate(templates || [])
  assert.ok(template?.id, 'No global mandate_default_v1 template was found.')

  const { data: sections, error: sectionsError } = await client
    .from('document_template_sections')
    .select('id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at')
    .eq('template_id', template.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  assert.ifError(sectionsError)

  return { template, sections: sections || [] }
}

const outputPath = arg('out', 'docs/mandate-template-vnext-phase1-baseline-audit.md')
const jsonPath = arg('json-out', '')
const snapshot = await readSnapshot()
const audit = buildMandateTemplateBaselineAudit(snapshot)

if (jsonPath) {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`)
}

if (flag('json')) {
  console.log(JSON.stringify(audit, null, 2))
} else {
  const markdown = formatMandateTemplateBaselineAuditMarkdown(audit)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, markdown)
  console.log(JSON.stringify({
    status: audit.status,
    outputPath,
    templateId: audit.template.id,
    sectionCount: audit.visualBaseline.sectionCount,
    mergeFieldCount: audit.mergeFieldAudit.tokenCount,
    wordingGapCount: audit.wordingGaps.length,
    headingIssueCount: audit.headingIssues.length,
    blankRenderRiskCount: audit.blankRenderRisks.length,
    mutatedData: false,
  }, null, 2))
}
