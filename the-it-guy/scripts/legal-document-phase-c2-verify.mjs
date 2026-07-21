import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildC2Scenarios } from './legal-document-phase-c2-scenarios.mjs'
import { inspectDocx, isNativeStructuredSource, loadC1Context } from './legal-document-phase-c1-source.mjs'

const c1Run = spawnSync(process.execPath, ['scripts/legal-document-phase-c1-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 180_000, maxBuffer: 10 * 1024 * 1024 })
let c1 = null
try { c1 = JSON.parse(c1Run.stdout) } catch {}
const blockers = []
const assessments = []
if (c1?.status !== 'READY_FOR_B1_REFREEZE') blockers.push({ code: 'C2_C1_NOT_READY', detail: 'C1 source integrity must pass before merge rendering can be exercised.' })

if (!blockers.length) {
  const { client, mandateEntries, projectRef, templates } = await loadC1Context()
  const templateById = new Map(templates.map((row) => [row.id, row]))
  const scenarios = buildC2Scenarios()
  const placeholderKeys = new Set(scenarios.flatMap((scenario) => Object.keys(scenario.placeholders)))
  const legacySources = mandateEntries.filter((row) => !isNativeStructuredSource(templateById.get(row.templateId)) && row.sourceMode !== 'native_structured_sections')
  const nativeSources = mandateEntries.filter((row) => !legacySources.includes(row))
  for (const source of nativeSources) {
    assessments.push({
      projectRef,
      storagePath: source.storagePath || null,
      sourceMode: 'native_structured_sections',
      sourceSha256: source.sourceSha256,
      scenario: 'native_structured_section_source',
      status: 'passed',
      outputSha256: null,
      unresolvedPlaceholders: [],
      error: null,
    })
  }
  const uniqueSources = [...new Map(legacySources.map((row) => [`${row.storageBucket}:${row.storagePath}`, row])).values()]
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-c2-render-'))
  try {
    for (const source of uniqueSources) {
      const download = await client.storage.from(source.storageBucket).download(source.storagePath)
      if (download.error || !download.data) {
        blockers.push({ code: 'C2_SOURCE_DOWNLOAD_FAILED', detail: download.error?.message || 'Object not found', storagePath: source.storagePath })
        continue
      }
      const bytes = Buffer.from(await download.data.arrayBuffer())
      const inspection = inspectDocx(bytes)
      const unknownTokens = inspection.placeholderKeys.filter((key) => !placeholderKeys.has(key))
      if (unknownTokens.length) blockers.push({ code: 'C2_UNKNOWN_TEMPLATE_PLACEHOLDERS', storagePath: source.storagePath, placeholderKeys: unknownTokens })
      const sourceFile = path.join(temporaryDirectory, `${inspection.sha256}.docx`)
      fs.writeFileSync(sourceFile, bytes)
      for (const scenario of scenarios) {
        const inputFile = path.join(temporaryDirectory, `${inspection.sha256}-${scenario.key}.json`)
        const outputFile = path.join(temporaryDirectory, `${inspection.sha256}-${scenario.key}-rendered.docx`)
        fs.writeFileSync(inputFile, JSON.stringify({ sourcePath: sourceFile, placeholders: scenario.placeholders }))
        const render = spawnSync(process.env.DENO_BIN || 'deno', ['run', '--quiet', '--allow-read', '--allow-write', '--config', '../supabase/functions/generate-mandate/deno.json', 'scripts/legal-document-phase-c2-render-worker.ts', `--input=${inputFile}`, `--output=${outputFile}`], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
        let rendered = null
        let unresolved = []
        if (render.status === 0 && fs.existsSync(outputFile)) {
          rendered = inspectDocx(fs.readFileSync(outputFile))
          unresolved = rendered.placeholderKeys
          const outputText = spawnSync('/usr/bin/unzip', ['-p', outputFile, 'word/document.xml'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 20 * 1024 * 1024 }).stdout || ''
          if (outputText.includes('[[C2_UNRESOLVED:')) unresolved.push('nullGetter')
        }
        const passed = render.status === 0 && rendered?.valid === true && unresolved.length === 0
        assessments.push({ projectRef, storagePath: source.storagePath, sourceSha256: inspection.sha256, scenario: scenario.key, status: passed ? 'passed' : 'failed', outputSha256: rendered?.sha256 || null, unresolvedPlaceholders: [...new Set(unresolved)], error: passed ? null : (render.stderr || render.stdout || 'Rendered DOCX validation failed.').trim() })
        if (!passed) blockers.push({ code: 'C2_SCENARIO_RENDER_FAILED', storagePath: source.storagePath, scenario: scenario.key })
      }
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

const solutionByCode = {
  C2_C1_NOT_READY: 'Restore and verify the mandate source through C1, then rerun C2.',
  C2_SOURCE_DOWNLOAD_FAILED: 'Restore the exact governed source object and rerun C1/C2.',
  C2_UNKNOWN_TEMPLATE_PLACEHOLDERS: 'Map or remove every unknown template token before legal review.',
  C2_SCENARIO_RENDER_FAILED: 'Repair the DOCX merge syntax or canonical data mapping for the failing seller scenario.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.storagePath || ''}:${row.scenario || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'C2', status: unique.length ? 'NO_GO' : 'READY_FOR_B1_REFREEZE', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), c1Status: c1?.status || 'UNAVAILABLE', assessments, scenarioCount: 4, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
