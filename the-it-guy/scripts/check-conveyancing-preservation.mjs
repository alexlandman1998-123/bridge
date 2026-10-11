import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withoutLegalShell } from './legal-workspace-shell-review.mjs'
import { spawnSync } from 'node:child_process'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const manifest = JSON.parse(readFileSync(resolve(appRoot, 'docs/conveyancing-preservation-baseline.json'), 'utf8'))
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--sources-only')) throw new Error('Only --sources-only is supported.')
if (manifest.version !== 1 || !manifest.protectedFiles?.length || !manifest.reviewFiles?.length) {
  throw new Error('Missing or unsupported conveyancing preservation baseline.')
}

function changedFiles(entries) {
  return entries.filter(entry => {
    const file = resolve(repositoryRoot, entry.path)
    if (!file.startsWith(repositoryRoot + sep) || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Invalid baseline entry: ${entry.path}`)
    }
    try {
      return createHash('sha256').update(readFileSync(file)).digest('hex') !== entry.sha256
    } catch (error) {
      if (error.code === 'ENOENT') return true
      throw error
    }
  }).map(entry => entry.path)
}

const protectedChanges = changedFiles(manifest.protectedFiles)
function unreviewedSharedChanges() {
  return changedFiles(manifest.reviewFiles).filter(path=>{
    const reconstructed=withoutLegalShell(path,readFileSync(resolve(repositoryRoot,path),'utf8'));
    const entry=manifest.reviewFiles.find(item=>item.path===path);
    return !reconstructed||createHash('sha256').update(reconstructed).digest('hex')!==entry.sha256;
  });
}
const reviewChanges = unreviewedSharedChanges()
if (protectedChanges.length || reviewChanges.length) {
  for (const path of protectedChanges) console.error(`Protected conveyancing source changed: ${path}`)
  for (const path of reviewChanges) console.error(`Shared surface requires conveyancing review: ${path}`)
  console.error('Do not regenerate this baseline to clear a failure. Review the change and verify preservation first.')
  process.exit(1)
}
if(changedFiles(manifest.reviewFiles).length) console.log('Reviewed Legal shell additions reconstruct the original App and Sidebar byte-for-byte.');
console.log(`Conveyancing source baseline matches (${manifest.protectedFiles.length} protected files, ${manifest.reviewFiles.length} shared surfaces).`)
if (args.includes('--sources-only')) process.exit(0)

// Established local fixtures only: no hosted credentials, release checks or sends.
const checks = [
  ['npm', ['run', 'test:legal-workspace']],
  ['npm', ['run', 'check:attorney-conveyancing']],
  ['node', ['scripts/attorney-transfer-navigation.test.mjs']],
  ['node', ['scripts/attorney-task-operational-contract.test.mjs']],
  ['node', ['scripts/verify-attorney-bond-lane-phase9.mjs']],
  ['node', ['scripts/verify-attorney-cancellation-lane-phase9.mjs']],
  ['node', ['scripts/attorney-workbench-permission-contract.test.mjs']],
  ['node', ['--test', 'scripts/attorney-document-persistence.test.mjs', 'scripts/shared-matter-journey-atomic.test.mjs']],
  ['node', ['src/services/__tests__/attorneyMatterWorkspaceScope.test.js']],
  ['node', ['src/services/__tests__/attorneyMatterWorkspaceSnapshot.test.js']],
  ['node', ['src/services/__tests__/attorneyIncomingMatterInstructionActions.test.js']],
  ['node', ['--test', 'src/services/__tests__/attorneyMatterNumberService.test.js']],
  ['npx', ['vitest', 'run', 'src/services/__tests__/attorneyMatterTeamService.test.js', '--maxWorkers=1']],
  ['npx', ['vitest', 'run', '--config', 'vitest.attorney-calendar.config.js', '--maxWorkers=1']],
  ['node', ['scripts/attorney-accounting-phase2-matter-ui.test.mjs']],
  ['node', ['scripts/attorney-accounting-phase4-statement-download.test.mjs']],
]
for (const [command, parameters] of checks) {
  console.log(`\nChecking ${command} ${parameters.join(' ')}`)
  const result = spawnSync(command, parameters, { cwd: appRoot, stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
// Detect concurrent source changes during the suite as well.
if (changedFiles(manifest.protectedFiles).length || unreviewedSharedChanges().length) {
  console.error('Conveyancing source changed during verification. Review and rerun against a stable baseline.')
  process.exit(1)
}
console.log('\nConveyancing preservation baseline passed. Authenticated browser and deployment verification remain release gates.')
