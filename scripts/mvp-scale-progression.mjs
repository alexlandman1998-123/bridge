import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateMvpScaleProgression } from '../the-it-guy/src/core/transactions/mvpScaleProgression.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
if (!inputArg) throw new Error('Use --input=<rollout-evidence.json>.')
const input = JSON.parse(readFileSync(path.resolve(repoRoot, inputArg.slice('--input='.length)), 'utf8'))
if (input.environment !== 'production') throw new Error('Scale evidence must be marked as production.')
const entry = spawnSync(process.execPath, ['scripts/mvp-scale-entry-evidence-check.mjs', `--input=${inputArg.slice('--input='.length)}`], { cwd: repoRoot, encoding: 'utf8' })
const monthly = spawnSync(process.execPath, ['scripts/mvp-monthly-capacity-evidence-check.mjs', `--input=${inputArg.slice('--input='.length)}`], { cwd: repoRoot, encoding: 'utf8' })
let entryReport = null
let monthlyReport = null
try { entryReport = JSON.parse(entry.stdout) } catch { entryReport = null }
try { monthlyReport = JSON.parse(monthly.stdout) } catch { monthlyReport = null }
const progression = evaluateMvpScaleProgression(input)
const report = {
  ...progression,
  decision: entry.status === 0 && monthly.status === 0 ? progression.decision : 'pause_rollout',
  blockers: [...new Set([
    ...progression.blockers,
    ...(entry.status === 0 ? [] : ['scale_entry_evidence_invalid']),
    ...(monthly.status === 0 ? [] : ['monthly_capacity_evidence_invalid']),
  ])],
  scaleEntry: entryReport ? { approvedBy: entryReport.approvedBy, completedPilotCloseouts: entryReport.completedPilotCloseouts } : null,
  monthlyCapacity: monthlyReport ? { reportingMonth: monthlyReport.reportingMonth, monthlyTransactionCount: monthlyReport.monthlyTransactionCount, remainingCapacity: monthlyReport.remainingCapacity } : null,
}
console.log(JSON.stringify(report, null, 2))
if (report.decision === 'pause_rollout') process.exit(1)
