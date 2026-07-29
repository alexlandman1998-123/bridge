import { readFile, writeFile } from 'node:fs/promises'
import {
  buildMandateTemplatePdfLayoutVNextReport,
  formatMandateTemplatePdfLayoutVNextMarkdown,
} from '../src/core/documents/mandateTemplatePdfLayoutVNext.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const report = buildMandateTemplatePdfLayoutVNextReport({
  sections: listMandateTemplateWordingVNextSections(),
  rendererSource,
  generatedAt: '2026-07-28T12:00:00.000Z',
})

const outputUrl = new URL('../docs/mandate-template-vnext-phase5-pdf-layout.md', import.meta.url)
await writeFile(outputUrl, formatMandateTemplatePdfLayoutVNextMarkdown(report), 'utf8')

console.log(`Mandate template PDF layout vNext report written to ${outputUrl.pathname}`)
