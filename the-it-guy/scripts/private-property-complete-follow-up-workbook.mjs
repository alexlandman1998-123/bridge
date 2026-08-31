import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildPrivatePropertyWorkbookCompletionPlan } from './private-property-follow-up-workbook-model.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_SOURCE = '/Users/alexanderlandman/Downloads/Arch9 Sandbox Testing Commands - Completed All Actions With Agents-1.xlsx'

function parseArgs(argv = []) {
  const options = {
    apply: false,
    source: DEFAULT_SOURCE,
    evidenceDir: path.join(appRoot, 'outputs'),
    agentEvidence: '',
    output: path.join(appRoot, 'outputs', 'private-property-follow-up-completed.xlsx'),
    report: path.join(appRoot, 'outputs', 'private-property-follow-up-workbook-plan.json'),
  }
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
      continue
    }
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = match[2]
  }
  return options
}

async function writeReport(reportPath, report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

function appendFollowUp(existingNote, followUps) {
  const suffix = `Follow-up verification: ${followUps.join('; ')}.`
  return existingNote ? `${existingNote}\n${suffix}` : suffix
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const plan = buildPrivatePropertyWorkbookCompletionPlan({
    outputDir: options.evidenceDir,
    agentEvidencePath: options.agentEvidence || undefined,
  })
  const report = {
    phase: 'private-property-sandbox-phase7-workbook-completion',
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    source: options.source,
    output: options.output,
    status: options.apply && plan.status === 'READY_TO_EXPORT' ? 'READY_TO_EXPORT' : plan.status === 'READY_TO_EXPORT' ? 'DRY_RUN_READY' : 'BLOCKED',
    plan,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      workbookEdited: false,
      rawCredentialsStored: false,
    },
    nextStep: plan.status === 'READY_TO_EXPORT'
      ? options.apply ? 'Export the completed Private Property workbook.' : 'Review the completed action plan, then re-run with --apply to export the workbook.'
      : 'Complete and verify every green action before exporting the Private Property workbook.',
  }
  if (!options.apply || plan.status !== 'READY_TO_EXPORT') {
    await writeReport(options.report, report)
    console.log(JSON.stringify({ status: report.status, report: options.report, blockers: plan.blockers, nextStep: report.nextStep }, null, 2))
    if (options.apply && plan.status !== 'READY_TO_EXPORT') process.exitCode = 1
    return
  }

  const { FileBlob, SpreadsheetFile } = await import('@oai/artifact-tool')
  const input = await FileBlob.load(options.source)
  const workbook = await SpreadsheetFile.importXlsx(input)
  const sheet = workbook.worksheets.getItem('Sheet1')
  for (const update of plan.updates) {
    const row = update.row
    const currentNote = String(sheet.getRange(`G${row}`).values?.[0]?.[0] || '')
    sheet.getRange(`C${row}`).values = [[update.reference]]
    if (update.agentId) sheet.getRange(`F${row}`).values = [[update.agentId]]
    sheet.getRange(`G${row}`).values = [[appendFollowUp(currentNote, update.followUps)]]
  }
  const check = await workbook.inspect({ kind: 'table', range: 'Sheet1!A1:G8', include: 'values,formulas', tableMaxRows: 8, tableMaxCols: 7 })
  report.workbookCheck = check.ndjson
  await fs.mkdir(path.dirname(options.output), { recursive: true })
  const exportFile = await SpreadsheetFile.exportXlsx(workbook)
  await exportFile.save(options.output)
  report.status = 'EXPORTED'
  report.safety.workbookEdited = true
  report.nextStep = 'Send the exported workbook to Private Property.'
  await writeReport(options.report, report)
  console.log(JSON.stringify({ status: report.status, output: options.output, report: options.report, nextStep: report.nextStep }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', name: error.name || 'Error', message: error.message }, null, 2))
  process.exitCode = 1
})
