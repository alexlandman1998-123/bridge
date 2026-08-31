import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizePrivatePropertyText } from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const outputDir = path.join(appRoot, 'outputs')

function parseArgs(argv = []) {
  const options = {
    prepare: false,
    phase14: path.join(outputDir, 'private-property-phase14-workbook-export.json'),
    recipient: '',
    packageOutput: path.join(outputDir, 'private-property-follow-up-return-package.json'),
    emailDraft: path.join(outputDir, 'private-property-follow-up-return-email.md'),
    output: path.join(outputDir, 'private-property-phase15-return-package.json'),
  }
  for (const arg of argv) {
    if (arg === '--prepare') {
      options.prepare = true
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
  const phase14 = readJson(options.phase14)
  const completionReport = phase14?.workbookReport || ''
  const workbookOutput = phase14?.workbookOutput || ''
  const blockers = [
    ...(phase14?.status === 'EXPORTED' ? [] : ['phase14_workbook_not_exported']),
    ...(completionReport && fs.existsSync(completionReport) ? [] : ['phase14_completion_report_missing']),
    ...(workbookOutput && fs.existsSync(workbookOutput) ? [] : ['phase14_workbook_missing']),
    ...(options.recipient ? [] : ['missing_recipient']),
  ]
  const report = {
    phase: 'private-property-sandbox-phase15-return-package',
    generatedAt: new Date().toISOString(),
    prepare: options.prepare,
    status: options.prepare ? 'BLOCKED' : blockers.length ? 'BLOCKED' : 'READY_TO_PREPARE',
    phase14: options.phase14,
    workbookOutput: workbookOutput || null,
    completionReport: completionReport || null,
    safety: { privatePropertyApiCalled: false, databaseWritten: false, workbookEdited: false, emailSent: false, rawCredentialsStored: false },
    blockers,
    returnPackage: null,
    nextStep: '',
  }
  if (!options.prepare) {
    report.nextStep = report.status === 'READY_TO_PREPARE'
      ? 'Re-run with --prepare to generate the attachment receipt and reply draft for review.'
      : 'Resolve the Phase 14 export or recipient blocker before preparing the return package.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    if (report.status === 'BLOCKED') process.exitCode = 1
    return
  }
  if (blockers.length) {
    report.nextStep = 'Do not send anything. Resolve every blocker first.'
    writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output: options.output, blockers, nextStep: report.nextStep }, null, 2))
    process.exitCode = 1
    return
  }
  const child = spawnSync(process.execPath, [
    path.join(appRoot, 'scripts', 'private-property-prepare-follow-up-return-package.mjs'),
    `--completion-report=${completionReport}`,
    `--recipient=${options.recipient}`,
    `--output=${options.packageOutput}`,
    `--email-draft=${options.emailDraft}`,
  ], { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const returnPackage = readJson(options.packageOutput)
  report.returnPackage = { path: options.packageOutput, status: returnPackage?.status || 'MISSING', emailDraft: options.emailDraft }
  if (child.status === 0 && returnPackage?.status === 'READY_TO_SEND' && fs.existsSync(options.emailDraft)) {
    report.status = 'READY_TO_SEND'
    report.nextStep = 'Review the draft and attachment, then manually send the email to Private Property.'
  } else {
    report.status = 'ATTENTION_REQUIRED'
    report.blockers.push('phase15_return_package_not_confirmed')
    report.childError = normalizePrivatePropertyText(child.stderr) || null
    report.nextStep = 'Review the return-package report before attempting another preparation.'
    process.exitCode = 1
  }
  writeReport(report, options.output)
  console.log(JSON.stringify({ status: report.status, output: options.output, packageOutput: options.packageOutput, emailDraft: options.emailDraft, blockers: report.blockers, nextStep: report.nextStep }, null, 2))
}

run()
