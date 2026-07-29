import { writeFile } from 'node:fs/promises'
import {
  buildMandateTemplateWordingVNext,
  formatMandateTemplateWordingVNextMarkdown,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const report = buildMandateTemplateWordingVNext({
  generatedAt: '2026-07-28T12:00:00.000Z',
})

const outputUrl = new URL('../docs/mandate-template-vnext-phase4-wording.md', import.meta.url)
await writeFile(outputUrl, formatMandateTemplateWordingVNextMarkdown(report), 'utf8')

console.log(`Mandate template wording vNext report written to ${outputUrl.pathname}`)
