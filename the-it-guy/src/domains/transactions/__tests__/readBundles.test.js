// @vitest-environment node
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

const probes = [
  ['development selectors', 'developments/selectionReadApi.js', 360_000, 70_000],
  ['development portfolio', 'developments/portfolioReadApi.js', 150_000, 38_000],
  ['transaction first load', 'transactions/workspaceReadApi.js', 390_000, 80_000],
  ['transaction lists', 'transactions/listReadApi.js', 420_000, 85_000],
  ['document lists', 'documents/listReadApi.js', 440_000, 90_000],
  ['transaction activity', 'transactions/activityReadApi.js', 90_000, 21_000],
]

it.each(probes)('%s excludes the legacy API and stays within its isolated bundle limit', async (_label, entry, rawLimit, gzipLimit) => {
  const root = resolve(import.meta.dirname, '../..')
  const bundle = await build({
    entryPoints: [resolve(root, entry)], bundle: true, write: false, metafile: true,
    minify: true, platform: 'browser', format: 'esm', packages: 'external',
    define: { 'import.meta.env': '{}' }, logLevel: 'silent',
  })
  expect(Object.keys(bundle.metafile.inputs).some((path) => path.endsWith('/lib/api.js'))).toBe(false)
  expect(bundle.outputFiles[0].contents.length).toBeLessThan(rawLimit)
  expect(gzipSync(bundle.outputFiles[0].contents).length).toBeLessThan(gzipLimit)
}, 10_000)
