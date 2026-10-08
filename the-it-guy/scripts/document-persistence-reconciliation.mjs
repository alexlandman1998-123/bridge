import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildAuditSql, reconcileSnapshot, buildRepairSql } from '../server/services/documentPersistenceReconciliation.js'
export { STORES, buildAuditSql, reconcileSnapshot, resolveReference, buildRepairSql } from '../server/services/documentPersistenceReconciliation.js'

export async function main(argv = process.argv.slice(2)) {
  const options = {}
  for (const arg of argv) {
    if (arg === '--monitor') { options.monitor = true; continue }
    const match = arg.match(/^--(project|snapshot|output|export-sql|outcomes|previous)=(.+)$/)
    if (!match) throw new Error('Use --project=<ref> --export-sql=<file>, or --project=<ref> --snapshot=<file> --output=<directory>. This command never applies repairs.')
    options[match[1]] = match[2]
  }
  if (options['export-sql']) {
    await mkdir(path.dirname(options['export-sql']), { recursive: true })
    await writeFile(options['export-sql'], `begin read only;\nset local jit=off;\nset local statement_timeout='30s';\n${buildAuditSql(options.project)}\n${options.monitor ? 'select public.document_upload_outcome_summary() as outcomes;\n' : ''}commit;\n`)
    return
  }
  if (!options.snapshot || !options.output || !options.project) throw new Error('Explicit project, snapshot and output are required.')
  const snapshot = JSON.parse(await readFile(options.snapshot, 'utf8'))
  if (snapshot.projectRef !== options.project) throw new Error('Snapshot target differs from requested project.')
  if (options.monitor) {
    if (!options.outcomes) throw new Error('Monitoring requires --outcomes=<fresh-summary.json>.')
    const outputFile = path.resolve(options.output, 'monitoring.json')
    if ([options.snapshot, options.outcomes, options.previous].filter(Boolean).some(input => path.resolve(input) === outputFile)) throw new Error('Monitoring output must not overwrite input evidence.')
    const { buildDocumentPersistenceMonitoringReport } = await import('../server/services/documentPersistenceMonitoringService.js')
    const report = buildDocumentPersistenceMonitoringReport({
      snapshot, telemetry: JSON.parse(await readFile(options.outcomes, 'utf8')),
      previous: options.previous ? JSON.parse(await readFile(options.previous, 'utf8')) : null,
    })
    await mkdir(options.output, { recursive: true })
    await writeFile(path.join(options.output,'monitoring.json'), JSON.stringify(report,null,2)+'\n')
    console.log(JSON.stringify({ status: report.status, ...report.summary, documentDataMutated: false, output: options.output }))
    if (report.status !== 'healthy') process.exitCode = 2
    return
  }
  const report = reconcileSnapshot(snapshot)
  await mkdir(options.output, { recursive: true })
  await writeFile(path.join(options.output,'reconciliation.json'), JSON.stringify(report,null,2)+'\n')
  await writeFile(path.join(options.output,'reviewed-repairs.sql'), buildRepairSql(report))
  await writeFile(path.join(options.output,'rollback-repairs.sql'), buildRepairSql(report,{rollback:true}))
  console.log(JSON.stringify({ ...report.summary, mutatedData: false, output: options.output }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
