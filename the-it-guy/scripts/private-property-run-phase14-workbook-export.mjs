import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'
import { buildPrivatePropertyWorkbookCompletionPlan } from './private-property-follow-up-workbook-model.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_SOURCE = '/Users/alexanderlandman/Downloads/Arch9 Sandbox Testing Commands - Completed All Actions With Agents-1.xlsx'
const outputDir = path.join(appRoot, 'outputs')

function parseArgs(argv = []) {
  const options = {
    export: false,
    freeze: path.join(outputDir, 'private-property-follow-up-input-freeze.json'),
    phase10: path.join(outputDir, 'private-property-phase10-baseline.json'),
    source: DEFAULT_SOURCE,
    evidenceDir: outputDir,
    agentEvidence: path.join(outputDir, 'private-property-verify-agent-user-2-inactive.json'),
    workbookOutput: path.join(outputDir, 'private-property-follow-up-completed.xlsx'),
    workbookReport: path.join(outputDir, 'private-property-follow-up-workbook-plan.json'),
    output: path.join(outputDir, 'private-property-phase14-workbook-export.json'),
  }
  for (const arg of argv) {
    if (arg === '--export') {
      options.export = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    if (!Object.hasOwn(options, key)) throw new Error(`Unknown option: ${arg}`)
    options[key] = normalizePrivatePropertyText(match[2])
  }
  return options
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeReport(report, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const freeze = readJson(options.freeze)
  const phase10 = readJson(options.phase10)
  const plan = buildPrivatePropertyWorkbookCompletionPlan({ outputDir: options.evidenceDir, agentEvidencePath: options.agentEvidence })
  const blockers = [
    ...(freeze?.status === 'FROZEN' && freeze?.inputDigest ? [] : ['phase9_input_freeze_not_frozen']),
    ...(phase10?.status === 'CAPTURED' && phase10?.baseline?.inputFreezeDigest === freeze?.inputDigest ? [] : ['phase10_baseline_not_bound_to_freeze']),
    ...(fs.existsSync(options.source) ? [] : ['spreadsheet_template_missing']),
    ...plan.blockers,
  ]
  const report = {
    phase: 'private-property-sandbox-phase14-workbook-export',
    generatedAt: new Date().toISOString(),
    export: options.export,
    status: options.export ? 'BLOCKED' : blockers.length ? 'BLOCKED' : 'READY_TO_EXPORT',
    source: options.source,
    workbookOutput: options.workbookOutput,
    workbookReport: options.workbookReport,
    inputFreezeDigest: freeze?.inputDigest || null,
    plan,
    safety: { privatePropertyApiCalled: false, databaseWritten: false, workbookEdited: false, rawCredentialsStored: false },
    blockers,
    nextStep: '',
  }
  if (!options.export) {
    report.nextStep = report.status === 'READY_TO_EXPORT'
      ? 'Re-run with --export to create the completed Private Property workbook.'
      : 'Resolve every evidence or template blocker before exporting the workbook.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    if (report.status === 'BLOCKED') process.exitCode = 1
    return
  }
  if (blockers.length) {
    report.nextStep = 'Do not edit the spreadsheet. Resolve every blocker before exporting.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  const child = spawnSync(process.execPath, [
    path.join(appRoot, 'scripts', 'private-property-complete-follow-up-workbook.mjs'),
    '--apply',
    `--source=${options.source}`,
    `--evidence-dir=${options.evidenceDir}`,
    `--agent-evidence=${options.agentEvidence}`,
    `--output=${options.workbookOutput}`,
    `--report=${options.workbookReport}`,
  ], { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const workbookReport = readJson(options.workbookReport)
  if (child.status === 0 && workbookReport?.status === 'EXPORTED' && fs.existsSync(options.workbookOutput)) {
    report.status = 'EXPORTED'
    report.safety.workbookEdited = true
    report.nextStep = 'Workbook exported. Continue to Phase 15 return-package preparation.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('phase14_workbook_export_not_confirmed')
    report.childError = normalizePrivatePropertyText(child.stderr) || null
    report.nextStep = 'Review the workbook export report before attempting another export.'
    process.exitCode = 1
  }
  writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output: options.output, workbookOutput: options.workbookOutput, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run()
