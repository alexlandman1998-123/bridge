import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessLegalTemplateApproval } from '../src/core/documents/legalTemplateApproval.js'
import { assessNativeStarterTemplate } from '../src/core/documents/nativeStarterTemplateAssurance.js'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

function text(value) {
  return String(value ?? '').trim()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url, 'Supabase URL is required.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required for the read-only Phase 2 verifier.')

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: templates, error: templatesError } = await client
  .from('document_packet_templates')
  .select('id, organisation_id, module_type, packet_type, template_key, template_label, template_format, status, is_default, is_active, metadata_json, created_at, updated_at, published_at')
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

const sectionsByTemplateId = new Map()
for (const section of sections || []) {
  const rows = sectionsByTemplateId.get(section.template_id) || []
  rows.push(section)
  sectionsByTemplateId.set(section.template_id, rows)
}

function hydrate(template) {
  return {
    ...template,
    sections: sectionsByTemplateId.get(template.id) || [],
  }
}

function isLive(template) {
  return text(template?.status).toLowerCase() === 'published' && template?.is_active === true && template?.is_default === true
}

const globalOtp = (templates || []).filter((template) => template.packet_type === 'otp' && template.template_key === 'otp_default_v1' && isLive(template)).map(hydrate)
const globalMandates = (templates || []).filter((template) => template.packet_type === 'mandate' && template.template_key === 'mandate_default_v1' && isLive(template)).map(hydrate)
const blockers = []
const warnings = []

if (globalOtp.length !== 1) {
  blockers.push({ code: 'GLOBAL_OTP_DEFAULT_CARDINALITY', detail: `Expected one active/default global OTP, found ${globalOtp.length}.` })
}
if (globalMandates.length !== 1) {
  blockers.push({ code: 'GLOBAL_MANDATE_DEFAULT_CARDINALITY', detail: `Expected one active/default global mandate, found ${globalMandates.length}.` })
}

const mandate = globalMandates[0] || null
if (mandate) {
  const metadata = record(mandate.metadata_json)
  if (!['structured', 'json'].includes(text(mandate.template_format).toLowerCase())) {
    blockers.push({ code: 'GLOBAL_MANDATE_NOT_NATIVE_FORMAT', detail: `Expected structured/json, found ${mandate.template_format || 'missing'}.` })
  }
  if (text(metadata.render_mode || metadata.renderMode) !== 'native_structured') {
    blockers.push({ code: 'GLOBAL_MANDATE_RENDER_MODE_INVALID', detail: 'Global mandate must use native_structured render mode.' })
  }
  if (metadata.platform_default_can_route_without_org_template !== true) {
    warnings.push({ code: 'GLOBAL_MANDATE_PLATFORM_DEFAULT_MARKER_MISSING', detail: 'Phase 2 marker is missing; apply the Phase 2 migration.' })
  }

  const starterAssessment = assessNativeStarterTemplate(mandate)
  if (!starterAssessment.ready) {
    blockers.push({ code: 'GLOBAL_MANDATE_NATIVE_STARTER_INVALID', detail: starterAssessment.blockers.join('; ') })
  }

  const approvalAssessment = assessLegalTemplateApproval(mandate, { expectedPacketType: 'mandate' })
  if (!approvalAssessment.approved) {
    blockers.push({ code: 'GLOBAL_MANDATE_NOT_APPROVED', detail: approvalAssessment.reasons.join(', ') })
  }
}

const otp = globalOtp[0] ? hydrate(globalOtp[0]) : null
if (otp) {
  const approvalAssessment = assessLegalTemplateApproval(otp, { expectedPacketType: 'otp' })
  if (!approvalAssessment.approved) {
    warnings.push({ code: 'GLOBAL_OTP_NOT_APPROVED', detail: approvalAssessment.reasons.join(', ') })
  }
}

const report = {
  phase: 2,
  status: blockers.length ? 'NO_GO' : 'GO',
  blockerCount: blockers.length,
  warningCount: warnings.length,
  blockers,
  warnings,
  evidence: {
    otp: globalOtp.map((template) => ({
      id: template.id,
      key: template.template_key,
      sectionCount: template.sections.length,
      status: template.status,
      active: template.is_active,
      default: template.is_default,
    })),
    mandate: globalMandates.map((template) => ({
      id: template.id,
      key: template.template_key,
      sectionCount: template.sections.length,
      conditionalSectionCount: template.sections.filter((section) => Object.keys(record(section.condition_json)).length > 0).length,
      status: template.status,
      active: template.is_active,
      default: template.is_default,
    })),
  },
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}

console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 1
