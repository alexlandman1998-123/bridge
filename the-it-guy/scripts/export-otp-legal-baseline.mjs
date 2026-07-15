import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  buildOtpLegalBaseline,
  createOtpAttorneyReviewManifest,
  getOtpBaselineHashPayload,
  stableStringify,
} from '../src/core/documents/otpLegalBaseline.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUTPUT = path.join(ROOT, 'docs/legal/otp-baseline/current.json')

function parseArgs(argv = []) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue
    const key = argv[index].slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) args[key] = true
    else { args[key] = value; index += 1 }
  }
  return args
}

function resolvePath(value, fallback) {
  return path.resolve(ROOT, value || fallback)
}

async function readInput(inputPath) {
  const input = JSON.parse(await readFile(inputPath, 'utf8'))
  const template = input.template || input
  const sections = input.sections || template.sections || []
  return { template, sections }
}

async function readExistingReview(reviewPath, baseline) {
  try {
    const review = JSON.parse(await readFile(reviewPath, 'utf8'))
    if (review.baselineHash === baseline.baselineHash && review.templateId === baseline.template.id) return review
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  return null
}

async function readFromDatabase(templateId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Database export requires VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.')
  }
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: template, error: templateError } = await client
    .from('document_packet_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle()
  if (templateError) throw templateError
  if (!template) throw new Error(`OTP template ${templateId} was not found.`)
  const { data: sections, error: sectionsError } = await client
    .from('document_template_sections')
    .select('id, template_id, section_key, section_label, section_type, sort_order, is_required, is_repeatable, condition_json, placeholder_keys, legal_text, metadata_json, created_at, updated_at')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (sectionsError) throw sectionsError
  return { template, sections: sections || [] }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const templateId = String(args['template-id'] || process.env.OTP_BASELINE_TEMPLATE_ID || '').trim()
  if (!args.input && !templateId) throw new Error('Pass --template-id <uuid>, set OTP_BASELINE_TEMPLATE_ID, or pass --input <json>.')
  const outputPath = resolvePath(args.output, 'docs/legal/otp-baseline/current.json')
  const reviewPath = resolvePath(args.review, 'docs/legal/otp-baseline/attorney-review.json')
  const input = args.input
    ? await readInput(resolvePath(args.input))
    : await readFromDatabase(templateId)
  const baseline = buildOtpLegalBaseline({
    ...input,
    source: {
      environment: args.environment || process.env.OTP_BASELINE_ENVIRONMENT || 'production',
      exportedAt: new Date().toISOString(),
      exportMethod: args.input ? 'json_input' : 'database',
    },
  })
  baseline.baselineHash = createHash('sha256')
    .update(stableStringify(getOtpBaselineHashPayload(baseline)))
    .digest('hex')
  const existingReview = await readExistingReview(reviewPath, baseline)
  const review = existingReview || createOtpAttorneyReviewManifest(baseline)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await mkdir(path.dirname(reviewPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    ok: true,
    templateId: baseline.template.id,
    baselineHash: baseline.baselineHash,
    sections: baseline.summary.sectionCount,
    variables: baseline.summary.variableCount,
    classifications: baseline.summary.classifications,
    baseline: path.relative(ROOT, outputPath),
    attorneyReview: path.relative(ROOT, reviewPath),
    attorneyReviewStatus: review.status,
    attorneyReviewPreserved: Boolean(existingReview),
  }, null, 2))
}

main().catch((error) => {
  console.error(`[OTP baseline export] ${error.message}`)
  process.exitCode = 1
})
