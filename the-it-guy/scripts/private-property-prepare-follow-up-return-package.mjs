import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { PRIVATE_PROPERTY_FOLLOW_UP_ROWS } from './private-property-follow-up-workbook-model.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv = []) {
  const options = {
    completionReport: path.join(appRoot, 'outputs', 'private-property-follow-up-workbook-plan.json'),
    output: path.join(appRoot, 'outputs', 'private-property-follow-up-return-package.json'),
    emailDraft: path.join(appRoot, 'outputs', 'private-property-follow-up-return-email.md'),
    recipient: '',
  }
  for (const arg of argv) {
    const match = String(arg).match(/^--([^=]+)=(.*)$/)
    if (!match) throw new Error(`Unknown option: ${arg}`)
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    if (!Object.hasOwn(options, key)) throw new Error(`Unknown option: ${arg}`)
    options[key] = match[2].trim()
  }
  return options
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return { readError: error.message }
  }
}

function digestFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function emailBody({ recipient, attachmentName }) {
  return [
    `To: ${recipient}`,
    'Subject: Private Property sandbox follow-up testing - completed spreadsheet',
    '',
    'Hi Riccardo,',
    '',
    'Please find attached the completed spreadsheet for the follow-up sandbox test actions.',
    'The reference numbers and agent IDs have been recorded next to the relevant commands.',
    '',
    `Attachment: ${attachmentName}`,
    '',
    'Kind regards,',
    'Alexander',
  ].join('\n')
}

function buildPackage(options, report) {
  const blockers = []
  if (report.readError) blockers.push(`completion_report_unreadable:${report.readError}`)
  if (report.status !== 'EXPORTED') blockers.push(`completion_workbook_not_exported:${report.status || 'MISSING'}`)
  if (report.plan?.status !== 'READY_TO_EXPORT') blockers.push(`completion_plan_not_ready:${report.plan?.status || 'MISSING'}`)
  const completedActionIds = new Set(
    Array.isArray(report.plan?.rows)
      ? report.plan.rows.filter((row) => row.completed).map((row) => row.actionId)
      : [],
  )
  const missingCompletedActions = PRIVATE_PROPERTY_FOLLOW_UP_ROWS
    .map((row) => row.actionId)
    .filter((actionId) => !completedActionIds.has(actionId))
  if (missingCompletedActions.length) blockers.push(`follow_up_verification_incomplete:${missingCompletedActions.join(',')}`)
  const attachmentPath = report.output || ''
  if (!attachmentPath) blockers.push('completion_report_missing_attachment_path')
  if (attachmentPath && !fs.existsSync(attachmentPath)) blockers.push('completed_workbook_missing')
  if (!options.recipient) blockers.push('missing_recipient')
  const attachmentName = attachmentPath ? path.basename(attachmentPath) : ''
  return {
    phase: 'private-property-sandbox-phase8-return-package',
    generatedAt: new Date().toISOString(),
    status: blockers.length ? 'BLOCKED' : 'READY_TO_SEND',
    completionReport: options.completionReport,
    attachment: attachmentPath && fs.existsSync(attachmentPath)
      ? { path: attachmentPath, name: attachmentName, sha256: digestFile(attachmentPath) }
      : null,
    recipient: options.recipient || null,
    completedActionIds: [...completedActionIds].sort(),
    blockers,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      workbookEdited: false,
      emailSent: false,
      rawCredentialsStored: false,
    },
    nextStep: blockers.length
      ? 'Resolve every blocker before sending anything to Private Property.'
      : 'Review the generated reply, attach the completed workbook, and send it manually to the requested Private Property contact.',
  }
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, value)
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const completionReport = readJson(options.completionReport)
  const result = buildPackage(options, completionReport)
  writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`)
  if (result.status === 'READY_TO_SEND') {
    writeFile(options.emailDraft, `${emailBody({ recipient: options.recipient, attachmentName: result.attachment.name })}\n`)
  }
  console.log(JSON.stringify({
    status: result.status,
    package: options.output,
    emailDraft: result.status === 'READY_TO_SEND' ? options.emailDraft : null,
    attachment: result.attachment?.path || null,
    blockers: result.blockers,
    nextStep: result.nextStep,
  }, null, 2))
  if (result.status !== 'READY_TO_SEND') process.exitCode = 1
}

run()
