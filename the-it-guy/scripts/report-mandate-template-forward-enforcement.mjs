import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import {
  buildMandateTemplateVNextApprovalDigestPayload,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  buildMandateTemplateForwardEnforcementReport,
  formatMandateTemplateForwardEnforcementMarkdown,
} from '../src/core/documents/mandateTemplateForwardEnforcement.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const generatedAt = '2026-07-28T12:00:00.000Z'
const sections = listMandateTemplateWordingVNextSections()
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const digestPayload = buildMandateTemplateVNextApprovalDigestPayload({ sections })
const expectedContentDigest = `sha256:${createHash('sha256').update(stringifyMandateTemplateApprovalDigestPayload(digestPayload)).digest('hex')}`
const report = buildMandateTemplateForwardEnforcementReport({
  packageScripts: packageJson.scripts,
  sections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
})

const outputUrl = new URL('../docs/mandate-template-vnext-phase8-forward-enforcement.md', import.meta.url)
await writeFile(outputUrl, formatMandateTemplateForwardEnforcementMarkdown(report), 'utf8')

console.log(`Mandate template forward enforcement report written to ${outputUrl.pathname}`)
