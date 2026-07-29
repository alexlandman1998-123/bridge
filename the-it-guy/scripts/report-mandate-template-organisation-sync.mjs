import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import {
  buildMandateTemplateVNextApprovalDigestPayload,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  buildMandateTemplateOrganisationSyncPlan,
  formatMandateTemplateOrganisationSyncMarkdown,
} from '../src/core/documents/mandateTemplateOrganisationSync.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

function argValues(name) {
  const prefix = `--${name}=`
  return process.argv.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length).trim()).filter(Boolean)
}

async function readJsonArg(name) {
  const [filePath] = argValues(name)
  if (!filePath) return {}
  return JSON.parse(await readFile(filePath, 'utf8'))
}

const generatedAt = '2026-07-28T12:00:00.000Z'
const sections = listMandateTemplateWordingVNextSections()
const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const digestPayload = buildMandateTemplateVNextApprovalDigestPayload({ sections })
const expectedContentDigest = `sha256:${createHash('sha256').update(stringifyMandateTemplateApprovalDigestPayload(digestPayload)).digest('hex')}`
const organisations = argValues('organisation-id').map((id) => ({ id }))
const approvalEvidence = await readJsonArg('approval-evidence-json')
const existingTemplatesInput = await readJsonArg('existing-templates-json')
const existingTemplates = Array.isArray(existingTemplatesInput)
  ? existingTemplatesInput
  : Array.isArray(existingTemplatesInput.templates)
    ? existingTemplatesInput.templates
    : []

const report = buildMandateTemplateOrganisationSyncPlan({
  organisations,
  existingTemplates,
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  generatedAt,
})

const outputUrl = new URL('../docs/mandate-template-vnext-phase7-organisation-sync.md', import.meta.url)
await writeFile(outputUrl, formatMandateTemplateOrganisationSyncMarkdown(report), 'utf8')

console.log(`Mandate template organisation sync report written to ${outputUrl.pathname}`)
