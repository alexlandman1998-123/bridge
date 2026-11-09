// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('keeps development reads independent of the legacy API and listing workflows', async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../api.js', import.meta.url))],
    bundle: true, write: false, metafile: true, minify: true,
    platform: 'browser', format: 'esm', packages: 'external',
    define: { 'import.meta.env': '{}' }, logLevel: 'silent',
  })
  const inputs = Object.keys(result.metafile.inputs)
  expect(inputs.some((path) => path.endsWith('/lib/api.js'))).toBe(false)
  expect(inputs.some((path) => path.endsWith('/services/privateListingService.js'))).toBe(false)
  // These are isolated bundle limits, excluding packages, not production Vite
  // transfer budgets. They catch accidental reintroduction of workflow modules.
  expect(result.outputFiles[0].contents.length).toBeLessThan(500_000)
  expect(gzipSync(result.outputFiles[0].contents).length).toBeLessThan(110_000)
})
