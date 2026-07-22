import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { envFile } from './legal-document-review-fingerprint.mjs'

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const normalizeIds = (value) => [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map((item) => String(item).trim()).filter(Boolean))].sort()

export function isNativeStructuredSource(template = {}) {
  const metadata = template.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const format = String(template.template_format || '').trim().toLowerCase()
  const renderMode = String(metadata.render_mode || '').trim().toLowerCase()
  return ['structured', 'json', 'native_structured'].includes(format) || renderMode === 'native_structured'
}

export function inspectDocx(bytes) {
  const buffer = Buffer.from(bytes)
  if (buffer.length < 100) throw new Error('The candidate DOCX is empty or truncated.')
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-c1-docx-'))
  const temporaryFile = path.join(temporaryDirectory, 'candidate.docx')
  let documentXml = ''
  let mergeXml = ''
  try {
    fs.writeFileSync(temporaryFile, buffer)
    const listing = spawnSync('/usr/bin/zipinfo', ['-1', temporaryFile], { encoding: 'utf8', timeout: 10_000, maxBuffer: 5 * 1024 * 1024 })
    if (listing.status !== 0) throw new Error('The candidate is not a valid DOCX ZIP package.')
    const entries = new Set(listing.stdout.split(/\r?\n/).filter(Boolean))
    for (const entry of ['[Content_Types].xml', 'word/document.xml']) {
      if (!entries.has(entry)) throw new Error(`The candidate DOCX is missing ${entry}.`)
    }
    const mergeParts = [...entries].filter((entry) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry)).sort()
    const extractedParts = []
    for (const entry of mergeParts) {
      const extracted = spawnSync('/usr/bin/unzip', ['-p', temporaryFile, entry], { encoding: 'utf8', timeout: 10_000, maxBuffer: 20 * 1024 * 1024 })
      if (extracted.status !== 0) throw new Error(`The candidate DOCX merge part ${entry} cannot be read.`)
      extractedParts.push(extracted.stdout)
      if (entry === 'word/document.xml') documentXml = extracted.stdout
    }
    mergeXml = extractedParts.join('\n')
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
  if (!/<w:document[\s>]/.test(documentXml) || !/<w:body[\s>]/.test(documentXml)) throw new Error('The candidate DOCX has no Word document body.')
  const normalizedXml = mergeXml.replace(/<[^>]+>/g, '')
  const placeholders = [...normalizedXml.matchAll(/\{\{?\s*([A-Za-z0-9_.-]+)\s*\}\}?/g)].map((match) => match[1])
  return { valid: true, byteLength: buffer.length, sha256: sha256(buffer), placeholderKeys: [...new Set(placeholders)].sort() }
}

export async function loadC1Context() {
  const manifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
  const mandateEntries = manifest.templates.filter((row) => row.packetType === 'mandate')
  const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for C1.')
  const projectRef = new URL(url).hostname.split('.')[0]
  if (projectRef !== manifest.projectRef) throw new Error('Runtime Supabase project does not match the frozen review project.')
  const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await client.from('document_packet_templates').select('id, packet_type, status, is_active, template_format, template_storage_bucket, template_storage_path, template_file_name, metadata_json').in('id', mandateEntries.map((row) => row.templateId))
  if (result.error) throw result.error
  const templates = result.data || []
  return { manifest, mandateEntries, projectRef, client, templates }
}

export async function inspectStoredSource(client, bucket, objectPath) {
  const result = await client.storage.from(bucket).download(objectPath)
  if (result.error || !result.data) return { available: false, error: result.error?.message || 'Object not found' }
  const bytes = Buffer.from(await result.data.arrayBuffer())
  try { return { available: true, ...inspectDocx(bytes), error: null } } catch (error) { return { available: true, valid: false, error: error.message, byteLength: bytes.length, sha256: sha256(bytes), placeholderKeys: [] } }
}
