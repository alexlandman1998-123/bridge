import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import {
  buildMandateTemplateApprovalReleaseGate,
  buildMandateTemplateVNextApprovalDigestPayload,
  formatMandateTemplateApprovalReleaseGateMarkdown,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
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
const approvalEvidence = await readJsonArg('approval-evidence-json')
const report = buildMandateTemplateApprovalReleaseGate({
  sections,
  rendererSource,
  expectedContentDigest,
  approvalEvidence,
  generatedAt,
})

const outputUrl = new URL('../docs/mandate-template-vnext-phase6-approval-release-gate.md', import.meta.url)
await writeFile(outputUrl, formatMandateTemplateApprovalReleaseGateMarkdown(report), 'utf8')

console.log(`Mandate template approval release gate report written to ${outputUrl.pathname}`)
