import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const boundarySource = await readFile('src/components/AppErrorBoundary.jsx', 'utf8')
const viteConfigSource = await readFile('vite.config.js', 'utf8')
const packageDefinition = JSON.parse(await readFile('package.json', 'utf8'))

const reloadLimitMatch = boundarySource.match(/const\s+STALE_CHUNK_AUTO_RELOAD_LIMIT\s*=\s*(\d+)/)
assert.ok(reloadLimitMatch, 'Stale chunk recovery must define an auto-reload limit.')
assert.equal(Number(reloadLimitMatch[1]), 1, 'Stale chunk recovery must make only one automatic reload attempt.')

assert.match(
  boundarySource,
  /STALE_CHUNK_RETRY_DELAYS_MS\s*=\s*\[250\]/,
  'Stale chunk recovery must make one short, bounded automatic retry.',
)
assert.match(
  boundarySource,
  /getStaleChunkAssetUrl/,
  'Stale chunk recovery must extract the missing asset URL from dynamic import errors.',
)
assert.match(
  boundarySource,
  /release-manifest\.json\?stale_chunk_check=/,
  'Stale chunk recovery must compare missing assets against the active release manifest.',
)
assert.match(
  boundarySource,
  /criticalAssets/,
  'Stale chunk recovery must distinguish current-release propagation from old-shell refreshes.',
)
assert.match(
  boundarySource,
  /method:\s*'HEAD'/,
  'Stale chunk recovery must probe asset availability before refreshing current-release chunks.',
)
assert.match(
  boundarySource,
  /method:\s*'GET'[\s\S]*Range:\s*'bytes=0-0'/,
  'Stale chunk recovery must fall back to a ranged GET when HEAD probes are unreliable.',
)
assert.match(
  boundarySource,
  /STALE_CHUNK_FORCE_RELOAD_AFTER_PROBE_ATTEMPT/,
  'Stale chunk recovery must force a fresh shell reload after repeated failed current-release probes.',
)
assert.match(
  boundarySource,
  /refreshStaleChunkApp[\s\S]*?reloadWithFreshAppShell/,
  'Manual refresh must load a fresh app shell without resetting the exhausted-loop marker.',
)

assert.match(
  viteConfigSource,
  /chunkInfo\.name\s*===\s*'Sidebar'[\s\S]*?navigation-shell-\[hash\]\.js/,
  'The primary navigation chunk must use a neutral asset name for browser content filters.',
)
assert.match(
  packageDefinition.scripts['build:guarded'],
  /test:stale-chunk-recovery/,
  'Guarded builds must keep stale chunk recovery covered.',
)

console.log('stale-chunk-recovery tests passed')
