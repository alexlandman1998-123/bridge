import process from 'node:process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { reconcileSnapshot } from './documentPersistenceReconciliation.js'
import { DOCUMENT_UPLOAD_RELEASE_MATRIX } from '../../src/services/documents/documentUploadReleaseReadinessService.js'
import { documentMonitorClient, telemetryResponse } from './documentUploadTelemetryApi.js'

const minute = 60000
const criticalTypes = new Set(['missing_object', 'missing_storage_reference', 'missing_document_record', 'missing_requirement_record', 'wrong_context_link', 'wrong_requirement_context', 'wrong_document_requirement_context', 'canonical_backlink_conflict'])
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function fresh(timestamp, now, maxAge) {
  const checked = Date.parse(timestamp)
  return Number.isFinite(checked) && checked <= now && now - checked <= maxAge
}
function issueReceipt(finding) {
  // No paths or signed URLs enter the persistent monitoring report. Keep the
  // record ID for an operator's scoped follow-up; compare the hashed identity.
  const identity = ['type', 'source', 'id', 'field', 'documentId', 'objectId', 'bucket', 'path'].map(key => finding[key] || null)
  return { fingerprint: digest(identity), type: finding.type, source: finding.source || 'storage.objects', recordId: finding.id || finding.objectId || null, severity: criticalTypes.has(finding.type) ? 'critical' : 'review' }
}
export function buildDocumentPersistenceMonitoringReport({ snapshot, telemetry, previous = null, now = Date.now() } = {}) {
  if (!Number.isFinite(now) || !snapshot || !fresh(snapshot.capturedAt, now, 15 * minute)) throw new Error('A fresh complete persistence snapshot is required.')
  const audit = reconcileSnapshot(snapshot)
  if (!telemetry || !fresh(telemetry.capturedAt, now, 15 * minute) || telemetry.windowMinutes !== 60 || !Array.isArray(telemetry.rows)) throw new Error('Fresh upload outcome coverage is required.')
  const rows = new Map()
  const countKeys = ['attempts', 'succeeded', 'recovered', 'failed', 'unconfirmed', 'attention', 'stalled', 'permission_errors', 'network_errors', 'access_errors']
  for (const row of telemetry.rows) {
    if (rows.has(row.surface) || ![...DOCUMENT_UPLOAD_RELEASE_MATRIX.map(s=>s.id), 'unknown'].includes(row.surface) || countKeys.some(key => !Number.isSafeInteger(Number(row[key])) || Number(row[key]) < 0 || Number(row[key]) > Number(row.attempts))) throw new Error('Invalid upload outcome summary.')
    if (Number(row.recovered) > Number(row.succeeded) || Number(row.unconfirmed) > Number(row.failed) || ['succeeded', 'failed', 'attention', 'stalled'].reduce((sum, key) => sum + Number(row[key]), 0) > Number(row.attempts)) throw new Error('Invalid upload outcome totals.')
    rows.set(row.surface, Object.fromEntries(['surface', ...countKeys].map(key=>[key, key === 'surface' ? row[key] : Number(row[key])])))
  }
  // New unmatched objects can be between Storage and metadata commits. Retain
  // them for review, without asserting a lost upload or deleting anything.
  const findings = [...new Map(audit.findings.map(f=>{const receipt=issueReceipt(f);return [receipt.fingerprint, receipt]})).values()]
  for (const repair of audit.repairs) findings.push(issueReceipt({ type: 'legacy_storage_metadata', source: 'development_documents', id: repair.id }))
  const baselineUsable = previous?.projectRef === snapshot.projectRef && fresh(previous?.checkedAt, now, 120 * minute) && Array.isArray(previous?.findings) && previous.snapshotComplete === true && previous.status !== 'unavailable'
  const before = new Set(baselineUsable ? previous.findings.map(f=>f.fingerprint) : [])
  const current = new Set(findings.map(f=>f.fingerprint))
  const surfaces = DOCUMENT_UPLOAD_RELEASE_MATRIX.map(surface=>{
    const row = rows.get(surface.id)
    const terminal = row ? row.succeeded + row.failed + row.attention : 0
    return { id: surface.id, label: surface.label, observation: terminal ? 'observed' : 'not_observed', counts: row || null }
  })
  const alerts = []
  if (findings.some(f=>f.severity==='critical')) alerts.push({ severity: 'critical', code: 'persistence_mismatch', count: findings.filter(f=>f.severity==='critical').length })
  for (const row of rows.values()) {
    if (row.unconfirmed) alerts.push({ severity: 'critical', code: 'save_unconfirmed', surface: row.surface, count: row.unconfirmed })
    if (row.stalled) alerts.push({ severity: 'attention', code: 'upload_stalled', surface: row.surface, count: row.stalled })
    if (row.access_errors) alerts.push({ severity: 'attention', code: 'document_access_failed', surface: row.surface, count: row.access_errors })
    if (row.failed > 0 && (row.failed < 3 || row.failed / row.attempts < 0.2)) alerts.push({ severity: 'attention', code: 'upload_failed', surface: row.surface, count: row.failed })
    if (row.failed >= 3 && row.failed / row.attempts >= 0.2) alerts.push({ severity: 'attention', code: 'upload_failure_rate', surface: row.surface, count: row.failed })
    if (row.permission_errors) alerts.push({ severity: 'attention', code: 'upload_permission_denied', surface: row.surface, count: row.permission_errors })
    if (row.attention) alerts.push({ severity: 'attention', code: 'upload_follow_up_pending', surface: row.surface, count: row.attention })
  }
  const gaps = surfaces.filter(s=>s.observation==='not_observed').map(s=>s.id)
  const status = alerts.some(a=>a.severity==='critical') ? 'critical' : alerts.length || findings.length ? 'attention' : gaps.length ? 'incomplete' : 'healthy'
  return {
    version: 1, projectRef: snapshot.projectRef, checkedAt: new Date(now).toISOString(), status,
    documentDataMutated: false, snapshotComplete: true, baselineUsable, findings, alerts, surfaces,
    changes: { newlyDetected: findings.filter(f=>!before.has(f.fingerprint)), recurring: findings.filter(f=>before.has(f.fingerprint)), resolved: baselineUsable ? previous.findings.filter(f=>!current.has(f.fingerprint)) : [] },
    summary: { stores: audit.summary.stores, sourceRows: audit.summary.sourceRows, storageObjects: audit.summary.storageObjects, findings: findings.length, observedSurfaces: surfaces.length-gaps.length, requiredSurfaces: surfaces.length, telemetryWindowMinutes: 60 },
    coverageGaps: gaps,
    limitations: ['Browser outcomes are untrusted operational signals, not verified document saves.', 'Storage catalog checks cannot prove readable bytes, role access or tenant isolation.', 'No recent activity is not proof that an upload space works.', 'Unmatched storage objects remain review-only; in-flight uploads and retained history can explain them.'],
  }
}
export async function createDocumentPersistenceMonitorResponse({ method = 'GET', headers = {}, env = process.env, client, now = Date.now() } = {}) {
  if (method !== 'GET') return telemetryResponse(405, { status: 'unavailable' })
  const expected = env.CRON_SECRET
  const supplied = String(headers.authorization || '')
  if (!expected || !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(`Bearer ${expected}`).digest())) return telemetryResponse(401, { status: 'unavailable' })
  if (env.DOCUMENT_PERSISTENCE_MONITOR_ENABLED !== 'true') return telemetryResponse(200, { status: 'disabled', monitoringActive: false })
  let projectRef
  try {
    const url = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
    projectRef = url.hostname.split('.')[0]
    if (url.protocol !== 'https:' || url.hostname !== `${projectRef}.supabase.co` || url.port || url.username || url.password || url.pathname !== '/' || !/^[a-z]{20}$/.test(projectRef) || env.DOCUMENT_PERSISTENCE_MONITOR_PROJECT_REF !== projectRef) throw new Error()
  } catch { return telemetryResponse(503, { status: 'unavailable', reason: 'target_configuration' }) }
  const runKey = `${projectRef}:${Math.floor(now / (60*minute))}`
  let db
  try {
    db = client || documentMonitorClient(env)
    const [snapshot, telemetry, previous] = await Promise.all([
      db.rpc('document_persistence_monitor_snapshot', { p_project_ref: projectRef }),
      db.rpc('document_upload_outcome_summary'),
      db.from('document_persistence_monitor_runs').select('report').eq('project_ref',projectRef).order('checked_at',{ascending:false}).limit(1).maybeSingle(),
    ])
    if (snapshot.error || telemetry.error || previous.error || snapshot.data?.projectRef !== projectRef) throw new Error('Monitoring read failed')
    const report = buildDocumentPersistenceMonitoringReport({ snapshot: snapshot.data, telemetry: telemetry.data, previous: previous.data?.report, now: Math.max(now, Date.now()) })
    const saved = await db.from('document_persistence_monitor_runs').upsert({ run_key: runKey, project_ref: projectRef, checked_at: report.checkedAt, status: report.status, report }, { onConflict: 'run_key' })
    if (saved.error) throw new Error('Monitoring receipt failed')
    const pruned = await db.rpc('prune_document_persistence_monitor_history')
    if (pruned.error) console.warn('[document-persistence-monitor]', { status: 'retention_pending' })
    // Responses and logs contain aggregate status only, never customer records.
    console.info('[document-persistence-monitor]', { status: report.status, summary: report.summary, alertCount: report.alerts.length })
    return telemetryResponse(200, { status: report.status, summary: report.summary, alertCount: report.alerts.length, monitoringActive: true })
  } catch {
    const failure = { version: 1, projectRef, checkedAt: new Date(now).toISOString(), status: 'unavailable', snapshotComplete: false, findings: [], changes: { resolved: [] } }
    try { await db?.from('document_persistence_monitor_runs').upsert({ run_key: runKey, project_ref: projectRef, checked_at: failure.checkedAt, status: failure.status, report: failure }, { onConflict: 'run_key' }) } catch { /* Still return failure if the receipt store is unavailable. */ }
    return telemetryResponse(503, { status: 'unavailable', monitoringActive: false })
  }
}
