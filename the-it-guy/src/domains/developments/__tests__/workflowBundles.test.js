// @vitest-environment node
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

const probes = [
  ['creation', 'developments/creationWorkflow.js', 450_000, 96_000],
  ['details', 'developments/detailActions.js', 390_000, 80_000],
  ['configuration', 'developments/configurationActions.js', 115_000, 27_000],
  ['documents', 'developments/documentActions.js', 360_000, 76_000],
  ['stock', 'developments/stockActions.js', 350_000, 70_000],
  ['marketing', 'developments/marketingActions.js', 25_000, 9_000],
  ['partner invitations', 'partners/invitationActions.js', 30_000, 10_000],
  ['onboarding handoff', 'onboarding/workflow.js', 610_000, 135_000],
]

it.each(probes)('%s actions exclude the central API and stay within their isolated limit', async (_label, entry, rawLimit, gzipLimit) => {
  const bundle = await build({
    entryPoints: [resolve(import.meta.dirname, '../..', entry)],
    bundle: true, write: false, metafile: true, minify: true,
    format: 'esm', platform: 'browser', packages: 'external',
    define: { 'import.meta.env': '{}' }, logLevel: 'silent',
  })
  expect(Object.keys(bundle.metafile.inputs).some((path) => path.endsWith('/lib/api.js'))).toBe(false)
  expect(bundle.outputFiles[0].contents.length).toBeLessThan(rawLimit)
  expect(gzipSync(bundle.outputFiles[0].contents).length).toBeLessThan(gzipLimit)
}, 10_000)
