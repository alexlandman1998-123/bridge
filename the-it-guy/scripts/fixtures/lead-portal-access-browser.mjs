import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = await readFile(new URL('../../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const helpers = source.slice(source.indexOf('function writePortalDocumentWindowMessage('), source.indexOf('function openGeneratedPortalDocumentHtml('))
const signedStart = source.indexOf('  async function handleOpenFinalSignedPortalDocument(')
const normalStart = source.indexOf('  async function handleOpenPortalDocument(document)')
const normalEnd = source.indexOf('\n  useEffect(', normalStart)
const handlerSource = `${helpers}\n${source.slice(signedStart, normalEnd)}`
const bundle = await build({ entryPoints: [fileURLToPath(new URL('./lead-portal-access-browser.jsx', import.meta.url))], bundle: true, write: false, outfile: 'portal.js', format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"', PORTAL_HANDLER_SOURCE: JSON.stringify(handlerSource) } })
const server = createServer(async (request, response) => {
  if (request.url === '/portal.js') { response.setHeader('content-type', 'text/javascript'); response.end(bundle.outputFiles.find(file => file.path.endsWith('.js')).text); return }
  if (request.url === '/portal.css') { response.setHeader('content-type', 'text/css'); response.end(bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || ''); return }
  if (request.url === '/document') { response.end('Synthetic document opened successfully.'); return }
  if (request.url === '/sign') {
    let raw = ''; for await (const part of request) raw += part
    const payload = JSON.parse(raw)
    await new Promise(resolve => setTimeout(resolve, payload.slow ? 500 : 20))
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(payload.denied ? { error: 'Your document access has expired. Sign in again to retry.' } : { url: '/document' })); return
  }
  response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated buyer and seller portal checks</title><link rel="stylesheet" href="/portal.css"><style>body{font-family:Arial;margin:20px}button,select{padding:12px;margin:8px}[role=alert]{color:#b91c1c}</style></head><body><div id="root"></div><script type="module" src="/portal.js"></script></body></html>')
})
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, isolation: 'production password component and extracted document handlers; synthetic local signing transport; no hosted access or delivery' })))
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)) })
