import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright'

// A real browser, component, Supabase Storage SDK and downloaded bytes.
// Storage/authorization are a local HTTP fixture, not hosted Supabase RLS.
const output = resolve('output/playwright/document-access')
await mkdir(output, { recursive: true })
const files = new Map([['tenant/one.pdf', Buffer.from('%PDF-1.4\noriginal diagnostic document\n%%EOF')], ['tenant/two.pdf', Buffer.from('%PDF-1.4\nreplacement diagnostic document\n%%EOF')]])
const signed = new Map()
let denied = false
let tokenSequence = 0
const calls = []
const bundle = await build({
  stdin: { contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client'; import DocumentAccessButton from './src/components/documents/DocumentAccessButton.jsx';
    function App(){const [replacement,setReplacement]=useState(false); const document={id:replacement?'two':'one',name:'Proof.pdf',file_path:replacement?'tenant/two.pdf':'tenant/one.pdf',file_bucket:'documents',url:location.origin+'/expired'};
      return <main><h1>Local document access regression</h1><p>Proof.pdf</p><DocumentAccessButton document={document} download aria-label="Download proof">Download proof</DocumentAccessButton><button onClick={()=>setReplacement(true)}>Use replacement</button><button onClick={()=>fetch('/fixture/revoke',{method:'POST'})}>Revoke access</button></main>}; createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), sourcefile: 'document-access-fixture.jsx', loader: 'jsx' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  plugins: [{ name: 'local-storage-api', setup(builder) {
    builder.onResolve({ filter: /transactionWorkspaceApi\.js$/ }, () => ({ path: 'fixture-api', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import {createClient} from '@supabase/supabase-js'; import {createFreshDocumentSignedUrl} from './src/lib/documentAccess.js'; const client=createClient(location.origin,'local-fixture-key',{auth:{persistSession:false,autoRefreshToken:false}}); export const createTransactionDocumentSignedUrl=(options)=>createFreshDocumentSignedUrl({client,...options});`, resolveDir: process.cwd(), loader: 'js' }))
  } }],
})
const http = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><title>Document access regression</title></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>'); return }
    if (url.pathname === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); return }
    if (url.pathname === '/fixture/revoke') { denied = true; response.end('{}'); return }
    const prefix = '/storage/v1/object/sign/documents/'
    if (request.method === 'POST' && url.pathname.startsWith(prefix)) {
      const path = decodeURIComponent(url.pathname.slice(prefix.length)); calls.push(path)
      response.setHeader('Content-Type', 'application/json')
      if (denied || !files.has(path)) { response.statusCode = 403; response.end(JSON.stringify({ statusCode: '403', error: 'Access denied', message: 'Access denied' })); return }
      const token = String(++tokenSequence); signed.set(token, path)
      response.end(JSON.stringify({ signedURL: `/object/sign/documents/${path}?token=${token}` })); return
    }
    if (request.method === 'GET' && url.pathname.startsWith(prefix)) {
      const path = signed.get(url.searchParams.get('token'))
      if (!path) { response.statusCode = 403; response.end('Expired link'); return }
      response.setHeader('Content-Type', 'application/pdf'); response.setHeader('Content-Disposition', 'attachment; filename="Proof.pdf"'); response.end(files.get(path)); return
    }
    response.statusCode = 403; response.end('Expired link')
  } catch { response.statusCode = 500; response.end('Local fixture failed') }
})
await new Promise((done) => http.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${http.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  const downloads = []
  context.on('page', (tab) => tab.on('download', (download) => downloads.push(download)))
  const page = await context.newPage()
  await page.goto(origin)
  assert.equal((await fetch(`${origin}/expired`)).status, 403)
  async function download(expected, name) {
    const count = downloads.length
    await page.getByRole('button', { name: 'Download proof' }).click()
    for (let tries = 0; downloads.length === count && tries < 100; tries++) await new Promise((done) => setTimeout(done, 50))
    assert.equal(downloads.length, count + 1, 'browser must download the freshly signed file')
    const file = resolve(output, name)
    await downloads[count].saveAs(file)
    const bytes = await readFile(file)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(files.get(expected)).digest('hex'))
    assert.equal(bytes.length, files.get(expected).length)
  }
  await download('tenant/one.pdf', 'original.pdf')
  // Reload the screen and invalidate the previous capability: reopening must sign again.
  signed.clear()
  assert.equal((await fetch(`${origin}/storage/v1/object/sign/documents/tenant/one.pdf?token=1`)).status, 403)
  await page.reload()
  await download('tenant/one.pdf', 'reopened.pdf')
  await page.getByRole('button', { name: 'Use replacement' }).click()
  await download('tenant/two.pdf', 'replacement.pdf')
  await Promise.all([page.waitForResponse((response) => response.url().endsWith('/fixture/revoke')), page.getByRole('button', { name: 'Revoke access' }).click()])
  await page.getByRole('button', { name: 'Download proof' }).click()
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(), /Access denied/)
  assert.equal(downloads.length, 3)
  assert.equal(await page.getByText('Proof.pdf', { exact: true }).count(), 1)
  await page.screenshot({ path: resolve(output, 'denied-access.png') })
  assert.deepEqual(calls, ['tenant/one.pdf', 'tenant/one.pdf', 'tenant/two.pdf', 'tenant/two.pdf'])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ mode: 'local', hostedRlsVerified: false, passed: true, downloads: 3, scenarios: ['expiredCachedUrl', 'freshSigning', 'reopen', 'byteHash', 'replacement', 'revokedAccess'], calls }, null, 2))
  console.log('Document access browser regression passed: actual SDK signing, 3 byte-verified downloads, expired URL, reopen, replacement and access denial. Local HTTP authorization fixture only.')
} finally {
  await browser?.close()
  await new Promise((done) => http.close(done))
}
