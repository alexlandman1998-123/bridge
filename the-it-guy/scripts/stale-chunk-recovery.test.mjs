import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const boundarySource = await readFile('src/components/AppErrorBoundary.jsx', 'utf8')
const packageDefinition = JSON.parse(await readFile('package.json', 'utf8'))

const reloadLimitMatch = boundarySource.match(/const\s+STALE_CHUNK_AUTO_RELOAD_LIMIT\s*=\s*(\d+)/)
assert.ok(reloadLimitMatch, 'Stale chunk recovery must define an auto-reload limit.')
assert.ok(Number(reloadLimitMatch[1]) >= 6, 'Stale chunk recovery must cover realistic edge propagation delays.')

assert.match(
  boundarySource,
  /STALE_CHUNK_RETRY_DELAYS_MS\s*=\s*\[[^\]]*15000[^\]]*30000[^\]]*\]/s,
  'Stale chunk recovery must use delayed backoff instead of rapid repeated reloads.',
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
  /this\.recoverFromStaleChunk\(\{\s*force:\s*false\s*\}\)/,
  'Manual refresh must reset once, then continue through the normal bounded recovery sequence.',
)
assert.match(
  packageDefinition.scripts['build:guarded'],
  /test:stale-chunk-recovery/,
  'Guarded builds must keep stale chunk recovery covered.',
)

console.log('stale-chunk-recovery tests passed')
