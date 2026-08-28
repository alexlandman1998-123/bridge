import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(appRoot, 'dist')
const assetsRoot = path.join(distRoot, 'assets')
const ENTRY_RAW_LIMIT = 475 * 1024
const API_GZIP_LIMIT = 400 * 1024

const indexHtml = await fs.readFile(path.join(distRoot, 'index.html'), 'utf8')
const assetNames = await fs.readdir(assetsRoot)
const entryMatch = indexHtml.match(/<script[^>]+src="\/?(assets\/index-[^"]+\.js)"/)
if (!entryMatch) throw new Error('Could not resolve the production entry chunk from dist/index.html.')

const entryPath = path.join(distRoot, entryMatch[1])
const entryBytes = (await fs.stat(entryPath)).size
if (entryBytes > ENTRY_RAW_LIMIT) {
  throw new Error(`Entry chunk is ${(entryBytes / 1024).toFixed(1)} KB raw; limit is ${ENTRY_RAW_LIMIT / 1024} KB.`)
}

const apiChunks = assetNames.filter((name) => /^(?:api|pipelineApiActions)-[A-Za-z0-9_-]+\.js$/.test(name))
if (!apiChunks.length) throw new Error('Shared API action chunk was not found in dist/assets.')
for (const name of apiChunks) {
  const contents = await fs.readFile(path.join(assetsRoot, name))
  const gzipBytes = gzipSync(contents, { level: 9 }).length
  if (gzipBytes > API_GZIP_LIMIT) {
    throw new Error(`${name} is ${(gzipBytes / 1024).toFixed(1)} KB gzip; limit is ${API_GZIP_LIMIT / 1024} KB.`)
  }
}

if (assetNames.some((name) => /^Report-[A-Za-z0-9_-]+\.js$/.test(name))) {
  throw new Error('The launch-locked Reports route emitted a production JavaScript chunk.')
}
if (!assetNames.some((name) => /^vendor-xlsx-[A-Za-z0-9_-]+\.js$/.test(name))) {
  throw new Error('The spreadsheet runtime was not isolated in a vendor-xlsx chunk.')
}
if (/vendor-(?:xlsx|pdf|jspdf|html2canvas)|html2pdf-runtime/.test(indexHtml)) {
  throw new Error('A document/export runtime is referenced by the initial HTML entrypoint.')
}

console.log(`Phase 2 bundle boundary passed: entry ${(entryBytes / 1024).toFixed(1)} KB raw; API chunks <= ${API_GZIP_LIMIT / 1024} KB gzip.`)
