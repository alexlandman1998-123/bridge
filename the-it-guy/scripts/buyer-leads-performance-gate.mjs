import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import {
  BUYER_LEADS_RELEASE_GATE_CONTRACT,
  BUYER_LEADS_RELEASE_GATE_LIMITS,
  evaluateBuyerLeadsReleaseGate,
} from '../src/services/observability/buyerLeadsReleaseGate.js'

const root = resolve(import.meta.dirname, '..')
const sellerRouteGate = spawnSync(process.execPath, ['scripts/seller-leads-performance-budget.mjs'], {
  cwd: root,
  encoding: 'utf8',
})
assert.equal(sellerRouteGate.status, 0, sellerRouteGate.stderr || sellerRouteGate.stdout)
const routeReport = JSON.parse(sellerRouteGate.stdout)

// Includes the workspace's shared Button and Field closure, not only the component source.
const specialistBudget = Object.freeze({ rawBytes: 42_000, gzipBytes: 14_000 })
const specialistBuild = await build({
  entryPoints: [resolve(root, 'src/components/appointments/BuyerLeadAppointmentsWorkspace.jsx')],
  bundle: true,
  write: false,
  minify: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
})
const specialistContents = specialistBuild.outputFiles[0]?.contents
assert.ok(specialistContents, 'Buyer appointments workspace should produce a deferred asset.')
const specialistAsset = {
  entry: 'BuyerLeadAppointmentsWorkspace.jsx',
  rawBytes: specialistContents.byteLength,
  rawBudgetBytes: specialistBudget.rawBytes,
  gzipBytes: gzipSync(specialistContents).byteLength,
  gzipBudgetBytes: specialistBudget.gzipBytes,
}
assert.ok(specialistAsset.rawBytes <= specialistAsset.rawBudgetBytes)
assert.ok(specialistAsset.gzipBytes <= specialistAsset.gzipBudgetBytes)

const runtimeAcceptance = evaluateBuyerLeadsReleaseGate({
  durationMs: BUYER_LEADS_RELEASE_GATE_LIMITS.workspaceReadyMs,
  supabaseRequestCount: BUYER_LEADS_RELEASE_GATE_LIMITS.supabaseRequestCount,
  duplicateSupabaseRequestCount: 0,
  inactiveSpecialistRequestCount: 0,
  longTaskDurationMs: BUYER_LEADS_RELEASE_GATE_LIMITS.longTaskDurationMs,
  routeChunkTransferBytes: BUYER_LEADS_RELEASE_GATE_LIMITS.routeChunkTransferBytes,
})
assert.equal(runtimeAcceptance.status, 'within_budget')

console.log(JSON.stringify({
  status: 'within_budget',
  contract: BUYER_LEADS_RELEASE_GATE_CONTRACT,
  routeContract: routeReport.contract,
  routes: routeReport.routes,
  deferredSpecialistAssets: [specialistAsset],
  runtimeLimits: BUYER_LEADS_RELEASE_GATE_LIMITS,
}, null, 2))
