import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyReleaseStabilisationDecision } from '../src/services/attorneyReleaseStabilisation.js'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (configured, fallback) => { const path = resolve(projectRoot, String(configured || fallback)); if (!existsSync(path)) return null; try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
const validFingerprint = (artifact, field, excluded = []) => { if (!artifact?.[field]) return false; const { [field]: fingerprint, ...core } = artifact; for (const key of excluded) delete core[key]; return createHash('sha256').update(JSON.stringify(core)).digest('hex') === fingerprint }
const parseJsonOutput = (output) => { const start = output.indexOf('{'); const end = output.lastIndexOf('}'); if (start < 0 || end < start) return null; try { return JSON.parse(output.slice(start, end + 1)) } catch { return null } }
const propagationProcess = spawnSync(process.execPath, ['scripts/check-attorney-release-phase3-staging.mjs'], { cwd: projectRoot, env: process.env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
const propagationReport = parseJsonOutput(propagationProcess.stdout || '')
const rawPhase5Ledger = readJson(process.env.ATTORNEY_RELEASE_PHASE5_LEDGER_FILE, 'output/attorney-release/phase5-controlled-batch-ledger.json')
const rawObservation = readJson(process.env.ATTORNEY_RELEASE_PHASE6_OBSERVATION_FILE, 'output/attorney-release/phase6-observation.json')
const rawRollbackReadiness = readJson(process.env.ATTORNEY_RELEASE_ROLLBACK_READINESS_FILE, 'output/attorney-release/phase6-rollback-readiness.json')
const phase5Ledger = validFingerprint(rawPhase5Ledger, 'ledgerFingerprint', ['updatedAt']) ? rawPhase5Ledger : null
const observation = validFingerprint(rawObservation, 'observationFingerprint') ? rawObservation : null
const rollbackReadiness = validFingerprint(rawRollbackReadiness, 'rollbackFingerprint') ? rawRollbackReadiness : null
const decision = buildAttorneyReleaseStabilisationDecision({ phase5Ledger, observation, currentPropagation: propagationReport?.health, rollbackReadiness })
console.log(JSON.stringify({ phase: 6, ...decision, evidence: { phase5LedgerLoaded: Boolean(phase5Ledger), observationLoaded: Boolean(observation), rollbackReadinessLoaded: Boolean(rollbackReadiness), artifactIntegrityPassed: Boolean(phase5Ledger && observation && rollbackReadiness), livePropagationCheckPassed: propagationProcess.status === 0, observation: observation ? { observationHours: observation.observationHours, totalActions: observation.totalActions, actionsByRole: observation.actionsByRole, successfulActionRate: observation.successfulActionRate, propagationP95Seconds: observation.propagationP95Seconds, observedAt: observation.observedAt } : null } }, null, 2))
if (decision.status !== 'STABILIZED') process.exitCode = 1
